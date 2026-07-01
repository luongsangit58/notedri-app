# NoteDri Mobile App - Services Guide

Deep-dive documentation for the 6 hardware service classes in `src/services/`. These are pure TypeScript modules - no React imports, no hooks. They are the only parts of the app that communicate with hardware (BLE adapter, GPS sensor) or manage the offline retry queues.

Reference: `/home/miichi/TMP/notedri-app/J16 protocol.pdf` - ELM327 OBD2 AT command reference.

---

## OBD2 Service Stack

The four OBD2 service classes form a layered stack:

```
OBDDashboardScreen  /  OBDTripsScreen
          │
          ▼
    TripSession                    ← session lifecycle, PID polling
          │
          ▼
     ObdReader                     ← AT command protocol, PID/DTC parsing
          │
          ▼
     BleService                    ← BLE transport, connection management
          │
          ▼
  react-native-ble-plx             ← native BLE API
          │
          ▼
  ELM327 / Vgate iCar adapter      ← physical OBD2 dongle (BLE)
          │
          ▼
  Vehicle OBD2 port (ISO 15765-4)  ← CAN bus
```

Failed trip uploads flow to `TripSyncQueue` → `POST /obd2/trips`.

---

## 1. BleService

**File:** `src/services/obd/BleService.ts`

### Purpose

Singleton BLE manager. Owns the `BleManager` instance from `react-native-ble-plx`. Manages device scanning, connection, and characteristic read/write/notify operations. Abstracts adapter-type differences (ELM327 vs Vgate) behind a single write/read interface.

### Singleton Pattern

```typescript
// Lazy singleton - not initialized until first use to avoid
// NativeEventEmitter warnings in Expo Go / Jest
let _instance: BleService | null = null;
export function getBleService(): BleService {
  if (!_instance) _instance = new BleService();
  return _instance;
}
```

Do not call `new BleService()` directly. Use `getBleService()`.

### Adapter Profiles

| Adapter | Service UUID | Write Characteristic | Notify Characteristic |
|---|---|---|---|
| Generic ELM327 | `FFF0` | `FFF2` | `FFF1` |
| Vgate iCar | Proprietary (detected at connect time) | Proprietary | Proprietary |

Adapter type is auto-detected during `scan()` by inspecting the service UUIDs advertised by discovered devices.

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `scan` | `scan(onDevice, timeoutMs?): Promise<void>` | BLE scan. Calls `onDevice` for each discovered device. Stops after `timeoutMs` (default 10 s). |
| `connect` | `connect(deviceId: string): Promise<void>` | Connect to device, discover services, identify adapter type, cache write/notify characteristic refs. |
| `disconnect` | `disconnect(): Promise<void>` | Disconnect current device, null out refs. |
| `sendCommand` | `sendCommand(cmd: string): Promise<string>` | Write AT command bytes to write characteristic, await response from notify characteristic. Resolves with the full response string. Internally queues commands to prevent concurrent writes (AT protocol is synchronous). |
| `isConnected` | `isConnected(): boolean` | Returns `true` if a device is currently connected. |
| `getConnectedDevice` | `getConnectedDevice(): Device \| null` | Returns the active `Device` object or `null`. |

### Error Handling

`sendCommand` throws `BleError` on connection loss. `ObdReader` and `TripSession` catch these and surface them to screens via their callback interfaces. `BleService` does not auto-reconnect.

### Permissions Required

Android (`app.json` `android.permissions`):
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `ACCESS_FINE_LOCATION` (required by Android BLE scan API)

iOS (`app.json` `ios.infoPlist`):
- `NSBluetoothAlwaysUsageDescription`

---

## 2. ObdReader

**File:** `src/services/obd/ObdReader.ts`

### Purpose

ELM327 AT command protocol layer. Sits above `BleService`. Sends standardized AT init commands, then reads OBD2 PIDs and DTC fault codes. Converts raw hex OBD2 responses into typed TypeScript objects.

### Key Types

