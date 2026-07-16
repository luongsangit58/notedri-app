# NoteDri Mobile App - Screens Inventory

All 56 screen files catalogued by feature group, with path, purpose, navigation location, and Premium gating status. (A previous version of this document listed only 44 screens; this revision was produced by reading every file under `src/screens/**` on 2026-07-16. The orphaned `DashboardScreen.tsx` counted in the initial 57 was subsequently deleted as dead code, see the Dashboard section below.)

---

## Navigation Location Key

| Symbol | Meaning |
|---|---|
| TAB | Root bottom tab screen (`AppNavigator.tsx` → `ThemedTabNavigator`) |
| TAB (embedded) | Rendered as a sub-tab inside another tab screen (`ThongKeScreen` / `QuanLyScreen`), not a route of its own |
| STACK | Pushed onto the root stack (`RootStack` in `AppNavigator.tsx`), reachable from a tab or menu |
| AUTH | Auth-only stack (no token required) |
| ORPHANED | File exists under `src/screens/` but is not imported/registered anywhere in `AppNavigator.tsx` |

**Tab bar note:** the 4 bottom tabs are named **Dashboard, Stats, Vehicles, Management** in `src/navigation/AppNavigator.tsx`. The `Stats` and `Management` route names were recently renamed from the older Vietnamese-derived names `ThongKe`/`QuanLy` to be consistent with the other English route names in the navigator — the underlying screen **files** are still called `ThongKeScreen.tsx` and `QuanLyScreen.tsx` and were not renamed. The `Dashboard` tab renders `HomeScreen`, not `DashboardScreen` (see the Dashboard section below).

---

## Auth Screens (6)

| Screen | File | Navigation | Purpose |
|---|---|---|---|
| _authLayout | `src/screens/auth/_authLayout.tsx` | (shared layout, not a route) | Exports the fixed dark color palette (`C`), `INPUT_STYLE`/`LABEL_STYLE`, the tiled icon `BgPattern` background, and the `AuthContainer` scroll wrapper shared by every auth screen. |
| SplashScreen | `src/screens/auth/SplashScreen.tsx` | AUTH (initial) | Thin wrapper that renders `LoadingView` while `authStore.initialize()` resolves and `RootNavigator` decides where to send the user. |
| OnboardingScreen | `src/screens/auth/OnboardingScreen.tsx` | AUTH (first run) | 5-slide horizontal carousel introducing OBD2, vehicle health, GPS trips and other features; has a language switch and "Skip" button; sets an `AsyncStorage` "seen" flag (`onboarding_seen`) before routing to Register or Login. |
| LoginScreen | `src/screens/auth/LoginScreen.tsx` | AUTH | Email + password login form. Google login opens `expo-web-browser`'s `openAuthSessionAsync` against the backend's `/auth/google/mobile` endpoint and completes the session from the `notedri://auth` callback URL. Links to Register and ForgotPassword. |
| RegisterScreen | `src/screens/auth/RegisterScreen.tsx` | AUTH | Two-step signup: (1) name/email/password/confirm + terms checkbox, submitted to `POST /auth/register`; (2) 6-digit OTP email verification step with a 60s resend countdown, calling `authApi.verifyOtp`. |
| ForgotPasswordScreen | `src/screens/auth/ForgotPasswordScreen.tsx` | AUTH | Email input that posts to `/auth/forgot-password` and shows a success confirmation panel. |

---

## Home (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| HomeScreen | `src/screens/home/HomeScreen.tsx` | TAB (`Dashboard`) | No | The app's real main-tab dashboard. Header with weather widget, avatar, and unread-notification bell; vehicle selector; top-priority reminder banner; GPS-trip hero card; OBD quick-connect card (promoted to a hero card once the user has paired/connected an adapter, otherwise a small upsell row with a crown icon for Free users); refuel/EV-charging and odometer quick-action cards; service shortcut; quick stats strip (this month spend, L/100km, all-time spend); upcoming reminders list; `AdMobBanner` at the bottom. |

---

## Dashboard

