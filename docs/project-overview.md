# NoteDri Mobile App - Project Overview

## Executive Summary

NoteDri mobile is the Expo React Native companion app for [notedri.com](https://notedri.com) - a personal vehicle management platform targeted at Vietnamese car owners. The mobile app surfaces every backend feature in a native experience optimized for in-car and garage use: logging fuel, odometer, and maintenance; tracking trips via GPS or BLE OBD2 scanner; viewing vehicle health scores; and receiving smart push notifications for legal deadlines and maintenance due dates.

The app is the **hardware extension** of the web platform. Features only possible on a phone (BLE OBD2 diagnostics, GPS background trip tracking, on-device OCR, voice input) are the primary reason the mobile app exists alongside the web product.

Built with **Expo SDK ~54** (React Native 0.81.5) in TypeScript. Deployed via **EAS Build** and distributed to Android (primary) and iOS.

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

- Multi-vehicle registry (Free tier: 2 vehicles; Premium: 3+)
- Vehicle dossier - registration, insurance, and inspection document storage
- Odometer logging with OCR (dashboard photo) and voice input
- Fuel refuel logging with receipt OCR and voice input
- Service / maintenance log with full history
- Reminders for legal deadlines (inspection, insurance, registration) and maintenance intervals
- Fuel prices feed and nearby fuel station map (WebView + Leaflet)

### Analytics and Reporting

- Dashboard with aggregated stats per vehicle (cost per km, fuel efficiency, service spend)
- Timeline: chronological event stream across all vehicles
- Reports: cost breakdown and consumption charts
- Year Review: annual summary highlights
- Achievements / gamification milestones
- Data export from profile settings

### Vehicle Health

- Vehicle Health Score (VHS) display - score computed server-side
- Band-change push notifications from the backend scoring engine
- Garage guide (workshop checklist per vehicle type)

### OBD2 Diagnostics (Premium-only)

- BLE ELM327 / Vgate iCar adapter support (auto-detected)
- Live dashboard: RPM, speed, coolant temperature, oil temperature, fuel level, engine load, throttle position
- OBD trip recording (PID polling every 3 s)
- DTC fault code reading with SAE J2012 descriptions and resolution workflow
- OBD trip history and sync queue for offline resilience

### GPS Trip Tracking

- Auto-start when speed exceeds 5 km/h for 12 s (no driver action needed)
- Auto-stop after 3 min below 3 km/h
- Background foreground service (Android) / background location (iOS)
- Pause and resume trip
- Stale-trip recovery on app restart
- Route map rendered with Leaflet via WebView
- GPS trip history with haversine distance calculation

### Input Assistance

- On-device OCR (ML Kit) for odometer display and fuel receipt scanning
- Voice input for odometer and money amounts via expo-speech-recognition

### Account and Premium

- Email/password registration and login
- Google OAuth (expo-auth-session)
- Premium subscription screen and tier gating (OBD2, vehicle limits, history window)
- Profile editing and avatar upload
- Push notifications via Expo push service
- Notification preferences screen
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
| [screens-inventory.md](screens-inventory.md) | All 44 screens catalogued |
| [component-inventory.md](component-inventory.md) | All shared components |
| [services-guide.md](services-guide.md) | BLE / GPS / sync service classes |
| [api-integration.md](api-integration.md) | Axios + TanStack Query + endpoints |
| [development-guide.md](development-guide.md) | Local dev setup |
| [deployment-guide.md](deployment-guide.md) | EAS build and store submit |
| [index.md](index.md) | Master index |

> **AI coding note:** Always read Expo v56 docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code. The API surface has changed from earlier versions and generated code based on older docs will be incorrect.
