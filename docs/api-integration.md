# NoteDri Mobile App - API Integration

All backend communication goes through a single Axios instance. TanStack Query hooks wrap every domain's API calls. This document covers the base configuration, the interceptor pattern, the hooks table, the full endpoint list, and the auth token lifecycle.

---

## Base Configuration

**File:** `src/api/client.ts`

```typescript
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://notedri.com';

const client = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30_000,  // 30 s
});
```

**Environment variable:** `EXPO_PUBLIC_API_URL` (see [development-guide.md](development-guide.md)).
Defaults to `https://notedri.com` if not set.

All domain API modules (`src/api/*.ts`) import and use this single `client` instance.

---

## Interceptors

### Request interceptor

Runs before every outgoing request. Injects auth token and language header.

```typescript
client.interceptors.request.use((config) => {
  // Synchronous Zustand read - no await needed
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const lang = useI18nStore.getState().lang ?? 'vi';
  config.headers['Accept-Language'] = lang;

  return config;
});
```

Key design: `useAuthStore.getState()` and `useI18nStore.getState()` are synchronous Zustand reads available outside React components. This is the standard Zustand pattern for non-component code.

### Response interceptor (401 auto-logout)

```typescript
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or revoked - force logout
      useAuthStore.getState().logout();
      // logout() clears SecureStore and triggers RootNavigator to show AuthNavigator
    }
    return Promise.reject(error);
  }
);
```

No infinite retry loop on 401. After one 401, the user is logged out immediately.

---

## TanStack Query Hooks

Each hook file in `src/hooks/` exports one or more `useQuery` and `useMutation` calls for its domain.

| Hook | File | Query Keys | API Module |
|---|---|---|---|
| `useVehicles` | `src/hooks/useVehicles.ts` | `['vehicles']`, `['vehicle', id]` | `src/api/vehicles.ts` |
| `useRefuels` | `src/hooks/useRefuels.ts` | `['refuels', vehicleId]`, `['refuel', id]` | `src/api/refuels.ts` |
| `useServices` | `src/hooks/useServices.ts` | `['services', vehicleId]`, `['service', id]` | `src/api/services.ts` |
| `useOdometer` | `src/hooks/useOdometer.ts` | `['odometer', vehicleId]`, `['odometer-entry', id]` | `src/api/odometer.ts` |
| `useReminders` | `src/hooks/useReminders.ts` | `['reminders', vehicleId]`, `['reminder', id]` | `src/api/reminders.ts` |
| `useObd` | `src/hooks/useObd.ts` | `['obd-trips']`, `['dtc', vehicleId]` | `src/api/obd.ts` |
| `useGpsTrip` | `src/hooks/useGpsTrip.ts` | `['gps-trips']`, `['gps-trip', id]` | `src/api/gpsTrips.ts` |
| `useDashboard` | `src/hooks/useDashboard.ts` | `['dashboard', vehicleId]` | `src/api/dashboard.ts` |
| `useTimeline` | `src/hooks/useTimeline.ts` | `['timeline']` | `src/api/timeline.ts` |
| `useNotifications` | `src/hooks/useNotifications.ts` | `['notifications']`, `['notifications', 'unread-count']` | `src/api/notifications.ts` |
| `useFuelTypes` | `src/hooks/useFuelTypes.ts` | `['fuel-types']` | `src/api/fuelTypes.ts` |
| `useVoiceInput` | `src/hooks/useVoiceInput.ts` | (none - no network) | expo-speech-recognition only |

### Mutation pattern

All mutations follow the same pattern: call the API function, then invalidate related query keys.

```typescript
const mutation = useMutation({
  mutationFn: (data: CreateRefuelDto) => createRefuel(vehicleId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['refuels', vehicleId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', vehicleId] });
    queryClient.invalidateQueries({ queryKey: ['timeline'] });
  },
});
```

---

## Full Endpoint Reference

### Auth

