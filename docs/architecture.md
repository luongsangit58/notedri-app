# NoteDri Mobile App - Architecture

## Executive Summary

NoteDri is a feature-based Expo React Native application. Each product domain (vehicles, refuels, OBD2, GPS trips, etc.) owns its own screen folder, API module, and TanStack Query hook. Seven Zustand stores carry global state (auth session, network status, cockpit theme, OBD live session, selected vehicle, Nori agent conversation, OBD auto-connect settings); two more small Zustand stores live inline in `src/utils/theme.ts` (app theme) and `src/i18n/index.ts` (language). All server communication goes through a single Axios client instance that injects the Bearer token and `Accept-Language` header on every request. Three parallel background/foreground systems sit alongside the API layer: OBD2 over BLE/Classic Bluetooth (with a global non-blocking auto-connect orchestrator and a soft device lock), GPS trip tracking via `expo-task-manager`, and **Nori**, an in-app AI agent that does tool-calling against the same API/service layer to answer questions and (with confirmation) write data. Offline writes are retried through several AsyncStorage-backed sync queues built on a shared queue factory. The app has an automated Jest test suite (33 test files) covering the OBD parsing/session/sync stack, the Nori agent tool-calling loop, driving-score scoring, NFC deep links, VIN decoding, and utility math.

---

## Tech Stack

| Concern | Solution |
|---|---|
| Framework | Expo ~54.0.0 (managed workflow with custom native modules) |
| Language | TypeScript ~5.9.2 |
| React / React Native | React 19.1.0 / RN 0.81.5 |
| Navigation | React Navigation v7 (bottom-tabs + stack) |
| Global app state | Zustand v5 |
| Server state and caching | TanStack React Query v5 |
| HTTP | Axios v1 (single shared client in `src/api/client.ts`) |
| Token storage | expo-secure-store (encrypted on-device) |
| Offline retry queues | @react-native-async-storage/async-storage (shared queue factory in `src/services/syncQueue.ts`) |
| BLE hardware | react-native-ble-plx ^3.5.1 (+ a custom Classic Bluetooth native module, `modules/notedri-bt-pairing`) |
| GPS background | expo-location + expo-task-manager |
| OCR | expo-camera + @react-native-ml-kit/text-recognition (on-device) |
| Voice | expo-speech-recognition |
| Push | expo-notifications |
| Maps | react-native-webview + Leaflet (HTML injected) |
| AI agent | Nori (`src/agent/`) - tool-calling agent talking to backend `/ai/nori/chat` (Anthropic Messages API shape), Premium-gated |
| i18n | i18next + react-i18next (custom Zustand wrapper, vi default / en) |
| Testing | Jest 29 + jest-expo preset (`npm test`) - 33 `*.test.ts` files |
| Build | EAS Build (CLI >= 20.3.0) |

---

## Architecture Pattern

The app follows a **feature-based layered architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│  Screens (src/screens/<feature>/, 59 files)                 │
│  - Consume hooks + Zustand stores                            │
│  - Render shared components (src/components/)               │
└───────────┬────────────────────────┬───────────────────────┘
            │                        │
            ▼                        ▼
┌───────────────────────┐   ┌────────────────────────────────┐
│  Zustand Stores        │   │  TanStack Query Hooks           │
│  src/store/ (7 files)  │   │  src/hooks/use*.ts (15 files)   │
│  - authStore           │   │  - useVehicles, useRefuels, ... │
│  - networkStatusStore  │   │  Cache, deduplicate, invalidate │
│  - cockpitThemeStore   │   └─────────────┬────────────────────┘
│  - obdSessionStore     │                 │
│  - selectedVehicleStore│                 ▼
│  - noriAgentStore      │   ┌────────────────────────┐
│  - obdAutoConnectSettingsStore │ API modules       │
│  (+ themeStore/i18nStore, │  src/api/<domain>.ts   │
│   embedded in utils/i18n) │  + src/api/client.ts   │
└───────────────────────┘   │  (shared Axios inst.)  │
                              └──────────┬─────────────┘
                                         │ HTTPS / Bearer token
                                         ▼
                              ┌───────────────────────┐
                              │  notedri.com/api/v1   │
                              └───────────────────────┘

