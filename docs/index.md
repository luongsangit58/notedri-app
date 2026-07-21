# NoteDri Mobile App - Documentation Index

Master navigation index for all project documentation.

> **Critical for AI coding agents:** Always read Expo v56 docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code. This is required per `AGENTS.md`. The Expo managed workflow API changed in SDK 50+ and earlier-version knowledge will produce broken code.

---

## Quick Reference

| I want to... | Go to |
|---|---|
| Understand what the app does | [project-overview.md](project-overview.md) |
| Understand the codebase structure | [architecture.md](architecture.md) |
| Find a specific file or folder | [source-tree-analysis.md](source-tree-analysis.md) |
| Find a specific screen | [screens-inventory.md](screens-inventory.md) |
| Find a shared component | [component-inventory.md](component-inventory.md) |
| Understand BLE OBD2 / GPS services | [services-guide.md](services-guide.md) |
| Know which API endpoint to call | [api-integration.md](api-integration.md) |
| Verify a formula/threshold against source | [ALGORITHMS.md](ALGORITHMS.md) |
| Set up local development | [development-guide.md](development-guide.md) |
| Build and release to stores | [deployment-guide.md](deployment-guide.md) |

---

## All Documents

### [project-overview.md](project-overview.md)

Executive summary of what NoteDri mobile is, why it exists alongside the web product, and what it does. Includes:
- Tech stack table (framework, state, hardware, build)
- Full feature list by category
- Platform support (Android primary, iOS supported)
- EAS project info and distribution model
- Links to all other docs

### [architecture.md](architecture.md)

System architecture reference. Includes:
- Architecture pattern diagram (feature-based screens + Zustand + TanStack Query + Axios)
- Navigation structure (full tree: RootNavigator → AuthNavigator / AppNavigator → tabs + stacks)
- State management: Zustand stores (authStore, themeStore, i18nStore) + TanStack Query cache
- API integration layer (Axios interceptors, token injection, 401 auto-logout)
- Hardware integration layer (BLE OBD2, GPS, OCR, Voice, Push)
- Background service state machines (OBD TripSession, GPS GpsTripTracker)
- Source tree summary
- Testing note (no automated tests; recommendations for adding them)

### [source-tree-analysis.md](source-tree-analysis.md)

Annotated directory tree of the entire project. Every folder and key file explained. Use this when you need to locate where something lives or understand the purpose of an unfamiliar file.

### [component-inventory.md](component-inventory.md)

All 13 shared components in `src/components/` plus `CustomTabBar` from `src/navigation/`. For each component: path, type, purpose, dependencies, and which screens use it. Includes a component dependency map.

### [screens-inventory.md](screens-inventory.md)

All 44 screens organized by feature group. For each screen: file path, navigation location (tab / stack / auth), purpose description, and Premium-gating status. Includes a Premium-gated feature summary table.

### [services-guide.md](services-guide.md)

Deep-dive documentation for all 6 service classes. Each service includes:
- Purpose and role in the stack
- Key TypeScript types
- State machine diagram (where applicable)
- Key method signatures and descriptions
- Dependencies and permissions
- Error handling and iOS considerations
- Service lifecycle summary (boot → active → logout)

### [ALGORITHMS.md](ALGORITHMS.md)

Tiếng Việt. Mọi thuật toán/công thức thực sự triển khai trong app (OBD2 parsing/reliability/rule engine, EWMA gauge smoothing, Driving Score, GPS trip detection, VIN decode, OCR) — mỗi mục có công thức nguyên văn + `file:dòng` để đối chiếu. Có phần "Luồng dữ liệu liên-repo" giải thích ranh giới với backend.

### [api-integration.md](api-integration.md)

Everything about backend communication. Includes:
- Axios client base configuration
- Request and response interceptor code
- TanStack Query hooks table with query keys
- Complete endpoint reference (Auth, Vehicles, Refuels, Odometer, Services, Reminders, Dashboard, OBD2, GPS Trips, Profile, Notifications, Other)
- Auth token lifecycle (login → storage → refresh → 401 logout)
- Error handling pattern

