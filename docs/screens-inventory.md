# NoteDri Mobile App - Screens Inventory

All 44 screens catalogued by feature group, with path, purpose, navigation location, and Premium gating status.

---

## Navigation Location Key

| Symbol | Meaning |
|---|---|
| TAB | Root bottom tab screen |
| STACK > Tab | Pushed onto the root stack, accessible from a tab or menu |
| AUTH | Auth-only stack (no token required) |

---

## Auth Screens (4)

| Screen | File | Navigation | Purpose |
|---|---|---|---|
| SplashScreen | `src/screens/auth/SplashScreen.tsx` | AUTH (initial) | Brand splash shown during `authStore.initialize()`. Fades to Login or App depending on stored token. |
| LoginScreen | `src/screens/auth/LoginScreen.tsx` | AUTH | Email + password login form. Also contains Google OAuth button via `expo-auth-session`. Links to Register and ForgotPassword. |
| RegisterScreen | `src/screens/auth/RegisterScreen.tsx` | AUTH | New account form: name, email, password, confirm password. Calls `POST /auth/register`. |
| ForgotPasswordScreen | `src/screens/auth/ForgotPasswordScreen.tsx` | AUTH | Email input to trigger password reset email. Calls backend reset endpoint. |

---

## Home (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| HomeScreen | `src/screens/home/HomeScreen.tsx` | TAB (Home) | No | Main dashboard tab. Shows greeting, active vehicle summary (health score, last ODO, recent events), quick action shortcuts, and a VehicleCard list. Entry point for most flows. |

---

## Dashboard (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| DashboardScreen | `src/screens/dashboard/DashboardScreen.tsx` | STACK > Home | No | Aggregated analytics for a selected vehicle: cost per km, monthly spend, fuel efficiency trend, service cost breakdown. Powered by `GET /dashboard`. |

---

## Timeline (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| TimelineScreen | `src/screens/timeline/TimelineScreen.tsx` | TAB (Timeline) | No | Chronological event stream across all vehicles. Each item is a `TimelineItem` card. Types: refuel, service, ODO, reminder, trip, health change. Paginated or infinite-scroll. |

---

## Vehicles (5)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| VehiclesScreen | `src/screens/vehicles/VehiclesScreen.tsx` | TAB (Vehicles) | No | Vehicle list. Each vehicle shown as `VehicleCard`. Free users capped at 2 vehicles; Premium shown above cap are blurred with upgrade prompt. |
| VehicleDetailScreen | `src/screens/vehicles/VehicleDetailScreen.tsx` | STACK > Vehicles | No | Full detail for one vehicle. Tabs or sections: overview, refuels, services, ODO, reminders, health, documents. Navigation hub for vehicle-specific sub-screens. |
| AddVehicleScreen | `src/screens/vehicles/AddVehicleScreen.tsx` | STACK (modal) | Partial | Form to add a new vehicle: make, model, year, fuel type, plate, initial ODO. Free users blocked when at vehicle limit (upgrade prompt shown). |
| EditVehicleScreen | `src/screens/vehicles/EditVehicleScreen.tsx` | STACK (modal) | No | Edit existing vehicle details. Same form fields as Add. |
| DossierScreen | `src/screens/vehicles/DossierScreen.tsx` | STACK > VehicleDetail | No | Document storage for registration, insurance, and inspection documents. Upload and view PDFs/images. |

---

## Health (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| HealthScreen | `src/screens/health/HealthScreen.tsx` | STACK > VehicleDetail | No | Vehicle Health Score (VHS) display. Shows numeric score, band (A-F), contributing factors (maintenance freshness, DTC codes, mileage pace), and recommended actions. Score is server-computed. |

---

## Profile (8)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ProfileScreen | `src/screens/profile/ProfileScreen.tsx` | TAB (Profile) | No | User info card + settings menu list. Links to all profile sub-screens. Shows current plan (Free / Premium) and vehicle count usage. |
| EditProfileScreen | `src/screens/profile/EditProfileScreen.tsx` | STACK > Profile | No | Edit display name and avatar photo. Avatar upload calls `POST /profile/avatar` (multipart). |
| ChangePasswordScreen | `src/screens/profile/ChangePasswordScreen.tsx` | STACK > Profile | No | Current password + new password + confirm form. Calls `POST /profile/password`. |
| PremiumScreen | `src/screens/profile/PremiumScreen.tsx` | STACK > Profile | No | Premium upgrade CTA. Feature comparison table (Free vs Premium). Links to payment flow (handled by backend/WebView). |
| NotificationSettingsScreen | `src/screens/profile/NotificationSettingsScreen.tsx` | STACK > Profile | No | Toggle individual notification categories (reminders, VHS alerts, promotions). Calls `PUT /profile` with notification preference payload. |
| ExportDataScreen | `src/screens/profile/ExportDataScreen.tsx` | STACK > Profile | No | Requests personal data export. Calls `POST /profile/export`; user receives email with data file. |
| FeedbackScreen | `src/screens/profile/FeedbackScreen.tsx` | STACK > Profile | No | In-app feedback submission form (category + message). Sends to backend feedback endpoint. |
| AboutScreen | `src/screens/profile/AboutScreen.tsx` | STACK > Profile | No | App version, build number, links to privacy policy, terms of service, and open source licenses. |

---