Removed: `DashboardScreen.tsx` was an older, unrouted per-vehicle dashboard superseded by `HomeScreen.tsx` (which absorbed its features plus GPS, notifications, AdMobBanner and OBD pairing). It was never imported in `AppNavigator.tsx` and has been deleted as dead code. The `Dashboard` tab renders `HomeScreen`.

---

## Timeline (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| TimelineScreen | `src/screens/timeline/TimelineScreen.tsx` | TAB (embedded in `Stats` sub-tab 0) | No | Chronological event stream across vehicles. Vehicle chips (multi-vehicle users) and type filter chips (All/Refuel/Service, server-side filtered) above an infinite-scroll `FlatList` of `TimelineItem` cards; tapping an item opens `EditRefuel`/`EditService`. |

---

## Stats (1 tab-container file)

| Screen | File | Navigation | Purpose |
|---|---|---|---|
| ThongKeScreen | `src/screens/stats/ThongKeScreen.tsx` | TAB (`Stats`) | Tab-bar route is named `Stats` (renamed from `ThongKe`); the file itself keeps its original name. Renders its own top sub-tab bar with 3 tabs — **Timeline** (`TimelineScreen`), **Reports** (`ReportsScreen`), **Trips** (`GpsTripsScreen`, embedded mode) — switched locally with `useState`, no separate navigation routes. Accepts a `route.params.tab` index to deep-link into a specific sub-tab. |

---

## Management (1 tab-container file)

| Screen | File | Navigation | Purpose |
|---|---|---|---|
| QuanLyScreen | `src/screens/management/QuanLyScreen.tsx` | TAB (`Management`) | Tab-bar route is named `Management` (renamed from `QuanLy`); the file itself keeps its original name. Renders its own sub-tab bar with 2 tabs — **Reminders** (`RemindersScreen`) and **Health** (`HealthScreen`) — switched locally with `useState`; accepts `route.params.tab` to deep-link (e.g. tapping a reminder from `HomeScreen` opens tab 0 directly). |

---

## Vehicles (6)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| VehiclesScreen | `src/screens/vehicles/VehiclesScreen.tsx` | TAB (`Vehicles`, stack root) | No | Vehicle list with health-score badges. FAB opens `AddVehicle` unless the Free-tier vehicle limit is reached (shows an amber limit-warning banner instead). Each card has an inline "Edit" shortcut to `EditVehicle`. |
| VehicleDetailScreen | `src/screens/vehicles/VehicleDetailScreen.tsx` | STACK > Vehicles | No (OBD entry points are Premium) | Per-vehicle hub: health organs/pillars summary, upcoming reminders, OBD pairing/capability card (links to `OBDSetup`, `DtcLookup`), rest-mode toggle, and "mark as sold" / ownership-transfer entry points. |
| AddVehicleScreen | `src/screens/vehicles/AddVehicleScreen.tsx` | STACK (modal) | Partial | Multi-step vehicle creation: brand → model → spec picker modals (popular Vietnamese brands sorted to the top), vehicle type (ô tô / xe máy), photo upload, extra fields via `VehicleMoreFields`, optional transfer-request send (VIN-based "hand over to new owner"). Free users blocked at the vehicle limit. |
| EditVehicleScreen | `src/screens/vehicles/EditVehicleScreen.tsx` | STACK (modal) | No | Edit existing vehicle: name, plate, make/model, year, fuel type, tank capacity, official consumption, default flag, photo, extra fields (`VehicleMoreFields`); also exposes delete and send-transfer-request actions. |
| DossierScreen | `src/screens/vehicles/DossierScreen.tsx` | STACK > VehicleDetail | No | Vehicle "hồ sơ" (dossier) view: identity fields plus service-log-derived stat cards (total service cost, service count, etc.), with share/export of the summary. |
| VehicleTransferRequestsScreen | `src/screens/vehicles/VehicleTransferRequestsScreen.tsx` | STACK | No | Incoming and outgoing vehicle-ownership transfer requests (the "maintenance passport" / VIN hand-over feature). Incoming requests can be approved or denied; outgoing requests show status (pending/approved/denied/expired). |