Parallel systems (alongside the API layer):
┌─────────────────────┐  ┌───────────────────────┐  ┌──────────────────────────┐
│ OBD2 (BLE/Classic)   │  │ GPS background trips   │  │ Nori AI Agent            │
│ BleService/ObdReader │  │ GpsTripTracker          │  │ src/agent/*              │
│ obdLiveMonitor        │  │ (expo-task-manager BG) │  │ ToolExecutor -> API/svc  │
│ ObdAutoConnect (global)│  │ GpsTripSyncQueue        │  │ layer, same as screens    │
│ device-lock (obdApi)  │  │ (AsyncStorage queue)    │  │ NoriFloatingButton (global)│
└─────────────────────┘  └───────────────────────┘  └──────────────────────────┘
```

**Key design rules:**
1. Screens never call `axios` or `fetch` directly - always through hooks or service classes.
2. Mutations always invalidate the affected query key so UI stays consistent.
3. `authStore` is the single source of truth for the authenticated user; never read the token from SecureStore directly in a screen.
4. Background service classes (OBD, GPS) do not import React - they are plain TypeScript singletons/modules.
5. Nori's tools call the *same* `src/api/*` and `src/services/*` layer the screens use - the agent has no private data path, so every number it can say is already reachable (and auditable) through normal app code.
6. Permission requests to Android/iOS APIs go through one module (`PermissionManager`) - no screen or service calls `PermissionsAndroid`/`Location.request*`/etc. directly.

---

## Navigation Structure

```
RootNavigator
├── (isLoading)  → LoadingView (the old SplashScreen wrapper around it was deleted as dead code)
├── (no token)   → AuthNavigator (Stack)
│   ├── OnboardingScreen
│   ├── LoginScreen
│   ├── RegisterScreen
│   └── ForgotPasswordScreen
└── (has token)  → AppNavigator
    └── RootStack (Stack, headerless by default)
        ├── "Tabs" → ThemedTabNavigator (BottomTabNavigator, CustomTabBar)
        │   ├── Dashboard tab   → HomeScreen
        │   ├── Stats tab       → ThongKeScreen
        │   │       (owns its OWN internal sub-tab bar, not React Navigation -
        │   │        activeTab state switches between 3 embedded screens:)
        │   │        0: TimelineScreen
        │   │        1: ReportsScreen
        │   │        2: GpsTripsScreen (embedded mode)
        │   ├── Vehicles tab    → VehiclesStack (nested Stack)
        │   │       ├── VehiclesScreen
        │   │       └── VehicleDetailScreen
        │   └── Management tab  → QuanLyScreen
        │
        └── Screens pushed on top of the tabs (RootStack.Screen, ~45 routes):
            AddRefuel, AddOdometer, EditOdometer, AddService, AddVehicle,
            EditVehicle, VehicleTransferRequests,
            Profile (avatar in HomeScreen header opens this - no longer a tab),
            EditProfile, ChangePassword, Devices,
            AddReminder, EditReminder, NearbyStations, NearbyGarages,
            FuelPrices, RefuelsList, OdometerList, EditRefuel, EditService,
            Notifications, Reports, Dossier, Health, GarageGuide, Feedback,
            NoriChat, About, NotificationSettings, ExportData, Premium,
            PaymentHistory, Services (ServicesStack: ServicesScreen),
            Achievements, GpsTrips, OBDSetup, OBDDashboard, OBDTechnical,
            ObdSystemHealth, NfcSetup, DtcLookup, TrafficFines, ObdReport,
            ObdSessionDetail (renders CorrelatedGpsTrips as a sub-component),
            YearReview
```

Notes:
- **Only 4 real bottom tabs** exist: Dashboard, Stats, Vehicles, Management. `Timeline` and `Profile` are commonly mistaken for tabs - Timeline is an internal sub-view of the Stats tab (see `ThongKeScreen.tsx`), and Profile is a pushed stack screen reached via the avatar button in `HomeScreen`'s header.
- `CustomTabBar` renders a vRace-style bottom bar with a raised center FAB (implemented inline in `CustomTabBar.tsx`) that opens a modal sheet for quick odometer/refuel logging without navigating away from the current tab.
- `Reports` and `GpsTrips` are reachable BOTH as embedded sub-tabs inside Stats and as standalone pushed RootStack screens (`GpsTripsScreen` accepts an `embedded` prop to hide its own header/chrome when nested).
- The old `DashboardScreen` (`src/screens/dashboard/`) and `OBDTripsScreen` no longer exist. OBD session history/detail now lives in `ObdSessionDetailScreen.tsx`, with correlated GPS trip data rendered by its `CorrelatedGpsTrips.tsx` sub-component.

---

## State Management

### Zustand stores (global)

| Store | Location | Persisted | Contents |
|---|---|---|---|
| `useAuthStore` | `src/store/authStore.ts` | Yes (SecureStore: token + user JSON) | `token`, `user` (id, name, email, plan, is_premium, vehicle_limit), `login()`, `loginWithGoogle()`, `logout()`, `initialize()` |
| `useNetworkStatusStore` | `src/store/networkStatusStore.ts` | No | `isOnline` flag, patched by `networkStatusListener.ts`; drives `NetworkStatusToast` |
| `useCockpitThemeStore` | `src/store/cockpitThemeStore.ts` | Yes (AsyncStorage) | `mode` (dark/light) for the OBD dashboard/cockpit screen ONLY - deliberately independent of the app-wide theme (in-car readability), defaults to dark |
| `useObdSessionStore` | `src/store/obdSessionStore.ts` | No (in-memory) | `connected`, `reconnecting`, `vehicleId`/`vehicleName`, `deviceName`, `lastSessionSaved`, `sharedByOtherDevice` (soft device-lock warning), `pendingSyncCount` - single source of truth for Home cards, vehicle detail card and the mini connection banner |
| `useSelectedVehicleStore` | `src/store/selectedVehicleStore.ts` | No | `selectedVehicleId` - the vehicle currently picked on Home, read by screens reached without `route.params.vehicleId` (reminders, odometer, etc. opened from the tab bar/FAB) |
| `useNoriAgentStore` | `src/store/noriAgentStore.ts` | No | `agent` (NoriAgent instance), `uiMessages`, `isThinking`, `progressStage`, `pendingConfirmation`; `init()`/`sendMessage()`/`submitFeedback()`/`resolveConfirmation()`/`dispose()` |
| `useObdAutoConnectSettingsStore` | `src/store/obdAutoConnectSettingsStore.ts` | Yes (AsyncStorage) | `enabled` (master on/off switch for the whole auto-connect feature), `sessionSuppressed` (in-memory only, cleared on app restart) |
| `useThemeStore` | `src/utils/theme.ts` | Yes (SecureStore key `theme`) | `mode` (dark/light) for the rest of the app, palette object `ColorPalette`, `toggle()` |
| `useI18nStore` | `src/i18n/index.ts` | Yes (SecureStore key `lang`) | `lang` (vi/en), `t()` translation function, `setLang()` |

`authStore.initialize()` is called once in `RootNavigator` on mount. It reads SecureStore, rehydrates `token` and `user`, then fires a background `GET /auth/me` refresh to pick up plan changes without blocking the UI.

### TanStack React Query (server state cache)

All data-fetching and mutation is wrapped in custom hooks under `src/hooks/` (15 files): `useDashboard`, `useFuelTypes`, `useGpsTrip`, `useNotifications`, `useObd`, `useOdometer`, `useRefuels`, `useReminders`, `useServices`, `useTimeline`, `useVehicles`, `useVehicleTransfer`, `useVoiceInput` (no network; wraps expo-speech-recognition), plus two non-query UI hooks: `useCockpitLayout` (computes gauge/ring sizes for the OBD cockpit from screen orientation) and `useCountingNumber` (animated number tween used in stat displays). Query keys are domain-scoped strings. Mutations call `queryClient.invalidateQueries` to keep the cache fresh.

**Caching strategy:** Default stale time is not explicitly overridden (TanStack default: 0). Queries refetch on window focus (React Native: app foreground). Trip and OBD2 queries use longer stale times to avoid polling during active sessions.

---

## API Integration Layer

### Axios client (`src/api/client.ts`)

```typescript
const client = axios.create({
  baseURL: `${EXPO_PUBLIC_API_URL ?? 'https://notedri.com'}/api/v1`,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  timeout: 30000,
});
```

**Request interceptor** - runs before every outbound request:
1. Reads `token` from `useAuthStore.getState()` (synchronous Zustand read, no await)
2. Sets `Authorization: Bearer <token>` if present
3. Sets `Accept-Language` from `useI18nStore.getState().lang` (defaults to `vi`)

**Response interceptor** - runs on every error response:
- On HTTP 401: calls `useAuthStore.getState().logout()`, which clears SecureStore and resets navigation to the Auth stack

All domain-specific API functions live in `src/api/<domain>.ts` (22 files: `achievements`, `auth`, `client`, `dashboard`, `devices`, `fuelTypes`, `geo`, `gpsTrips`, `nearby`, `nori`, `notifications`, `obd`, `odometer`, `payment`, `profile`, `queryClient`, `refuels`, `reminders`, `services`, `timeline`, `trafficFines`, `vehicles`, `vehicleTransfer`) and import the shared client. They are thin wrappers and do not contain retry logic (handled by TanStack Query or the sync queues below).

See [api-integration.md](api-integration.md) for the full endpoint listing.

---

## Hardware Integration Layer

### BLE / Classic Bluetooth OBD2

```
BleService / NotedriBtPairing (native Classic BT module)
        │
        ▼
   ObdReader (AT init + PID/DTC parsing)
        │
        ▼
   obdLiveMonitor  ──── orchestrator: polling scheduler (obdPollingScheduler),
   (started by useObd  session state machine (obdSessionStateMachine),
   after connect)       diagnostic rule engine (diagnosticEngine + diagnosticRulesStore),
        │               driving-score engine (drivingScore/drivingScoreEngine),
        │               DTC notifications (dtcNotificationStore)
        ▼
 ObdSessionSyncQueue / ObdDtcSyncQueue  →  POST /obd2/session, /obd2/dtc
```

`BleService` is a singleton, lazy-initialized to avoid `NativeEventEmitter` warnings at boot. It manages one BLE connection at a time (generic ELM327 FFF0/FFF1/FFF2 UUIDs, Vgate iCar proprietary UUIDs auto-detected during scan) and delegates to the custom `modules/notedri-bt-pairing` native module for Classic Bluetooth (SPP) adapters that don't expose a BLE GATT profile.

`obdLiveMonitor` (`src/services/obd/obdLiveMonitor.ts`) is the actual session orchestrator that replaced the earlier `TripSession` class: `obdLiveMonitor.start(vehicleId)` is called once BLE connects, it drives a "medium poll" loop (PID reads via `ObdReader`), keeps a `VehicleSessionState` machine (`obdSessionStateMachine.ts` - see below) up to date, feeds the diagnostic rule engine and driving-score engine, and on session end calls `buildSessionSummary()` which is handed off to `ObdSessionSyncQueue`. DTC reports/clears go through the separate `ObdDtcSyncQueue` so a lost connection at the exact moment a code is detected doesn't drop the report.

### Offline sync queues

All offline write queues share one generic factory, `createSyncQueue()` in `src/services/syncQueue.ts` (AsyncStorage-backed, capped size, single-flight, and a logout "epoch" guard so a leftover queued item from a previous account is never replayed under a new one). Permanent-vs-temporary error classification is centralized in `src/services/syncRetryPolicy.ts` (4xx other than 401/403/429 = permanent/drop; network errors, 5xx, 429 = retry forever; 401/403 = retry up to `MAX_AUTH_RETRIES` then drop). Four queues are built on top of this factory:

| Queue | File | Endpoint |
|---|---|---|
| OBD session summaries | `src/services/obd/TripSyncQueue.ts`, `ObdSessionSyncQueue.ts` | `POST /obd2/session` (idempotency key generated at enqueue time) |
| OBD DTC report/resolve | `src/services/obd/ObdDtcSyncQueue.ts` | `POST /obd2/dtc`, `POST /obd2/dtc/.../resolve` |
| GPS trips | `src/services/gps/GpsTripSyncQueue.ts` | `POST /gps/trips` |

### GPS background trip tracking (expo-location + expo-task-manager)

```
GpsTripTracker (background task name: 'GPS_TRIP_TRACKING')
      ↓
AsyncStorage (persisted state machine + route points array)
      ↓
GpsTripSyncQueue  →  POST /gps/trips
```

The background task is registered with `expo-task-manager`. State is persisted to AsyncStorage so a killed app can recover an in-progress trip on next launch. Route points are capped at 500 entries to bound memory use.

### Camera / OCR (expo-camera + ML Kit)

`OcrCamera` wraps `expo-camera` and `@react-native-ml-kit/text-recognition`. Text recognition runs **on-device** - no network call. The raw recognized string is post-processed in the consuming screen to extract the numeric value (ODO reading or currency amount).

### Voice input (expo-speech-recognition)

`VoiceButton` wraps `expo-speech-recognition`. The hook `useVoiceInput` returns `{ isListening, startListening, stopListening, result }`. Used in `AddRefuelScreen`, `AddOdometerScreen`, and Nori's voice popover.

### Push notifications (expo-notifications)

On successful login, `registerPushToken()` (`src/utils/pushNotifications.ts`) requests permission, retrieves the Expo push token, and registers it with the backend via `POST /profile/push-token`. Local notifications for reminders (and DTC/GPS-trip alerts, handled in `App.tsx`'s notification-response listener) are also scheduled via `expo-notifications`.

### PermissionManager (`src/services/permissions/`)

`PermissionManager.ts` is the single place in the app allowed to call `PermissionsAndroid`/`Location.request*`/`Camera.request*`/notifications/microphone permission APIs directly - it used to be scattered across `BleService`, `GpsTripTracker`, `obdKeepAliveService`, `OcrCamera`, `useVoiceInput`, and `pushNotifications`, with GPS and OBD keep-alive independently reimplementing the same "foreground → disclosure → background" location flow. It normalizes every permission check to one `{ granted, canAskAgain }` shape, handles the Android 12+ (`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`) vs. pre-12 (`ACCESS_FINE_LOCATION`) BLE permission split, and exposes a "check only, don't prompt" variant (`hasBluetooth`) for the background auto-connect flow so it never surprises the user with an unexplained permission dialog. `backgroundLocationDisclosure.ts` renders the Play-Store-mandated "prominent disclosure" screen required before requesting background location.

---

## AI Agent Layer - Nori

Nori is an in-app AI assistant (Premium-gated) that answers questions about the user's vehicles/costs/maintenance and, with explicit confirmation, can write data (e.g. log an odometer reading or a refuel). It is **not** a separate screen bolted onto the app - the agent runtime is mounted globally.

### Where it's mounted

- `NoriFloatingButton` (`src/components/nori/NoriFloatingButton.tsx`) is rendered once in `App.tsx`, alongside `ObdSessionBanner`/`NetworkStatusToast`/`ObdAutoConnect`, so it persists across every screen transition. It is a draggable floating avatar (auto-hidden while `NoriChatScreen` itself is open, or while its own popover is open) that opens `NoriQuickPopover` - an in-place popup (no navigation) that can listen, speak, and show a short reply, with an "expand" action that pushes the full `NoriChatScreen` (route `NoriChat`) for typed conversation, history, feedback, and write confirmations.
- `useNoriAgentStore` (`src/store/noriAgentStore.ts`) owns the single `NoriAgent` instance for the app session, created lazily via `init(getVehicleId, userName)`.

### Tool-calling architecture (`src/agent/`)

```
NoriChatScreen / NoriQuickPopover
        │  sendMessage(text)
        ▼
useNoriAgentStore  ──  premium gate (blocks BOTH the local matcher and the LLM path for free users)
        │
        ▼
NoriAgent  (idle ⇄ thinking state machine)
        │
        ▼
ConversationManager
  ├── LocalIntentMatcher   - deterministic pattern match answered straight from a tool_result,
  │                          no LLM call (faster, cheaper, 100% grounded since there's no LLM
  │                          rewrite step where a number could be invented)
  └── LLM loop (up to 6 tool iterations):
        1. POST backend /ai/nori/chat (Anthropic Messages API shape: messages[] + tools[])
        2. if stop_reason === 'tool_use' → ToolExecutor.execute() each tool_use block
             - SafetyPolicy.canUseTool() gate (blocks mutating tools like odometer.create/
               fuel.create while IVehicleIO reports speed > 0 - "don't write while driving")
             - requiresConfirmation tools await a user-supplied confirmAction() Promise,
               resolved by the pendingConfirmation UI in NoriChatScreen
             - tool implementations live in tools/{vehicleTools,knowledgeTools,businessTools,
               writeTools}.ts and call into the SAME src/api/*.ts / src/services/*.ts used by
               screens - no private data path for the agent
           tool_result blocks are appended and looped back to the LLM
        3. once stop_reason !== 'tool_use', a grounding validator scans every digit sequence
           in the LLM's final text against every tool_result AND every user message seen so
           far in the conversation; any ungrounded number is replaced with a safe refusal
           string instead of being shown (anti-hallucination guard for figures like costs/
           odometer values)
```

`ToolRegistry` holds the Map of tool name → definition and exports the Anthropic `tools[]` schema. `SafetyPolicy` is the single gate for "is it safe to run this tool right now" (Phase 1: only driving-state checks). `VehicleContext` (`src/agent/VehicleContext.ts`) implements `IVehicleIO` against the live OBD snapshot so the agent can answer "what's my current speed" without a network round trip. A `TestHarness`/`MockVehicleAdapter` under `src/agent/platform/` let the tool-calling loop be exercised in Jest without any network or native BLE dependency (`src/agent/__tests__/noriAgentHarness.test.ts`).

---

## OBD Cockpit Dashboard, Auto-Connect & Device Lock

### Dashboard visual styles

The OBD "cockpit" screen (`OBDDashboardScreen`) is skinnable: `src/constants/dashboardStyles.ts` is a registry of 6 selectable layouts, each a full-screen component under `src/components/obd/dashboard/layouts/`:

| Style id | Component | Premium only |
|---|---|---|
| `analog` | `AnalogLayout.tsx` | No (default/free) |
| `racing` | `RacingLayout.tsx` | Yes |
| `minimal` | `MinimalLayout.tsx` | Yes |
| `retro` | `RetroLayout.tsx` | Yes |
| `night` | `NightLayout.tsx` | Yes |
| `fleet` | `FleetLayout.tsx` | Yes (also `hiddenFromPicker` - reserved for a future B2B/fleet-branding channel, not purchasable through the normal Premium upsell yet) |

The selected style is persisted **per vehicle** in AsyncStorage (`getSelectedDashboardStyleId`/`setSelectedDashboardStyleId`, key `obd_dashboard_style_id_<vehicleId>`), chosen via `DashboardStylePicker.tsx`. `useCockpitLayout()` (`src/hooks/useCockpitLayout.ts`) is the single source of truth for gauge/ring pixel sizes given current orientation, replacing three previously-duplicated size formulas. `useCockpitThemeStore` controls light/dark for this screen independently of the rest of the app (always defaults dark, for in-car readability).

### Global non-blocking auto-connect

`ObdAutoConnect` (`src/components/ObdAutoConnect.tsx`) is mounted globally in `App.tsx` (same level as `ObdSessionBanner`). On a cold start or foreground return, if the master switch (`useObdAutoConnectSettingsStore.enabled`, default on) is enabled, the user is Premium, Bluetooth is powered on with scan permission already granted (checked via `PermissionManager.hasBluetooth()`, never prompts), and a paired auto-connect device is on record for the default vehicle, it silently starts a scan and — once the paired device is found — shows a **non-blocking bottom-sheet card** (not a `Modal`, so the rest of the app is still usable underneath) with a 5-second countdown before auto-connecting. The user can tap "Connect now", dismiss (silently, no "paused" banner - a later app open/foreground return will try again after the 60s cooldown), or turn auto-connect off for that vehicle entirely. A dismiss during an in-flight connection attempt calls the full `disconnect()` path (not just a BLE-level disconnect) so any soft device lock already claimed is released rather than left to expire.

### Device lock (soft, advisory)

`obdApi.deviceLock.claim(vehicleId, deviceId, deviceName)` / `.release(...)` (`src/api/obd.ts`) implement a **soft** per-vehicle lock: when this phone connects to a vehicle's OBD2 adapter, it claims the lock; if another device already holds it, the response flags `locked_by_other` and the app surfaces it via `useObdSessionStore.sharedByOtherDevice` (an "in use by another device" notice) - it does **not** block the connection. While connected, `useObd.ts` calls `claimDeviceLock()` again every `DEVICE_LOCK_RENEW_INTERVAL_MS` (90s) as a heartbeat/renew (reusing `claim()` rather than a separate renew endpoint), so the server can expire a stale lock if a device disappears without a clean `release()`.

---

## Background Services - State Machines

### OBD `VehicleSessionState` (`src/services/obd/obdSessionStateMachine.ts`)

```
DISCONNECTED
  │  BLE/Classic connect begins
  ▼
CONNECTING
  │  connected
  ▼
CONNECTED
  │  ELM327 AT init sequence completes
  ▼
ELM_READY  ◄────────────────────────────────────┐
  │                                              │
  │  engine off / idle / driving (free transitions between the 3 below)
  ▼                                              │
ENGINE_OFF ⇄ ENGINE_IDLE ⇄ DRIVING ───────────────┘
  │
  │  session ends (disconnect / stop())
  ▼
STOPPED  →  DISCONNECTED
```

`obdLiveMonitor.start(vehicleId)` drives this machine and the polling loop together; on stop it calls `buildSessionSummary()`, which is hashed into `ObdSessionSyncQueue`. iOS note: BLE polling intervals pause when the app is suspended - `obdLiveMonitor` resets its timing reference on `AppState` foreground return to avoid inflating elapsed/idle time.

### GPS `GpsTripTracker` (`src/services/gps/GpsTripTracker.ts`)

```
idle
  │  speed > 5 km/h detected in background task
  ▼
waiting_start  (12 s confirmation window)
  │  speed stays > 5 km/h
  ▼
active  ◄──────────────── GPS location updates ~every 1 s
  │  speed drops below 3 km/h
  ▼
waiting_stop  (3 min confirmation window)
  │  speed stays < 3 km/h for 3 min
  ▼
finalize  →  GpsTripSummary  →  GpsTripSyncQueue  →  POST /gps/trips
```

Safety valves:
- Trip auto-finalizes after 6 h (anti-hang for forgotten sessions)
- Background task shuts down after 20 min idle (battery saving); a periodic ~15-minute WorkManager recovery task (`registerGpsRecoveryTask`, wired in `App.tsx`) sweeps up trips stuck open by an app/OS kill even while the app isn't running
- Trip with no GPS update for 15 min is treated as stale; recovered on next launch
- GPS fixes with accuracy worse than 50 m are ignored for distance
- Moves shorter than 8 m are filtered (parked GPS jitter)

---

## Source Tree Summary

```
notedri-app/
├── src/
│   ├── agent/         Nori AI agent (23 files): NoriAgent, ConversationManager,
│   │                  ToolExecutor, ToolRegistry, safety/SafetyPolicy,
│   │                  tools/{vehicleTools,knowledgeTools,businessTools,writeTools},
│   │                  platform/ (IVehicleIO, MockVehicleAdapter, TestHarness),
│   │                  VehicleContext, LocalIntentMatcher, LocalReplyTemplates
│   ├── api/           22 files - Axios call functions per domain (+ shared client.ts)
│   ├── components/    29 top-level shared UI components, plus
│   │   ├── nori/      NoriFloatingButton, NoriQuickPopover, NoriAvatar, VoiceWaveform
│   │   └── obd/       CockpitClock, CockpitWeather, GaugeCluster, DashboardStylePicker,
│   │                  dashboard/layouts/{Analog,Racing,Minimal,Retro,Night,Fleet}Layout,
│   │                  dashboard/primitives/{ArcGauge,RingProgress}
│   ├── hooks/         15 hooks: TanStack Query hooks per domain + useCockpitLayout,
│   │                  useCountingNumber, useVehicleTransfer, useVoiceInput
│   ├── i18n/          vi.ts + en.ts dictionaries; Zustand i18n store (index.ts)
│   ├── navigation/     RootNavigator, AppNavigator, AuthNavigator, CustomTabBar
│   ├── screens/       59 screens, each in its feature folder (nori/, obd/, health/,
│   │                  management/, stats/ added since the previous doc revision)
│   ├── services/
│   │   ├── ads/           AdMob native/web split
│   │   ├── drivingScore/  drivingScoreEngine.ts (+ __tests__)
│   │   ├── gps/           GpsTripTracker, GpsTripSyncQueue
│   │   ├── network/       networkStatusListener.ts
│   │   ├── nfc/           NfcService, DeepLinkService, handleConnectLink/AutoDriveLink (+ __tests__)
│   │   ├── nori/          nori.ts, noriSummary.ts, voiceCues.ts (+ __tests__)
│   │   ├── obd/           ~21 files: BleService, ObdReader, obdLiveMonitor,
│   │   │                  obdSessionStateMachine, obdPollingScheduler, diagnosticEngine,
│   │   │                  diagnosticRulesStore, dtcNotificationStore, dtcOfflineDictionary,
│   │   │                  capabilityService, systemHealth, sessionReport, sessionTrend,
│   │   │                  pairedDevices, ObdSessionSyncQueue, ObdDtcSyncQueue, TripSyncQueue,
│   │   │                  obdSyncStatus, obdKeepAliveService, obdLogger, obdParser (+ __tests__,
│   │   │                  19 test files)
│   │   ├── permissions/   PermissionManager.ts, backgroundLocationDisclosure.ts
│   │   ├── vehicles/      resolveDefaultVehicle.ts
│   │   ├── vin/           vinDecoder.ts (+ __tests__)
│   │   ├── crashLog.ts, googleAuthRecovery.ts, syncQueue.ts (shared queue factory),
│   │   │   syncRetryPolicy.ts
│   ├── store/         7 Zustand stores: authStore, networkStatusStore, cockpitThemeStore,
│   │                  obdSessionStore, selectedVehicleStore, noriAgentStore,
│   │                  obdAutoConnectSettingsStore
│   └── utils/         theme (+ embedded useThemeStore), api, storage, pushNotifications,
│                       format, colors, vehicleIcon, navigation, reminders, ewma (+ __tests__)
├── assets/           App icons (adaptive, splash, favicon)
├── modules/          Custom native module: notedri-bt-pairing (Classic Bluetooth)
├── patches/          patch-package patches (react-native-ble-plx build.gradle)
├── android/          Native Android project (for EAS builds with native modules)
├── app.json          Expo config (permissions, plugins, adaptive icon)
├── eas.json          EAS Build profiles (development / preview / production)
├── App.tsx           Entry: NavigationContainer + QueryClientProvider + global overlays
│                     (ObdSessionBanner, NetworkStatusToast, ObdAutoConnect,
│                     AppOpenAdManager, NoriFloatingButton)
└── index.ts          Expo entry point (registerRootComponent)
```

---

## Testing

The app has an automated Jest suite: `package.json` defines `"test": "jest"` with the `jest-expo` preset (`testMatch: ["**/__tests__/**/*.test.ts"]`), and `@react-native-async-storage/async-storage` is mocked globally via `moduleNameMapper`. There are **33** `*.test.ts` files, concentrated in:
- `src/services/obd/__tests__/` (19 files) - BLE Classic adapter, ELM327 parser, capability detection, diagnostic engine/rules, DTC notification/offline dictionary, `obdLiveMonitor` (driving score, fuel, DTC phase 2, resilience, smoothing), polling scheduler, paired devices, session state machine, session sync queue, session report/trend, system health - plus an `elm327Emulator.ts` test helper
- `src/agent/__tests__/` (3 files) - Nori tool-calling harness, unsubscribe/cleanup behavior, progress-text mapping
- `src/services/drivingScore/`, `src/services/nfc/`, `src/services/nori/`, `src/services/vin/` (1 file each)
- `src/constants/__tests__/obdMetrics.test.ts` and `src/utils/__tests__/ewma.test.ts`

There is no E2E test runner (Detox etc.) configured; manual verification via the development client on a real device remains the way OBD/GPS hardware flows and screen-level UX are validated.