## Refuels (5)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| RefuelsListScreen | `src/screens/refuels/RefuelsListScreen.tsx` | STACK > VehicleDetail | No | Chronological refuel history for a vehicle. Summary stats (total volume, total cost, avg price/L). |
| AddRefuelScreen | `src/screens/refuels/AddRefuelScreen.tsx` | STACK (modal) | No | Log a new fuel fill-up. Fields: date, ODO, volume (L), total cost, fuel type, station, notes. Has OCR button (scan receipt) and voice button (dictate amount). |
| EditRefuelScreen | `src/screens/refuels/EditRefuelScreen.tsx` | STACK (modal) | No | Edit an existing refuel entry. Same fields as Add. |
| FuelPricesScreen | `src/screens/refuels/FuelPricesScreen.tsx` | STACK > Home | No | Current fuel price feed by fuel type (E5 RON 95, E10 RON 95, RON 92, DO 0.05S, etc.). Sourced from `GET /fuel-types` (which includes price data). |
| NearbyStationsScreen | `src/screens/refuels/NearbyStationsScreen.tsx` | STACK > Home | No | Map of nearby fuel stations via WebView + Leaflet. Uses device GPS (foreground) to center the map. |

---

## Odometer (3)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| OdometerListScreen | `src/screens/odometer/OdometerListScreen.tsx` | STACK > VehicleDetail | No | ODO reading history for a vehicle in reverse-chronological order. Shows distance delta between consecutive readings. |
| AddOdometerScreen | `src/screens/odometer/AddOdometerScreen.tsx` | STACK (modal) | No | Log a new ODO reading. Fields: date, reading (km). Has OCR button (scan dashboard photo) and voice button (dictate number). |
| EditOdometerScreen | `src/screens/odometer/EditOdometerScreen.tsx` | STACK (modal) | No | Edit an existing ODO entry. |

---

## Services (4)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ServicesScreen | `src/screens/services/ServicesScreen.tsx` | STACK > VehicleDetail | No | Service log list for a vehicle. Each entry shows service type, date, ODO, cost, garage name. |
| AddServiceScreen | `src/screens/services/AddServiceScreen.tsx` | STACK (modal) | No | Log a new service event. Fields: service type, date, ODO, cost, garage, notes, parts replaced. |
| EditServiceScreen | `src/screens/services/EditServiceScreen.tsx` | STACK (modal) | No | Edit an existing service entry. |
| GarageGuideScreen | `src/screens/services/GarageGuideScreen.tsx` | STACK > ServicesScreen | No | Checklist / guide for what to tell/ask the garage when dropping off the vehicle. Based on vehicle type and recent history. |

---

## Reminders (3)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| RemindersScreen | `src/screens/reminders/RemindersScreen.tsx` | STACK > VehicleDetail | No | Active and completed reminders list for a vehicle. Shows days remaining / overdue for each reminder. |
| AddReminderScreen | `src/screens/reminders/AddReminderScreen.tsx` | STACK (modal) | No | Create a reminder. Types: legal deadline (inspection, insurance, registration) or maintenance interval (km or date-based). Schedules a local notification. |
| EditReminderScreen | `src/screens/reminders/EditReminderScreen.tsx` | STACK (modal) | No | Edit an existing reminder. |

---

## Notifications (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| NotificationsScreen | `src/screens/notifications/NotificationsScreen.tsx` | STACK > Home | No | In-app notification inbox. Lists server-pushed notifications (VHS band changes, reminder alerts, service due alerts). Mark-read calls `PATCH /notifications/{id}`. |

---

## Reports (2)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| ReportsScreen | `src/screens/reports/ReportsScreen.tsx` | STACK > Profile | No | Cost and consumption charts per vehicle. Fuel spend by month, service cost breakdown, efficiency trend. Powered by `GET /reports/*`. |
| YearReviewScreen | `src/screens/reports/YearReviewScreen.tsx` | STACK > Profile | No | Annual summary in "year in review" style. Total km driven, fuel spend, number of services, best efficiency month. Powered by backend year-review endpoint. |

---

## Achievements (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| AchievementsScreen | `src/screens/achievements/AchievementsScreen.tsx` | STACK > Profile | No | Gamified milestone display. Locked and unlocked badges (e.g., "First refuel logged", "100 fill-ups", "10,000 km tracked"). Powered by `GET /achievements`. |

---

## GPS Trips (1)

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| GpsTripsScreen | `src/screens/trips/GpsTripsScreen.tsx` | STACK > Home | No | GPS trip history list. Each trip shows date, distance, duration. Tapping a trip expands a `RouteMap` (Leaflet WebView) showing the route polyline. Powered by `GET /gps-trips`. |

---

## OBD2 (3) - Premium-Gated

| Screen | File | Navigation | Premium | Purpose |
|---|---|---|---|---|
| OBDSetupScreen | `src/screens/obd/OBDSetupScreen.tsx` | STACK > Profile | **Yes** | BLE scan for ELM327/Vgate adapters. Lists discovered devices, allows selecting and pairing. Runs AT handshake to confirm adapter is working. Entry point before accessing OBD features. |
| OBDDashboardScreen | `src/screens/obd/OBDDashboardScreen.tsx` | STACK > Home | **Yes** | Live OBD2 PID dashboard. Gauges: RPM, speed (km/h), coolant temp (°C), oil temp (°C), fuel level (%), engine load (%), throttle position (%). Start / stop trip recording button. Calls `TripSession.start()` / `.stop()`. |
| OBDTripsScreen | `src/screens/obd/OBDTripsScreen.tsx` | STACK > Home | **Yes** | OBD trip recording history. List of completed OBD trips with distance, duration, avg speed, max RPM. DTC codes surfaced in trip detail. Powered by `GET /obd2/trips`. |

---

## Premium-Gated Summary

| Feature Area | Gated Screens |
|---|---|
| OBD2 | OBDSetupScreen, OBDDashboardScreen, OBDTripsScreen |
| Vehicle count | AddVehicleScreen (blocked at limit), VehiclesScreen (excess vehicles locked) |
| History window | Free users see last 12 months; Premium sees full history (enforced server-side) |
