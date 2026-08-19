# NoteDri Mobile App - API Integration

All backend communication goes through a single Axios instance. TanStack Query hooks wrap most domains' API calls (some low-traffic domains are called directly from screens with plain `async/await`, no hook wrapper). This document covers the base configuration, the interceptor pattern, the hooks table, the full endpoint list, and the auth token lifecycle.

Derived directly from the code in `src/api/*.ts` on 2026-08-13 — every method/path below was read off the actual `client.get/post/put/patch/delete` call, not reconstructed from memory.

---

## Base Configuration

**Files:** `src/utils/api.ts` (URL constants) + `src/api/client.ts` (axios instance)

```typescript
// src/utils/api.ts
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://notedri.com';
export const API_URL = `${BASE_URL}/api/v1`;

// src/api/client.ts
import axios from 'axios';
import { API_URL } from '../utils/api';

const client = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json' },
  timeout: 30000,
});
```

**Environment variable:** `EXPO_PUBLIC_API_URL` (see [development-guide.md](development-guide.md)).
Defaults to `https://notedri.com` if not set.

All domain API modules (`src/api/*.ts`) import and use this single `client` instance.

---

## Interceptors

### Request interceptor

Runs before every outgoing request. Injects auth token and language header. It's `async` (not sync) because it dynamically imports the Zustand stores — this file is also loaded from headless JS contexts (background location tasks) where `RootNavigator` never mounted.

```typescript
client.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('../store/authStore');
  const { useI18nStore } = await import('../i18n');

  // Background/headless task (expo-task-manager waking the app for a location
  // update) never ran authStore.initialize(), so in-memory token can be null
  // even though the user is genuinely logged in. Fall back to SecureStore.
  let token = useAuthStore.getState().token;
  if (!token) {
    const { storage } = await import('../utils/storage');
    token = await storage.getToken();
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = useI18nStore.getState().lang ?? 'vi';
  return config;
});
```

### Response interceptor (success side-effect + 401 auto-logout + premium downgrade)

```typescript
client.interceptors.response.use(
  (response) => {
    // Any 2xx response is proof the network is up RIGHT NOW - piggy-back on it
    // to flush the offline OBD session sync queue instead of adding a netinfo
    // dependency. Dynamic import to avoid a circular-import loop
    // (client.ts <- ObdSessionSyncQueue.ts <- api/obd.ts -> client.ts).
    import('../services/obd/obdSyncStatus')
      .then(({ flushObdQueuesAndRefreshCount }) => flushObdQueuesAndRefreshCount())
      .catch(() => {});
    return response;
  },
  async (error) => {
    // 401 -> auto logout, EXCEPT if the failing request is /auth/logout itself
    // (otherwise logout() -> authApi.logout() -> 401 -> logout() again, infinite loop).
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.includes('/auth/logout')) {
      const { useAuthStore } = await import('../store/authStore');
      await useAuthStore.getState().logout();
    }

    // Premium expired/downgraded mid-OBD-session (backend EnsurePremium middleware
    // returns 403 { error: 'premium_required' }): downgrade in-memory user.is_premium
    // and force-disconnect the live BLE session if one is active.
    if (error.response?.status === 403 && error.response?.data?.error === 'premium_required') {
      const { useAuthStore } = await import('../store/authStore');
      const user = useAuthStore.getState().user;
      if (user?.is_premium) {
        useAuthStore.getState().setUser({ ...user, is_premium: false });
        const { bleService } = await import('../services/obd/BleService');
        if (bleService.isConnected()) {
          const { useI18nStore } = await import('../i18n');
          const t = useI18nStore.getState().t;
          await bleService.disconnect().catch(() => {});
          Alert.alert(t('obd.premium_expired_title'), t('obd.premium_expired_body'));
        }
      }
    }

    return Promise.reject(error);
  }
);
```

No infinite retry loop on 401. After one 401 (other than on the logout call itself), the user is logged out immediately.

---

## TanStack Query Hooks

Each hook file in `src/hooks/` exports one or more `useQuery`/`useInfiniteQuery`/`useMutation` calls for its domain. Query keys shown are the literal arrays used in code (not paraphrased).

