# NoteDri Mobile App - Architecture

## Executive Summary

NoteDri is a feature-based Expo React Native application. Each product domain (vehicles, refuels, OBD2, GPS trips, etc.) owns its own screen folder, API module, and TanStack Query hook. Three Zustand stores carry lightweight global state (auth session, theme, i18n language). All server communication goes through a single Axios client instance that injects the Bearer token and `Accept-Language` header on every request. Two separate background service layers - OBD2 over BLE and GPS via `expo-task-manager` - produce trip data that is uploaded to the backend and retried via AsyncStorage queues if the upload fails.

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
| Offline retry queue | @react-native-async-storage/async-storage |
| BLE hardware | react-native-ble-plx ^3.5.1 |
| GPS background | expo-location + expo-task-manager |
| OCR | expo-camera + @react-native-ml-kit/text-recognition (on-device) |
| Voice | expo-speech-recognition |
| Push | expo-notifications |
| Maps | react-native-webview + Leaflet (HTML injected) |
| i18n | i18next + react-i18next (custom Zustand wrapper, vi default / en) |
| Build | EAS Build (CLI >= 20.3.0) |

---

## Architecture Pattern

The app follows a **feature-based layered architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│  Screens (src/screens/<feature>/)                           │
│  - Consume hooks + Zustand stores                           │
│  - Render shared components (src/components/)               │
└───────────┬────────────────────────┬───────────────────────┘
            │                        │
            ▼                        ▼
┌───────────────────┐   ┌────────────────────────────────────┐
│  Zustand Stores   │   │  TanStack Query Hooks              │
│  src/store/       │   │  src/hooks/use*.ts                 │
│  - authStore      │   │  - useVehicles, useRefuels, ...    │
│  - themeStore*    │   │  Cache, deduplicate, invalidate    │
│  - i18nStore*     │   └─────────────┬──────────────────────┘
│  (*in utils/i18n) │                 │
└───────────────────┘                 ▼
                          ┌───────────────────────┐
                          │  API modules          │
                          │  src/api/<domain>.ts  │
                          │  + src/api/client.ts  │
                          │  (shared Axios inst.) │
                          └──────────┬────────────┘
                                     │ HTTPS / Bearer token
                                     ▼
                          ┌───────────────────────┐
                          │  notedri.com/api/v1   │
                          └───────────────────────┘

Hardware layer (parallel to API layer):
┌─────────────────────────┐   ┌──────────────────────────────┐
│ OBD2 Services           │   │ GPS Services                 │
│ BleService              │   │ GpsTripTracker               │
│ ObdReader               │   │  (expo-task-manager BG task) │
│ TripSession             │   │ GpsTripSyncQueue             │
│ TripSyncQueue           │   │  (AsyncStorage retry queue)  │
└─────────────────────────┘   └──────────────────────────────┘
```

**Key design rules:**
1. Screens never call `axios` or `fetch` directly - always through hooks or service classes.
2. Mutations always invalidate the affected query key so UI stays consistent.
3. `authStore` is the single source of truth for the authenticated user; never read the token from SecureStore directly in a screen.
4. Background service classes (OBD, GPS) do not import React - they are plain TypeScript singletons.

---

## Navigation Structure

```
RootNavigator
├── (isLoading)  → SplashScreen / LoadingView
├── (no token)   → AuthNavigator (Stack)
│   ├── LoginScreen
│   ├── RegisterScreen
│   └── ForgotPasswordScreen
└── (has token)  → AppNavigator
    └── RootStack (Stack, headerless)
        ├── MainTabs (BottomTabNavigator, CustomTabBar)
        │   ├── Home tab       → HomeScreen
        │   ├── Timeline tab   → TimelineScreen
        │   ├── [Center FAB]   → QuickAddFAB (overlay, not a tab screen)
        │   ├── Vehicles tab   → VehiclesStack
        │   │   ├── VehiclesScreen
        │   │   └── VehicleDetailScreen
        │   └── Profile tab    → ProfileScreen
        │
        └── Modal/stack screens (pushed over any tab):
            AddVehicleScreen, EditVehicleScreen, DossierScreen,
            HealthScreen, DashboardScreen,
            AddRefuelScreen, EditRefuelScreen, RefuelsListScreen,
            FuelPricesScreen, NearbyStationsScreen,
            AddOdometerScreen, EditOdometerScreen, OdometerListScreen,
            AddServiceScreen, EditServiceScreen, ServicesScreen,
            GarageGuideScreen, RemindersScreen, AddReminderScreen,
            EditReminderScreen, NotificationsScreen, ReportsScreen,
            YearReviewScreen, AchievementsScreen, GpsTripsScreen,
            OBDSetupScreen, OBDDashboardScreen, OBDTripsScreen,
            EditProfileScreen, ChangePasswordScreen, PremiumScreen,
            NotificationSettingsScreen, ExportDataScreen,
            FeedbackScreen, AboutScreen