### [development-guide.md](development-guide.md)

Step-by-step local development setup. Includes:
- Prerequisites (Node, Expo CLI, EAS CLI, Android Studio, Xcode)
- Environment variable setup (`EXPO_PUBLIC_API_URL`)
- Running with Expo Go vs. development client (and which features require a dev client)
- USB device setup (ADB for Android, Xcode for iOS)
- patch-package workflow
- BLE gotchas (Android permissions, no emulator support, adapter compatibility)
- GPS background task setup and testing
- Code conventions (TypeScript, styles, translations, dates, navigation)
- Common development tasks (add screen, add endpoint, add translation)
- Debugging tips

### [deployment-guide.md](deployment-guide.md)

EAS Build and store distribution. Includes:
- EAS build profiles (development / preview / production) with purpose and output type
- Pre-build checklist
- Environment variables for production (EAS Secrets)
- Android signing (keystore via EAS)
- iOS signing (Distribution Certificate via EAS)
- Store submission (`eas submit` for Google Play and App Store)
- OTA updates (when to use, how to publish, update channels, rollback)
- Version management (`version` vs `versionCode` vs `buildNumber`)
- Build troubleshooting

---

## Getting Started

### For a developer joining the project

1. Read this index
2. Read [project-overview.md](project-overview.md) for product context
3. Read [architecture.md](architecture.md) to understand the code structure
4. Follow [development-guide.md](development-guide.md) to get running locally
5. Use [screens-inventory.md](screens-inventory.md) and [source-tree-analysis.md](source-tree-analysis.md) as references while working

### For an AI agent implementing a feature

1. Read [AGENTS.md](../AGENTS.md) first (mandatory Expo v56 docs requirement)
2. Check [screens-inventory.md](screens-inventory.md) to find the relevant screen(s)
3. Check [component-inventory.md](component-inventory.md) for reusable components
4. Check [api-integration.md](api-integration.md) for the relevant endpoint and hook
5. Check [services-guide.md](services-guide.md) if the feature involves BLE or GPS
6. Follow the code conventions in [development-guide.md](development-guide.md)

### For an AI agent debugging a bug

1. Use [source-tree-analysis.md](source-tree-analysis.md) to locate relevant files
2. Use [architecture.md](architecture.md) to understand the data flow
3. Use [api-integration.md](api-integration.md) to verify the correct endpoint and hook pattern
4. Use [services-guide.md](services-guide.md) if the bug is in BLE / GPS background behavior

---

## Key Facts at a Glance

| Fact | Value |
|---|---|
| Framework | Expo ~54.0.0 (managed workflow) |
| React Native | 0.81.5 |
| Language | TypeScript |
| Navigation | React Navigation v7 |
| State (global) | Zustand v5 |
| State (server) | TanStack React Query v5 |
| Screens | 44 total |
| Shared components | 13 + CustomTabBar |
| Service classes | 6 (BleService, ObdReader, TripSession, TripSyncQueue, GpsTripTracker, GpsTripSyncQueue) |
| API base | https://notedri.com/api/v1 |
| EAS project ID | 92c0bda5-b744-47c5-b06d-12bff12b13f9 |
| Android package | com.notedri |
| Default language | Vietnamese (vi) |
| Premium features | OBD2 (all 3 screens), 3+ vehicles, full history |
| Automated tests | None currently |
| Expo docs to use | https://docs.expo.dev/versions/v56.0.0/ |

---

## Project Root Files Reference

| File | Purpose |
|---|---|
| `App.tsx` | React root; NavigationContainer + QueryClientProvider |
| `index.ts` | Expo entry point (`registerRootComponent`) |
| `app.json` | Expo config (permissions, plugins, bundle IDs) |
| `eas.json` | EAS Build profiles |
| `tsconfig.json` | TypeScript config |
| `AGENTS.md` | **Read this first** - AI agent instructions |
| `CLAUDE.md` | Imports AGENTS.md |
| `J16 protocol.pdf` | ELM327 OBD2 AT command reference (hardware spec) |
| `patches/` | patch-package diffs (react-native-ble-plx build fix) |
