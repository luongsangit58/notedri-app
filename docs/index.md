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
| So sánh độ ổn định/kết nối các đầu đọc OBD2 (cho trang supported-devices) | [obd-supported-devices.md](obd-supported-devices.md) |
| Know which API endpoint to call | [api-integration.md](api-integration.md) |
| Verify a formula/threshold against source | [ALGORITHMS.md](ALGORITHMS.md) |
| Set up local development | [development-guide.md](development-guide.md) |
| Build and release to stores | [deployment-guide.md](deployment-guide.md) |
| Xem kế hoạch triển khai Nori Agent (AI Agent, chưa xong) | [nori-agent-plan.md](nori-agent-plan.md) |
| Knowledge (từ điển DTC + rule chẩn đoán) đang phủ tới đâu, còn thiếu gì | [knowledge-coverage.md](knowledge-coverage.md) |
| So sánh tính năng app vs web (notedri.com), còn thiếu gì | [feature-parity-vs-web.md](feature-parity-vs-web.md) |
| So sánh tính năng OBD2 app vs KONNWEI KW905/MAXOBD Pro, còn thiếu gì | [feature-parity-vs-maxobd.md](feature-parity-vs-maxobd.md) |

---

## All Documents

### [project-overview.md](project-overview.md)

Executive summary of what NoteDri mobile is, why it exists alongside the web product, and what it does. Includes:
- Tech stack table (framework, state, hardware, build)
- Full feature list by category
- Platform support (Android primary, iOS supported)
- EAS project info and distribution model
- Links to all other docs

### [obd-supported-devices.md](obd-supported-devices.md)

Tiếng Việt. So sánh khách quan độ ổn định/kết nối 4 đầu đọc OBD2 đã test
(KONNWEI KW906, KONNWEI KW902, OBDII giá rẻ, Vgate "Android-Vlink"), rút ra từ
log phiên thật (`obd-fixtures/`) — dùng làm dữ liệu cho trang **supported-devices**
bên Web. Có bảng so sánh, giải thích từng khác biệt (VIN mode 09, latency,
transport BLE/Classic), lưu ý về PIN ghép Classic, và mẫu cấu trúc dữ liệu JSON
gợi ý cho BE.

### [architecture.md](architecture.md)

System architecture reference. Includes:
- Architecture pattern diagram (feature-based screens + Zustand + TanStack Query + Axios)
- Navigation structure (full tree: RootNavigator → AuthNavigator / AppNavigator → tabs + stacks)
- State management: 7 Zustand stores (authStore, networkStatusStore, cockpitThemeStore, obdSessionStore, selectedVehicleStore, noriAgentStore, obdAutoConnectSettingsStore) + TanStack Query cache
- API integration layer (Axios interceptors, token injection, 401 auto-logout)
- Hardware integration layer (BLE OBD2, GPS, OCR, Voice, Push)
- Nori AI agent (tool-calling loop) and OBD cockpit dashboard / auto-connect / device-lock systems
- Background service state machines (OBD obdLiveMonitor, GPS GpsTripTracker)
- Source tree summary
- Testing note (Jest configured, 33 test files)

### [source-tree-analysis.md](source-tree-analysis.md)

Annotated directory tree of the entire project. Every folder and key file explained. Use this when you need to locate where something lives or understand the purpose of an unfamiliar file.

### [component-inventory.md](component-inventory.md)

All 48 component files in `src/components/` (including the `obd/` and `nori/` subfolders) plus `CustomTabBar` from `src/navigation/`. For each component: path, type, purpose, dependencies, and which screens use it. Includes a component dependency map and a root-mounted-vs-screen-local breakdown.

### [screens-inventory.md](screens-inventory.md)

All 59 screens organized by feature group. For each screen: file path, navigation location (tab / stack / auth), purpose description, and Premium-gating status. Includes a Premium-gated feature summary table.

### [services-guide.md](services-guide.md)

Deep-dive documentation for the ~44 service files across 11 folders in `src/services/`. Each major service includes:
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

### [nori-agent-plan.md](nori-agent-plan.md)

Kế hoạch triển khai **Nori Agent** — trợ lý AI điều khiển tính năng NoteDri qua Tool Calling (không phải chatbot). Bản nháp kiến trúc, khảo sát hiện trạng codebase, danh sách Tool, việc cần làm ở cả app và backend Laravel, roadmap theo phase, và câu hỏi còn mở. Đọc file này trước khi bắt tay code phần Nori/AI.

### [knowledge-coverage.md](knowledge-coverage.md)

Hiện trạng **Knowledge** (từ điển DTC `dtc_dictionary.json` + rule chẩn đoán sống `diagnostic_rules.json`, cả hai ở backend `notedri`): số lượng, độ phủ theo tiền tố/hệ, lịch sử tăng trưởng, giới hạn kỹ thuật (vd mã Chassis/Body không đọc được qua ELM327 phổ thông), cách ưu tiên mở rộng tiếp theo qua báo cáo "misses" thật. Thay thế vai trò tài liệu tầm nhìn ban đầu `OBD2/*.md` (đã xoá vì lỗi thời).

### [feature-parity-vs-web.md](feature-parity-vs-web.md)

Đối chiếu tính năng app vs web (`notedri.com`) — tính năng nào app đã có, đã tương đương, hay còn thiếu so với web, kèm đề xuất ưu tiên xử lý và trạng thái đã làm/chưa làm.

### [feature-parity-vs-maxobd.md](feature-parity-vs-maxobd.md)

So sánh tính năng OBD2 (xe xăng/dầu) với KONNWEI KW905/MAXOBD và MAXOBD Pro
2026 — 11 tính năng KW905 đối chiếu NoteDri (9/11 đã có), phân tích "full-system"
(ABS/SRS/Transmission...) của MAXOBD Pro và rào cản dữ liệu ECU riêng hãng, kèm
đề xuất thứ tự triển khai nếu theo đuổi hướng full-system.

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
| Screens | 59 total (see screens-inventory.md) |
| Shared components | 48 files across src/components/ (top-level + obd/ + nori/ subfolders) |
| Zustand stores | 7 (authStore, networkStatusStore, cockpitThemeStore, obdSessionStore, selectedVehicleStore, noriAgentStore, obdAutoConnectSettingsStore) |
| Service files | 30+ across src/services/ (obd/, gps/, nori/, permissions/, vehicles/, vin/, nfc/, drivingScore/, ads/, network/) — see services-guide.md |
| API base | https://notedri.com/api/v1 |
| EAS project ID | 92c0bda5-b744-47c5-b06d-12bff12b13f9 |
| Android package | com.notedri |
| Default language | Vietnamese (vi) |
| Premium features | OBD2 (all 3 screens), 3+ vehicles, full history |
| Automated tests | Jest configured (jest-expo preset); 33 `*.test.ts` files under src/agent, src/services, src/constants, src/utils |
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
| `patches/` | patch-package diffs (react-native-ble-plx build fix) |
