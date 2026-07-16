# NoteDri Mobile App - Component Inventory

All shared components live in `src/components/`. Navigation-layer components (`CustomTabBar`) live in `src/navigation/`. There are 22 files in `src/components/` (`AdMobBanner` ships as 3 files: a platform-agnostic `.d.ts` plus `.native.tsx`/`.web.tsx` implementations, counted here as one logical component) plus `CustomTabBar`, totalling 20 logical components. (A previous version of this document listed 13 components; this revision was produced by reading every file under `src/components/` on 2026-07-16.)

---

## Component Categories

| Category | Components |
|---|---|
| Layout / Decoration | AppBgPattern, LoadingView, ErrorView |
| Form Inputs | DatePickerField, MoneyInput, PasswordInput, SelectField, VehicleMoreFields |
| Hardware-backed Inputs | OcrCamera, VoiceButton |
| Media Pickers | ReceiptPicker |
| Data Display | VehicleCard, TimelineItem |
| Map | RouteMap |
| Icon | Icon |
| Ads | AdMobBanner |
| OBD2 | ObdConnectionGuide, ObdSessionBanner |
| Quick Actions | QuickAddFAB |
| Navigation | CustomTabBar |

---

## Full Component Reference

### AdMobBanner

| Property | Value |
|---|---|
| Path | `src/components/AdMobBanner.native.tsx`, `src/components/AdMobBanner.web.tsx`, `src/components/AdMobBanner.d.ts` |
| Type | Feature / Ads |
| Purpose | Renders a Google AdMob adaptive anchored banner ad (`react-native-google-mobile-ads`) at the bottom of a screen. The `.native.tsx` implementation resolves an ad-unit ID via `getAdMobBannerAdUnitId()` (or `TestIds.BANNER` in `__DEV__`) and renders nothing on `Platform.OS === 'web'` or when no unit ID is configured. The `.web.tsx` variant is a no-op stub (`return null`) so Metro's platform-extension resolution keeps the web/Expo-web build free of the native ads SDK. |
| Used by | HomeScreen (bottom of the scroll view) |
| Dependencies | react-native-google-mobile-ads, `src/services/ads/admob.ts` |

---

### AppBgPattern

| Property | Value |
|---|---|
| Path | `src/components/AppBgPattern.tsx` |
| Type | UI / Layout |
| Purpose | Renders a decorative background gradient/pattern layer behind screen content. Gives all screens a consistent visual base without repeating styles. Typically rendered as the first child of a screen's root `View`, right after `SafeAreaView`. |
| Used by | Nearly every screen in the app (background decoration) |

---

### DatePickerField

| Property | Value |
|---|---|
| Path | `src/components/DatePickerField.tsx` |
| Type | UI / Form Input |
| Purpose | Cross-platform date picker. Shows an iOS-native modal date picker on iOS and the Android system date dialog on Android. Accepts a `value` (Date/string) and `onChange` callback, wrapping platform differences so calling screens need no platform-specific code. |
| Used by | AddRefuelScreen, EditRefuelScreen, AddServiceScreen, EditServiceScreen, AddReminderScreen, EditReminderScreen, AddOdometerScreen, VehicleMoreFields (purchase date), and other date-entry screens |

---

### ErrorView

| Property | Value |
|---|---|
| Path | `src/components/ErrorView.tsx` |
| Type | UI / State Display |
| Purpose | Standardized full-screen or inline error state. Displays an error message and a "Retry" button that calls the provided `onRetry` callback. Ensures consistent error UX across all data-fetching screens. |
| Used by | Screens that surface a TanStack Query `isError` state (e.g. TimelineScreen, VehiclesScreen, HealthScreen, RemindersScreen) |

---

### Icon

| Property | Value |
|---|---|
| Path | `src/components/Icon.tsx` |
| Type | UI / Primitive |
| Purpose | Thin wrapper around `@expo/vector-icons` FontAwesome5. Accepts `name`, `size`, and `color` props and applies a theme-aware default color when no explicit color is passed, centralizing icon-library choice so switching libraries later only touches one file. (Most screens still call `FontAwesome5` directly rather than going through `Icon`.) |
| Used by | VehicleCard, TimelineItem, and other components that want a themed default icon color |

---

### LoadingView

| Property | Value |
|---|---|
| Path | `src/components/LoadingView.tsx` |
| Type | UI / State Display |
| Purpose | Full-screen centered `ActivityIndicator` with an optional message, matching theme colors. Used as the loading state for TanStack Query `isLoading` conditions, and directly by `SplashScreen` while `authStore.initialize()` runs. |
| Used by | SplashScreen, DashboardScreen, VehiclesScreen, and other screens' initial-loading states |

---

### MoneyInput

