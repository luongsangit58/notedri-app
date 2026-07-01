# NoteDri Mobile App - Component Inventory

All shared components live in `src/components/`. Navigation-layer components (CustomTabBar) live in `src/navigation/`. There are 13 shared components plus CustomTabBar, totalling 14.

---

## Component Categories

| Category | Components |
|---|---|
| Layout / Decoration | AppBgPattern, LoadingView, ErrorView |
| Form Inputs | DatePickerField, MoneyInput, PasswordInput, VoiceButton |
| Hardware-backed Inputs | OcrCamera, VoiceButton |
| Data Display | VehicleCard, TimelineItem |
| Map | RouteMap |
| Icon | Icon |
| Quick Actions | QuickAddFAB |
| Navigation | CustomTabBar |

---

## Full Component Reference

### AppBgPattern

| Property | Value |
|---|---|
| Path | `src/components/AppBgPattern.tsx` |
| Type | UI / Layout |
| Purpose | Renders a decorative background gradient or pattern layer behind screen content. Gives all screens a consistent visual base without repeating styles. Typically rendered as the first child of a screen's root View. |
| Used by | Most screens (background decoration) |

---

### DatePickerField

| Property | Value |
|---|---|
| Path | `src/components/DatePickerField.tsx` |
| Type | UI / Form Input |
| Purpose | Cross-platform date picker. Shows an iOS-native modal date picker on iOS and the Android system date dialog on Android. Accepts a `value` (Date) and `onChange` callback. Wraps platform differences so calling screens need no platform-specific code. |
| Used by | AddRefuelScreen, AddServiceScreen, AddReminderScreen, AddOdometerScreen, and edit equivalents |

---

### ErrorView

| Property | Value |
|---|---|
| Path | `src/components/ErrorView.tsx` |
| Type | UI / State Display |
| Purpose | Standardized full-screen or inline error state. Displays an error message and a "Retry" button that calls the provided `onRetry` callback. Ensures consistent error UX across all data-fetching screens. |
| Used by | All screens that use TanStack Query `isError` state |

---

### Icon

| Property | Value |
|---|---|
| Path | `src/components/Icon.tsx` |
| Type | UI / Primitive |
| Purpose | Thin wrapper around `@expo/vector-icons` FontAwesome5. Accepts `name`, `size`, and `color` props. Applies theme-aware default color from `useThemeStore` when no explicit color is passed. Centralizes icon library choice so switching libraries later requires only one file change. |
| Used by | Throughout the app - every screen that renders an icon |

---

### LoadingView

| Property | Value |
|---|---|
| Path | `src/components/LoadingView.tsx` |
| Type | UI / State Display |
| Purpose | Full-screen centered `ActivityIndicator` with optional message. Used as the loading state for all TanStack Query `isLoading` conditions. Matches theme colors. |
| Used by | All screens while awaiting initial query data |

---

### MoneyInput

| Property | Value |
|---|---|
| Path | `src/components/MoneyInput.tsx` |
| Type | UI / Form Input |
| Purpose | Numeric text input that displays values in Vietnamese Dong (VND) formatting with thousands separators. Handles the conversion between the raw number value and the formatted display string. Accepts `value` (number) and `onChange` (number) callbacks. |
| Used by | AddRefuelScreen, EditRefuelScreen, AddServiceScreen, EditServiceScreen |

---

### OcrCamera

| Property | Value |
|---|---|
| Path | `src/components/OcrCamera.tsx` |
| Type | Feature / Hardware |
| Purpose | Camera viewfinder powered by `expo-camera` with on-device text recognition from `@react-native-ml-kit/text-recognition`. Renders a live camera preview, captures a frame, and runs ML Kit OCR locally. Returns the raw recognized text string via an `onResult` callback. The consuming screen is responsible for extracting the numeric value (ODO digits or receipt total). No network call is made. |
| Used by | AddOdometerScreen (ODO reading), AddRefuelScreen (receipt total) |
| Dependencies | expo-camera ~17.0.10, @react-native-ml-kit/text-recognition ^2.0.0 |

---

### PasswordInput