---

## Health (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| HealthScreen | `src/screens/health/HealthScreen.tsx` | TAB (embedded in `Management` sub-tab 1) | No | Vehicle Health Score (VHS) for **every** vehicle the user owns (one card per vehicle, loaded in parallel via `useQueries`). Each card shows the numeric score badge, 4 pillar progress bars, organ rows with severity icon/verdict/CTA, an "improve your score" tip list, and a 30-point score-trend bar chart. |

---

## Profile (10)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ProfileScreen | `src/screens/profile/ProfileScreen.tsx` | STACK (opened from HomeScreen avatar, not a tab) | No | Settings menu hub: theme toggle, language switch, Google account link/unlink, plan display, delete-account flow (with password/Google-aware confirmation), logout. Links to all profile sub-screens. |
| EditProfileScreen | `src/screens/profile/EditProfileScreen.tsx` | STACK > Profile | No | Edit name, phone, address (province/ward via `SelectField` + `geoApi`) and avatar photo upload. |
| ChangePasswordScreen | `src/screens/profile/ChangePasswordScreen.tsx` | STACK > Profile | No | Current password + new password + confirm form, each with its own show/hide toggle and inline field errors. |
| DevicesScreen | `src/screens/profile/DevicesScreen.tsx` | STACK > Profile | No | Lists active login sessions/devices (`devicesApi.list`), lets the user log out a single device, log out all other devices, or set a primary device. |
| ExportDataScreen | `src/screens/profile/ExportDataScreen.tsx` | STACK > Profile | **Yes** | Requests/previews a personal data export (`GET /account/export`); redirects Free users to `Premium` on a 403. Preview can be shared as raw JSON via `Share.share`. |
| FeedbackScreen | `src/screens/profile/FeedbackScreen.tsx` | STACK > Profile | No | In-app feedback form: category chips (bug / idea / other), star rating, free-text message (min 10 chars), posts to `/feedback`. |
| NotificationSettingsScreen | `src/screens/profile/NotificationSettingsScreen.tsx` | STACK > Profile | No | Reminder notification level toggle (all / urgent-only / off) plus a master switch, persisted via `/profile/notification-settings`. |
| PaymentHistoryScreen | `src/screens/profile/PaymentHistoryScreen.tsx` | STACK > Profile | No | List of past/pending Premium payment orders with status, amount, plan length, invoice number; can resume a pending order's QR bank-transfer payment modal. |
| PremiumScreen | `src/screens/profile/PremiumScreen.tsx` | STACK | No | Premium upgrade screen: Free vs Premium feature comparison, plan length picker (1/3/6/12 months), redeem-code field, and a QR bank-transfer payment modal. Refreshes `authStore.user` after a successful payment/redeem so gates unlock immediately. |
| AboutScreen | `src/screens/profile/AboutScreen.tsx` | STACK > Profile | No | App version/build, mission statement, and links to website, privacy policy, and terms of service. |

---

## Refuels (5)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| AddRefuelScreen | `src/screens/refuels/AddRefuelScreen.tsx` | STACK (modal) | No | Log a fuel fill-up: vehicle picker (EV vehicles excluded from the fuel-vehicle list), fuel-type picker, OCR receipt scan (`OcrCamera`) and voice input (`VoiceButton`) for the amount, auto price lookup with a "nearby stations" price suggestion dropdown, full-tank toggle. |
| EditRefuelScreen | `src/screens/refuels/EditRefuelScreen.tsx` | STACK (modal) | No | Edit an existing refuel entry (same fields as Add) with delete support. |
| FuelPricesScreen | `src/screens/refuels/FuelPricesScreen.tsx` | STACK | No | Current fuel-price board grouped by fuel family (gasoline/diesel/kerosene) plus a hand-drawn 6-month mini line chart (no charting library, built from `View`s). |
| NearbyStationsScreen | `src/screens/refuels/NearbyStationsScreen.tsx` | STACK | No | Finds nearby fuel stations or EV charging stations (togglable mode) using device GPS; each result opens native Google/Apple Maps turn-by-turn directions via deep link. |
| RefuelsListScreen | `src/screens/refuels/RefuelsListScreen.tsx` | STACK > VehicleDetail | No | Refuel history list with per-entry consumption (L/100km) and km-since-last-fill, paginated. |

