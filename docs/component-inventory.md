# NoteDri Mobile App - Component Inventory

All shared components live in `src/components/`, including two functional subfolders — `nori/` (the Nori AI companion's floating UI) and `obd/` (the OBD2 live-dashboard UI) — both of which are in scope for this document. Navigation-layer components (`CustomTabBar`) live in `src/navigation/`.

`src/components/` contains **48 files** (verified via `find src/components -type f`, 2026-08-13; `QuickAddFAB.tsx` — previously the 29th flat-level file, already flagged below as orphaned dead code from the deleted `DashboardScreen` — was deleted the same day this revision was written):

- **28 files** at the flat top level (`AdMobBanner` ships as 3 files — `.d.ts` + `.native.tsx` + `.web.tsx` — counted as 1 logical component; `AppOpenAdManager` ships the same way, also counted as 1; `leafletAssets.ts` is a non-component HTML/JS asset module, not a React component) → **24 logical entries** (23 components + 1 asset module).
- **4 files** in `nori/` → 4 logical components.
- **16 files** in `obd/` (7 standalone files + 9 files under `obd/dashboard/` — 6 layout components, 2 gauge primitives, 1 shared types file) → documented as **8 logical entries** (7 individual components + 1 grouped entry for the 6 dashboard-style layouts + their primitives, per the scope note below).

Plus `CustomTabBar` in `src/navigation/`.

**Total: 37 documented logical entries** across 49 tracked files (48 in `src/components/` + `CustomTabBar`).

(A previous revision of this document, dated 2026-07-16, scoped itself to ONLY the flat top level of `src/components/` and explicitly excluded subfolders — at the time this missed `nori/` and `obd/` entirely, including two components, `NoriFloatingButton` and `ObdAutoConnect`, that are mounted globally in `App.tsx` and are exactly the kind of app-wide shared UI this document is meant to cover. This revision, produced 2026-08-13, covers all of `src/components/` including subfolders.)

---

## Root-Mounted (Global) vs. Screen-Local Components

`App.tsx` mounts a fixed set of components as permanent siblings of `<RootNavigator />`, inside `<NavigationContainer ref={navigationRef}>`. These run for the lifetime of the app, on every screen, regardless of navigation state — they are architecturally distinct from the majority of components in this doc, which are imported and rendered only by specific screens:

```tsx
<AppErrorBoundary>                    {/* wraps EVERYTHING, outermost */}
  ...
  <NavigationContainer ref={navigationRef}>
    <RootNavigator />
    <ObdSessionBanner />
    <NetworkStatusToast />
    <ObdAutoConnect />
    <AppOpenAdManager />
    <NoriFloatingButton />
  </NavigationContainer>
  ...
</AppErrorBoundary>
```

| Component | Root-mounted in App.tsx? | Notes |
|---|---|---|
| `AppErrorBoundary` | Yes — outermost wrapper, wraps the entire component tree including `GestureHandlerRootView`/`KeyboardProvider`/`SafeAreaProvider` | Class component; catches render/lifecycle errors app-wide |
| `ObdSessionBanner` | Yes | Reads `useObdSessionStore` directly, no props |
| `NetworkStatusToast` | Yes | Reads `useNetworkStatusStore` directly, no props |
| `ObdAutoConnect` | Yes | Reads auth/vehicle/BLE state directly, no props |
| `AppOpenAdManager` | Yes | Reads `useAuthStore` directly, no props |
| `NoriFloatingButton` | Yes | Reads auth/vehicle/navigation state directly, no props; self-hides on the `NoriChat` route and while its own popover is open |

Every other component in this document is a screen-local import — used by one or more specific screens, not globally mounted.

---

## Component Categories

| Category | Components |
|---|---|
| Layout / Decoration | AppBgPattern, LoadingView, ErrorView |
| Form Inputs | DatePickerField, MoneyInput, PasswordInput, SelectField, VehicleMoreFields |
| Hardware-backed Inputs | OcrCamera, VoiceButton |
| Media Pickers | ReceiptPicker |
| Data Display | VehicleCard, TimelineItem |
| Map | RouteMap, DayRouteMap |
| Icon | Icon |
| Ads | AdMobBanner, AppOpenAdManager |
| Global App Shell | AppErrorBoundary, NetworkStatusToast |
| OBD2 | ObdConnectionGuide, ObdSessionBanner, ObdAutoConnect, DashboardStylePicker, GaugeCluster, CockpitClock, CockpitWeather, PipCompactView, SafetyAlerts, StatBox, dashboard layouts + primitives |
| Nori AI Companion | NoriFloatingButton, NoriAvatar, NoriQuickPopover, VoiceWaveform |
| Navigation | CustomTabBar |

---

## Full Component Reference

### AdMobBanner

| Property | Value |
|---|---|
| Path | `src/components/AdMobBanner.native.tsx`, `src/components/AdMobBanner.web.tsx`, `src/components/AdMobBanner.d.ts` |
| Type | Feature / Ads |
| Purpose | Renders a Google AdMob adaptive anchored banner ad (`react-native-google-mobile-ads`) at the bottom of a screen. The `.native.tsx` implementation resolves an ad-unit ID via `getAdMobBannerAdUnitId()` (or `TestIds.BANNER` in `__DEV__`) and renders nothing on `Platform.OS === 'web'`, when no unit ID is configured, or for premium users (`ADS_FREE_FOR_PREMIUM`). The `.web.tsx` variant is a no-op stub (`return null`) so Metro's platform-extension resolution keeps the web/Expo-web build free of the native ads SDK. |
| Used by | HomeScreen, HealthScreen, VehiclesScreen, ReportsScreen, VehicleDetailScreen, TimelineScreen, RemindersScreen (expanded well beyond the single HomeScreen placement of the prior revision) |
| Dependencies | react-native-google-mobile-ads, `src/services/ads/admob.ts` |

---

### AppBgPattern

| Property | Value |
|---|---|
| Path | `src/components/AppBgPattern.tsx` |
| Type | UI / Layout |
| Purpose | Renders a decorative background gradient/pattern layer behind screen content. Gives all screens a consistent visual base without repeating styles. Typically rendered as the first child of a screen's root `View`, right after `SafeAreaView`. |
| Used by | Nearly every screen in the app (background decoration) — confirmed present in 50+ screen files |

---

### AppErrorBoundary

| Property | Value |
|---|---|
| Path | `src/components/AppErrorBoundary.tsx` |
| Type | Global App Shell / Class Component |
| Purpose | React class-component error boundary that wraps the **entire** app tree in `App.tsx` (outermost element, above `GestureHandlerRootView`). Before this existed, any render-time error (e.g. a gauge calculation producing `NaN` while driving) crashed the whole app silently in release builds with no diagnostic trace. On catch, calls `persistFatalError()` (`src/services/crashLog.ts`) to log the crash for later inspection and renders a plain "Đã có lỗi xảy ra. Vui lòng mở lại ứng dụng." fallback screen with a "Thử lại" (retry) button that resets its own state. Deliberately avoids `useColors()`/`useT()` in its fallback UI, since if the Theme/I18n provider itself is the failure source, depending on that same context in the fallback would crash again inside the catch path. Only catches render/lifecycle errors in its React subtree — native callback errors (BLE) or unhandled Promise rejections do not pass through it (see `installGlobalErrorHandler()` in `crashLog.ts` for that separate path). |
| Used by | Mounted once, globally, as the outermost wrapper in `App.tsx` — not used by any individual screen |

---

### DatePickerField

| Property | Value |
|---|---|
| Path | `src/components/DatePickerField.tsx` |
| Type | UI / Form Input |
| Purpose | Cross-platform date picker. Shows an iOS-native modal date picker on iOS and the Android system date dialog on Android. Accepts a `value` (Date/string) and `onChange` callback, wrapping platform differences so calling screens need no platform-specific code. |
| Used by | AddRefuelScreen, EditRefuelScreen, AddServiceScreen, EditServiceScreen, AddReminderScreen, EditReminderScreen, RemindersScreen, AddOdometerScreen, EditOdometerScreen, VehicleMoreFields (purchase date), and other date-entry screens |

---

### DayRouteMap

| Property | Value |
|---|---|
| Path | `src/components/DayRouteMap.tsx` |
| Type | Feature / Map |
| Purpose | "View whole day" variant of `RouteMap` (mirrors a web feature) — draws **multiple** GPS routes on the same Leaflet map, each in its own color (`ColoredRoute = { points, color }`), instead of `RouteMap`'s single polyline. Reuses `leafletAssets.ts` for the embedded Leaflet HTML/JS but builds its own HTML document (`buildDayHtml`) rather than modifying `RouteMap`, so existing single-trip callers are unaffected. Auto-fits map bounds to all drawn routes. |
| Used by | GpsTripsScreen |
| Dependencies | react-native-webview, `src/components/leafletAssets.ts`, `src/components/RouteMap.tsx` (imports the `LatLng` type only) |

---

### ErrorView

| Property | Value |
|---|---|
| Path | `src/components/ErrorView.tsx` |
| Type | UI / State Display |
| Purpose | Standardized full-screen or inline error state. Displays an error message and a "Retry" button that calls the provided `onRetry` callback. Ensures consistent error UX across all data-fetching screens. |
| Used by | Screens that surface a TanStack Query `isError` state (e.g. TimelineScreen, VehiclesScreen, VehicleDetailScreen, EditVehicleScreen, RemindersScreen, ReportsScreen) |

---

### Icon

| Property | Value |
|---|---|
| Path | `src/components/Icon.tsx` |
| Type | UI / Primitive |
| Purpose | Thin wrapper around `@expo/vector-icons` FontAwesome5. Accepts `name`, `size`, and `color` props and applies a theme-aware default color when no explicit color is passed, centralizing icon-library choice so switching libraries later only touches one file. (Most screens still call `FontAwesome5` directly rather than going through `Icon`.) |
| Used by | VehicleCard, TimelineItem, HomeScreen, and other components that want a themed default icon color |

---

### LoadingView

| Property | Value |
|---|---|
| Path | `src/components/LoadingView.tsx` |
| Type | UI / State Display |
| Purpose | Full-screen centered `ActivityIndicator` with an optional message, matching theme colors. Used as the loading state for TanStack Query `isLoading` conditions, and directly by `RootNavigator` while `authStore.initialize()` runs (the old `SplashScreen` wrapper that used to own this role was deleted as dead code). |
| Used by | RootNavigator, AuthNavigator, VehiclesScreen, VehicleDetailScreen, EditVehicleScreen, ReportsScreen, FuelPricesScreen, and other screens' initial-loading states |

---

### MoneyInput

| Property | Value |
|---|---|
| Path | `src/components/MoneyInput.tsx` |
| Type | UI / Form Input |
| Purpose | Numeric text input that displays values in Vietnamese Dong (VND) formatting with thousands separators, handling the conversion between the raw number value and the formatted display string. Exports a `toMoneyRaw` helper for reading the underlying numeric value back out. |
| Used by | AddRefuelScreen, EditRefuelScreen, AddServiceScreen, EditServiceScreen |

---

### NetworkStatusToast

| Property | Value |
|---|---|
| Path | `src/components/NetworkStatusToast.tsx` |
| Type | Global App Shell / State Display |
| Purpose | Floating pill toast that announces network connectivity transitions ("back online" / "offline") by watching `useNetworkStatusStore` (fed by `networkStatusListener.ts`). Distinct from `ObdSessionBanner`, which only reports OBD2 connection-state changes — this one is purely about internet/network reachability. Visually similar (floating pill, auto-dismiss after ~4.5s) but positioned lower (`top: 110` vs. `ObdSessionBanner`'s `top: 60`) so the two toasts don't visually collide if they happen to fire at the same time. Suppresses the transition toast on first mount (doesn't fire just because the app happened to start offline). |
| Used by | Mounted once, globally, in `App.tsx` alongside `ObdSessionBanner` — not used by any individual screen |

---

### ObdAutoConnect

| Property | Value |
|---|---|
| Path | `src/components/ObdAutoConnect.tsx` |
| Type | Global App Shell / Feature / OBD2 |
| Purpose | Orchestrates automatically reconnecting to a paired OBD2 adapter when the app opens or returns to the foreground, without requiring the user to be on the OBD setup/dashboard screen. Gated by: premium (`isPremium`), a global on/off switch (`useObdAutoConnectSettingsStore`), a per-session "dismissed" suppression flag, a 60s cooldown between attempts, current route (skips while already on `OBDSetup`/`OBDDashboard`), Bluetooth adapter power state, and scan permissions. Resolves the default vehicle and its remembered auto-connect pairing (BLE or Classic transport), then renders `AutoConnectPrompt` — a non-blocking bottom-sheet overlay (`pointerEvents="box-none"`, not a `<Modal>`, so the user can keep using the app underneath while it counts down 5s and connects) with a live countdown, manual "connect now" / "cancel" / "disable auto-connect" actions, and a brief "connected silently" notice banner with a button to jump to `OBDDashboard` if the countdown completed on its own without the user tapping anything. |
| Used by | Mounted once, globally, in `App.tsx` — not used by any individual screen. (`OBDDashboardScreen` and `ProfileScreen` only consume the sibling `useObdAutoConnectSettingsStore`, not this component directly.) |
| Dependencies | `store/obdAutoConnectSettingsStore.ts`, `services/obd/BleService.ts`, `services/obd/pairedDevices.ts`, `services/vehicles/resolveDefaultVehicle.ts`, `hooks/useObd.ts`, `modules/notedri-bt-pairing` |

---

### ObdConnectionGuide

| Property | Value |
|---|---|
| Path | `src/components/ObdConnectionGuide.tsx` |
| Type | Feature / OBD2 |
| Purpose | Swipeable 4-step illustrated carousel ("find port → plug in → turn key → pair Bluetooth") shown on the OBD setup screen, replacing an earlier plain 3-line text card. Each slide pairs one bundled step image (`assets/obd-guide/step-*.png`) with a short instruction and an icon; includes page-dot indicators. |
| Used by | OBDSetupScreen |

---

### ObdSessionBanner

| Property | Value |
|---|---|
| Path | `src/components/ObdSessionBanner.tsx` |
| Type | Global App Shell / Feature / OBD2 |
| Purpose | Transition toast for OBD BLE connection-state changes (connected / reconnected / disconnected / session-auto-saved), shown for ~2.5s whenever `useObdSessionStore`'s `connected`/`reconnecting` flags change. Complements the persistent status pill elsewhere in the OBD UI by giving an immediate, momentary confirmation at the point of transition. |
| Used by | Mounted once, globally, in `App.tsx` (reads `useObdSessionStore` directly; navigates via `navigationRef`) — not used by any individual screen |

---

### OcrCamera

| Property | Value |
|---|---|
| Path | `src/components/OcrCamera.tsx` |
| Type | Feature / Hardware |
| Purpose | Camera viewfinder powered by `expo-camera` with on-device text recognition from `@react-native-ml-kit/text-recognition`. Renders a live camera preview, captures a frame, and runs ML Kit OCR locally, returning the raw recognized text (and, for receipts, a structured `ReceiptData` guess) via an `onResult` callback. No network call is made. |
| Used by | AddOdometerScreen (ODO reading), AddRefuelScreen (receipt total), AddServiceScreen (receipt total) |
| Dependencies | expo-camera, @react-native-ml-kit/text-recognition |

---

### PasswordInput

| Property | Value |
|---|---|
| Path | `src/components/PasswordInput.tsx` |
| Type | UI / Form Input |
| Purpose | `TextInput` with `secureTextEntry` toggled by an eye/eye-slash icon button, giving a consistent password field. (Login/Register/ChangePassword currently implement their own inline show/hide `TextInput` rather than importing this component, but it remains available for reuse.) |
| Used by | Not currently imported anywhere — available for any password-entry form |

---

### ReceiptPicker

| Property | Value |
|---|---|
| Path | `src/components/ReceiptPicker.tsx` |
| Type | Feature / Media Picker |
| Purpose | Image picker (via `expo-image-picker`'s media library) for attaching a receipt photo to a service-log entry. Tracks a freshly picked photo, an already-saved photo URL (edit mode), and a "removed" flag; includes a full-screen photo viewer modal. |
| Used by | AddServiceScreen, EditServiceScreen |
| Dependencies | expo-image-picker |

---

### RouteMap

| Property | Value |
|---|---|
| Path | `src/components/RouteMap.tsx` |
| Type | Feature / Map |
| Purpose | Renders a GPS trip route as a polyline on a Leaflet map inside a `react-native-webview`. The Leaflet HTML/JS is provided by `leafletAssets.ts` (inline string). Accepts an array of `{lat, lng}` coordinate objects and visualizes completed GPS trip routes. Exports the `LatLng` type, reused by `DayRouteMap`. |
| Used by | GpsTripsScreen (single-trip detail) |
| Dependencies | react-native-webview, `src/components/leafletAssets.ts` |

---

### SelectField

| Property | Value |
|---|---|
| Path | `src/components/SelectField.tsx` |
| Type | UI / Form Input |
| Purpose | Single-select dropdown with an in-modal search box (`normalizeSearch`-based, accent-insensitive matching), used for picking from a list of `{code, name}` options such as provinces/wards. |
| Used by | EditProfileScreen (province/ward selection via `geoApi`) |

---

### TimelineItem

| Property | Value |
|---|---|
| Path | `src/components/TimelineItem.tsx` |
| Type | Feature / Data Display |
| Purpose | Single event card for the Timeline screen. Renders an icon, title, date, and detail text for a timeline event (refuel, service), with a left-border accent color coded by event type. |
| Used by | TimelineScreen |

---

### VehicleCard

| Property | Value |
|---|---|
| Path | `src/components/VehicleCard.tsx` |
| Type | Feature / Data Display |
| Purpose | Vehicle summary card displaying vehicle name, type icon, license plate, and a quick stats row (last ODO, health score badge). Tappable — navigates to `VehicleDetailScreen`. |
| Used by | VehiclesScreen |

---

### VehicleMoreFields

| Property | Value |
|---|---|
| Path | `src/components/VehicleMoreFields.tsx` |
| Type | UI / Form Input (compound) |
| Purpose | Optional vehicle profile fields matching the web app's vehicle form: color, interior color, VIN, engine number, dealer, purchase date (`DatePickerField`), purchase price, notes. Exports the `VehicleExtra` type plus `EMPTY_VEHICLE_EXTRA`, `extraFromVehicle()` and `extraToPayload()` helpers for loading/serializing the extra-fields block, and integrates VIN decoding (`decodeVinModelYear`, `decodeVinRegionHint`) to suggest model year/region from a typed VIN. |
| Used by | AddVehicleScreen, EditVehicleScreen |

---

### VoiceButton

| Property | Value |
|---|---|
| Path | `src/components/VoiceButton.tsx` |
| Type | Feature / Hardware |
| Purpose | Microphone icon button that starts/stops `expo-speech-recognition` via the `useVoiceInput` hook, showing a pulsing animation while listening and returning recognized text via an `onResult` callback. Used as an alternative entry method for ODO readings and monetary amounts. |
| Used by | AddOdometerScreen, AddRefuelScreen, AddServiceScreen |
| Dependencies | expo-speech-recognition, `src/hooks/useVoiceInput.ts` |

---

### AppOpenAdManager

| Property | Value |
|---|---|
| Path | `src/components/AppOpenAdManager.native.tsx`, `src/components/AppOpenAdManager.web.tsx`, `src/components/AppOpenAdManager.d.ts` |
| Type | Global App Shell / Ads |
| Purpose | Renders a Google AdMob "App Open" interstitial ad when the user brings the app back from the background (deliberately **not** on cold start, so it never competes with the splash screen / login flow on first launch). Loads the ad unit (`useAppOpenAd` from `react-native-google-mobile-ads`) whenever not skipped, then shows it on the next `AppState` transition to `active` from `background`/`inactive`. Skipped entirely for premium users (`ADS_FREE_FOR_PREMIUM`), logged-out users (no token), or when no ad unit ID is configured. The `.web.tsx` variant is a no-op stub returning `null`, matching the `AdMobBanner` platform-split pattern. |
| Used by | Mounted once, globally, in `App.tsx` — not used by any individual screen |
| Dependencies | react-native-google-mobile-ads, `src/services/ads/admob.ts` |

---

### leafletAssets.ts

| Property | Value |
|---|---|
| Path | `src/components/leafletAssets.ts` |
| Type | Asset / Utility |
| Purpose | Exports the complete Leaflet map HTML document injected into the `RouteMap` and `DayRouteMap` WebViews: Leaflet CSS/JS, map initialization, and a JavaScript bridge for receiving route coordinates from React Native via `postMessage`. Not a React component. |
| Used by | RouteMap, DayRouteMap |

---

## Nori AI Companion Components (`src/components/nori/`)

Previously undocumented. `NoriFloatingButton` is the global floating icon mounted in `App.tsx`; the other three are its supporting pieces, only ever reached through it (or through `NoriChatScreen`, which is outside `src/components/`).

### NoriFloatingButton

| Property | Value |
|---|---|
| Path | `src/components/nori/NoriFloatingButton.tsx` |
| Type | Global App Shell / Feature / Nori AI |
| Purpose | Globally-mounted floating mascot icon (mirrors the equivalent icon on the web app) that gives access to Nori (the app's AI assistant) from anywhere in the app. Implements its own drag-to-dock gesture (via `PanResponder`/`Animated`, no extra dependency): drag it to either screen edge to shrink it to a small peeking "handle"; tap the peeking handle to bring it back out; tap it when fully visible to open `NoriQuickPopover`. Shows a pulsing alert badge when Nori's mood is `urgent`/`warn` and hasn't yet been "seen" this session, and a one-time coachmark tooltip for first-time users (persisted via AsyncStorage key `nori_floating_coachmark_seen`). Reads current route via `navigationRef` (not `useNavigation()`/`useNavigationState()`, since it renders as a sibling of `<RootNavigator />`, outside any Navigator, and those hooks throw in that position) to hide itself while the user is already on the `NoriChat` screen or while its own popover is open. Renders nothing if there's no logged-in user or no resolved vehicle. |
| Used by | Mounted once, globally, in `App.tsx` — not used by any individual screen |
| Dependencies | `NoriAvatar`, `NoriQuickPopover`, `services/nori/noriSummary.ts`, `services/nori/nori.ts` (`NORI_MOOD_COLOR`), `store/selectedVehicleStore.ts`, `navigation/navigationRef.ts` |

---

### NoriAvatar

| Property | Value |
|---|---|
| Path | `src/components/nori/NoriAvatar.tsx` |
| Type | UI / Nori AI |
| Purpose | Renders Nori's mascot image (`assets/nori/nori-icon.png`, the same artwork used on the web app) at a given `size`, with a small colored status dot in the bottom-right corner whose color reflects `mood` (via `NORI_MOOD_COLOR`). Nori has only one static image (no per-mood expression set, matching the web app) — mood is communicated entirely through the dot, mirroring how the web app's `_nori_today.blade.php` shows a colored dot next to a status label rather than swapping Nori's face. |
| Used by | NoriFloatingButton, NoriQuickPopover |

---

### NoriQuickPopover

| Property | Value |
|---|---|
| Path | `src/components/nori/NoriQuickPopover.tsx` |
| Type | Feature / Nori AI |
| Purpose | Bottom-sheet popup (opened by tapping `NoriFloatingButton`) for quick voice/text Q&A with Nori without leaving the current screen. Shares the same `useNoriAgentStore` conversation state as the full `NoriChatScreen` (via `useInitNoriAgent()`, a no-op if the agent already exists) — a conversation started here continues seamlessly if the user expands to the full chat screen, since it's the same underlying transcript. Shows only the most recent message (not full history — reviewing history / rating / typing sample questions still requires the full screen, reached via the "Mở rộng" button). Auto-starts listening (`useVoiceInput`) as soon as it opens for premium users, and always speaks the assistant's replies aloud via `expo-speech` (`Speech.speak`), regardless of whether the question was typed or spoken — distinguishing it from `NoriChatScreen`, where typing is an equally common input mode and answers aren't necessarily read aloud. If Nori needs write-confirmation before recording data (e.g. `odometer.create`/`fuel.create`), it does not attempt its own confirmation modal — it closes itself and navigates to `NoriChatScreen`, which already has that confirmation UI. Free (non-premium) users see/hear an upgrade prompt instead of being able to send messages. |
| Used by | NoriFloatingButton |
| Dependencies | `NoriAvatar`, `VoiceWaveform`, `store/noriAgentStore.ts`, `agent/useInitNoriAgent.ts`, `agent/progressText.ts`, `hooks/useVoiceInput.ts`, `services/nori/noriSummary.ts`, expo-speech, react-native-keyboard-controller |

---

### VoiceWaveform

| Property | Value |
|---|---|
| Path | `src/components/nori/VoiceWaveform.tsx` |
| Type | UI / Nori AI / Animation Primitive |
| Purpose | 5-bar animated waveform (replacing a static microphone icon) that visualizes live microphone volume (0..1, from `useVoiceInput().volume`) while `NoriQuickPopover` is listening. Each bar has a different sensitivity multiplier (center bar most reactive, outer bars least) so the bars move independently rather than as one uniform block, mimicking real voice-assistant waveform UIs (e.g. Kiki, Google Assistant). Built entirely on React Native core `Animated` — no new animation dependency. |
| Used by | NoriQuickPopover |

---

## OBD2 Dashboard Components (`src/components/obd/`)

Previously undocumented. These implement the "cockpit" gauge dashboard shown on `OBDDashboardScreen` while connected to a vehicle's OBD2 adapter, plus the style-selection UI on `VehicleDetailScreen`/`OBDDashboardScreen` for choosing among 6 visual dashboard themes.

### GaugeCluster

| Property | Value |
|---|---|
| Path | `src/components/obd/GaugeCluster.tsx` |
| Type | Feature / OBD2 / Cockpit Dashboard |
| Purpose | Top-level cockpit dashboard renderer. Picks the user's selected/premium-gated dashboard style (`pickDashboardStyle`, persisted per-vehicle via AsyncStorage) and renders that style's `Layout` component with live metrics (preferring the 500ms raw `fastSnapshot` for speed/RPM, falling back to the smoothed 3s `snapshot` for everything else, each value quantized via `quantizeValue`). Draws a floating, auto-hiding toolbar (back / dark-light toggle / style-picker / disconnect / manual Picture-in-Picture entry via `NotedriPip`) plus an always-visible clock+weather pill pair (`CockpitClock` + `CockpitWeather`) at the top, tinted to the active style's accent color (auto-brightened via `ensureVisibleAccent` for low-luma themes like "Minimal EV" so it stays legible). Handles safe-area insets defensively (capped at 64dp) to guard against car head-unit ROMs that misreport huge insets. |
| Used by | OBDDashboardScreen, VehicleDetailScreen |
| Dependencies | `DashboardStylePicker`, `CockpitClock`, `CockpitWeather`, `constants/dashboardStyles.ts`, `constants/obdMetrics.ts`, `hooks/useCockpitLayout.ts`, `modules/notedri-pip`, `services/obd/obdKeepAliveService.ts` |

---

### DashboardStylePicker

| Property | Value |
|---|---|
| Path | `src/components/obd/DashboardStylePicker.tsx` |
| Type | Feature / OBD2 / Cockpit Dashboard |
| Purpose | Modal for choosing one of the app's dashboard visual styles. The list view shows all non-hidden styles from `DASHBOARD_STYLES` (with lock icons for premium-only styles the user can't use) plus a "always ask" reset option. Tapping a style opens a **full-screen, WYSIWYG** live preview — rendered using the exact same `Layout` component and `useCockpitLayout()` sizing math as the real Dashboard, fed fixed demo metric values (a Honda Jazz V 2017 sample dataset), so the preview is pixel-identical to what the user will actually see, not a scaled-down thumbnail. From the preview, the user can apply the style, get upsold to Premium (locked styles), or back out. |
| Used by | GaugeCluster |
| Dependencies | `constants/dashboardStyles.ts`, `constants/obdMetrics.ts`, `hooks/useCockpitLayout.ts`, `theme/cockpitPalettes.ts` |

---

### The 6 Dashboard Style Layouts + Shared Primitives

| Property | Value |
|---|---|
| Path | `src/components/obd/dashboard/layouts/AnalogLayout.tsx`, `FleetLayout.tsx`, `MinimalLayout.tsx`, `NightLayout.tsx`, `RacingLayout.tsx`, `RetroLayout.tsx`; `src/components/obd/dashboard/primitives/ArcGauge.tsx`, `RingProgress.tsx`; `src/components/obd/dashboard/types.ts` |
| Type | Feature / OBD2 / Cockpit Dashboard (grouped entry) |
| Purpose | Six selectable dashboard visual styles (Analog — free; Racing "HUD Đua xe", Minimal "Tối giản EV", Retro, Night, and Fleet — all Premium-only, with Fleet additionally hidden from the picker for a separate garage/fleet-only entry point), all implementing the same `CockpitLayoutProps` interface (`types.ts`): `{ metrics, size, heroSize, ringSize, isPortrait, animate }`. Each style has its own distinct visual identity (e.g. RacingLayout: carbon-fiber HUD with a giant RPM gauge and an 8-segment shift-light bar in dark or light pit-lane variants; MinimalLayout: flat, low-chrome digital readout) but all consume the identical metrics array and layout-sizing props computed once by `useCockpitLayout()`, so switching styles is purely cosmetic. `ArcGauge` (a 316-line semi-circular SVG gauge with animated needle-style arc fill and "nice" auto-scaled tick marks, e.g. 0/50/100/150/200 rather than awkward divisions) and `RingProgress` (a simpler circular progress ring) are the two low-level SVG gauge primitives shared across multiple layouts. |
| Used by | `constants/dashboardStyles.ts` (style registry), rendered by `GaugeCluster` and previewed by `DashboardStylePicker` |
| Dependencies | react-native-svg, `hooks/useCountingNumber.ts`, `theme/cockpitPalettes.ts`, `constants/obdMetrics.ts` |

---

### CockpitClock

| Property | Value |
|---|---|
| Path | `src/components/obd/CockpitClock.tsx` |
| Type | UI / OBD2 / Cockpit Dashboard |
| Purpose | Small `HH:mm` clock text (via `dayjs`, refreshed every 30s), rendered once in `GaugeCluster`'s toolbar so it appears identically across all 8 dashboard styles rather than being reimplemented per-layout. Exists because the Dashboard's "clock mode" hides the system status bar (for a full-screen cockpit look), which would otherwise leave the driver with no visible clock at all. Accepts `color`/`fontSize` so it can match the active style's accent and scale with screen size. |
| Used by | GaugeCluster |

---

### CockpitWeather

| Property | Value |
|---|---|
| Path | `src/components/obd/CockpitWeather.tsx` |
| Type | Feature / OBD2 / Cockpit Dashboard |
| Purpose | Small current-temperature + condition-icon pill shown next to `CockpitClock` in the Dashboard toolbar. Reuses the same permission pattern as `HomeScreen`'s weather widget: only reads an **already-granted** foreground location permission (`PermissionManager.getLocationForegroundStatus()`), never prompts for it itself (a secondary cockpit widget shouldn't force a permission decision on the driver), and renders nothing until both permission and weather data (`GET /weather`, cached 30 min via TanStack Query) are available. |
| Used by | GaugeCluster |
| Dependencies | `services/permissions/PermissionManager.ts`, `api/client.ts` |

---

### PipCompactView

| Property | Value |
|---|---|
| Path | `src/components/obd/PipCompactView.tsx` |
| Type | UI / OBD2 / Picture-in-Picture |
| Purpose | Minimal 2-number layout (speed + RPM only, monospace, huge digits) that `OBDDashboardScreen` swaps to when Android shrinks the app into a Picture-in-Picture window. The regular dashboard's header/buttons are both illegible at PiP size and non-interactive (Android blocks touch input inside a PiP window), so this is a dedicated, separate UI rather than a 7th/9th dashboard style. |
| Used by | OBDDashboardScreen |
| Dependencies | `hooks/useCountingNumber.ts`, `theme/fonts.ts` |

---

### SafetyAlerts

| Property | Value |
|---|---|
| Path | `src/components/obd/SafetyAlerts.tsx` |
| Type | Feature / OBD2 / Diagnostics |
| Purpose | Renders the stack of safety/warning banners (VIN mismatch, "no data" warning, Diagnostic Engine `Finding`s color-coded by severity, and a "data paused / disconnected" notice) shared between `OBDDashboardScreen`'s Grid mode and Clock mode — extracted after this JSX block had been copy-pasted identically in both places, to guarantee the two modes always show identical warnings. Exports a companion `hasSafetyAlerts()` helper so the caller can decide whether to reserve layout space before any alert has rendered. |
| Used by | OBDDashboardScreen |
| Dependencies | `services/obd/diagnosticEngine.ts` (`Finding`), `services/obd/findingCost.ts`, `hooks/useObd.ts` (`ObdWarning`) |

---

### StatBox

| Property | Value |
|---|---|
| Path | `src/components/obd/StatBox.tsx` |
| Type | UI / OBD2 / Data Display |
| Purpose | Small labeled stat tile (icon + value + unit + label) used in `OBDDashboardScreen`'s Grid-mode metric grid. Rounds numeric values to 1 decimal place before display, since some OBD PID conversion formulas (e.g. `A*100/255` for engine load/throttle) produce floating-point noise (`13.7399999999999998`) that would otherwise overflow the tile. |
| Used by | OBDDashboardScreen |

---

## Navigation Layer Component

### CustomTabBar

| Property | Value |
|---|---|
| Path | `src/navigation/CustomTabBar.tsx` |
| Type | Navigation |
| Purpose | Custom bottom tab bar passed as the `tabBar` prop to the root `BottomTabNavigator` in `AppNavigator.tsx`. Splits the 4 tab routes (Dashboard, Stats, Vehicles, Management) into a left half and a right half with a raised circular FAB in the empty center slot; the FAB is implemented inline in this file and opens a bottom-sheet modal with 5 quick-add shortcuts: Refuel, Update ODO, GPS Trip, Add Service, Add Reminder. |
| Used by | AppNavigator (as `tabBar` prop) |

---

## Component Dependency Map

```
App.tsx (root)
  ├── AppErrorBoundary                 (outermost wrapper, class component error boundary)
  └── inside <NavigationContainer>, siblings of <RootNavigator/>:
      ├── ObdSessionBanner             (global — reads obdSessionStore)
      ├── NetworkStatusToast           (global — reads networkStatusStore)
      ├── ObdAutoConnect               (global — reads auth/BLE/vehicle state)
      │     └── (internal) AutoConnectPrompt (non-blocking bottom-sheet overlay)
      ├── AppOpenAdManager             (global — reads authStore, react-native-google-mobile-ads)
      └── NoriFloatingButton           (global — reads auth/vehicle/nav state)
            ├── NoriAvatar
            └── NoriQuickPopover
                  ├── NoriAvatar
                  └── VoiceWaveform

CustomTabBar
  └── (own inline FAB + quick-add sheet)

RouteMap
  └── leafletAssets.ts (inline Leaflet HTML)

DayRouteMap
  ├── leafletAssets.ts (inline Leaflet HTML)
  └── RouteMap (type import only: LatLng)

OcrCamera
  ├── expo-camera
  └── @react-native-ml-kit/text-recognition

VoiceButton
  └── useVoiceInput (hook)
      └── expo-speech-recognition

ReceiptPicker
  └── expo-image-picker

VehicleMoreFields
  ├── DatePickerField
  └── services/vin/vinDecoder.ts

SelectField
  └── utils/text.ts (normalizeSearch)

Icon
  └── @expo/vector-icons (FontAwesome5)

VehicleCard
  └── Icon

TimelineItem
  └── Icon

MoneyInput
  └── (RN TextInput + format.ts)

DatePickerField
  └── (Platform.OS check → iOS DateTimePicker / Android DateTimePicker)

AdMobBanner (.native.tsx)
  └── react-native-google-mobile-ads

AppOpenAdManager (.native.tsx)
  └── react-native-google-mobile-ads (useAppOpenAd)

ObdConnectionGuide
  └── assets/obd-guide/step-*.png (bundled images)

GaugeCluster
  ├── DashboardStylePicker
  │     └── constants/dashboardStyles.ts → 6 Layout components
  ├── CockpitClock
  ├── CockpitWeather
  │     └── services/permissions/PermissionManager.ts
  ├── constants/dashboardStyles.ts (style registry → 6 Layout components)
  └── modules/notedri-pip

6 Dashboard Layouts (Analog/Fleet/Minimal/Night/Racing/Retro)
  ├── dashboard/types.ts (shared CockpitLayoutProps interface)
  ├── dashboard/primitives/ArcGauge.tsx
  └── dashboard/primitives/RingProgress.tsx

SafetyAlerts
  ├── services/obd/diagnosticEngine.ts
  └── services/obd/findingCost.ts

PipCompactView
  └── hooks/useCountingNumber.ts
```
