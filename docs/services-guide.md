# NoteDri Mobile App - Services Guide

Deep-dive documentation for `src/services/` - the parts of the app that talk to hardware (BLE adapter, GPS sensor, NFC), manage offline retry queues, and hold business logic that doesn't belong in a React component. Most modules here are pure/near-pure TypeScript (no JSX); a few (`obdAutoConnectSettingsStore.ts`, `dashboardStyles.ts`) live just outside `src/services/` but are documented here because they're part of the same OBD2 picture.

As of **2026-08-13** there are **~44 files** across 11 sub-folders plus 4 top-level modules - not "6 service classes". The count keeps growing (OBD2 alone went from 4 files to 22 between the last two audits), so treat any number here as a snapshot, not a promise.

> The `J16 protocol.pdf` (ELM327 AT command reference) that a previous version of this doc pointed to has been deleted from the repo. If you need the raw AT command reference again, re-source it - don't recreate a phantom path.

---

## 1. OBD2 Service Stack (`src/services/obd/`, 22 files)

### 1.0 What changed since the last major rewrite

The previous version of this doc described a `TripSession` class (`src/services/obd/TripSession.ts`) as the OBD trip-lifecycle manager, with its own `idle → running → stopping → stopped` state machine. **That class no longer exists.** Per the comment at the top of `src/services/obd/TripSyncQueue.ts`:

> "Kiểu tóm tắt 1 chuyến OBD2 - trước đây sinh bởi TripSession (đã bỏ 14/7 khi obdLiveMonitor thay thế)..."
> (*"Trip summary type - previously produced by TripSession, removed 14/7 when obdLiveMonitor replaced it"*)