---

## Odometer (3)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| AddOdometerScreen | `src/screens/odometer/AddOdometerScreen.tsx` | STACK (modal) | No | Log a new ODO reading; OCR camera and voice input for the number; auto-prefills the vehicle's last known ODO as a suggestion; checks whether GPS trip tracking is currently active. |
| EditOdometerScreen | `src/screens/odometer/EditOdometerScreen.tsx` | STACK (modal) | No | Edit or delete an existing ODO entry. |
| OdometerListScreen | `src/screens/odometer/OdometerListScreen.tsx` | STACK > VehicleDetail | No | ODO reading history, reverse-chronological, showing the distance delta between consecutive readings. |

---

## Services (4)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ServicesScreen | `src/screens/services/ServicesScreen.tsx` | STACK > VehicleDetail | No | Service-log list with type-chip filtering (bảo dưỡng, sửa chữa, lốp, bảo hiểm, đăng kiểm, phạt nguội, phí gửi xe, phí cầu đường, rửa xe, khác) and text search. |
| AddServiceScreen | `src/screens/services/AddServiceScreen.tsx` | STACK (modal) | No | Log a new service/maintenance/fee event across 10 type categories; receipt photo attachment via `ReceiptPicker`; date/cost/garage/notes fields. |
| EditServiceScreen | `src/screens/services/EditServiceScreen.tsx` | STACK (modal) | No | Edit or delete an existing service entry, including its receipt photo. |
| GarageGuideScreen | `src/screens/services/GarageGuideScreen.tsx` | STACK > ServicesScreen (header icon) | No | Topic checklist of what to tell/ask the garage, with the vehicle's last logged cost for that topic shown alongside each set of questions. |

---

## Reminders (3)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| RemindersScreen | `src/screens/reminders/RemindersScreen.tsx` | TAB (embedded in `Management` sub-tab 0) | No | Active/overdue reminders for a vehicle with status badges (ok / sắp tới / tới hạn / quá hạn / chưa dữ liệu); mark-done, delete, "seed suggested reminders", and confirm-all actions. |
| AddReminderScreen | `src/screens/reminders/AddReminderScreen.tsx` | STACK (modal) | No | Create a reminder. Types: bảo dưỡng, đăng kiểm, bảo hiểm, giấy tờ, khác. Modes: chu kỳ (km/month interval), ngày cố định (fixed date), một lần (one-off). Accepts prefill params from a suggested reminder. |
| EditReminderScreen | `src/screens/reminders/EditReminderScreen.tsx` | STACK (modal) | No | Edit or delete an existing reminder. |

---

## Reports (2)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ReportsScreen | `src/screens/reports/ReportsScreen.tsx` | TAB (embedded in `Stats` sub-tab 1) | No | Cost/consumption stat cards and charts per vehicle with a horizontal vehicle-chip selector. |
| YearReviewScreen | `src/screens/reports/YearReviewScreen.tsx` | STACK | No | Dark "year in review" recap card (animated gradient background): total km, fuel cost, liters, fill count, service cost/count, top fuel station of the year. |

---

## Achievements (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| AchievementsScreen | `src/screens/achievements/AchievementsScreen.tsx` | STACK | No | Gamified badge/level wall with an animated aurora-blob + twinkling-spark background, per-level accent colors, locked/unlocked badge grid sourced from `GET /achievements`. |

---

## GPS Trips (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| GpsTripsScreen | `src/screens/trips/GpsTripsScreen.tsx` | TAB (embedded in `Stats` sub-tab 2, `embedded` prop) or STACK (`GpsTrips` route from Home hero card) | No | GPS trip history and live-tracking control (start/pause/stop), driving-score computation (`drivingScoreEngine`), a one-time battery-optimization tip, and route visualization via `RouteMap` (Leaflet/WebView). |