```typescript
interface ObdSnapshot {
  rpm: number | null;            // PID 0x0C - engine RPM (rev/min)
  speed: number | null;          // PID 0x0D - vehicle speed (km/h)
  engineLoad: number | null;     // PID 0x04 - calculated engine load (%)
  coolantTemp: number | null;    // PID 0x05 - coolant temperature (°C)
  fuelLevel: number | null;      // PID 0x2F - fuel tank level input (%)
  oilTemp: number | null;        // PID 0x5C - engine oil temperature (°C)
  throttle: number | null;       // PID 0x11 - throttle position (%)
  timestamp: number;             // Date.now() at time of reading
}

interface DtcCode {
  code: string;       // e.g. "P0301" (SAE J2012 format)
  description: string; // human-readable description
  raw: string;        // raw hex bytes from adapter
}
```

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `initializeElm327` | `(): Promise<void>` | Sends ELM327 initialization sequence: `ATZ` (reset), `ATE0` (echo off), `ATL0` (linefeeds off), `ATH0` (headers off), `ATSP0` (auto protocol). Should be called once after `BleService.connect()`. |
| `readSnapshot` | `(): Promise<ObdSnapshot>` | Reads all 7 PIDs sequentially. A `null` value for a PID means the vehicle did not respond (unsupported PID or CAN timeout). Takes ~200-400 ms total. |
| `readDtcCodes` | `(): Promise<DtcCode[]>` | Sends `03` (Request stored DTCs), parses multi-frame response, maps raw hex to SAE J2012 codes. Returns empty array if no faults. |
| `clearDtcCodes` | `(): Promise<void>` | Sends `04` (Clear DTCs). Use with caution - confirms with user in screen before calling. |

### PID Parsing

Raw ELM327 response format: `41 0C 0F A0 \r` (mode 41 = response to mode 01 request, PID 0C, then data bytes).

Each PID has a specific formula (from SAE J1979):
- RPM: `((A * 256) + B) / 4`
- Speed: `A` (km/h directly)
- Engine load: `A * 100 / 255` (%)
- Coolant temp: `A - 40` (°C)
- Fuel level: `A * 100 / 255` (%)
- Oil temp: `A - 40` (°C)
- Throttle: `A * 100 / 255` (%)

---

## 3. TripSession

**File:** `src/services/obd/TripSession.ts`

### Purpose

OBD trip lifecycle manager. Polls `ObdReader.readSnapshot()` every 3 seconds, accumulates distance (speed × time), detects idle engine, and produces a `TripSummary` when the trip ends. Handles iOS background suspension gracefully.

### Key Types

```typescript
interface TripSummary {
  startedAt: string;      // ISO 8601
  endedAt: string;        // ISO 8601
  durationSeconds: number;
  distanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgRpm: number;
  maxRpm: number;
  avgCoolantTemp: number | null;
  fuelLevelStart: number | null;
  fuelLevelEnd: number | null;
  snapshots: ObdSnapshot[];  // raw data array
}
```

### State Machine

```
idle
  │  start(vehicleId) called
  ▼
running  ◄──────────────── setInterval every 3 000 ms
  │                         - readSnapshot()
  │                         - accumulate distance
  │                         - check idle condition
  │
  ├── [idle condition met: RPM < 200 for 30 s]
  │     or [stop() called]
  ▼
stopping
  │  finalize TripSummary
  ▼
stopped  →  onTripEnd(TripSummary)  →  TripSyncQueue.enqueue()
```

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `start` | `start(vehicleId: number, callbacks: TripCallbacks): void` | Begins polling. `callbacks.onSnapshot(snapshot)` fires every poll. `callbacks.onTripEnd(summary)` fires when session stops. `callbacks.onError(err)` fires on BLE error. |
| `stop` | `stop(): void` | Manually ends the session. Produces `TripSummary` and calls `onTripEnd`. |
| `getState` | `getState(): 'idle' \| 'running' \| 'stopping' \| 'stopped'` | Current state. Screens use this to update the UI. |
| `getCurrentSnapshot` | `getCurrentSnapshot(): ObdSnapshot \| null` | Latest snapshot for live dashboard display. |