| Property | Value |
|---|---|
| Path | `src/components/MoneyInput.tsx` |
| Type | UI / Form Input |
| Purpose | Numeric text input that displays values in Vietnamese Dong (VND) formatting with thousands separators, handling the conversion between the raw number value and the formatted display string. Exports a `toMoneyRaw` helper for reading the underlying numeric value back out. |
| Used by | AddRefuelScreen, EditRefuelScreen, AddServiceScreen, EditServiceScreen |

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
| Type | Feature / OBD2 |
| Purpose | Transition toast for OBD BLE connection-state changes (connected / reconnected / disconnected / session-auto-saved), shown for ~2.5s whenever `useObdSessionStore`'s `connected`/`reconnecting` flags change. Complements the persistent status pill elsewhere in the OBD UI by giving an immediate, momentary confirmation at the point of transition. |
| Used by | Rendered globally alongside the OBD session UI (reads `useObdSessionStore` directly; navigates via `navigationRef`) |

---

### OcrCamera

| Property | Value |
|---|---|
| Path | `src/components/OcrCamera.tsx` |
| Type | Feature / Hardware |
| Purpose | Camera viewfinder powered by `expo-camera` with on-device text recognition from `@react-native-ml-kit/text-recognition`. Renders a live camera preview, captures a frame, and runs ML Kit OCR locally, returning the raw recognized text (and, for receipts, a structured `ReceiptData` guess) via an `onResult` callback. No network call is made. |
| Used by | AddOdometerScreen (ODO reading), AddRefuelScreen (receipt total) |
| Dependencies | expo-camera, @react-native-ml-kit/text-recognition |

---

### PasswordInput

| Property | Value |
|---|---|
| Path | `src/components/PasswordInput.tsx` |
| Type | UI / Form Input |
| Purpose | `TextInput` with `secureTextEntry` toggled by an eye/eye-slash icon button, giving a consistent password field. (Login/Register/ChangePassword currently implement their own inline show/hide `TextInput` rather than importing this component, but it remains available for reuse.) |
| Used by | Available for any password-entry form |

---

### QuickAddFAB

| Property | Value |
|---|---|
| Path | `src/components/QuickAddFAB.tsx` |
| Type | Feature / Navigation |
| Purpose | Standalone floating action button (bottom-right) that opens a small modal sheet with 2 shortcuts — log a refuel or an odometer reading — without leaving the current screen. Distinct from the FAB built directly into `CustomTabBar` (which opens a larger 5-item quick-add sheet); `QuickAddFAB` is used by screens that are not part of the main tab bar's own FAB context. |
| Used by | DashboardScreen (legacy dashboard) |

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
| Purpose | Renders a GPS trip route as a polyline on a Leaflet map inside a `react-native-webview`. The Leaflet HTML/JS is provided by `leafletAssets.ts` (inline string). Accepts an array of `{lat, lng}` coordinate objects and visualizes completed GPS trip routes. |
| Used by | GpsTripsScreen (trip detail) |
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
| Used by | AddOdometerScreen, AddRefuelScreen |
| Dependencies | expo-speech-recognition, `src/hooks/useVoiceInput.ts` |

---

### leafletAssets.ts

| Property | Value |
|---|---|
| Path | `src/components/leafletAssets.ts` |
| Type | Asset / Utility |
| Purpose | Exports the complete Leaflet map HTML document injected into the `RouteMap` WebView: Leaflet CSS/JS, map initialization, and a JavaScript bridge for receiving route coordinates from React Native via `postMessage`. Not a React component. |
| Used by | RouteMap |

---

## Navigation Layer Component

### CustomTabBar

| Property | Value |
|---|---|
| Path | `src/navigation/CustomTabBar.tsx` |
| Type | Navigation |
| Purpose | Custom bottom tab bar passed as the `tabBar` prop to the root `BottomTabNavigator` in `AppNavigator.tsx`. Splits the 4 tab routes (Dashboard, Stats, Vehicles, Management) into a left half and a right half with a raised circular FAB in the empty center slot; the FAB (implemented inline in this file, not by importing `QuickAddFAB`) opens a bottom-sheet modal with 5 quick-add shortcuts: Refuel, Update ODO, GPS Trip, Add Service, Add Reminder. |
| Used by | AppNavigator (as `tabBar` prop) |

---

## Component Dependency Map

```
CustomTabBar
  └── (own inline FAB + quick-add sheet; does NOT import QuickAddFAB)

QuickAddFAB
  └── (standalone FAB, used outside the tab bar context)

RouteMap
  └── leafletAssets.ts (inline Leaflet HTML)

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

ObdConnectionGuide
  └── assets/obd-guide/step-*.png (bundled images)

ObdSessionBanner
  ├── store/obdSessionStore.ts
  └── navigation/navigationRef.ts
```