---

## Notifications (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| NotificationsScreen | `src/screens/notifications/NotificationsScreen.tsx` | STACK | No | In-app notification inbox; mark one/all read; tapping a notification with a `url` deep-links via `navigateFromUrl`; clears the OS badge/notification tray on focus. |

---

## OBD2 (9) - Mostly Premium-Gated

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| OBDSetupScreen | `src/screens/obd/OBDSetupScreen.tsx` | STACK | **Yes** (redirects Free users to `Premium`) | BLE scan/connect screen for ELM327/Vgate adapters; shows the `ObdConnectionGuide` step carousel, a Bluetooth-enable flow, and an NFC auto-connect entry path. |
| OBDDashboardScreen | `src/screens/obd/OBDDashboardScreen.tsx` | STACK | **Yes** | Live OBD2 PID gauge dashboard (RPM, speed, coolant/oil temp, fuel level, engine load, throttle) with findings/warnings and a disconnect action; links to `NfcSetup` for tap-to-connect setup. |
| OBDTechnicalScreen | `src/screens/obd/OBDTechnicalScreen.tsx` | STACK | **Yes** | Full raw-PID table covering all 13 registry PIDs, including 5 "extended" ones (short-term fuel trim, intake manifold pressure, intake air temp, ambient air temp, fuel rate) polled separately from the core live monitor. |
| ObdSystemHealthScreen | `src/screens/obd/ObdSystemHealthScreen.tsx` | STACK | **Yes** | Groups OBD readings/findings into 4 "system" cards — engine, cooling, electrical, fuel — each with an overall status (critical/warn/ok/na). |
| OBDTripsScreen | `src/screens/obd/OBDTripsScreen.tsx` | STACK | **Yes** (redirects Free users to `Premium`) | OBD trip recording history with distance/duration/avg-speed stats, DTC events surfaced per trip, and an estimated fuel cost. |
| NfcSetupScreen | `src/screens/obd/NfcSetupScreen.tsx` | STACK (from OBDSetup/OBDDashboard) | Indirect (only reachable via the OBD flow) | Writes vehicle + BLE-device pairing data to an NFC tag so a future tap auto-connects; shows supported/enabled checks and a short buy/place/tip guide. |
| DtcLookupScreen | `src/screens/obd/DtcLookupScreen.tsx` | STACK (also linked from VehicleDetail) | No (standalone utility) | Look up a SAE J2012 diagnostic trouble code (format `[PCBU][0-9A-F]{4}`) online via `obdApi.lookupDtc`, falling back to a bundled offline dictionary when the network call fails; shows severity and "can I still drive?" guidance. |
| ObdReportScreen | `src/screens/obd/ObdReportScreen.tsx` | STACK | **Yes** | Latest-session vitals report plus a 30-day trend tab (voltage avg, coolant max, driving score, DTC count, engine minutes) rendered with `ObdTrendChart`. |
| ObdTrendChart | `src/screens/obd/ObdTrendChart.tsx` | (sub-component, not a route) | — | Reusable hand-drawn bar chart (no charting library) for a single OBD trend metric over N days; tappable bars show the date/value for that day. Colocated under `screens/obd/` but consumed only by `ObdReportScreen`. |

---

## Premium-Gated Summary

| Feature Area | Gated Screens |
|---|---|
| OBD2 core flow | OBDSetupScreen, OBDDashboardScreen, OBDTechnicalScreen, ObdSystemHealthScreen, OBDTripsScreen, ObdReportScreen (NfcSetupScreen is reachable only through this flow; DtcLookupScreen is a free-standing utility) |
| Data export | ExportDataScreen (403 from the backend redirects to Premium) |
| Vehicle count | AddVehicleScreen (blocked at limit), VehiclesScreen (shows limit-warning banner) |
| History window | Free users see a limited history window; Premium sees full history (enforced server-side) |