### iOS Background Handling

`TripSession` subscribes to `AppState` via `AppState.addEventListener('change', ...)`. When the app returns to foreground from background/inactive state, it records the gap time and adjusts the next poll's `elapsed` calculation to exclude suspended time (distance is not estimated during suspension - conservative approach).

### Idle Engine Detection

If the last 10 snapshots (30 s at 3 s interval) all have `rpm !== null && rpm < 200`, the session auto-stops. This covers the case where the user parks but forgets to tap "Stop trip".

---

## 4. TripSyncQueue

**File:** `src/services/obd/TripSyncQueue.ts`

### Purpose

AsyncStorage-backed retry queue for failed OBD trip uploads. When `TripSession` produces a `TripSummary` and the upload to `POST /obd2/trips` fails (no network, server error), the summary is serialized to AsyncStorage. `processQueue()` retries all pending items.

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `enqueue` | `enqueue(summary: TripSummary, vehicleId: number): Promise<void>` | Serialize and append to AsyncStorage queue. |
| `processQueue` | `processQueue(): Promise<void>` | Read all queued items, attempt upload for each. Remove from queue on 2xx success. Leave in queue on network error. Remove on 4xx (bad data, skip forever). |
| `getPendingCount` | `getPendingCount(): Promise<number>` | Number of queued items. Screens display this as a badge or warning. |
| `clear` | `clear(): Promise<void>` | Clear all pending items (for logout). |

### When to Call `processQueue`

- On app foreground (`AppState` change to `active`)
- After a successful login
- After `TripSession` finishes (attempt immediate upload first)

`OBDDashboardScreen` and `OBDTripsScreen` call `processQueue` on mount.

---

## 5. GpsTripTracker

**File:** `src/services/gps/GpsTripTracker.ts`

### Purpose

Background GPS trip tracker registered as an `expo-task-manager` background task. Implements an auto-start / auto-stop state machine based on speed. All state is persisted to AsyncStorage so a killed app can recover a trip in progress.

### Background Task Registration

```typescript
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

export const GPS_TRIP_TASK = 'GPS_TRIP_TRACKING';

TaskManager.defineTask(GPS_TRIP_TASK, ({ data, error }) => {
  // called by the OS with new location data
  GpsTripTracker.getInstance().handleLocationUpdate(data.locations);
});
```

Task is started with `Location.startLocationUpdatesAsync(GPS_TRIP_TASK, options)` and stopped with `Location.stopLocationUpdatesAsync(GPS_TRIP_TASK)`.

### Persisted State Shape (AsyncStorage key: `gps_trip_state`)

```typescript
interface GpsTripState {
  status: 'idle' | 'waiting_start' | 'active' | 'waiting_stop' | 'finalize';
  vehicleId: number | null;
  startedAt: string | null;         // ISO 8601
  waitingStartSince: number | null; // timestamp
  waitingStopSince: number | null;  // timestamp
  lastUpdateAt: number | null;      // timestamp (for stale detection)
  route: Array<{ lat: number; lng: number; timestamp: number; speedKmh: number }>;
  distanceM: number;
  lastPoint: { lat: number; lng: number } | null;
}
```

### State Machine

```
idle
  │  speed > 5 km/h in any GPS update
  ▼
waiting_start  (confirmation: requires 12 s sustained above 5 km/h)
  │  12 s elapsed at speed > 5 km/h
  ▼
active  ◄────────────── every GPS location update from OS
  │   - append point to route[] (cap at 500)
  │   - add haversine distance (if accuracy < 50 m and delta > 8 m)
  │   - speed drops below 3 km/h → enter waiting_stop
  │
  ├── [speed < 3 km/h]
  ▼
waiting_stop  (3 min below 3 km/h)
  │  3 min elapsed at speed < 3 km/h
  ▼
finalize  →  GpsTripSummary  →  GpsTripSyncQueue.enqueue()
         →  reset to idle
```