```

`CustomTabBar` renders a vRace-style bottom bar with a raised center FAB (`QuickAddFAB`) that opens a modal sheet for quick odometer/refuel logging without navigating away from the current tab.

---

## State Management

### Zustand stores (global, persisted in SecureStore)

| Store | Location | Persisted | Contents |
|---|---|---|---|
| `useAuthStore` | `src/store/authStore.ts` | Yes (token + user JSON) | `token`, `user` (id, name, email, plan, is_premium, vehicle_limit), `login()`, `loginWithGoogle()`, `logout()`, `initialize()` |
| `useThemeStore` | `src/utils/theme.ts` | Yes (SecureStore key `theme`) | `mode` (dark/light), palette object `ColorPalette`, `toggle()` |
| `useI18nStore` | `src/i18n/index.ts` | Yes (SecureStore key `lang`) | `lang` (vi/en), `t()` translation function, `setLang()` |

`authStore.initialize()` is called once in `RootNavigator` on mount. It reads SecureStore, rehydrates `token` and `user`, then fires a background `GET /auth/me` refresh to pick up plan changes without blocking the UI.

### TanStack React Query (server state cache)

All data-fetching and mutation is wrapped in custom hooks under `src/hooks/`. Query keys are domain-scoped strings. Mutations call `queryClient.invalidateQueries` to keep the cache fresh.

```
useVehicles      → /vehicles/*
useRefuels       → /refuels/*
useServices      → /services/*
useObd           → /obd2/*
useGpsTrip       → /gps-trips/*
useDashboard     → /dashboard
useTimeline      → /timeline
useReminders     → /reminders/*
useOdometer      → /odometer/*
useNotifications → /notifications/*
useFuelTypes     → /fuel-types
useVoiceInput    → (no network; wraps expo-speech-recognition)
```

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

All domain-specific API functions live in `src/api/<domain>.ts` and import this shared client. They are thin wrappers and do not contain retry logic (handled by TanStack Query or sync queues).

See [api-integration.md](api-integration.md) for the full endpoint listing.

---

## Hardware Integration Layer

### BLE OBD2 (react-native-ble-plx)

```
BleService   →   ObdReader   →   TripSession
(BLE driver)     (PID/DTC)       (session lifecycle)
                                      ↓
                               TripSyncQueue  →  POST /obd2/trips
```

`BleService` is a singleton, lazy-initialized to avoid `NativeEventEmitter` warnings at boot. It manages one BLE connection at a time and supports two adapter profiles:
- **Generic ELM327**: FFF0 service UUID, FFF2 write characteristic, FFF1 notify characteristic
- **Vgate iCar**: proprietary UUIDs (auto-detected during scan)

`ObdReader` sends AT init commands through `BleService` and parses hex OBD2 responses into typed `ObdSnapshot` and `DtcCode` objects.

`TripSession` polls `readSnapshot()` every 3 s, accumulates data, detects idle engine (RPM < 200 for 30 s), and delivers a `TripSummary` when the session stops.

### GPS background trip tracking (expo-location + expo-task-manager)

```
GpsTripTracker (background task name: 'GPS_TRIP_TRACKING')
      ↓
AsyncStorage (persisted state machine + route points array)
      ↓
GpsTripSyncQueue  →  POST /gps-trips
```

The background task is registered with `expo-task-manager`. State is persisted to AsyncStorage so a killed app can recover an in-progress trip on next launch. Route points are capped at 500 entries to bound memory use.

### Camera / OCR (expo-camera + ML Kit)

`OcrCamera` wraps `expo-camera` and `@react-native-ml-kit/text-recognition`. Text recognition runs **on-device** - no network call. The raw recognized string is post-processed in the consuming screen to extract the numeric value (ODO reading or currency amount).

### Voice input (expo-speech-recognition)

`VoiceButton` wraps `expo-speech-recognition`. The hook `useVoiceInput` returns `{ isListening, startListening, stopListening, result }`. Used in `AddRefuelScreen` and `AddOdometerScreen`.

### Push notifications (expo-notifications)

On successful login, `registerPushToken()` (`src/utils/pushNotifications.ts`) requests permission, retrieves the Expo push token, and registers it with the backend via `POST /profile/push-token`. Local notifications for reminders are also scheduled via `expo-notifications`.

---

## Background Services - State Machines

### OBD TripSession

```
idle
  │  start() called by OBDDashboardScreen
  ▼
running  ◄──────────────── polling every 3 s via setInterval
  │
  │  RPM < 200 for 30 s  OR  stop() called
  ▼
stopping
  │  finalize and aggregate data
  ▼
stopped  →  onTripEnd(TripSummary)  →  TripSyncQueue
```

iOS note: `setInterval` pauses when the app is suspended. `TripSession` subscribes to `AppState` changes and resets `lastTimestamp` to now on foreground return to avoid inflating elapsed time.

### GPS GpsTripTracker

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
finalize  →  GpsTripSummary  →  GpsTripSyncQueue  →  POST /gps-trips
```

Safety valves:
- Trip auto-finalizes after 6 h (anti-hang for forgotten sessions)
- Background task shuts down after 20 min idle (battery saving)
- Trip with no GPS update for 15 min is treated as stale; recovered on next launch
- GPS fixes with accuracy worse than 50 m are ignored for distance
- Moves shorter than 8 m are filtered (parked GPS jitter)

---

## Source Tree Summary

```
notedri-app/
├── src/
│   ├── api/          Axios call functions per domain (+ shared client.ts)
│   ├── components/   13 shared UI components
│   ├── hooks/        TanStack Query hooks per domain (12 hooks)
│   ├── i18n/         vi.ts + en.ts dictionaries; Zustand i18n store (index.ts)
│   ├── navigation/   RootNavigator, AppNavigator, AuthNavigator, CustomTabBar
│   ├── screens/      44 screens, each in its feature folder
│   ├── services/
│   │   ├── obd/      BleService, ObdReader, TripSession, TripSyncQueue
│   │   └── gps/      GpsTripTracker, GpsTripSyncQueue
│   ├── store/        authStore.ts (Zustand)
│   └── utils/        theme, api, storage, pushNotifications,
│                     format, colors, vehicleIcon, navigation, reminders
├── assets/           App icons (adaptive, splash, favicon)
├── patches/          patch-package patches (react-native-ble-plx build.gradle)
├── android/          Native Android project (for EAS builds with native modules)
├── app.json          Expo config (permissions, plugins, adaptive icon)
├── eas.json          EAS Build profiles (development / preview / production)
├── App.tsx           Entry: NavigationContainer + QueryClientProvider + fonts
└── index.ts          Expo entry point (registerRootComponent)
```

---

## Testing

There are no automated tests (unit, integration, or E2E) in the current codebase. The `package.json` has no test script. All validation is manual via the development client on a real device.

**Recommended additions:**
- **Jest + @testing-library/react-native** for unit and component tests (hook logic, utility functions)
- **Detox** for E2E (requires a dev client build; compatible with EAS `development` profile)
- Mock `react-native-ble-plx` and `expo-location` for service unit tests (both have community Jest mocks)