The reason (per `obdLiveMonitor.ts`'s own header comment): a real fixture showed the OS freezing JS timers (`setInterval`) when the app went to background, so a trip's distance/duration computed by polling OBD PIDs on a timer could not be trusted. **GPS is now the sole source of trip timing/distance** (`src/services/gps/GpsTripTracker.ts` - see §2). OBD2's job changed from "manage a trip" to "poll live data + watch for DTCs + run the diagnostic rule engine for as long as the BLE session is connected" - a session-shaped concern, not a trip-shaped one. `TripSyncQueue.ts` itself is now a one-time migration shim (see §1.4) rather than an active queue.

The stack today looks like this:

```
OBDDashboardScreen / OBDSetupScreen / HomeScreen (via useObd hook)
          │
          ▼
    obdLiveMonitor                ← session lifecycle (connect→disconnect), PID polling,
          │                         DTC watch, rule engine, session summary/telemetry
          ▼
     ObdReader (functions)        ← AT command protocol, PID/DTC/VIN/readiness parsing
          │
          ▼
     BleService (singleton)       ← BLE (GATT) OR Bluetooth Classic (SPP) transport
          │
          ▼
  react-native-ble-plx  /  NotedriBtPairing (custom native module, Classic SPP)
          │
          ▼
  ELM327 / Vgate iCar adapter    ← physical OBD2 dongle
          │
          ▼
  Vehicle OBD2 port (ISO 15765-4) ← CAN bus

GPS (independent of the stack above) ─── owns trip start/stop/distance ─── src/services/gps/
```

Session summaries flow to `ObdSessionSyncQueue` → `POST /obd2/sessions`. Live DTC detections flow to `ObdDtcSyncQueue` → `POST /obd2/dtc` (report) / `.../resolve` (clear). Trips (GPS-timed) flow to `GpsTripSyncQueue` → `POST /gps/trips`.

---

### 1.1 BleService

**File:** `src/services/obd/BleService.ts` (~1200 lines - the single largest service file)

#### Purpose

Singleton BLE **and** Bluetooth Classic (SPP) transport manager. It is the *only* place in the app that touches `react-native-ble-plx` or the custom `NotedriBtPairing` native module directly. Owns connection state, the serialized AT-command queue, session logging (for fixture capture), reconnect-with-grace, and link-quality tracking.

Unlike the doc's previous description, `BleService` is exported as an **already-instantiated singleton**, not behind a lazy factory function:

```typescript
class BleService { /* ... */ }
export const bleService = new BleService();
```

(The internal `BleManager` from `react-native-ble-plx` is still created lazily via a getter, to avoid `NativeEventEmitter` warnings before native modules are ready.)

#### Two transports

| Transport | Added | Why |
|---|---|---|
| BLE (GATT) | original | Standard for ELM327/Vgate BLE dongles |
| Bluetooth Classic (SPP) | 22/7 | Some Android car head-unit chips/ROMs can't scan/connect BLE at all (confirmed on a Honda Jazz V 2017 fixture), but Classic SPP works fine - matches Vgate's own recommended "Android-Vlink" pairing flow (PIN `1234`) |

Both transports share the *same* `sendCommand()`, command queue, session log, and reconnect-grace logic - only the raw byte read/write path differs (GATT characteristic vs RFCOMM socket). Callers above (`ObdReader`, `obdLiveMonitor`) never need to know which transport is active. `connect(deviceId)` handles BLE; `connectClassic(address, name, pin?)` handles Classic.

TX/RX GATT characteristics are **discovered dynamically**, not hardcoded - a real Vgate iCar Pro fixture had a service UUID (`e7810a71`) but not the characteristic the code once assumed, breaking every write. `PREFERRED_SERIAL_SERVICE_PREFIXES` is only a ranking hint when multiple serial-like services are advertised, not a requirement.

#### Key Types

```typescript
export type ObdDevice = { id: string; name: string };
export type ConnectionState =
  'disconnected' | 'scanning' | 'connecting' | 'reconnecting' | 'connected' | 'error';
export type SessionLogEntry = { t: number; cmd: string; res: string };
export type LinkQuality = 'good' | 'fair' | 'poor' | 'unknown';
```

#### Key Methods

| Method | Description |
|---|---|
| `connect(deviceId)` | Connect over BLE: discover GATT services, identify TX/RX characteristics, attach. |
| `connectClassic(address, name, pin = '1234')` | Connect over Bluetooth Classic (SPP), same downstream behavior as `connect()`. |
| `sendCommand(cmd, timeoutMs = 2000)` | Queued AT command send/receive - guarantees one in-flight command at a time regardless of transport. |
| `disconnect()` | User-intentional disconnect. Sets a flag that suppresses reconnect-grace, synchronously clears connection state so `isConnected()` is correct immediately (previously depended on a native disconnect event that could arrive late or never on cheap adapters). |
| `isConnected()` / `getDeviceId()` | Current connection status / active device id (BLE id or Classic MAC address). |
| `getSessionLog()` / `logDiagnostic(tag, detail)` | Raw command/response log for the current session, used to produce debugging fixtures; other modules (e.g. `obdKeepAliveService`) can inject diagnostic lines into the same log. |
| `getLinkQuality()` | Rolling 60s command-success-rate window → `'good' | 'fair' | 'poor' | 'unknown'`. Used by `obdPollingScheduler` to pause the "fast" poll tier when the link is poor. |
| `addDisconnectListener` / `addReconnectingListener` / `addReconnectedListener` | Multi-subscriber listener sets (multiple screens/services can all listen; each listener is isolated in its own try/catch so one throwing listener can't crash the app or block the others - this was a real crash source, see §1.1 note below). |
| `getSessionAgeSeconds()` / `consumeSessionInfo()` | Session-start bookkeeping for telemetry (read-once-then-clear so each session reports exactly once). |

#### Reconnect Grace

On an *unexpected* disconnect (not user-initiated), `BleService` retries the connection itself before firing `disconnectListeners`: 3 attempts at `[1000, 3000, 6000]` ms delays. `reconnectingListeners` fire per attempt; `reconnectedListeners` fire on success. `ObdReader.reinitElm327AfterReconnect()` is called automatically on reconnect (adapters often reboot on drop, forgetting init settings).

#### Error Isolation

A prior crash (7/8) traced to `disconnectListeners.forEach` running multiple registered listeners synchronously inside a *native* disconnect callback - one listener throwing killed the callback and crashed the whole app with no trace. All listener fan-out now goes through a private `notifyListeners()` helper that wraps each call in its own try/catch.

#### Permissions Required

Android (`app.json`):
- API 31+: `BLUETOOTH_SCAN` (flagged `neverForLocation`), `BLUETOOTH_CONNECT`
- API <31: `ACCESS_FINE_LOCATION` (OS requires it to scan BLE pre-Android-12)

iOS: `NSBluetoothAlwaysUsageDescription`. iOS BLE state restoration (`restoreStateIdentifier: 'notedri-obd-restore'`) lets CoreBluetooth relaunch the app in the background when a previously-connected peripheral reconnects.

Actual permission *requesting* now goes through `PermissionManager` (§4.1) rather than `BleService` calling `PermissionsAndroid` directly.

---

### 1.2 ObdReader

**File:** `src/services/obd/ObdReader.ts` (~420 lines)

#### Purpose

ELM327 AT-command protocol layer sitting above `BleService`. **This is no longer a class** - it's a module of exported functions operating on `bleService` directly, plus a small module-level PID whitelist used for capability-aware polling.

#### Key Types

```typescript
export type ObdSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  fuelLevelPct: number | null;
  oilTempC: number | null;
  throttlePct: number | null;
  controlModuleVoltage: number | null;  // PID 42 - charging/battery rule signal
  timestamp: number;
};

export type DtcCode = { code: string; description: string | null };

export type ObdExtendedSnapshot = { /* fuel trims, intake pressure/temp, ambient temp, fuel rate, O2 sensor, barometric pressure - "slow tier" PIDs */ };

export type FreezeFrameSnapshot = { /* mode 02 - ECU state at moment of DTC set */ };

export type ReadinessStatus = { /* mode 01 PID 01 monitor readiness, from obdParser */ };
```

#### Capability-Aware Polling

```typescript
export function setActivePidWhitelist(pids: string[] | null): void
```
Once `capabilityService.discoverCapability()` has determined which PIDs a vehicle actually supports, `readPid()` skips any PID not in the whitelist - no wasted BLE round-trip on a PID a Honda City, for example, doesn't answer (confirmed: `012F` fuel level and `015C` oil temp both return NO DATA on that vehicle).

#### Key Functions

| Function | Description |
|---|---|
| `initializeElm327()` | Sends `ATZ`, `ATE0`, `ATL0`, `ATH0`, `ATS0`, `ATSP0`, then health-checks by reading RPM+speed. Returns `InitResult` distinguishing "adapter connected, car off/unsupported protocol" (`dataAvailable: false`, includes raw RPM response for debugging) from full success. Also opportunistically reads VIN via `readCurrentVin()` (shared cache, avoids a duplicate `0902`). |
| `reinitElm327AfterReconnect()` | Lighter re-init (no `ATZ`) run after BLE reconnect-grace - a real fixture showed the adapter self-rebooting on drop, losing echo/linefeed settings. |
| `readRpm/readSpeed/readEngineLoad/readCoolantTemp/readFuelLevel/readOilTemp/readThrottle/readVoltage/...` | One function per PID (mode 01). Extended set added since the last doc: fuel trims (short/long, bank 1), intake manifold pressure, intake/ambient air temp, fuel rate, O2 sensor voltage, barometric pressure. |
| `readSnapshot()` | The 8-field "fast tier" snapshot (adds `controlModuleVoltage` vs. the old 7-field doc version). |
| `readExtendedSnapshot()` | The "slow tier" extended PIDs, polled far less often (30-60s). |
| `readDtcCodes()` / `readPendingDtcCodes()` / `readPermanentDtcCodes()` | Mode 03 (confirmed), Mode 07 (pending, not yet a real DTC), Mode 0A (permanent - cannot be cleared by battery disconnect or a normal scan tool clear). |
| `clearDtcCodes()` | Mode 04. Returns `boolean` success (not `void` as previously documented). |
| `readReadinessStatus()` | Mode 01 PID 01 - emissions monitor readiness (MIL status + per-monitor supported/ready). |
| `readFreezeFrame()` | Mode 02 - ECU snapshot captured at the moment a DTC was set. |

#### PID Parsing

Delegated to `obdParser.ts` (§1.6) - `extractPayload()` handles response variants a naive space-split parser missed (concatenated `ATS0` responses like `410C1034`, and `SEARCHING...\r`-prefixed lines), which was a real bug (fixture #2: dashboard showed all-dashes because of this).

---

### 1.3 obdLiveMonitor - the session lifecycle manager (replaces the old TripSession's connection-management role)

**File:** `src/services/obd/obdLiveMonitor.ts` (~1000 lines - second-largest OBD file)

#### Purpose

Runs for the lifetime of a BLE/Classic *connection*, not a *trip*. Polls live PIDs across three tiers (fast/medium/slow, via `obdPollingScheduler`, §1.6), evaluates the diagnostic rule engine on every medium-tier poll, watches for new/cleared DTCs, tracks session-aggregate statistics (min/max/avg for coolant, voltage, load, idle RPM), drives the `obdSessionStateMachine` (§1.7) and the Android keep-alive service (§1.5), and on disconnect assembles a session summary that's enqueued to the server.

#### Key Types

```typescript
export type SessionPhase = 'engine_off' | 'idle' | 'driving';       // lightweight, inferred each poll
export type FastSnapshot = { rpm: number | null; speedKmh: number | null; throttlePct: number | null; timestamp: number };
export type SlowSnapshot = { /* fuel level, oil temp, ambient temp, fuel rate */ };
```

`SessionPhase` is intentionally *not* a full state machine - `obdSessionStateMachine.ts` already owns the richer `DISCONNECTED→...→STOPPED` machine (§1.7); this is a cheap per-poll inference used to feed the Knowledge Engine later.

#### Design notes worth knowing

- **Background-gap detection**: a gap between polls >15s is assumed to be the OS freezing the JS timer while backgrounded (not a BLE disconnect) - a real fixture showed gaps of 144s/1700s/980s with an unbroken session log. This is exactly the finding that killed `TripSession`.
- **Vehicle-unresponsive detection**: 3 consecutive all-null PID reads (~9s) → "engine off / ECU asleep while adapter still holds BLE", surfaced via `onVehicleUnresponsive()`, distinct from a real disconnect.
- **Orphaned checkpoint recovery**: session stats are checkpointed to AsyncStorage every 60s. If the app is killed mid-session (cable yanked, Bluetooth killed abruptly without a clean disconnect event), the next `start()` - or an explicit `recoverPendingCheckpoint()` call from the Report screen - pushes the orphaned checkpoint as a completed session so it isn't silently lost.
- **DTC realtime reporting**: unlike the pre-14/7 design (DTCs only reached the server bundled with a trip save), DTCs found live are POSTed immediately via `ObdDtcSyncQueue` (§1.4), independent of session end.

#### Key API (`obdLiveMonitor` object)

| Method | Description |
|---|---|
| `start(vehicleId)` / `stop()` | Begin/end polling for a BLE session. Called from the connect/disconnect flow, not from a screen. Switching vehicles mid-session (rare) resets all accumulated stats. |
| `isRunning()` / `getVehicleId()` | Current status. |
| `getSessionState()` | Delegates to `obdSessionStateMachine.getState()`. |
| `onSnapshot(fn)` / `onSmoothedSnapshot(fn)` / `onFastSnapshot(fn)` / `onSlowSnapshot(fn)` | Subscribe to different tiers/smoothing of live data. Smoothed (EWMA) snapshots are for gauge display only - never for diagnostics/rule engine (use `onSnapshot`, raw). |
| `onDtcFound(fn)` / `onPendingDtcFound(fn)` / `onPermanentDtcFound(fn)` | Subscribe to confirmed/pending/permanent DTC updates. |
| `onFindings(fn)` | Subscribe to diagnostic rule engine output (debounced + sticky-held for display stability). |
| `clearDtcAndRefresh()` | Mode 04 clear + immediate re-read of 03/07/0A (doesn't wait for the ~5min DTC poll cadence) + fire-and-forget `enqueueDtcResolve()` so the server knows the codes were actually cleared on the vehicle (previously Mode 04 only changed local state; the server considered the codes unresolved forever). |
| `setSessionCapability(capability)` | Lets the connect flow hand in the cached `VehicleCapability` so the session summary can be normalized against it. |

#### Module-level listeners (registered once, run regardless of any screen being open)

- `bleService.addReconnectedListener` → re-runs `reinitElm327AfterReconnect()` and resets EWMA smoothing state (a real value jump during a disconnect, e.g. engine restarted, shouldn't be smoothed away).
- `bleService.addDisconnectListener` → sets `STOPPED` then `DISCONNECTED` on the state machine, builds and enqueues the session summary (`ObdSessionSyncQueue`), and patches `useObdSessionStore` with a "last session saved" marker so the UI can show immediate confirmation without waiting for the network flush.

---

### 1.4 Sync Queues (`TripSyncQueue`, `ObdSessionSyncQueue`, `ObdDtcSyncQueue`, `GpsTripSyncQueue`)

All four are now thin wrappers around a **shared generic queue factory**, `createSyncQueue<T>()` in `src/services/syncQueue.ts` (§7.1) - previously three separate copy-pasted AsyncStorage-queue implementations that had drifted from each other.

#### `TripSyncQueue.ts` - legacy migration shim only

**File:** `src/services/obd/TripSyncQueue.ts`

**Nothing enqueues into this queue anymore** (the old path was removed 14/7 along with `TripSession`). It survives purely to flush any leftover items a user's device may still have queued from *before* that removal:

```typescript
export async function flushPendingTrips(): Promise<{ synced: number; failed: number }>
export async function clearObdQueue(): Promise<void>   // called on logout
```

`flushPendingTrips()` does a one-shot best-effort upload of anything found under the old `obd_pending_trips` SecureStore key, then deletes the key - no retry, no rewrite. Do not add new call sites that enqueue here.

#### `ObdSessionSyncQueue.ts` - active, current

**File:** `src/services/obd/ObdSessionSyncQueue.ts`

Queues session summaries produced by `obdLiveMonitor` on disconnect. Adds an `idempotency_key` per item at enqueue time (server enforces uniqueness per vehicle) so a retried upload after a timeout can't double-count session/engine-hours. Cap raised from 30 → 100 items after a review found long offline stretches with multiple vehicles could silently drop the oldest session (`onDrop` now logs a warning instead of silently discarding).

```typescript
export async function enqueueObdSession(payload: Omit<ObdSessionPayload, 'idempotency_key'>): Promise<void>
export const flushPendingObdSessions = queue.flush;
export const pendingObdSessionCount = queue.count;
export const clearObdSessionQueue = queue.clear;
```

#### `ObdDtcSyncQueue.ts` - two independent queues

**File:** `src/services/obd/ObdDtcSyncQueue.ts`

- **Report queue** (`enqueueDtcReport`): POSTs newly-detected DTCs (`POST /obd2/dtc`). Server dedupes by unresolved code per vehicle, so no idempotency key is needed.
- **Resolve queue** (`enqueueDtcResolve`): re-fetches the server's list of unresolved DTCs at *send* time (not enqueue time) and resolves whichever match the codes just cleared on the vehicle (Mode 04). Deliberately does **not** swallow per-record errors internally - one failing record must fail the whole batch so the generic queue's retry logic keeps it, rather than the queue believing the batch "succeeded" while a record silently never got marked resolved.

#### `GpsTripSyncQueue.ts` - see §2.2

#### Underlying `createSyncQueue` behavior (all four queues share this)

- AsyncStorage-backed, capped size, single-flight (`isFlushing` guard against concurrent `flush()` calls).
- **Logout-safe via an epoch counter**: `clear()` increments `clearEpoch`; any `enqueue()`/`flush()` in flight checks the epoch before and after each AsyncStorage read/write and bails out (or re-deletes) if a `clear()` raced in - this prevents an item from a just-logged-out account being silently re-saved under the next account that logs in, which is possible because AsyncStorage doesn't guarantee ordering between two independent native calls.
- Error classification for retry delegated to `syncRetryPolicy.ts` (§7.2).

---

### 1.5 capabilityService

**File:** `src/services/obd/capabilityService.ts`

#### Purpose

Discovers and caches which OBD2 PIDs a specific vehicle actually supports, so polling/rules/dashboard can gate on real capability instead of a hardcoded PID list.

#### Key Types

```typescript
export type VehicleCapability = {
  vehicleId: number;
  supportedPids: string[];
  vin: string | null;
  discoveredAt: string;    // ISO 8601
};
```

#### Caching strategy

- Cached by `vehicleId` (AsyncStorage key `obd_vehicle_capabilities`), **and** by VIN (`obd_vehicle_capabilities_by_vin`) when the vehicle supports Mode 09 VIN read - VIN survives an adapter being swapped to a physically different but re-registered vehicle record.
- 30-day TTL (a vehicle's supported-PID set almost never changes, but an ECU swap/firmware update is a rare edge case this catches without requiring a manual cache clear).
- VIN itself is cached **per BLE session** (`vinCacheThisSession`), separate from the capability cache - a real bug had `0902` sent 3 times in the first 1.2s of a session because every `useObd.ts` mount re-triggered a VIN read.

#### Key Functions

| Function | Description |
|---|---|
| `discoverCapability(vehicleId, { force? })` | Probes `0100`/`0120`/.../`01A0` bitmap pages until a page reports no further pages. **"Làm mới" (Refresh) button** in the UI calls this with `force: true`, which invalidates the VIN cache and clears the stored capability first, forcing a real re-probe instead of trusting cache. Distinguishes a first-page failure (nothing discovered, don't cache, retry next session) from a mid-probe failure (partial data - return it for this session's use, but don't cache the truncated result, so a future session gets a chance at the full list rather than being locked into a falsely-narrow PID set forever). |
| `getCachedCapability(vehicleId)` | Cache-first lookup: VIN cache preferred over vehicleId cache when both exist. |
| `readCurrentVin()` | Session-cached VIN read (Mode 09 02), shared with `ObdReader.initializeElm327()`. |
| `invalidateVinCache()` / `clearCapability(vehicleId)` | Manual cache busting (used by the force-refresh path). |
| `getSessionVin()` | Read-only accessor to whatever VIN was read this session, without sending a new command. |

---

### 1.6 Minor OBD helpers (grouped)

| File | Role |
|---|---|
| `obdParser.ts` | Pure parsing functions: `extractPayload`, `isNoData`, `assembleIsoTpFrames` (multi-frame ISO-TP reassembly), `parseVin`, `parseDtcCodes`, `parseSupportedPids`, `parseReadinessStatus`, plausible-value range checks (`isPlausibleValue`, `PID_PLAUSIBLE_RANGE`), and the `PID_REGISTRY` PID metadata table. No RN/BLE imports - unit-testable in isolation. |
| `obdSessionStateMachine.ts` | The **actual** finite state machine for a vehicle session: `DISCONNECTED → CONNECTING → CONNECTED → ELM_READY → {ENGINE_OFF ↔ ENGINE_IDLE ↔ DRIVING} → STOPPED → DISCONNECTED`. Deliberately allows free transitions between the three "engine" states (a car idles/drives/stops repeatedly within one session) rather than the strict one-way diagram it's modeled after. Invalid transitions are logged and ignored, not thrown - signal sources (RPM/speed/BLE events) can arrive out of ideal order. Exists purely to give the future Knowledge Engine one authoritative state to read; doesn't change any BLE/ELM/polling behavior itself. |
| `obdPollingScheduler.ts` | Generic fast/medium/slow tiered task scheduler (default intervals 500ms/3000ms/45000ms) driven by a single 250ms internal tick, replacing one-setInterval-per-concern. Pauses the `fast` tier entirely when `bleService.getLinkQuality() === 'poor'`. `obdLiveMonitor` registers its PID-polling tasks into this; it has no knowledge of PIDs itself. |
| `diagnosticEngine.ts` | The rule engine: `evaluate(rules, snapshot) → Finding[]`. Rules are **data** (`DiagnosticRule[]`), the engine is a pure function - testable anywhere, no RN import. Every rule must cite a `source` (no rule ships without a documented threshold justification) and carries a `beta` flag until confirmed against real fleet data. `dedupeFindings()` merges multiple `evaluate()` passes (used by both live monitor and `sessionReport.ts`, which each need to check both a low- and high-voltage snapshot). |
| `diagnosticRulesStore.ts` | Rule source-of-truth resolution: bundled JSON snapshot (`src/data/diagnosticRules.json`, auto-generated from the Laravel backend via `npm run sync:rules`) as an always-available fallback, overridden by an AsyncStorage cache, refreshed from `GET /diagnostic-rules` after each successful connect. Rule threshold changes ship without an app rebuild. |
| `dtcNotificationStore.ts` | Per-vehicle persistent "already notified" DTC set (AsyncStorage), separate from `obdLiveMonitor`'s in-RAM `reportedCodes` (which resets every session) - a known DTC the user hasn't fixed yet doesn't re-spam a push notification on every reconnect, but a code that disappears and later reappears is treated as new again. |
| `dtcOfflineDictionary.ts` | Offline DTC lookup from a bundled JSON snapshot (`src/data/dtcDictionary.json`, `npm run sync:dtc`) - same response shape as the server API so screens don't need to branch on data source. Also normalizes bare numeric codes to a `P`-prefixed code (`withDefaultDtcPrefix`), matching the backend's own default-prefix convention. |
| `findingCost.ts` | One function, `findingCostLabel(relatedDtc)`, pulling an estimated VND repair-cost range from the offline DTC dictionary for a rule-engine finding that has a `related_dtc`. |
| `sessionReport.ts` | Runs the diagnostic engine against a completed session summary (not a live snapshot) for the Daily Vehicle Report - evaluates twice (once each for `voltage_min`/`voltage_max`) since a voltage problem can manifest as either too-low or too-high, then dedupes. |
| `sessionTrend.ts` | Groups session history into daily trend points (voltage avg, coolant max, driving score, DTC count, engine minutes, fuel used) and computes week-over-week comparisons. A day with no sessions gets `null` metrics, not `0` - a `0` would misleadingly chart as "0V" rather than "no data". |
| `systemHealth.ts` | Presentation-only grouping of existing findings + live readings into 4 systems (`engine`/`cooling`/`electrical`/`fuel`) with a qualitative status (`ok`/`warn`/`critical`/`na`). Deliberately *not* a 0-100 per-system score - there's no real fleet data yet to calibrate one, and a made-up number would misrepresent confidence. |
| `obdLogger.ts` | Grouped console logger (`ble`/`elm`/`pid`/`scheduler`/`dtc`/`knowledge`/`performance`/`sync`), each group independently toggleable, default on in dev / off in release builds. Errors always log regardless of group toggle. |
| `obdSyncStatus.ts` | Aggregates the pending counts of all three OBD sync queues into `useObdSessionStore.pendingSyncCount` (the "N items pending sync" badge) and provides `flushObdQueuesAndRefreshCount()` as the one call site screens use to flush + refresh together. |

---

### 1.7 obdKeepAliveService

**File:** `src/services/obd/obdKeepAliveService.ts`

#### Purpose

Android-only. Piggybacks on `expo-location`'s foreground-service mechanism (the same one `GpsTripTracker` uses for real trip recording) purely to prevent the OS from freezing the app's JS timers when the screen locks during an OBD2-only session with no GPS trip running. A real fixture showed a 54-minute session collapse to ~15 seconds of live data because Android froze the JS timer almost immediately with no foreground service held.

This is **not** a real location tracking task - `TaskManager.defineTask(OBD_KEEPALIVE_TASK_NAME, async () => {})` is deliberately empty; its only purpose is that `Location.startLocationUpdatesAsync()` forces Android to grant (and requires) a foreground service, which keeps the process alive.

iOS is explicitly skipped - Apple reviews background-location usage strictly, and this workaround has no iOS equivalent (no foreground-service concept).

#### Key API

```typescript
export type KeepAliveStatus =
  | 'started' | 'already_running' | 'skipped_ios' | 'skipped_gps_active' | 'skipped_no_permission' | 'error';

export async function startObdKeepAlive(platformOS = Platform.OS): Promise<KeepAliveStatus>
export async function requestKeepAlivePermissions(platformOS = Platform.OS): Promise<boolean>
export async function stopObdKeepAlive(): Promise<void>
```

If a GPS trip is *already* running (`Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME)`), the keep-alive task is skipped entirely - the process is already protected. Every outcome (including "skipped, no permission") is written into `BleService`'s session log via `logDiagnostic()`, so a mysteriously long gap in a captured fixture can be explained rather than guessed at - previously a `void`-returning function gave no way to confirm whether keep-alive silently ran or silently didn't.

Location background permission is requested via `PermissionManager.requestLocationBackgroundAlreadyDisclosed()` - **not** a second custom "disclosure" dialog. A 29/7 review found users seeing 4 consecutive popups on first OBD2 connect (nudge → disclosure → system location dialog → system battery-exemption dialog); the custom keep-alive disclosure dialog was removed because the preceding nudge Alert already satisfies Google Play's "prominent disclosure" requirement for the same permission.

---

### 1.8 pairedDevices

**File:** `src/services/obd/pairedDevices.ts`

#### Purpose

AsyncStorage-backed per-vehicle pairing record: which BLE/Classic device belongs to which vehicle, plus a per-vehicle `autoConnect` opt-out flag.

#### Key Type

```typescript
export type PairedDevice = {
  bleDeviceId: string;       // BLE id, or a Classic MAC address when transport==='classic'
  vehicleId: number;
  vehicleName: string;
  lastConnectedAt?: number;
  transport?: 'ble' | 'classic';   // absent = 'ble' (pre-22/7 data)
  autoConnect?: boolean;           // absent = true (pre-31/7 data) - see below
};
```

#### Behavior notes

- **Default flipped 31/7**: new pairings default `autoConnect: true` (previously defaulted off, out of battery-drain caution - user feedback said the opt-in friction wasn't worth it; users can still turn it off per-vehicle).
- `getAutoConnectPairing(preferredVehicleId?)` - used by `ObdAutoConnect.tsx` on app open. If more than one vehicle has auto-connect enabled, it prefers the **default vehicle** (`preferredVehicleId`, from `resolveDefaultVehicle()`) over "most recently connected" - a 27/7 review found NFC/App-Link entry (which uses `is_default`) and this path (which used `lastConnectedAt`) could pick two *different* vehicles for the same account, confusing users about which car was active.
- `savePairing()` is dedupe-aware in both directions (one device → one vehicle, one vehicle → one current pairing) and preserves an existing `autoConnect` choice rather than resetting it on every reconnect.

---

## 2. GPS Trip Tracking (`src/services/gps/`, 2 files)

Confirmed still living under `src/services/gps/` (not `obd/`) - `GpsTripTracker.ts` is the sole trip-timing/distance mechanism in the app (see §1.0). It has grown substantially since the last audit (~1100 lines) and is no longer just a background-task registration module - it's the full public API screens use to start/stop/pause/resume/query trip state.

### 2.1 GpsTripTracker

**File:** `src/services/gps/GpsTripTracker.ts`

#### Purpose

Auto-start/auto-stop speed-based trip tracker, registered as an `expo-task-manager` background location task plus a periodic `expo-background-task` recovery task (Android `WorkManager`-backed, survives device reboot without a custom `BOOT_COMPLETED` receiver). All state persists to AsyncStorage so a killed app can recover an in-progress trip.

This is **not** a singleton class with `getInstance()` as the previous doc described - it's a module of exported functions operating on module-level task registrations and AsyncStorage-persisted state.

#### Key Types

```typescript
export type GpsTripState = {
  status: 'idle' | 'waiting_start' | 'active' | 'waiting_stop';
  vehicleId: number | null;
  startedAt: string | null;
  distanceKm: number; maxSpeedKmh: number; speedSum: number; speedCount: number;
  idleMs: number; drivingMs: number;
  lastLat: number | null; lastLng: number | null; lastTs: number | null;
  speedStartTs: number | null; idleStartTs: number | null;
  lastAccuracy: number | null; lastSpeedKmh: number; pointCount: number;
  idleSinceTs: number | null;
  hadGap: boolean;              // trip includes an estimated signal-loss segment
  paused: boolean;               // user-initiated pause
  lastLockRenewTs: number | null;
};

export type GpsTripSummary = {
  vehicleId: number; startedAt: string; endedAt: string;
  distanceKm: number; avgSpeedKmh: number; maxSpeedKmh: number;
  idleTimeSeconds: number; drivingTimeSeconds: number;
  routePoints: RoutePoint[];
  ghiChu?: string | null;   // auto-note: truncated (stale/interrupted) or signal-gap
};
```

Note: there is no separate `finalize` status in the real state machine (the previous doc's diagram had one) - finalization happens inline inside the `active`/`waiting_stop` handlers, which write a fresh idle state after enqueuing the summary.

#### State Machine

```
idle
  │  speed ≥ 5 km/h
  ▼
waiting_start   (must sustain ≥5 km/h for 12s to "commit" the trip)
  │  12s elapsed
  ▼
active  ◄──────────── every ~5s GPS location update
  │  - accumulate haversine distance (accuracy ≤50m, segment ≥8m)
  │  - track speed sum/max, idle vs driving time
  │  - speed < 3 km/h sustained
  ▼
waiting_stop   (must stay <3 km/h for 5 minutes)
  │  - resumes to `active` immediately if speed picks back up
  │  5 min elapsed at <3km/h
  ▼
(finalize inline)  →  GpsTripSummary  →  GpsTripSyncQueue.enqueue()  →  reset to idle
```

The stop-confirmation window was raised from 3 minutes to **5 minutes** (7/8) after users reported heavy Vietnamese urban traffic/red-light waits splitting one real trip into several short fragmented ones.

Safety valves:
- `active` longer than 6h → force-finalize (anti-hang).
- No GPS update for 15 min while `active`/`waiting_stop` → treated as stale; recovered on next location update or app launch.
- `idle` with no movement for 20 min → background task self-stops (battery saving).
- Distance-jump handling: large jumps (≥500m) are accepted as distance **only** if the implied speed is ≤200km/h and the gap is ≤10 minutes (tunnel/underground-parking signal loss estimated as a straight line, flagged `hadGap`); anything else (GPS teleport/glitch) is discarded.

#### Vehicle lock (hard lock, different from OBD's soft lock - see §3)

`requestPermissionsAndStart()` first calls `gpsTripsApi.trackingLock.claim(vehicleId, deviceId)`. A `409` response means another device already holds the lock for this vehicle, and `startResult.reason === 'vehicle_locked'` is returned - **this actually blocks** starting a trip (unlike the OBD device lock, which is advisory-only). Network errors are treated offline-first (allowed to proceed rather than blocked). The lock is renewed every 3 minutes from inside the background task itself (server TTL is 5 minutes).

#### Key Public Functions

| Function | Description |
|---|---|
| `requestPermissionsAndStart(vehicleId, { skipDisclosure? })` | Full guarded start: lock claim → foreground location → device location-services-enabled check → best-effort background location → begin `Location.startLocationUpdatesAsync`. Returns a `StartResult` with a specific failure `reason` when it fails. |
| `stopTracking(save = true)` / `pauseTracking()` / `resumeTracking()` | User-initiated controls. Pause stops accumulating distance/route but keeps the reference point current so resuming doesn't count the paused interval as distance. |
| `maybeAutoShutdownStale()` | Runs on foreground/cold-start/OBD-connect *and* periodically via the `expo-background-task` recovery task - covers the case where a car's power cuts out mid-trip and nobody reopens the app for hours. |
| `checkInterruptedTrip()` / `resumeInterruptedTrip()` | Powers the "resume trip after app was killed?" prompt, gated by `RESUME_WINDOW_MS` (10 minutes) - within the window the user is asked; beyond it, the trip auto-saves and notifies instead. |
| `handleObdDisconnected(vehicleId)` | Hook point for OBD disconnect to interact with GPS trip state (e.g. stale-check on OBD disconnect too, not just app foreground). |
| `registerGpsRecoveryTask()` | Called once at app boot to register the `expo-background-task` periodic recovery job with `WorkManager`. |
| `getPermissionStatus()` / `getReadiness()` / `autoArmIfReady(vehicleId)` | Permission/readiness introspection and an auto-arm helper for silently starting tracking when everything is already in place. |

### 2.2 GpsTripSyncQueue

**File:** `src/services/gps/GpsTripSyncQueue.ts`

Thin wrapper over `createSyncQueue<GpsTripSummary>` (cap 30). **Endpoint correction**: the upload path is `POST /gps/trips` (confirmed against `src/api/gpsTrips.ts`), **not** `/gps-trips` - a stale reference to the dash-separated path anywhere in older docs was wrong.

```typescript
export const enqueueTrip = queue.enqueue;
export const flushPendingGpsTrips = queue.flush;
export const pendingGpsCount = queue.count;
export const clearGpsQueue = queue.clear;   // called on logout
```

`GpsTripTracker`'s background task itself has a small inlined duplicate of the enqueue logic (`enqueueTripFromTask`, to avoid a circular import pulling `expo-notifications`/`gpsTripsApi` into the background-task module) - it writes to the same `gps_pending_trips` AsyncStorage key and immediately attempts a flush, falling back silently to the queue if offline/unauthenticated (a headless background task may lack a hydrated auth token).

---

## 3. Device/Vehicle Locks - two different mechanisms, easy to conflate

Two independent per-vehicle "another device is using this" locks exist, with **opposite** blocking behavior:

| | GPS trip lock | OBD device lock |
|---|---|---|
| API | `gpsTripsApi.trackingLock.claim/renew` | `obdApi.deviceLock.claim/release` (`src/api/obd.ts` ~line 154) |
| Keyed by | `vehicle_id` + `device_id` | `vehicle_id` + `device_id` |
| Blocking? | **Yes** - `claim()` throws `409` if held by another device; `GpsTripTracker.requestPermissionsAndStart()` refuses to start | **No, advisory only** - `claim()` always returns `200`, never blocks connecting; response just carries `{ locked_by_other, held_by_device_name?, held_since? }` for the UI to show a "in use by another device" banner |
| Why VIN isn't used | n/a | `vehicle_id` is always reliable (already in the DB); VIN (read via PID `0902`) isn't supported by every ECU, so it can't be the gating condition |
| Renewal | dedicated `renew` endpoint, called every 3 min from inside the GPS background task | **no dedicated renew endpoint used** - see below |

### OBD lock heartbeat quirk (`src/hooks/useObd.ts` ~lines 138-153, 248-261)

The OBD lock's `PUT` (renew) endpoint was found (30/7) to return only `{"message":"ok"}` - it does **not** echo back `locked_by_other`/`held_by_device_name`/`held_since`. An earlier fix that read those fields off the renew response always got `undefined`, silently wiping the "in use by another device" banner every 90 seconds even while the other device still held the lock. The backend intentionally allows re-calling `claim()` (`POST`) to "reclaim" when the same device already holds it - so `useObd.ts` now uses `claimDeviceLock()` (i.e. `POST /obd2/device-lock` again) as the heartbeat, every 90 seconds, which both renews the TTL and returns fresh sharing info. `renew()` is no longer called from anywhere.

---

## 4. Newer OBD-adjacent app-level mechanisms (outside `services/`, but part of the same picture)

### 4.1 `src/store/obdAutoConnectSettingsStore.ts`

Global auto-connect master on/off switch (zustand + AsyncStorage, default **enabled**), separate from `pairedDevices.ts`'s per-vehicle `autoConnect` flag - this is a top-level gate: if off, `ObdAutoConnect.tsx` won't offer *any* vehicle regardless of per-vehicle settings. Also holds a `sessionSuppressed` flag that is deliberately **not** persisted - it's a one-app-session-only suppression set right after the user taps "Disconnect" on the Dashboard, so `ObdAutoConnect` doesn't immediately re-offer the same vehicle when they navigate back to Home; it clears itself the next time the app is fully restarted.

### 4.2 `src/constants/dashboardStyles.ts`

Per-vehicle dashboard visual-style persistence (AsyncStorage key `obd_dashboard_style_id_{vehicleId}`). Six style defs (`analog`/`racing`/`minimal`/`retro`/`night`/`fleet`), five selectable in-app (Premium-gated except `analog`), one (`fleet`) hidden from the picker entirely - reserved for a future B2B garage/fleet-branding channel, not purchasable through the normal Premium upgrade flow.

**New 2026-08-13**: `ASK_EVERY_TIME` sentinel value. Previously choosing a style stuck permanently; if the user explicitly taps "Always ask again" in `DashboardStylePicker.tsx`, this sentinel is written to the *same* storage key (not a key deletion, so it's distinguishable from "never chosen anything") - the dashboard (`GaugeCluster`) then re-opens the style picker on every future connect instead of silently reapplying the last choice.

These two are used by `src/components/ObdAutoConnect.tsx` and `src/components/obd/DashboardStylePicker.tsx` respectively.

---

## 5. Nori AI companion glue (`src/services/nori/`, 3 files)

The actual conversational agent logic (tool-calling, conversation state, LLM plumbing) lives in **`src/agent/`** (`NoriAgent.ts`, `ConversationManager.ts`, `ToolExecutor.ts`, `ToolRegistry.ts`, etc.) - `src/services/nori/` is app-side glue that feeds Nori's mascot mood and voice UX, not the agent brain itself.

| File | Role |
|---|---|
| `nori.ts` | Pure mood logic (`NoriMood = 'happy' | 'warn' | 'urgent' | 'unknown'`) shared between the Nori card on HomeScreen and the avatar on HealthScreen. Colors are deliberately matched 1:1 to the web app's existing organ-status palette (`urgent→rose-500`, `warn→amber-500`, `info→sky-400`, `ok→emerald-500`) rather than inventing a separate app palette. Mood thresholds mirror `HealthScreen.tsx`'s `scoreBand()` (85/70/55/40) collapsed to 3 mood buckets; a high total score does **not** override a `warn`-status organ (e.g. an upcoming inspection deadline) into a "happy" mood, to avoid contradicting the "top issue" text shown alongside it. |
| `noriSummary.ts` | `useNoriSummary(vehicleId)` react-query hook aggregating 3 *already-fetched* data sources (vehicle health, recent sessions, 30-day session history) into one summary object for the Nori popover - deliberately reuses the same query keys as `HealthScreen`/`ObdReportScreen` so opening the popover doesn't cost an extra round-trip if those screens were already visited. |
| `voiceCues.ts` | Two short embedded base64 WAV "beep" tones (880Hz/120ms start, 660Hz/90ms end - the same up/down convention as Google Assistant/Siri) played via `expo-audio` when Nori starts/stops listening for voice input. Added because haptic-only feedback (the prior approach) is silent-only on real phones - a haptic-to-sound fallback exists on some Android car head units but not on real phones, so it wasn't a reliable signal across devices. |

---

## 6. Permissions (`src/services/permissions/`, 2 files)

### 6.1 PermissionManager

**File:** `src/services/permissions/PermissionManager.ts`

**The single place in the app allowed to call `PermissionsAndroid`/`Location.request*`/`Camera.request*`/etc. directly.** Consolidates logic that used to be duplicated across `BleService.ts`, `GpsTripTracker.ts`, `obdKeepAliveService.ts`, `OcrCamera.tsx`, `useVoiceInput.ts`, and `pushNotifications.ts` - in particular, `GpsTripTracker` and `obdKeepAliveService` used to each independently reimplement an almost-identical "foreground → disclosure → background" location-permission chain.

Normalizes every underlying permission API (Bluetooth, Location foreground/background, Camera, Media Library, Microphone, Notifications) to one shape:

```typescript
export type PermissionResult = { granted: boolean; canAskAgain: boolean };
```

Notable design point: Camera/ImagePicker/Notifications/SpeechRecognition are `require()`d **lazily inside each function**, not imported statically - a static import would pull the *entire* native module chain (including `expo-speech-recognition`) into any caller that only needs, say, `requestBluetooth()`. This wasn't hypothetical: it broke real BLE unit tests (`Cannot find native module ExpoSpeechRecognition`) before being fixed this way.

Distinguishes **checking** existing permission (`hasBluetooth()`, used by silent background auto-connect - popping a permission dialog during an automatic background scan is exactly the kind of "annoying" surprise the app tries to avoid) from **requesting** it (`requestBluetooth()`, only called when the user explicitly taps into the OBD2 connect flow).

`requestLocationBackground(disclosure)` vs. `requestLocationBackgroundAlreadyDisclosed()`: the former shows the custom disclosure Alert itself; the latter skips it, for callers (like `obdKeepAliveService`) that already showed an equivalent explanation immediately beforehand - avoids showing the same explanation twice in a row for the same permission (a real complaint: 4 popups in a row on first OBD2 connect).

### 6.2 backgroundLocationDisclosure.ts

**File:** `src/services/permissions/backgroundLocationDisclosure.ts`

One function, `showBackgroundLocationDisclosure(titleKey, bodyKey)` - the Google-Play-mandated "prominent disclosure" Alert shown before the system background-location permission dialog, parameterized so each feature (GPS trip vs. OBD keep-alive) keeps its own wording while sharing one implementation.

---

## 7. Generic sync-queue infrastructure (top-level, `src/services/`)

### 7.1 syncQueue.ts

Generic AsyncStorage-backed offline sync queue factory, `createSyncQueue<T>({ key, cap, send, onDrop? })`, used by `GpsTripSyncQueue`, `ObdSessionSyncQueue`, and both `ObdDtcSyncQueue` queues. Replaced three near-identical hand-rolled copies. See §1.4 for its logout-safe epoch behavior.

### 7.2 syncRetryPolicy.ts

Shared error classification, `isPermanentSyncError(status, retriesSoFar)`: network errors/5xx/429 are retried indefinitely; other 4xx are treated as permanent client errors (bad payload, deleted resource) and dropped; 401/403 are retried up to `MAX_AUTH_RETRIES` (5) - possibly a token not yet hydrated at cold start, but if it's still failing after 5 attempts it's more likely a genuinely revoked/deleted resource, and the item shouldn't occupy a queue slot forever.

### 7.3 crashLog.ts

Global JS error handler (`installGlobalErrorHandler()`, called once at the very top of `App.tsx`, before any component mounts) that persists the last fatal error (`message`, `stack`, `isFatal`, timestamp) to AsyncStorage *before* letting it propagate through React Native's normal handling (dev: red box; release: crash as before - behavior unchanged, just now recorded). Exists because of a real crash (7/8) where a session dropped mid-drive with a perfectly clean log and zero trace of what happened - there was no ErrorBoundary/global handler/crash reporter anywhere in the app. `readLastFatalError()` lets `App.tsx` log (dev-only warning) what killed the previous session.

### 7.4 googleAuthRecovery.ts

Recovers a Google OAuth (login or account-link) callback if the OS killed the app process entirely while a Custom Tab/`ASWebAuthenticationSession` was still open (common on RAM-constrained devices) - in that scenario `openAuthSessionAsync()` never resolves because the JS context is gone. A flag is set in AsyncStorage *before* opening the OAuth session; `App.tsx` calls `recoverPendingGoogleAuthIfAny()` once at cold start (mounted before `RootNavigator`, independent of auth state) to check `Linking.getInitialURL()` if the flag is still set. Deliberately does **not** become a general-purpose deep-link listener - only ever reads the initial URL when its own pending flag is present, to avoid accepting an arbitrary deep link as an auth callback.

---

## 8. Other service areas (brief)

| Folder/File | Files | Summary |
|---|---|---|
| `src/services/vehicles/resolveDefaultVehicle.ts` | 1 | `resolveDefaultVehicle()` - resolves "the user's main vehicle" (`is_default`, same convention as Home/AddRefuel/Reminders/GpsTrips), preferring the React Query `['vehicles']` cache (almost always already populated by the time this is needed) over a fresh network call. Shared by the generic NFC/App-Link `/connect` handler and by app-open auto-connect as the tie-breaker when more than one vehicle has auto-connect enabled. |
| `src/services/vin/vinDecoder.ts` | 1 | Pure VIN decoding (ISO 3780/SAE J853), deliberately narrow in scope: only decodes model year (position 10, handles the 30-year code-reuse cycle by picking the candidate closest to an optional hint year or the newest non-future one) and a coarse region hint from the WMI first character, for a small allow-listed set of countries with unambiguous public data. Explicitly does **not** attempt make/model/trim decoding - an earlier internal attempt at a curated make/model table (`car_specs.json`) had ~24% missing/31% low-confidence entries, judged not worth shipping. |
| `src/services/nfc/` | 4 | `NfcService.ts` (low-level NFC read/write of a `notedri://autodrive?vehicleId=&deviceId=` URI tag; disabled entirely on iOS - Core NFC can't background-launch the app the way Android can, and the iOS NFC entitlement has been removed from the build), `DeepLinkService.ts` (single `Linking` listener covering cold-start/background/foreground, dedupes the same URL arriving via both `getInitialURL()` and the `'url'` event within a 2s window), `handleAutoDriveLink.ts` (NFC tag or `notedri://autodrive` link → opens OBDSetup with a known device id pre-filled, waits up to ~3s for navigation/auth to be ready at cold start), `handleConnectLink.ts` (generic `https://notedri.com/connect` App Link/mass-printed NFC tag → resolves the default vehicle rather than "most recently paired device", since a shared/generic tag has no vehicle-specific data encoded). |
| `src/services/drivingScore/drivingScoreEngine.ts` | 1 | Pure driving-score engine shared by both OBD (ECU speed, PID 0D, already polled every 3s) and GPS (route points, already logged every 5s) - no extra battery cost from either source. Detects harsh-brake/harsh-accel events (thresholds ~0.35g/~0.3g, more conservative than the 0.3-0.5g industry range because GPS/OBD-derived speed is noisier than a real accelerometer), weights harsh braking higher than harsh acceleration (collision-risk literature), and applies smaller penalties for night-hour driving ratio (23:00-05:00) and excess idle time. All thresholds are explicitly marked as unvalidated ("beta"), same discipline as the diagnostic rule engine, pending real fleet data to calibrate. |
| `src/services/ads/` | 3 | `admob.native.ts` (real `react-native-google-mobile-ads` integration: banner/interstitial/app-open ad unit ID resolution from Expo config extras, tracking-transparency request on iOS), `admob.web.ts` (no-op stub - ads unit ids resolve to `''`, init/show functions resolve immediately, since there's no mobile ad SDK on web), `admob.d.ts` (shared type declarations so the two platform-split implementations type-check identically). `ADS_FREE_FOR_PREMIUM = false` currently - Premium doesn't yet remove ads; flip this when that entitlement ships. |
| `src/services/network/networkStatusListener.ts` | 1 | `startNetworkStatusListener()` (called once from `RootNavigator.tsx`) - actively flushes all three offline sync surfaces (OBD sessions/DTCs, GPS trips) the instant `expo-network` reports connectivity restored, as a supplementary safety net on top of the existing incidental triggers (BLE reconnect, screen mount, another successful request). Also writes online/offline transitions into `networkStatusStore` so `NetworkStatusToast.tsx` can show a toast on the transition, independent of the queue-flushing side effect. |

---

## 9. Service Lifecycle Summary (updated for the current boot sequence)

```
App launch (App.tsx, module scope - before any component mounts)
  │
  ├── installGlobalErrorHandler()              (crashLog.ts - must be first, before mount)
  │
  ├── (RootNavigator mounts)
  │     ├── authStore.initialize()              (reads token from SecureStore)
  │     ├── startNetworkStatusListener()         (network/networkStatusListener.ts)
  │     └── registerGpsRecoveryTask()            (gps/GpsTripTracker.ts - WorkManager periodic task)
  │
  ├── App-level effects (gated mostly on token/auth):
  │     ├── useObdAutoConnectSettingsStore.getState().loadSaved()
  │     ├── recoverPendingGoogleAuthIfAny()      (googleAuthRecovery.ts)
  │     ├── initDeepLinkService()                (nfc/DeepLinkService.ts - NFC/App Link/AutoDrive URLs)
  │     └── readLastFatalError() (dev warning only, crashLog.ts)
  │
  ├── if logged in:
  │     ├── ObdAutoConnect (component, not a service) tries pairedDevices.getAutoConnectPairing()
  │     │     - gated by obdAutoConnectSettingsStore master switch + per-vehicle autoConnect flag
  │     ├── GPS: no longer auto-starts unconditionally - requestPermissionsAndStart()/autoArmIfReady()
  │     │     runs when the user is on a relevant screen or auto-arm conditions are met
  │     └── Nori: NoriFloatingButton mounted; agent (src/agent/) initializes lazily on first use
  │
  └── OBD2 connect flow (user- or auto-connect-triggered):
        BleService.connect()/connectClassic() → ObdReader.initializeElm327()
          → obdLiveMonitor.start(vehicleId) → obdSessionStateMachine transitions
          → capabilityService.discoverCapability() (first connect) or getCachedCapability()
          → obdKeepAliveService.startObdKeepAlive() (Android only)
          → obdApi.deviceLock.claim() heartbeat begins (every 90s, useObd.ts)

App killed / crash recovery
  │
  ├── GpsTripTracker: expo-background-task recovery job (registered at boot) periodically calls
  │     maybeAutoShutdownStale() even with the app fully closed; checkInterruptedTrip()/
  │     resumeInterruptedTrip() handle the "app reopened within 10 minutes" resume prompt
  ├── obdLiveMonitor: orphaned checkpoint (AsyncStorage, written every 60s) recovered on next
  │     obdLiveMonitor.start() or via recoverPendingCheckpoint() from the Report screen
  └── All 4 sync queues (ObdSessionSyncQueue, ObdDtcSyncQueue ×2, GpsTripSyncQueue) flush on next
        foreground/login/network-restored - TripSyncQueue only flushes pre-14/7 legacy leftovers

Logout
  │
  ├── BleService.disconnect() (if connected)
  ├── obdLiveMonitor.stop()
  ├── clearObdSessionQueue() / clearDtcReportQueue() / clearDtcResolveQueue() / clearGpsQueue() / clearObdQueue()
  │     (each queue's clearEpoch bump prevents an in-flight enqueue from the outgoing account
  │     resurrecting an item under the next logged-in account)
  ├── pairedDevices.clearPairings() (per-account BLE pairing history)
  └── authStore.logout() → clears SecureStore token
```