Safety valves automatically advance state:
- `active` for more than 6 h → force finalize
- No GPS update for 15 min while `active` or `waiting_stop` → treat as stale; recover on next `handleLocationUpdate` or app launch
- Background task running 20 min with status `idle` (false wakeup) → `stopLocationUpdatesAsync`

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `getInstance` | `(): GpsTripTracker` | Singleton accessor. |
| `initialize` | `(vehicleId: number): Promise<void>` | Start location updates. Reads persisted state to recover a stale trip. |
| `handleLocationUpdate` | `(locations: LocationObject[]): Promise<void>` | Called by the background task. Processes each location, advances state machine, persists state. |
| `pause` | `(): Promise<void>` | User-initiated pause. Sets `waiting_stop` immediately without the 3 min timer. |
| `resume` | `(): Promise<void>` | Resume from pause. Sets `active` directly. |
| `stop` | `(): Promise<void>` | Force-stop and finalize. Stops location updates and resets state. |
| `getState` | `(): Promise<GpsTripState>` | Read current persisted state (async, reads AsyncStorage). |

### Haversine Distance Formula

```typescript
function haversineMeters(a: {lat: number; lng: number}, b: {lat: number; lng: number}): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const aa = sinDlat * sinDlat
    + Math.cos((a.lat * Math.PI) / 180)
    * Math.cos((b.lat * Math.PI) / 180)
    * sinDlng * sinDlng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}
```

Points with accuracy worse than 50 m and moves less than 8 m are filtered before distance accumulation.

### Android Foreground Service

On Android, continuous background location requires a foreground service notification (mandatory from Android 10+). This is configured in `app.json` via the `expo-location` plugin:

```json
{
  "plugins": [
    ["expo-location", {
      "locationAlwaysAndWhenInUsePermission": "...",
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }]
  ]
}
```

---

## 6. GpsTripSyncQueue

**File:** `src/services/gps/GpsTripSyncQueue.ts`

### Purpose

AsyncStorage-backed retry queue for failed GPS trip uploads. Mirrors `TripSyncQueue` but for GPS trips (different payload shape and endpoint).

### Key Types

```typescript
interface GpsTripSummary {
  vehicleId: number;
  startedAt: string;       // ISO 8601
  endedAt: string;         // ISO 8601
  durationSeconds: number;
  distanceM: number;
  route: Array<{ lat: number; lng: number; timestamp: number }>;
}
```

### Key Methods

| Method | Signature | Description |
|---|---|---|
| `enqueue` | `enqueue(summary: GpsTripSummary): Promise<void>` | Serialize and append to AsyncStorage. |
| `processQueue` | `processQueue(): Promise<void>` | Retry all pending uploads to `POST /gps-trips`. Remove on success or 4xx; retain on network error. |
| `getPendingCount` | `getPendingCount(): Promise<number>` | Count of pending items. |
| `clear` | `clear(): Promise<void>` | Clear all pending items (for logout cleanup). |

### When to Call `processQueue`

- On app foreground (`AppState` active)
- On successful login
- In `GpsTripsScreen` on mount (ensures all trips appear)

---

## Service Lifecycle Summary

```
App launch
  │
  ├── authStore.initialize()  (reads SecureStore token)
  │
  ├── if logged in + Premium:
  │     GpsTripTracker.initialize(vehicleId)
  │       → startLocationUpdatesAsync (background task registered)
  │       → recover stale trip from AsyncStorage if present
  │
  └── OBD2 services start only on user action:
        OBDSetupScreen → BleService.scan() → BleService.connect()
        OBDDashboardScreen → ObdReader.initializeElm327()
                           → TripSession.start()

App killed / crash recovery
  │
  └── GpsTripTracker reads AsyncStorage on next initialize()
        → if state is 'active' or 'waiting_stop' → resumes from last known point
        → TripSyncQueue / GpsTripSyncQueue processQueue() called on next foreground

Logout
  │
  ├── GpsTripTracker.stop() → stopLocationUpdatesAsync
  ├── BleService.disconnect()
  ├── TripSyncQueue.clear()
  ├── GpsTripSyncQueue.clear()
  └── authStore.logout() → clears SecureStore
```