| Property | Value |
|---|---|
| Path | `src/components/PasswordInput.tsx` |
| Type | UI / Form Input |
| Purpose | `TextInput` with `secureTextEntry` toggled by an eye icon button. Consistent password field across Login, Register, and ChangePassword screens. |
| Used by | LoginScreen, RegisterScreen, ChangePasswordScreen |

---

### QuickAddFAB

| Property | Value |
|---|---|
| Path | `src/components/QuickAddFAB.tsx` |
| Type | Feature / Navigation |
| Purpose | Floating action button rendered by `CustomTabBar` at the center of the bottom tab bar. On press it opens a bottom modal sheet with shortcuts to log a refuel or odometer reading without navigating away from the current tab. This is the primary quick-entry point for the most frequent user actions. |
| Used by | CustomTabBar (always rendered in the tab bar) |

---

### RouteMap

| Property | Value |
|---|---|
| Path | `src/components/RouteMap.tsx` |
| Type | Feature / Map |
| Purpose | Renders a GPS trip route as a polyline on a Leaflet map inside a `react-native-webview`. The Leaflet HTML/JS is provided by `leafletAssets.ts` (inline string). Accepts an array of `{lat, lng}` coordinate objects. Used to visualize completed GPS trip routes. |
| Used by | GpsTripsScreen (trip detail), OBDTripsScreen (if route data present) |
| Dependencies | react-native-webview ^13.15.0, src/components/leafletAssets.ts |

---

### TimelineItem

| Property | Value |
|---|---|
| Path | `src/components/TimelineItem.tsx` |
| Type | Feature / Data Display |
| Purpose | Single event card for the Timeline screen. Renders an icon, title, date, vehicle name, and optional detail text for a timeline event (refuel, service, ODO, reminder, trip). Styled with a left-border accent color coding by event type. |
| Used by | TimelineScreen |

---

### VehicleCard

| Property | Value |
|---|---|
| Path | `src/components/VehicleCard.tsx` |
| Type | Feature / Data Display |
| Purpose | Vehicle summary card displaying vehicle name, type icon, license plate, and a quick stats row (last ODO, health score badge). Tappable - navigates to VehicleDetailScreen. Used in both the Vehicles tab list and the HomeScreen. |
| Used by | VehiclesScreen, HomeScreen |

---

### VoiceButton

| Property | Value |
|---|---|
| Path | `src/components/VoiceButton.tsx` |
| Type | Feature / Hardware |
| Purpose | Microphone icon button that starts and stops `expo-speech-recognition` via the `useVoiceInput` hook. Shows a pulsing animation while listening. Returns recognized text via an `onResult` callback. Used alongside number inputs as an alternative entry method for ODO readings and monetary amounts. |
| Used by | AddOdometerScreen, AddRefuelScreen |
| Dependencies | expo-speech-recognition ~3.1.3, src/hooks/useVoiceInput.ts |

---

### leafletAssets.ts

| Property | Value |
|---|---|
| Path | `src/components/leafletAssets.ts` |
| Type | Asset / Utility |
| Purpose | Exports a function or string that produces the complete Leaflet map HTML document injected into the `RouteMap` WebView. Includes the Leaflet CSS/JS (CDN or bundled), map initialization, and a JavaScript bridge for receiving route coordinates from React Native via `postMessage`. Not a React component. |

---

## Navigation Layer Component

### CustomTabBar

| Property | Value |
|---|---|
| Path | `src/navigation/CustomTabBar.tsx` |
| Type | Navigation |
| Purpose | Custom bottom tab bar component passed as the `tabBar` prop to the `BottomTabNavigator` in AppNavigator. Renders five tab slots in a vRace-style bar: Home, Timeline, [center FAB slot], Vehicles, Profile. The center slot renders `QuickAddFAB` instead of a navigation tab. Applies active/inactive icon colors from the theme. |
| Used by | AppNavigator (as `tabBar` prop) |

---

## Component Dependency Map

```
CustomTabBar
  └── QuickAddFAB

RouteMap
  └── leafletAssets.ts (inline Leaflet HTML)

OcrCamera
  ├── expo-camera
  └── @react-native-ml-kit/text-recognition

VoiceButton
  └── useVoiceInput (hook)
      └── expo-speech-recognition

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
```