| Hook(s) | File | Query Keys | API Module |
|---|---|---|---|
| `useVehicles`, `useVehicle`, `useVehicleHealth`, `useVehicleReminders`, `useCreateVehicle`, `useUpdateVehicle`, `useDeleteVehicle`, `useSetDefaultVehicle`, `useToggleVehicleRest` | `src/hooks/useVehicles.ts` | `['vehicles']`, `['vehicles', id]`, `['vehicles', id, 'health']`, `['vehicles', id, 'reminders']` | `src/api/vehicles.ts` |
| `useRefuels`, `useCreateRefuel`, `useUpdateRefuel`, `useDeleteRefuel` | `src/hooks/useRefuels.ts` | `['refuels', vehicleId, page]` | `src/api/refuels.ts` |
| `useServices`, `useRecentGarages`, `useServiceCatalog`, `useCreateService`, `useUpdateService`, `useDeleteService` | `src/hooks/useServices.ts` | `['services', vehicleId]` (infinite), `['services', 'garages']`, `['services', 'catalog', vehicleId]` | `src/api/services.ts` |
| `useOdometer`, `useCreateOdometer`, `useUpdateOdometer`, `useDeleteOdometer` | `src/hooks/useOdometer.ts` | `['odometer', vehicleId, page]` | `src/api/odometer.ts` |
| `useReminders`, `useCreateReminder`, `useDeleteReminder`, `useDoneReminder`, `useSeedReminders`, `useConfirmAllReminders` | `src/hooks/useReminders.ts` | `['reminders', vehicleId]` | `src/api/reminders.ts` |
| `useObdTrips`, `useObdDtcEvents`, `useObdConnection` | `src/hooks/useObd.ts` | `['obd', 'trips', vehicleId]`, `['obd', 'dtc', vehicleId]` | `src/api/obd.ts` |
| `useGpsTripState`, `useGpsTrips` | `src/hooks/useGpsTrip.ts` | `['gps_trips', vehicleId, page]` | `src/api/gpsTrips.ts` |
| `useDashboard` | `src/hooks/useDashboard.ts` | `['dashboard', vehicleId]` | `src/api/dashboard.ts` |
| `useTimeline` | `src/hooks/useTimeline.ts` | `['timeline', vehicleId, type ?? 'all']` (infinite) | `src/api/timeline.ts` |
| `useNotifications`, `useMarkAllRead`, `useMarkRead` | `src/hooks/useNotifications.ts` | `['notifications', page]` | `src/api/notifications.ts` |
| `useFuelTypes` | `src/hooks/useFuelTypes.ts` | `['fuel-types']` | `src/api/fuelTypes.ts` |
| `useIncomingTransferRequests`, `useOutgoingTransferRequests`, `useSendTransferRequest`, `useRespondTransferRequest`, `useSharedHistory`, `useMarkVehicleSold` | `src/hooks/useVehicleTransfer.ts` | `['transfer-requests', 'incoming'/'outgoing']`, `['vehicle-shared-history', vehicleId]` | `src/api/vehicleTransfer.ts` |
| `useVoiceInput` | `src/hooks/useVoiceInput.ts` | (none - no network) | expo-speech-recognition only |

**No hook wrapper — called directly from screens/services with plain async/await:** `authApi` (`src/api/auth.ts`), `profileApi` (`src/api/profile.ts`), `devicesApi` (`src/api/devices.ts`, used in `DevicesScreen.tsx`), `achievementsApi` (`src/api/achievements.ts`, used in `AchievementsScreen.tsx`), `trafficFinesApi` (`src/api/trafficFines.ts`, used in `TrafficFinesScreen.tsx`), `nearbyApi` (`src/api/nearby.ts`, used in `NearbyGaragesScreen.tsx`), `geoApi` (`src/api/geo.ts`), `noriApi` (`src/api/nori.ts`, used in `NoriAgent.ts`/`ConversationManager.ts`), `paymentApi` (`src/api/payment.ts`, used in `PaymentHistoryScreen.tsx`).

### Mutation pattern

All mutations follow the same pattern: call the API function, then invalidate related query keys.

```typescript
export const useCreateRefuel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => refuelsApi.create(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refuels'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};
```