| Method | Endpoint | Hook / Caller | Description |
|---|---|---|---|
| `POST` | `/auth/login` | `authStore.login()` | Email + password login. Returns `{ token, user }`. |
| `POST` | `/auth/register` | `RegisterScreen` direct | Create account. Returns `{ token, user }`. |
| `POST` | `/auth/logout` | `authStore.logout()` | Invalidate server-side token (best-effort). |
| `POST` | `/auth/forgot-password` | `ForgotPasswordScreen` | Trigger password reset email. |
| `GET` | `/auth/me` | `authStore.initialize()` | Refresh user object (plan, vehicle_limit) on app launch. |
| `POST` | `/auth/google` | `authStore.loginWithGoogle()` | Exchange Google OAuth `id_token` for app Bearer token. |

### Vehicles

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/vehicles` | `useVehicles` | List all vehicles for the authenticated user. |
| `POST` | `/vehicles` | `useVehicles` mutation | Create a vehicle. |
| `GET` | `/vehicles/{id}` | `useVehicles` | Get single vehicle detail. |
| `PUT` | `/vehicles/{id}` | `useVehicles` mutation | Update vehicle. |
| `DELETE` | `/vehicles/{id}` | `useVehicles` mutation | Delete vehicle and cascade (refuels, services, ODO, reminders). |

### Refuels

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/refuels?vehicle_id={id}` | `useRefuels` | List refuels for a vehicle. |
| `POST` | `/refuels` | `useRefuels` mutation | Create refuel entry. |
| `GET` | `/refuels/{id}` | `useRefuels` | Get single entry. |
| `PUT` | `/refuels/{id}` | `useRefuels` mutation | Update entry. |
| `DELETE` | `/refuels/{id}` | `useRefuels` mutation | Delete entry. |

### Odometer

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/odometer?vehicle_id={id}` | `useOdometer` | List ODO readings for a vehicle. |
| `POST` | `/odometer` | `useOdometer` mutation | Create ODO entry. |
| `GET` | `/odometer/{id}` | `useOdometer` | Single entry. |
| `PUT` | `/odometer/{id}` | `useOdometer` mutation | Update entry. |
| `DELETE` | `/odometer/{id}` | `useOdometer` mutation | Delete entry. |

### Services (Maintenance)

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/services?vehicle_id={id}` | `useServices` | List service records. |
| `POST` | `/services` | `useServices` mutation | Create service record. |
| `GET` | `/services/{id}` | `useServices` | Single record. |
| `PUT` | `/services/{id}` | `useServices` mutation | Update record. |
| `DELETE` | `/services/{id}` | `useServices` mutation | Delete record. |

### Reminders

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/reminders?vehicle_id={id}` | `useReminders` | List reminders. |
| `POST` | `/reminders` | `useReminders` mutation | Create reminder. |
| `GET` | `/reminders/{id}` | `useReminders` | Single reminder. |
| `PUT` | `/reminders/{id}` | `useReminders` mutation | Update reminder (also reschedules local notification). |
| `DELETE` | `/reminders/{id}` | `useReminders` mutation | Delete reminder. |

### Dashboard and Analytics

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/dashboard?vehicle_id={id}` | `useDashboard` | Aggregated stats for a vehicle. |
| `GET` | `/timeline` | `useTimeline` | Chronological event stream across all vehicles. Paginated. |
| `GET` | `/reports/fuel?vehicle_id={id}&year={y}` | `ReportsScreen` direct | Fuel consumption report data. |
| `GET` | `/reports/service?vehicle_id={id}&year={y}` | `ReportsScreen` direct | Service cost report data. |
| `GET` | `/reports/year-review?vehicle_id={id}&year={y}` | `YearReviewScreen` | Annual summary stats. |
| `GET` | `/achievements` | `useAchievements` (in screen) | User achievements list. |

