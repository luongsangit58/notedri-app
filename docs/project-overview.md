# NoteDri Mobile App - Project Overview

## Executive Summary

NoteDri mobile is the Expo React Native companion app for [notedri.com](https://notedri.com) - a personal vehicle management platform targeted at Vietnamese car owners. The mobile app surfaces every backend feature in a native experience optimized for in-car and garage use: logging fuel, odometer, and maintenance; tracking trips via GPS or BLE OBD2 scanner; viewing vehicle health scores; and receiving smart push notifications for legal deadlines and maintenance due dates.

The app is the **hardware extension** of the web platform. Features only possible on a phone (BLE OBD2 diagnostics, GPS background trip tracking, on-device OCR, voice input) are the primary reason the mobile app exists alongside the web product.

Built with **Expo SDK ~54** (React Native 0.81.5) in TypeScript. Deployed via **EAS Build** and distributed to Android (primary) and iOS.

---

## Navigation / Tab Bar

The root bottom tab bar (`src/navigation/AppNavigator.tsx` → `ThemedTabNavigator`, rendered through the custom `CustomTabBar`) has **4 tabs**:

| Tab route name | Screen rendered | Icon |
|---|---|---|
| `Dashboard` | `HomeScreen` (`src/screens/home/HomeScreen.tsx`) | home |
| `Stats` | `ThongKeScreen` (`src/screens/stats/ThongKeScreen.tsx`) — embeds Timeline / Reports / GPS Trips as sub-tabs | chart-line |
| `Vehicles` | `VehiclesStack` → `VehiclesScreen` / `VehicleDetailScreen` | car-side |
| `Management` | `QuanLyScreen` (`src/screens/management/QuanLyScreen.tsx`) — embeds Reminders / Health as sub-tabs | heartbeat |

`Stats` and `Management` are the current route names; they were renamed from the earlier Vietnamese-derived route names `ThongKe`/`QuanLy` for consistency with the rest of the (English) route names in the navigator. The underlying screen **file names** (`ThongKeScreen.tsx`, `QuanLyScreen.tsx`) were not renamed. A raised center FAB (built directly into `CustomTabBar`, not a 5th tab) opens a quick-add sheet for Refuel / Odometer / GPS Trip / Service / Reminder.

Note: `src/screens/dashboard/DashboardScreen.tsx` (an older, more detailed per-vehicle dashboard) exists in the tree but is **not currently wired into `AppNavigator.tsx`** — the `Dashboard` tab renders `HomeScreen`, not `DashboardScreen`. See [screens-inventory.md](screens-inventory.md) for details.

---

## Summary Table

| Property | Value |
|---|---|
| App name | NoteDri |
| Slug | `notedri-app` |
| Backend | https://notedri.com/api/v1 |
| EAS projectId | `92c0bda5-b744-47c5-b06d-12bff12b13f9` |
| Android package | `com.notedri` |
| iOS tablet support | Yes (`supportsTablet: true`) |
| Default language | Vietnamese (`vi`) |
| Secondary language | English (`en`) |
| Version | 1.0.0 |

---

## Tech Stack

| Layer | Library / Tool | Version |
|---|---|---|
| Framework | Expo (managed workflow) | ~54.0.0 |
| Language | TypeScript | ~5.9.2 |
| Runtime | React Native | 0.81.5 |
| React | React | 19.1.0 |
| Navigation | @react-navigation/bottom-tabs + stack | v7 |
| Global state | Zustand | ^5.0.14 |
| Server state / caching | TanStack React Query | ^5.101.0 |
| HTTP client | Axios | ^1.18.1 |
| Secure storage | expo-secure-store | ~15.0.8 |
| BLE (OBD2) | react-native-ble-plx | ^3.5.1 |
| GPS background | expo-location + expo-task-manager | ~19.0.8 / ~14.0.9 |
| Camera / OCR | expo-camera + @react-native-ml-kit/text-recognition | ~17.0.10 / ^2.0.0 |
| Voice input | expo-speech-recognition | ~3.1.3 |
| Push notifications | expo-notifications | ~0.32.17 |
| Maps | react-native-webview (Leaflet HTML) | ^13.15.0 |
| Internationalisation | i18next + react-i18next (Zustand wrapper) | ^26.3.1 / ^17.0.8 |
| Date handling | dayjs | ^1.11.21 |
| OAuth | expo-auth-session (Google) | ~7.0.11 |
| Build / distribution | EAS Build + EAS Submit | CLI >= 20.3.0 |

---

## Feature List

### Core Vehicle Management

- Multi-vehicle registry (Free tier: capped vehicle count; Premium: higher/unlimited)
- Vehicle dossier - registration, insurance, and inspection document storage, plus extended profile fields (color, VIN with decode-assisted model year/region, engine number, dealer, purchase date/price)
- Vehicle ownership transfer requests ("maintenance passport" hand-over between owners, VIN-based)
- Odometer logging with OCR (dashboard photo) and voice input
- Fuel refuel logging with receipt OCR, voice input, and auto price lookup
- Service / maintenance log with full history and receipt photo attachment
- Reminders for legal deadlines (inspection, insurance, registration) and maintenance intervals, with suggested-reminder seeding
- Fuel prices feed (with 6-month trend chart) and nearby fuel-station / EV-charging-station map (WebView + Leaflet)

### Analytics and Reporting

- Home dashboard with quick stats, highlight banner, and quick-action cards per vehicle
- Timeline: chronological event stream across vehicles (embedded as a Stats sub-tab)
- Reports: cost breakdown and consumption charts (embedded as a Stats sub-tab)
- Year Review: annual summary highlights (dark animated recap card)
- Achievements / gamification milestones with badge levels
- Data export from profile settings (Premium-gated)

### Vehicle Health

- Vehicle Health Score (VHS) display for every vehicle - score computed server-side, with pillar breakdown, organ-level findings, and a score-trend chart
- Band-change push notifications from the backend scoring engine
- Garage guide (workshop checklist per vehicle type, with last-cost context)

### OBD2 Diagnostics (Premium-only, except DTC Lookup)

- BLE ELM327 / Vgate iCar adapter support (auto-detected)
- Live dashboard: RPM, speed, coolant temperature, oil temperature, fuel level, engine load, throttle position
- Full technical PID table (13 PIDs incl. fuel trim, intake pressure/temp, ambient temp, fuel rate)
- System-health view grouping readings into engine / cooling / electrical / fuel status cards
- OBD trip recording (PID polling every 3 s) and trip history with DTC events
- Session report with a 30-day trend chart (voltage, coolant, driving score, DTC count, engine hours)
- NFC tap-to-connect setup (write vehicle/adapter pairing to an NFC tag)
- DTC fault code lookup (SAE J2012) with online + offline dictionary fallback and resolution guidance - available even without a connected adapter or Premium

### GPS Trip Tracking

- Auto-start when speed exceeds 5 km/h for 12 s (no driver action needed)
- Auto-stop after 3 min below 3 km/h
- Background foreground service (Android) / background location (iOS)
- Pause and resume trip
- Stale-trip recovery on app restart
- Driving-score computation from detected driving events
- Route map rendered with Leaflet via WebView
- GPS trip history with haversine distance calculation (embedded as a Stats sub-tab)

### Input Assistance

- On-device OCR (ML Kit) for odometer display and fuel receipt scanning
- Voice input for odometer and money amounts via expo-speech-recognition

### Account and Premium

- Email/password registration with OTP email verification, and login
- Google OAuth (expo-auth-session), including linking/unlinking Google from an existing account
- First-run onboarding carousel with in-flow language switch
- Premium subscription screen with plan-length picker, redeem codes, and QR bank-transfer payment; payment history screen
- Tier gating (OBD2 core flow, data export, vehicle limits, history window)
- Profile editing (name, phone, address, avatar upload)
- Active device/session management (view, log out one/all, set primary device)
- Push notifications via Expo push service
- Notification preferences screen
- In-app feedback form
- Dark / light theme (persisted in SecureStore)
- Bilingual UI: Vietnamese (default) and English

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| Android | Primary | APK (preview) + AAB (production), Proguard enabled, foreground GPS service |
| iOS | Supported | Tablet support enabled; background location + BLE permissions configured |
| Web | Dev only | `expo start --web` works for quick development checks; not a distribution target |

---

## Distribution

- **Android**: Google Play Store via EAS Submit (AAB production build)
- **iOS**: App Store via EAS Submit
- **Internal testing**: EAS `preview` profile distributes APK directly (no Play Store needed)
- **OTA updates**: Expo Updates managed by EAS (included in Expo SDK)

---

## EAS Build Profiles Summary

| Profile | Output | Purpose |
|---|---|---|
| `development` | Dev client APK/IPA | Local development with Expo dev client |
| `preview` | APK (internal) | Internal QA distribution |
| `production` | AAB + Proguard + autoIncrement | Store submission |

See [deployment-guide.md](deployment-guide.md) for full build commands and EAS configuration.

---

## Related Documents

| Document | Purpose |
|---|---|
| [architecture.md](architecture.md) | System architecture deep dive |
| [source-tree-analysis.md](source-tree-analysis.md) | Annotated directory tree |
| [screens-inventory.md](screens-inventory.md) | All 56 screen files catalogued |
| [component-inventory.md](component-inventory.md) | All shared components (22 files in `src/components/`) |
| [services-guide.md](services-guide.md) | BLE / GPS / sync service classes |
| [api-integration.md](api-integration.md) | Axios + TanStack Query + endpoints |
| [development-guide.md](development-guide.md) | Local dev setup |
| [deployment-guide.md](deployment-guide.md) | EAS build and store submit |
| [index.md](index.md) | Master index |

> **AI coding note:** Always read Expo v56 docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code. The API surface has changed from earlier versions and generated code based on older docs will be incorrect.