---

## Full Endpoint Reference

### Auth

**File:** `src/api/auth.ts` (`authApi`)

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `POST` | `/auth/login` | `authApi.login()` → `authStore.login()` | Email + password + device meta (`device_id`, `device_name`, `platform`). Returns `{ token, user }` (or `{ data: { token, user } }`). |
| `POST` | `/auth/register` | `RegisterScreen` (plain `axios.post`, bypasses `client`/`authApi`) | Create account with name/email/password. Does **not** return a token — triggers an email OTP and the UI moves to an OTP-entry step. |
| `POST` | `/auth/register/resend-otp` | `RegisterScreen` (plain `axios.post`) | Resend the registration OTP email. |
| `POST` | `/auth/register/verify-otp` | `authApi.verifyOtp()` | Body: `{ email, code, ...deviceMeta }`. On success returns `{ token, data: user }` — this is the step that actually logs the new user in. |
| `POST` | `/auth/logout` | `authApi.logout()` → `authStore.logout()` | Invalidate server-side token (best-effort, errors swallowed). |
| `POST` | `/auth/forgot-password` | `authApi.forgotPassword()` | Trigger password reset email. |
| `GET` | `/auth/me` | `authApi.me()` → `authStore.initialize()`, `PremiumScreen`, `ProfileScreen`, Google login callback | Refresh user object (plan, `is_premium`, `vehicle_limit`). Optionally takes an explicit bearer token param (used right after Google OAuth redirect, before the token is in the store). |
| `GET` | `/auth/google/mobile` | `LoginScreen.handleGoogle()` via `WebBrowser.openAuthSessionAsync` | **Not** a JSON API call — opens a browser session; backend redirects to `notedri://auth?token=...` on success. The app then reads `token` off the callback URL and calls `GET /auth/me` with it. There is no `POST /auth/google` id_token-exchange endpoint in the client. |
| `POST` | `/auth/google/unlink` | `authApi.unlinkGoogle()` → `ProfileScreen` | Unlink a Google account from the current user. |
| `POST` | `/auth/apple` | `authApi.loginWithApple()` → `LoginScreen.handleApple()` | Body: `{ identity_token, full_name?, ...deviceMeta }` from `expo-apple-authentication`. `full_name` is only non-null on the device's first-ever Sign in with Apple. Returns `{ token, user }`. |
| `POST` | `/auth/push-token` | `authApi.pushToken()` → `pushNotifications.ts` | Body: `{ expo_push_token, device_id }`. Register Expo push token for this device. |

### Vehicles