### Notifications

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/notifications` | `useNotifications` | In-app notification inbox. |
| `GET` | `/notifications/unread-count` | `useNotifications` | Badge count for tab icon. |
| `PATCH` | `/notifications/{id}/read` | `useNotifications` mutation | Mark single notification as read. |
| `PATCH` | `/notifications/read-all` | `useNotifications` mutation | Mark all as read. |

### OBD2

| Method | Endpoint | Hook / Caller | Description |
|---|---|---|---|
| `POST` | `/obd2/trips` | `TripSyncQueue.processQueue()` | Upload a completed OBD trip. Body: `TripSummary` + `vehicle_id`. |
| `GET` | `/obd2/trips?vehicle_id={id}` | `useObd` | List OBD trip history. |
| `GET` | `/obd2/dtc?vehicle_id={id}` | `useObd` | List unresolved DTC codes for a vehicle. |
| `POST` | `/obd2/dtc/{id}/resolve` | `useObd` mutation | Mark a DTC code as resolved. |

### GPS Trips

| Method | Endpoint | Hook / Caller | Description |
|---|---|---|---|
| `POST` | `/gps-trips` | `GpsTripSyncQueue.processQueue()` | Upload a completed GPS trip. Body: `GpsTripSummary`. |
| `GET` | `/gps-trips` | `useGpsTrip` | List GPS trip history. |
| `GET` | `/gps-trips/{id}` | `useGpsTrip` | Single GPS trip with full route array. |
| `DELETE` | `/gps-trips/{id}` | `useGpsTrip` mutation | Delete a GPS trip. |

### Profile

| Method | Endpoint | Caller | Description |
|---|---|---|---|
| `GET` | `/profile` | `ProfileScreen` | Get full user profile. |
| `PUT` | `/profile` | `EditProfileScreen` | Update name, notification preferences. |
| `POST` | `/profile/password` | `ChangePasswordScreen` | Change password (requires current password). |
| `POST` | `/profile/avatar` | `EditProfileScreen` | Upload avatar image (multipart/form-data). |
| `POST` | `/profile/push-token` | `pushNotifications.ts` | Register Expo push token for this device. |
| `POST` | `/profile/export` | `ExportDataScreen` | Trigger personal data export email. |
| `DELETE` | `/profile` | `ProfileScreen` (delete account) | Soft-delete user account. |

### Other

| Method | Endpoint | Hook | Description |
|---|---|---|---|
| `GET` | `/fuel-types` | `useFuelTypes` | Available fuel type list with current prices. |
| `GET` | `/weather` | `HomeScreen` | Current weather for user's location (optional). |
| `GET` | `/premium` | `PremiumScreen` | Premium plan details, pricing, features. |

---

## Auth Token Lifecycle

```
1. Login / Register
   POST /auth/login  →  { token: "...", user: {...} }
   authStore.login({ token, user })
     → write token to SecureStore
     → set token + user in Zustand state
     → call registerPushToken() in background

2. Every API request
   Request interceptor reads useAuthStore.getState().token
   Sets Authorization: Bearer <token>

3. Token refresh
   On app launch: authStore.initialize()
     → read token from SecureStore
     → set in Zustand (no wait - instant auth gate resolution)
     → background GET /auth/me to refresh user.plan, user.vehicle_limit
       (plan may have changed since last launch)

4. Token expiry (401 response)
   Response interceptor catches 401
   authStore.logout()
     → remove token from SecureStore
     → clear Zustand state (token: null, user: null)
     → RootNavigator re-renders, shows AuthNavigator

5. Manual logout
   authStore.logout() (same as 401 path)
   + additionally: GpsTripTracker.stop(), BleService.disconnect()
   + TripSyncQueue.clear(), GpsTripSyncQueue.clear()

6. Google OAuth
   expo-auth-session → Google ID token
   POST /auth/google { id_token }  →  { token, user }
   Same as step 1 from here
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

Network errors (offline) from TanStack Query will `retry` 3 times by default (TanStack Query v5 default). The sync queues handle offline retry for trip uploads independently.