**File:** `src/api/vehicles.ts` (`vehiclesApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/vehicles` | `useVehicles` | List all vehicles for the authenticated user. |
| `POST` | `/vehicles` | `useCreateVehicle` | Create a vehicle. Sends multipart `FormData` (field `anh`) instead of JSON when a photo is supplied. |
| `GET` | `/vehicles/{id}` | `useVehicle` | Get single vehicle detail. |
| `PUT` | `/vehicles/{id}` | `useUpdateVehicle` | Update vehicle (JSON body). |
| `POST` | `/vehicles/{id}` (`_method: PUT` spoofed) | `useUpdateVehicle` | Same update, but as multipart `FormData` with `_method=PUT` when a new photo or `anh_xoa` (remove photo) is present — Laravel can't parse file uploads on a real `PUT`. |
| `DELETE` | `/vehicles/{id}` | `useDeleteVehicle` | Delete vehicle and cascade (refuels, services, ODO, reminders). |
| `GET` | `/vehicles/{id}/health` | `useVehicleHealth` | Vehicle health summary. |
| `GET` | `/vehicles/{id}/cost-summary?days={n}` | `vehiclesApi.costSummary()` | Rolling cost summary (fuel/service/total) over the last `n` days (default 30). |
| `GET` | `/vehicles/{id}/cost-summary?scope=lifetime` | `vehiclesApi.costSummaryLifetime()` | Same endpoint, lifetime scope — adds `km` and `per_km`. |
| `GET` | `/vehicles/{id}/reminders` | `useVehicleReminders` | Reminders for this vehicle (also exposed under `/reminders` domain, see below — same route). |
| `GET` | `/vehicles/{id}/day-summary?at={date}` | `vehiclesApi.daySummary()` | Summary of activity for a given calendar day. |
| `POST` | `/vehicles/{id}/default` | `useSetDefaultVehicle` | Mark this vehicle as the user's default. |
| `POST` | `/vehicles/{id}/rest` | `useToggleVehicleRest` | Toggle "resting" (temporarily inactive) state for a vehicle. |

### Refuels

**File:** `src/api/refuels.ts` (`refuelsApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/refuels?vehicle={id}&page={p}` | `useRefuels` | List refuels for a vehicle (paginated). |
| `POST` | `/refuels` | `useCreateRefuel` | Create refuel entry. |
| `GET` | `/refuels/{id}` | `refuelsApi.get()` | Get single entry. |
| `PUT` | `/refuels/{id}` | `useUpdateRefuel` | Update entry. |
| `DELETE` | `/refuels/{id}` | `useDeleteRefuel` | Delete entry. |
| `GET` | `/refuels/nearby-stations?lat={}&lon={}` | `refuelsApi.nearbyStations()` | Nearby gas stations. |
| `GET` | `/refuels/nearby-charging?lat={}&lon={}` | `refuelsApi.nearbyCharging()` | Nearby EV charging stations. |
| `GET` | `/refuels/fuel-price?fuel_type_id={}&ngay={date}` | `refuelsApi.fuelPrice()` | Fuel price on a given date for a fuel type. |

### Odometer

**File:** `src/api/odometer.ts` (`odometerApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/odometer?vehicle={id}&page={p}` | `useOdometer` | List ODO readings for a vehicle (paginated). |
| `POST` | `/vehicles/{vehicleId}/odometer` | `useCreateOdometer` | Create ODO entry — note this is nested under `/vehicles/{id}`, not `/odometer`. |
| `GET` | `/odometer/{id}` | `odometerApi.get()` | Single entry. |
| `PUT` | `/odometer/{id}` | `useUpdateOdometer` | Update entry. |
| `DELETE` | `/odometer/{id}` | `useDeleteOdometer` | Delete entry. |

### Services (Maintenance)

**File:** `src/api/services.ts` (`servicesApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/services?vehicle={id}&page={p}` | `useServices` (infinite query) | List service records. |
| `GET` | `/services/{id}` | `servicesApi.get()` | Single record. |
| `POST` | `/services` | `useCreateService` | Create service record. Multipart `FormData` (field `dinh_kem`) when a receipt photo is attached. |
| `PUT` | `/services/{id}` | `useUpdateService` | Update record (JSON, no photo change). |
| `POST` | `/services/{id}` (`_method: PUT` spoofed) | `useUpdateService` | Multipart update when a new photo is attached or the existing one is removed (`dinh_kem_xoa: '1'`). |
| `DELETE` | `/services/{id}` | `useDeleteService` | Delete record. |
| `GET` | `/services/guide?vehicle={id}` | `servicesApi.guide()` | Maintenance guide/recommendations for a vehicle. |
| `GET` | `/services/garages` | `useRecentGarages` | Recently-used garage names (for autocomplete), across all of the user's vehicles. |
| `GET` | `/services/catalog?vehicle={id}` | `useServiceCatalog` | Suggested service item names for a vehicle (autocomplete). |

### Reminders

**Files:** `src/api/reminders.ts` (`remindersApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/vehicles/{vehicleId}/reminders` | `useReminders` | List reminders for a vehicle. |
| `POST` | `/vehicles/{vehicleId}/reminders` | `useCreateReminder` | Create reminder. |
| `PUT` | `/reminders/{id}` | *(not currently wired to a hook)* | Update reminder. |
| `DELETE` | `/reminders/{id}` | `useDeleteReminder` | Delete reminder. |
| `POST` | `/reminders/{id}/done` | `useDoneReminder` | Mark a reminder done. Optional body `{ last_done_odo, last_done_date }`. |
| `POST` | `/vehicles/{vehicleId}/reminders/seed` | `useSeedReminders` | Seed default reminders for a newly-added vehicle. |
| `POST` | `/vehicles/{vehicleId}/reminders/confirm-all` | `useConfirmAllReminders` | Bulk-confirm all pending reminders for a vehicle. |

### Dashboard and Analytics

**Files:** `src/api/dashboard.ts`, `src/api/timeline.ts`, `src/api/achievements.ts`

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/dashboard?vehicle={id}` | `useDashboard` | Aggregated stats. `vehicleId` omitted = combined dashboard across all vehicles (a valid mode, not just a loading state). |
| `GET` | `/timeline?vehicle={id}&page={p}&type={refuel\|service}` | `useTimeline` (infinite query) | Chronological event stream. `type` optional (both types when omitted). |
| `GET` | `/achievements` | `achievementsApi.get()` → `AchievementsScreen` | Badge/level progress summary (`earned`, `total`, `badges[]`, `level`, `levels[]`, `is_premium`, `free_ceiling_hit`). |

### Notifications

**File:** `src/api/notifications.ts` (`notificationsApi`)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/notifications?page={p}` | `useNotifications` | In-app notification inbox (paginated). |
| `POST` | `/notifications/read` | `useMarkRead` | Body `{ key }`. Mark a single notification as read (by `key`, not by numeric id/URL segment). |
| `POST` | `/notifications/read-all` | `useMarkAllRead` | Mark all as read. |

### OBD2

**File:** `src/api/obd.ts` (`obdApi`)

| Method | Endpoint | Hook / Caller | Description |
|---|---|---|---|
| `POST` | `/obd2/trips` | `TripSyncQueue.processQueue()` via `obdApi.saveTrip()` | Upload a completed OBD trip summary + `vehicle_id` + `obd_device_id` + `dtc_codes`. |
| `GET` | `/obd2/trips?vehicle_id={id}&page={p}` | `useObdTrips` | List OBD trip history. |
| `GET` | `/obd2/dtc?vehicle_id={id}` | `useObdDtcEvents` | List unresolved DTC event records for a vehicle. |
| `GET` | `/dtc-codes/{code}` | `obdApi.lookupDtc()` | Free/public route (no OBD device needed) — manual DTC code dictionary lookup. Returns severity, `can_drive`, titles, cost range. |
| `POST` | `/obd2/dtc` | `obdApi.reportDtc()` | Report DTC code(s) detected live during a session. Body: `{ vehicle_id, codes: [{ code, description }] }`. |
| `POST` | `/obd2/dtc/{id}/resolve` | `obdApi.resolveDtc()` | Mark a DTC event as resolved (called after a Mode 04 clear succeeds on the vehicle). |
| `GET` | `/obd2/sessions/recent?vehicle_id={id}` | `obdApi.recentSessions()` | Most recent OBD sessions (with summaries) for the Daily Report. Response `meta` includes `total_engine_hours` and `driving_score_stats`. |
| `GET` | `/obd2/sessions/history?vehicle_id={id}&days={n}` | `obdApi.historySessions()` | All sessions over the last `n` days (default 30), oldest→newest, for trend charts. |
| `POST` | `/obd2/sessions` | `ObdSessionSyncQueue` via `obdApi.reportSession()` | Persist one finished OBD connection session (telemetry retention). Body includes an `idempotency_key` generated at enqueue time so retries don't create duplicate sessions. Always goes through the sync queue, never called directly. |
| `POST` | `/obd2/device-lock` | `obdApi.deviceLock.claim()` | Soft per-`vehicle_id` lock ("this vehicle is in use by another device" banner, added late July). Body: `{ vehicle_id, device_id, device_name }`. **Always returns 200**, never 409 — response `{ locked_by_other, held_by_device_name?, held_since? }` just tells the FE who else (if anyone) currently holds it; the FE never blocks the connection on it. Also doubles as the heartbeat/renew call — `useObd.ts` calls `claim()` again every 90s while connected instead of a separate renew endpoint (see below). |
| `DELETE` | `/obd2/device-lock` | `obdApi.deviceLock.release()` | Body: `{ vehicle_id, device_id }`. Release the soft lock on manual disconnect. |

> **No `PUT` device-lock renew method.** There used to be one; it was removed because the backend's `PUT` renew route only ever returns `{"message":"ok"}` with none of `claim()`'s `locked_by_other` fields, so it couldn't be used to refresh the "in use by another device" banner. The backend intentionally allows re-calling `claim()` (`POST`) when the same device already holds the lock — it both extends the TTL and returns fresh shared-state info, so `claim()` now serves as the heartbeat too. See the comment above `claimDeviceLock` in `src/hooks/useObd.ts`.

### GPS Trips

**File:** `src/api/gpsTrips.ts` (`gpsTripsApi`)

| Method | Endpoint | Hook / Caller | Description |
|---|---|---|---|
| `POST` | `/gps/trips` | `GpsTripSyncQueue` via `gpsTripsApi.saveTrip()` | Upload a completed GPS trip (`vehicle_id`, timestamps, distance/speed, `route_points`, `ghi_chu`). **Path uses a slash (`/gps/trips`), not a hyphen** — `/gps-trips` does not exist. |
| `GET` | `/gps/trips?vehicle_id={id}&page={p}` | `useGpsTrips` | List GPS trip history (paginated). |
| `GET` | `/gps/trips?vehicle_id={id}&since={iso}&until={iso}` | `gpsTripsApi.tripsInRange()` | GPS trips inside a specific time window — used to show the "parallel" route alongside one specific OBD session on `ObdSessionDetailScreen`. Same route as `trips()`, different query params. |
| `PATCH` | `/gps/trips/{id}` | `gpsTripsApi.updateNote()` | Update only the `ghi_chu` (note) field of a trip. |
| `DELETE` | `/gps/trips/{id}` | `gpsTripsApi.remove()` | Delete a GPS trip. |
| `POST` | `/gps/tracking-lock` | `gpsTripsApi.trackingLock.claim()` | Hard lock ("who is actively GPS-tracking this vehicle") — body `{ vehicle_id, device_id }`. Unlike the OBD device-lock, this one is a real claim (can 409 if held elsewhere). |
| `DELETE` | `/gps/tracking-lock` | `gpsTripsApi.trackingLock.release()` | Release the tracking lock. |
| `PUT` | `/gps/tracking-lock` | `gpsTripsApi.trackingLock.renew()` | Renew/extend the tracking lock TTL (called on app foreground while actively tracking). |
| `GET` | `/gps/tracking-lock/status?vehicle_id={id}` | `gpsTripsApi.trackingLock.status()` | Who actually holds the lock right now (`holder_device_id`, `holder_device_name`) — used to sync the "GPS primary" banner with ground truth instead of the per-user (not per-vehicle) `is_gps_primary` flag. |

> GPS trips are the single source of truth for **trips**; OBD2 sessions (above) are an independent, parallel telemetry stream and do not create trip records.

### Profile

**File:** `src/api/profile.ts` (`profileApi`)

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/profile` | `ProfileScreen` (via `authApi.me()` reused for profile data) | Get full user profile. |
| `PUT` | `/profile` | `profileApi.update()` → `EditProfileScreen` | Update `name`, `phone`, `tinh`, `phuong_xa`, `dia_chi`. |
| `PUT` | `/profile/password` | `profileApi.updatePassword()` → `ChangePasswordScreen` | Change password. Body: `{ current_password, password, password_confirmation }`. **Method is `PUT`, not `POST`.** |
| `PUT` | `/profile/locale` | `profileApi.setLocale()` → `authStore.adoptAccountLocale()` | Persist the user's `vi`/`en` language choice to the account (so it syncs across web + email), not just on-device. |
| `DELETE` | `/profile` | `profileApi.deleteAccount()` → `ProfileScreen` | Soft-delete account. Body is `{ password }` if the account has a password, or `{ confirm_email }` for Google-only accounts with no password — matches `ProfileController::destroy` on the backend. |

> There is **no** `/profile/avatar` or `/profile/export` endpoint in the client — neither `profileApi` nor any screen calls them. Avatar upload and data-export are not implemented client-side; do not document them as existing endpoints.

### Devices (device-session management)

**File:** `src/api/devices.ts` (`devicesApi`) — powers the "Devices" screen (list of logged-in devices, remote logout) and per-device heartbeat/presence.

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/device-sessions` | `devicesApi.list()` → `DevicesScreen` | List this user's active device sessions (`device_id`, `device_name`, `platform`, `is_current`, `is_online`, `last_seen_at`). |
| `DELETE` | `/device-sessions/{id}` | `devicesApi.logout()` → `DevicesScreen` | Remotely log out one device session. |
| `DELETE` | `/device-sessions/all` | `devicesApi.logoutAll()` → `DevicesScreen` | Log out every device except (per backend semantics) the current one. |
| `POST` | `/device-sessions/heartbeat` | `devicesApi.heartbeat()` / `sendDeviceHeartbeat()` | Sent with device meta on login, on `authStore.initialize()`, and on app foreground. Backend upserts the row if the device has no session yet. Always called fire-and-forget (`.catch(() => {})`). |

### Vehicle Transfer (Premium — "maintenance passport" on sale)

**File:** `src/api/vehicleTransfer.ts` (`vehicleTransferApi`) — Premium feature letting a buyer request a vehicle's service/health history from the seller by VIN.

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `POST` | `/vehicles/{vehicleId}/transfer-requests` | `useSendTransferRequest` | Buyer sends a transfer request for a vehicle (matched server-side by VIN). |
| `GET` | `/transfer-requests/incoming` | `useIncomingTransferRequests` | Requests where the current user is the *owner* being asked to share history. |
| `GET` | `/transfer-requests/outgoing` | `useOutgoingTransferRequests` | Requests the current user has *sent* as a buyer. |
| `POST` | `/transfer-requests/{id}/approve` | `useRespondTransferRequest` | Owner approves a request. |
| `POST` | `/transfer-requests/{id}/deny` | `useRespondTransferRequest` | Owner denies a request. |
| `GET` | `/vehicles/{vehicleId}/shared-history` | `useSharedHistory` | Fetch the shared service history/health trend/DTC count once a request is approved. |
| `POST` | `/vehicles/{vehicleId}/sold` | `useMarkVehicleSold` | Body `{ sold: boolean }`. Mark a vehicle sold (or un-mark it). |

### Traffic Fines

**File:** `src/api/trafficFines.ts` (`trafficFinesApi`)

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/traffic-fines` | `trafficFinesApi.list()` → `TrafficFinesScreen` | Static reference table (~50 rows) of Vietnamese traffic fine amounts/point deductions by vehicle type and violation group. Backend supports `loai_xe`/`nhom`/`q` filter params, but the client fetches once and filters client-side to avoid a round-trip per keystroke. |

### Nearby (Garages / Inspection Centers)

**File:** `src/api/nearby.ts` (`nearbyApi`)

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/garages/nearby?lat={}&lon={}&loai={}` | `nearbyApi.garages()` → `NearbyGaragesScreen` | Nearby garages/service centers, optionally filtered by type. Not Premium-gated. |
| `GET` | `/dang-kiem/nearby?lat={}&lon={}` | `nearbyApi.dangKiem()` | Nearby vehicle inspection centers (đăng kiểm). Not Premium-gated. |

### Geo

**File:** `src/api/geo.ts` (`geoApi`) — Vietnamese administrative divisions, used for profile address fields.

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/geo/provinces` | `geoApi.provinces()` | List of provinces (`{ code, name }[]`). |
| `GET` | `/geo/wards/{provinceCode}` | `geoApi.wards()` | Wards/communes within a given province. |

### Nori (AI companion chat)

**File:** `src/api/nori.ts` (`noriApi`) — backs the Nori AI agent chat feature (`src/agent/NoriAgent.ts`, `src/agent/ConversationManager.ts`).

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `POST` | `/ai/nori/chat` | `noriApi.chat()` | Body: `{ messages, tools }`. Backend does **not** execute tools itself — it forwards the conversation to Anthropic and returns `content`/`stop_reason`/`usage`/`request_id` close to verbatim, so the client-side `ConversationManager` runs the tool-calling loop. |
| `POST` | `/ai/nori/feedback` | `noriApi.feedback()` | Body: `{ request_id, rating: 'good'\|'bad'\|'partial', note? }`. Rates a specific prior response (long-press on a chat bubble); logged server-side alongside the original request/response. |

### Other

**Files:** `src/api/fuelTypes.ts`

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/fuel-types` | `useFuelTypes` | Available fuel type list with current prices. Cached client-side for 1 hour (`staleTime`). |

---

## Auth Token Lifecycle

```
1. Login (email/password)
   POST /auth/login  →  { token, user } (or { data: { token, user } })
   authStore.login()
     → write token + user to SecureStore (utils/storage.ts)
     → queryClient.clear() (drop any previous account's cached data)
     → set token + user in Zustand state, userSynced: true
     → sync push token in background (after interactions settle)
     → sendDeviceHeartbeat()

1b. Register (email/password) — two-step, no immediate token
    POST /auth/register            → triggers an OTP email, no token returned
    POST /auth/register/resend-otp → resend the OTP (rate-limited by a 60s client countdown)
    POST /auth/register/verify-otp → { token, data: user } on success
      → useAuthStore.getState().setSession(token, user)
      → (fallback: if no token/user came back, call authStore.login() with the
         credentials the user just typed)

1c. Google login — browser redirect, not a JSON id_token exchange
    WebBrowser.openAuthSessionAsync(`${BASE_URL}/auth/google/mobile`, 'notedri://auth')
      → backend redirects to notedri://auth?token=...
      → app extracts `token` from the callback URL
      → GET /auth/me with that token (Authorization header set explicitly, since
        the store doesn't have the token yet)
      → authStore.setSession(token, user)
    (services/googleAuthRecovery.ts persists a "pending" flag before opening the
     browser session, so a cold-start after the OS kills the app mid-flow can
     recover instead of leaving the user stuck.)

1d. Sign in with Apple
    AppleAuthentication.signInAsync() → identityToken (+ fullName, first time only)
    POST /auth/apple { identity_token, full_name?, ...deviceMeta } → { token, user }
    authStore.setSession(token, user)

2. Every API request
   Request interceptor reads useAuthStore.getState().token,
   falling back to SecureStore directly if the in-memory token is empty
   (headless/background JS context).
   Sets Authorization: Bearer <token>

3. Token refresh
   On app launch: authStore.initialize()
     → read token + cached user from SecureStore, set in Zustand immediately
       (isLoading: false — instant auth gate resolution from cache)
     → sendDeviceHeartbeat()
     → background GET /auth/me to refresh user.plan / is_premium / vehicle_limit
     → userSynced: true once that background call settles (success OR failure)

4. Token expiry (401 response)
   Response interceptor catches 401 (except on the /auth/logout call itself)
   authStore.logout()
     → best-effort POST /auth/logout
     → stop GPS tracking without saving (avoid cross-account trip leakage)
     → disconnect BLE / clear OBD + GPS sync queues + cached device pairings
     → clear SecureStore + Zustand state (token: null, user: null)
     → RootNavigator re-renders, shows AuthNavigator

5. Manual logout
   Same authStore.logout() path as #4.

6. Premium downgrade mid-session (403 premium_required)
   Response interceptor downgrades user.is_premium in memory and force-disconnects
   any live BLE/OBD session — does not log the user out.
```

---

## Error Handling Pattern

All API modules throw Axios errors. TanStack Query surfaces them via `error` and `isError`. Screens render `<ErrorView onRetry={refetch} />` when `isError` is true.

For mutations, errors are handled in `onError` callbacks:
```typescript
useMutation({
  mutationFn: ...,
  onError: (error) => {
    const message = error.response?.data?.message ?? 'An error occurred';
    Alert.alert(t('common.error'), message);
  },
});
```

`queryClient.ts` deliberately does **not** retry timeouts: axios timeout (30s, `client.ts`) surfaces as `error.code === 'ECONNABORTED'`, and a network that's already slow enough to hit a 30s timeout will almost certainly time out again — retrying just adds another 30s of dead wait. The default retry predicate (`failureCount < 1 && !isTimeoutError(error)`) allows exactly one retry for genuine transient errors (dropped-then-restored connection, a brief 5xx) but skips it entirely for timeouts. Sync queues (`TripSyncQueue`, `GpsTripSyncQueue`, `ObdSessionSyncQueue`) handle offline retry for trip/session uploads independently of TanStack Query.
