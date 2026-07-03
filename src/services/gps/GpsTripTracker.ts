import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { gpsTripsApi } from '../../api/gpsTrips';
import { getDeviceId } from '../../utils/deviceId';
import { useI18nStore } from '../../i18n';

export const GPS_TASK_NAME = 'GPS_TRIP_TRACKING';

const KEY_STATE = 'gps_trip_state';
const KEY_ROUTE = 'gps_trip_route';

// Speed thresholds
const SPEED_START_KMPH = 5;
const SPEED_STOP_KMPH = 3;
const WAITING_START_MS = 12_000;   // drive 12s before trip "commits" (responsive)
const WAITING_STOP_MS = 180_000;   // must stop 3 min before trip ends
const MIN_TRIP_DISTANCE_KM = 0.3;
const MAX_ROUTE_POINTS = 500;
const MAX_TRIP_MS = 6 * 3_600_000;       // auto-finalize a trip after 6h (anti-hang)
const IDLE_SHUTDOWN_MS = 20 * 60_000;    // stop the service after 20min idle (save battery)
const STALE_ACTIVE_MS = 15 * 60_000;     // an "active" trip with no GPS for 15min = forgotten/stuck
const MAX_ACCURACY_M = 50;               // ignore fixes worse than this for distance
const MIN_SEGMENT_KM = 0.008;            // ignore <8m moves (GPS jitter when parked)

// Cửa sổ cho phép resume sau khi app bị kill (swipe-kill / OS kill).
// Trong 10 phút: hỏi user muốn tiếp tục hay lưu/bỏ.
// Sau 10 phút: tự lưu và thông báo (không hỏi).
export const RESUME_WINDOW_MS = 10 * 60_000;

export type RoutePoint = {
  lat: number;
  lng: number;
  ts: number;
  spd: number;
};

export type GpsTripState = {
  status: 'idle' | 'waiting_start' | 'active' | 'waiting_stop';
  vehicleId: number | null;
  startedAt: string | null;
  distanceKm: number;
  maxSpeedKmh: number;
  speedSum: number;
  speedCount: number;
  idleMs: number;
  drivingMs: number;
  lastLat: number | null;
  lastLng: number | null;
  lastTs: number | null;
  speedStartTs: number | null;   // when we first saw speed > threshold
  idleStartTs: number | null;    // when speed dropped below threshold
  // Diagnostics surfaced to the UI so the user can see GPS is alive
  lastAccuracy: number | null;
  lastSpeedKmh: number;
  pointCount: number;
  idleSinceTs: number | null;    // when we last became idle (for auto-shutdown)
  hadGap: boolean;               // chuyến có đoạn mất tín hiệu được ước lượng
  paused: boolean;               // user TẠM DỪNG ghi -> bỏ qua quãng đường/điểm cho tới khi tiếp tục
  lastLockRenewTs: number | null; // timestamp lần cuối gia hạn GPS tracking lock
};

export type GpsTripSummary = {
  vehicleId: number;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  idleTimeSeconds: number;
  drivingTimeSeconds: number;
  routePoints: RoutePoint[];
  ghiChu?: string | null;
};

const defaultState = (): GpsTripState => ({
  status: 'idle',
  vehicleId: null,
  startedAt: null,
  distanceKm: 0,
  maxSpeedKmh: 0,
  speedSum: 0,
  speedCount: 0,
  idleMs: 0,
  drivingMs: 0,
  lastLat: null,
  lastLng: null,
  lastTs: null,
  speedStartTs: null,
  idleStartTs: null,
  lastAccuracy: null,
  lastSpeedKmh: 0,
  pointCount: 0,
  idleSinceTs: null,
  hadGap: false,
  paused: false,
  lastLockRenewTs: null,
});

async function readState(): Promise<GpsTripState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_STATE);
    if (!raw) return defaultState();
    return JSON.parse(raw);
  } catch {
    return defaultState();
  }
}

async function writeState(state: GpsTripState): Promise<void> {
  await AsyncStorage.setItem(KEY_STATE, JSON.stringify(state));
}

async function readRoute(): Promise<RoutePoint[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_ROUTE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function appendRoute(point: RoutePoint): Promise<void> {
  const route = await readRoute();
  // Downsample: if at capacity, remove every other point
  if (route.length >= MAX_ROUTE_POINTS) {
    const trimmed = route.filter((_, i) => i % 2 === 0);
    trimmed.push(point);
    await AsyncStorage.setItem(KEY_ROUTE, JSON.stringify(trimmed));
  } else {
    route.push(point);
    await AsyncStorage.setItem(KEY_ROUTE, JSON.stringify(route));
  }
}

async function clearRoute(): Promise<void> {
  await AsyncStorage.removeItem(KEY_ROUTE);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function finalizeTrip(state: GpsTripState, endTs?: number): Promise<GpsTripSummary | null> {
  if (!state.startedAt || !state.vehicleId || state.distanceKm < MIN_TRIP_DISTANCE_KM) {
    return null;
  }
  const routePoints = await readRoute();
  // Clamp to the backend's accepted range (0-300). A single GPS glitch reading
  // (e.g. 900 km/h) must not make the server reject the whole trip (422) and
  // lose the real distance data.
  // Lưu ý: đây là tốc độ trung bình khi ĐANG DI CHUYỂN (speedSum/speedCount chỉ cộng
  // khi speedKmh > 0), không tính thời gian dừng.
  const avgSpeedKmh = Math.min(300,
    state.speedCount > 0 ? Math.round(state.speedSum / state.speedCount) : 0);

  // endTs cho phép "đóng" hành trình bị gián đoạn theo mốc GPS cuối cùng (thay vì
  // thời điểm hiện tại) -> thời lượng không bị thổi phồng bởi khoảng thời gian app chết.
  const endIso = endTs ? new Date(endTs).toISOString() : new Date().toISOString();

  return {
    vehicleId: state.vehicleId,
    startedAt: state.startedAt,
    endedAt: endIso,
    distanceKm: Math.round(state.distanceKm * 10) / 10,
    avgSpeedKmh,
    maxSpeedKmh: Math.min(300, Math.round(state.maxSpeedKmh)),
    idleTimeSeconds: Math.round(state.idleMs / 1000),
    drivingTimeSeconds: Math.round(state.drivingMs / 1000),
    routePoints,
    ghiChu: state.hadGap ? useI18nStore.getState().t('gps_trips.note_signal_gap') : null,
  };
}

// Serialize handler executions. expo-task-manager can invoke the handler again
// before the previous async chain finishes, which would cause lost-update races
// on the AsyncStorage-backed state (dropped distance / route points).
let taskChain: Promise<void> = Promise.resolve();
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = taskChain.then(fn, fn);
  // Nối tiếp hàng đợi và nuốt lỗi để một tác vụ hỏng không làm kẹt cả chuỗi.
  taskChain = next.then(() => undefined, () => undefined);
  return next;
}

// Background task - registered at module load time
TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }: any) => {
  if (error) return;
  const locations: Location.LocationObject[] = data?.locations ?? [];
  if (!locations.length) return;
  await runSerialized(() => handleLocation(locations[locations.length - 1]));
});

async function handleLocation(loc: Location.LocationObject): Promise<void> {
  const now = loc.timestamp;
  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  const rawSpeed = loc.coords.speed;

  const state = await readState();

  // TẠM DỪNG: bỏ qua mọi tích luỹ (quãng đường/tốc độ/điểm route) và chuyển trạng
  // thái. Vẫn cập nhật mốc tham chiếu theo vị trí hiện tại để khi "Tiếp tục" không
  // tính đoạn di chuyển trong lúc tạm dừng thành quãng đường (tránh nhảy số km).
  if (state.paused) {
    // An toàn chống-treo: dù đang tạm dừng vẫn chốt chuyến nếu mở quá lâu (quên
    // bấm "Tiếp tục") để không ghi nền vô tận gây hao pin.
    if (state.startedAt && now - new Date(state.startedAt).getTime() >= MAX_TRIP_MS) {
      const summary = await finalizeTrip(state);
      if (summary) await enqueueTripFromTask(summary);
      await clearRoute();
      const fresh = defaultState();
      fresh.vehicleId = state.vehicleId;
      await writeState(fresh);
      return;
    }
    state.lastLat = lat;
    state.lastLng = lng;
    state.lastTs = now;
    state.lastAccuracy = loc.coords.accuracy ?? null;
    state.lastSpeedKmh = 0;
    await writeState(state);
    return;
  }

  // Elapsed since last point (capped at 30s to avoid huge gaps from app suspend).
  // Kẹp >= 0: mốc GPS lùi/không đúng thứ tự (now < lastTs) không được trừ vào tổng idle/driving.
  const elapsedMs = state.lastTs ? Math.max(0, Math.min(now - state.lastTs, 30_000)) : 0;

  // Speed: prefer GPS-reported value, fall back to distance/time when GPS speed
  // is missing or invalid. Many Android devices report null or -1 on the
  // foreground-service location stream, which would otherwise keep speed at 0
  // and never let a trip start.
  let speedKmh = 0;
  if (rawSpeed != null && rawSpeed >= 0) {
    speedKmh = rawSpeed * 3.6;
  } else if (state.lastLat != null && state.lastLng != null && elapsedMs > 0) {
    const segKm = haversineKm(state.lastLat, state.lastLng, lat, lng);
    if (segKm < 0.5) speedKmh = (segKm / (elapsedMs / 1000)) * 3600;
  }
  speedKmh = Math.max(0, speedKmh);

  // Accuracy gate: skip distance from low-quality fixes (reduces jitter inflation)
  const accuracy = loc.coords.accuracy ?? 999;
  const goodFix = accuracy <= MAX_ACCURACY_M;

  // Accumulate distance only when trip is active (not during waiting_start or idle)
  if (
    (state.status === 'active' || state.status === 'waiting_stop') &&
    state.lastLat !== null && state.lastLng !== null && goodFix
  ) {
    const seg = haversineKm(state.lastLat, state.lastLng, lat, lng);
    const realGapSec = state.lastTs ? (now - state.lastTs) / 1000 : 0;
    const impliedKmh = realGapSec > 0 ? (seg / realGapSec) * 3600 : 0;

    if (seg >= MIN_SEGMENT_KM && seg < 0.5) {
      // Đoạn bình thường (<500m/lần)
      state.distanceKm += seg;
    } else if (seg >= 0.5 && realGapSec > 0 && realGapSec <= 600 && impliedKmh <= 200) {
      // ĐOẠN MẤT TÍN HIỆU (hầm/tầng hầm): nhảy lớn nhưng tốc độ ngầm hợp lý
      // (<=200km/h, gap<=10 phút) -> ước lượng đường thẳng thay vì bỏ mất quãng.
      state.distanceKm += seg;
      state.hadGap = true;
    }
    // Còn lại (teleport/glitch: nhảy lớn + tốc độ phi lý) -> bỏ qua
  }

  // Track speed stats when active
  if (state.status === 'active' || state.status === 'waiting_stop') {
    if (speedKmh > 0) {
      state.speedSum += speedKmh;
      state.speedCount += 1;
      if (speedKmh > state.maxSpeedKmh) state.maxSpeedKmh = speedKmh;
    }
    if (speedKmh < SPEED_STOP_KMPH) {
      state.idleMs += elapsedMs;
    } else {
      state.drivingMs += elapsedMs;
    }
  }

  // Append route point
  if (state.status === 'active' || state.status === 'waiting_stop') {
    await appendRoute({ lat, lng, ts: now, spd: Math.min(300, Math.round(speedKmh)) });
    state.pointCount += 1;
  }

  state.lastLat = lat;
  state.lastLng = lng;
  state.lastTs = now;
  // Diagnostics: always update so the status panel shows GPS is alive even before a trip starts
  state.lastAccuracy = loc.coords.accuracy ?? null;
  state.lastSpeedKmh = Math.round(speedKmh);

  // State machine
  switch (state.status) {
    case 'idle':
    case 'waiting_start': {
      if (speedKmh >= SPEED_START_KMPH) {
        state.idleSinceTs = null;
        if (state.speedStartTs === null) state.speedStartTs = now;
        const elapsed = now - state.speedStartTs;
        if (elapsed >= WAITING_START_MS) {
          // Trip started - reset distance so waiting_start movement is not counted
          state.status = 'active';
          state.startedAt = new Date(state.speedStartTs).toISOString();
          state.distanceKm = 0;
          state.idleStartTs = null;
        } else {
          state.status = 'waiting_start';
        }
      } else {
        state.speedStartTs = null;
        state.status = 'idle';
        // Anti-hang: if idle (no trip) too long, stop the service to save battery
        if (state.idleSinceTs === null) {
          state.idleSinceTs = now;
        } else if (now - state.idleSinceTs >= IDLE_SHUTDOWN_MS) {
          await autoShutdown(state.vehicleId);
          return;
        }
      }
      break;
    }

    case 'active': {
      // Anti-hang: cap a single trip's length (e.g. forgot to stop / GPS jitter)
      if (state.startedAt && now - new Date(state.startedAt).getTime() >= MAX_TRIP_MS) {
        const summary = await finalizeTrip(state);
        if (summary) await enqueueTripFromTask(summary);
        await clearRoute();
        const fresh = defaultState();
        fresh.vehicleId = state.vehicleId;
        await writeState(fresh);
        return;
      }
      if (speedKmh < SPEED_STOP_KMPH) {
        if (state.idleStartTs === null) state.idleStartTs = now;
        const idleElapsed = now - state.idleStartTs;
        if (idleElapsed >= WAITING_STOP_MS) {
          state.status = 'waiting_stop';
        }
      } else {
        state.idleStartTs = null;
      }
      break;
    }

    case 'waiting_stop': {
      if (speedKmh >= SPEED_START_KMPH) {
        // Driver moved again - resume
        state.status = 'active';
        state.idleStartTs = null;
      } else if (state.idleStartTs !== null && now - state.idleStartTs >= WAITING_STOP_MS) {
        // Confirmed stopped - finalize trip
        const summary = await finalizeTrip(state);
        if (summary) {
          await enqueueTripFromTask(summary);
        }
        await clearRoute();
        const fresh = defaultState();
        fresh.vehicleId = state.vehicleId;
        await writeState(fresh);
        return;
      }
      break;
    }
  }

  // Gia hạn GPS tracking lock mỗi 3 phút từ background task.
  // TTL trên server là 5 phút → renew 3 phút đảm bảo không expire khi đang ghi.
  const LOCK_RENEW_INTERVAL_MS = 3 * 60_000;
  if (
    state.vehicleId != null &&
    (state.status === 'active' || state.status === 'waiting_stop' || state.status === 'waiting_start') &&
    (state.lastLockRenewTs === null || now - state.lastLockRenewTs >= LOCK_RENEW_INTERVAL_MS)
  ) {
    state.lastLockRenewTs = now;
    getDeviceId().then(deviceId => {
      gpsTripsApi.trackingLock.renew(state.vehicleId!, deviceId).catch(() => {});
    });
  }

  await writeState(state);
}

// Import here would create circular dependency, so we inline the enqueue logic.
// Shape must match PendingTrip in GpsTripSyncQueue (retries + queuedAt) so the
// flush retry counter works instead of becoming NaN and dropping the trip.
async function enqueueTripFromTask(summary: GpsTripSummary): Promise<void> {
  const KEY = 'gps_pending_trips';
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const queue: any[] = raw ? JSON.parse(raw) : [];
    if (queue.length >= 30) queue.shift();
    queue.push({ ...summary, retries: 0, queuedAt: new Date().toISOString() });
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch { /* ignore */ }

  // Thử upload NGAY (kể cả khi app đang chạy nền) thay vì đợi user mở lại app hôm sau.
  // Dynamic import tránh vòng lặp import. Nền headless (app bị kill) có thể thiếu token ->
  // thất bại ÊM, chuyến vẫn nằm trong queue và sẽ được flush ở lần foreground kế tiếp.
  try {
    const { flushPendingGpsTrips } = await import('./GpsTripSyncQueue');
    await flushPendingGpsTrips();
  } catch { /* offline / chưa auth -> giữ trong queue */ }
}

// --- Public API (called from the app foreground) ---

export type StartResult = {
  ok: boolean;
  reason?: 'foreground_denied' | 'background_denied' | 'location_off' | 'start_failed' | 'vehicle_locked';
  error?: string;
  backgroundGranted: boolean;
};

// Thông tin hành trình bị gián đoạn (app bị kill khi đang ghi)
export type InterruptedTripInfo = {
  hasInterrupted: boolean;
  canResume: boolean;       // còn trong cửa sổ RESUME_WINDOW_MS
  distanceKm: number;
  durationMinutes: number;  // tổng thời gian từ lúc bắt đầu đến hiện tại
  timeSinceInterruptMin: number; // số phút kể từ điểm GPS cuối
  vehicleId: number | null;
};

async function startUpdates(): Promise<void> {
  await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5_000,
    distanceInterval: 20,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: useI18nStore.getState().t('gps_trips.fg_notif_title'),
      notificationBody: useI18nStore.getState().t('gps_trips.fg_notif_body'),
      notificationColor: '#2563EB',
    },
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
  });
}

// Stop the foreground service after a long idle period and tell the user.
async function autoShutdown(vehicleId: number | null): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(GPS_TASK_NAME).catch(() => {});
  const fresh = defaultState();
  fresh.vehicleId = vehicleId;
  await writeState(fresh);
  await clearRoute();
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'NoteDri',
        body: useI18nStore.getState().t('gps_trips.notif_auto_shutdown'),
      },
      trigger: null,
    });
  } catch { /* notifications non-critical */ }
}

// Công bố nổi bật (prominent disclosure) bắt buộc theo chính sách Google Play: phải
// giải thích lý do xin vị trí NỀN cho người dùng TRƯỚC khi hộp thoại hệ thống hiện ra.
function showBackgroundLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    const t = useI18nStore.getState().t;
    Alert.alert(
      t('gps_trips.disclosure_title'),
      t('gps_trips.disclosure_body'),
      [
        { text: t('gps_trips.disclosure_cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('gps_trips.disclosure_continue'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

export async function requestPermissionsAndStart(vehicleId: number): Promise<StartResult> {
  // 0) Kiểm tra lock: chỉ 1 thiết bị/xe cùng lúc.
  //    Nếu mạng lỗi -> offline-first: cho phép bật, tránh chặn oan.
  try {
    const deviceId = await getDeviceId();
    await gpsTripsApi.trackingLock.claim(vehicleId, deviceId);
  } catch (err: any) {
    if (err?.response?.status === 409) {
      return { ok: false, reason: 'vehicle_locked', backgroundGranted: false };
    }
    // Network error -> tiếp tục (offline-first)
  }

  // 1) Foreground location is mandatory
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
  if (fg.status !== 'granted') {
    return { ok: false, reason: 'foreground_denied', backgroundGranted: false };
  }

  // 1b) Định vị THIẾT BỊ phải đang bật, nếu không service chạy nhưng KHÔNG có tín
  //     hiệu (lỗi "chờ tín hiệu mãi"). Thử bật ngay qua hộp thoại hệ thống (Android).
  let enabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!enabled && Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      enabled = await Location.hasServicesEnabledAsync().catch(() => false);
    } catch { /* user từ chối bật */ }
  }
  if (!enabled) {
    return { ok: false, reason: 'location_off', backgroundGranted: false };
  }

  // 2) Background is best-effort. On Android 11+ this NO LONGER shows a dialog
  //    (must be enabled in Settings), so we DON'T block on it - we still try to
  //    start, and only surface a settings prompt if the start actually fails.
  let backgroundGranted = false;
  try {
    const existing = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (existing?.status === 'granted') {
      backgroundGranted = true;
    } else if (await showBackgroundLocationDisclosure()) {
      const bg = await Location.requestBackgroundPermissionsAsync();
      backgroundGranted = bg.status === 'granted';
    }
  } catch { backgroundGranted = false; }

  // 3) Prepare state (đọc-sửa-ghi qua hàng đợi để không đè lên handler nền đang chạy)
  await runSerialized(async () => {
    const state = await readState();
    if (state.status === 'idle') {
      const fresh = defaultState();
      fresh.vehicleId = vehicleId;
      await writeState(fresh);
      await clearRoute();
    } else if (state.vehicleId !== vehicleId) {
      state.vehicleId = vehicleId;
      await writeState(state);
    }
  });

  // 4) Start the location updates. If it throws (commonly because background
  //    permission is missing on Android), guide the user to Settings.
  const running = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
  if (!running) {
    try {
      await startUpdates();
    } catch (e: any) {
      if (!backgroundGranted) {
        return { ok: false, reason: 'background_denied', backgroundGranted: false };
      }
      return { ok: false, reason: 'start_failed', error: String(e?.message ?? e), backgroundGranted };
    }
  }

  // 5) Seed one immediate fix so the status panel shows GPS is alive right away.
  //    Lấy vị trí NGOÀI hàng đợi (không chặn chuỗi), chỉ đọc-sửa-ghi state trong hàng đợi.
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await runSerialized(async () => {
      const s = await readState();
      s.lastTs = pos.timestamp;
      s.lastLat = pos.coords.latitude;
      s.lastLng = pos.coords.longitude;
      s.lastAccuracy = pos.coords.accuracy ?? null;
      s.lastSpeedKmh = pos.coords.speed && pos.coords.speed > 0 ? Math.round(pos.coords.speed * 3.6) : 0;
      await writeState(s);
    });
  } catch { /* non-fatal */ }

  return { ok: true, backgroundGranted };
}

// Gọi khi app lên foreground (AppState active) HOẶC cold start.
// Xử lý 3 tình huống:
//   A) Service còn sống nhưng GPS im >15 phút (Doze/hang) → tự đóng
//   B) Service bị kill + trip cũ > RESUME_WINDOW_MS → tự lưu + thông báo
//   C) Service bị kill + trip cũ < RESUME_WINDOW_MS → return false, để UI hỏi resume
//   D) waiting_start + service bị kill → reset idle (chưa có chuyến, không cần lưu)
//   E) Idle service + GPS im >20 phút → tắt service tiết kiệm pin
//
// Test matrix:
//   cold-start, không có trip              → false (A/B/C đều bỏ qua)
//   cold-start, service bị kill <10ph      → false (C) → checkInterruptedTrip sẽ bắt
//   cold-start, service bị kill >10ph      → true  (B) → auto-lưu + notify
//   foreground, service còn + GPS stale    → true  (A) → auto-lưu + notify
//   foreground, service còn + GPS bình thường → false (không làm gì)
//   cold-start, waiting_start + killed     → true  (D) → reset idle
export async function maybeAutoShutdownStale(): Promise<boolean> {
  // Nối vào hàng đợi serialize (như các mutator state khác) -> handler GPS nền không xen giữa
  // đọc-sửa-ghi state, tránh lost-update làm chuyến vừa finalize "sống lại" (ghost trip).
  return runSerialized(async () => {
  const state = await readState();
  const now = Date.now();
  const inTrip = state.status === 'active' || state.status === 'waiting_stop';
  const running = await isTrackingActive();

  // (D) waiting_start + service không chạy → chưa có chuyến thực, reset về idle
  if (state.status === 'waiting_start' && !running) {
    const fresh = defaultState();
    fresh.vehicleId = state.vehicleId;
    await writeState(fresh);
    return true;
  }

  // (A) Service còn sống nhưng GPS im quá lâu (Doze / GPS treo)
  const tripStale = state.lastTs != null && now - state.lastTs >= STALE_ACTIVE_MS;
  if (inTrip && running && tripStale) {
    await Location.stopLocationUpdatesAsync(GPS_TASK_NAME).catch(() => {});
    const summary = await finalizeTrip(state, state.lastTs ?? undefined);
    await clearRoute();
    const fresh = defaultState();
    fresh.vehicleId = state.vehicleId;
    await writeState(fresh);
    if (summary) {
      await enqueueTripFromTask(summary);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'NoteDri',
            body: useI18nStore.getState().t('gps_trips.notif_autosaved_stale', { km: summary.distanceKm }),
          },
          trigger: null,
        });
      } catch { /* ignore */ }
    }
    return true;
  }

  // (B/C) Service bị kill trong khi có trip
  if (inTrip && !running) {
    const timeSinceLast = state.lastTs != null ? now - state.lastTs : Infinity;
    if (timeSinceLast < RESUME_WINDOW_MS) {
      // Còn trong cửa sổ resume → để UI hỏi, không tự finalize
      return false;
    }
    // Đã quá cửa sổ resume → tự lưu và báo
    const summary = await finalizeTrip(state, state.lastTs ?? undefined);
    await clearRoute();
    const fresh = defaultState();
    fresh.vehicleId = state.vehicleId;
    await writeState(fresh);
    if (summary) {
      await enqueueTripFromTask(summary);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'NoteDri',
            body: useI18nStore.getState().t('gps_trips.notif_autosaved_interrupted', { km: summary.distanceKm }),
          },
          trigger: null,
        });
      } catch { /* ignore */ }
    } else {
      // Trip quá ngắn để lưu - chỉ dọn state
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'NoteDri',
          body: useI18nStore.getState().t('gps_trips.notif_discarded_short'),
        },
        trigger: null,
      }).catch(() => {});
    }
    return true;
  }

  // (E) Idle service + GPS im lâu → tắt service tiết kiệm pin
  if (running && state.status === 'idle' && state.lastTs != null && now - state.lastTs >= IDLE_SHUTDOWN_MS) {
    await autoShutdown(state.vehicleId);
    return true;
  }
  return false;
  });
}

export async function getPermissionStatus(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.getForegroundPermissionsAsync().catch(() => ({ status: 'undetermined' }));
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'undetermined' }));
  return { foreground: fg.status === 'granted', background: bg.status === 'granted' };
}

export type Readiness = { foreground: boolean; background: boolean; locationEnabled: boolean };

// Trạng thái sẵn sàng - gọi KHÔNG thường xuyên (mount + khi quay lại app), không
// poll mỗi giây để tránh app nặng.
export async function getReadiness(): Promise<Readiness> {
  const [fg, bg, enabled] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => ({ status: 'undetermined' })),
    Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'undetermined' })),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  return {
    foreground: fg.status === 'granted',
    background: bg.status === 'granted',
    locationEnabled: enabled,
  };
}

// Mở Cài đặt định vị hệ thống (khi không bật được bằng dialog)
export async function openLocationSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.settings.LOCATION_SOURCE_SETTINGS');
      return;
    } catch { /* fallback */ }
  }
  const Linking = await import('react-native');
  await Linking.Linking.openSettings().catch(() => {});
}

// Mở Cài đặt tối ưu pin để user tắt cho NoteDri (service nền đỡ bị kill)
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      return;
    } catch { /* fallback */ }
  }
  const Linking = await import('react-native');
  await Linking.Linking.openSettings().catch(() => {});
}

export async function getRoutePoints(): Promise<RoutePoint[]> {
  return readRoute();
}

// save=false -> dừng và BỎ hành trình đang ghi (không lưu).
// Trả về summary nếu có chuyến được lưu (để UI báo "Đã lưu X km"), null nếu không.
export async function stopTracking(save: boolean = true): Promise<GpsTripSummary | null> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(GPS_TASK_NAME);
  }
  // Đọc-sửa-ghi state chạy qua cùng hàng đợi với handleLocation: một handler nền đang
  // dở (đã đọc state 'active' TRƯỚC khi stop ghi default) không được ghi đè lên
  // writeState(default) làm chuyến "sống lại" (ghost trip).
  const { saved, vehicleId } = await runSerialized(async () => {
    const state = await readState();
    let saved: GpsTripSummary | null = null;
    if (save && (state.status === 'active' || state.status === 'waiting_stop')) {
      saved = await finalizeTrip(state);
      if (saved) await enqueueTripFromTask(saved);
    }
    const vehicleId = state.vehicleId;
    await clearRoute();
    await writeState(defaultState());
    return { saved, vehicleId };
  });
  // Release tracking lock so other devices can start tracking this vehicle
  if (vehicleId) {
    try {
      const deviceId = await getDeviceId();
      await gpsTripsApi.trackingLock.release(vehicleId, deviceId);
    } catch { /* non-critical */ }
  }
  return saved;
}

// TẠM DỪNG ghi: giữ service chạy nhưng KHÔNG cộng quãng đường/điểm tới khi tiếp tục.
// Dùng khi dừng đổ xăng, ghé việc... mà không muốn kết thúc hẳn chuyến.
export async function pauseTracking(): Promise<void> {
  // Nối vào hàng đợi để không bị handler nền chạy xen giữa đọc và ghi.
  await runSerialized(async () => {
    const state = await readState();
    if (state.status === 'idle') return; // chưa có gì để tạm dừng
    state.paused = true;
    state.idleStartTs = null;   // hoãn bộ đếm dừng-tự-kết-thúc
    state.lastSpeedKmh = 0;
    await writeState(state);
  });
}

// TIẾP TỤC ghi: làm mới mốc tham chiếu theo vị trí hiện tại để đoạn đầu sau khi
// tiếp tục được đo từ ĐÂY (không tính đoạn đã đi trong lúc tạm dừng).
export async function resumeTracking(): Promise<void> {
  // Nối vào hàng đợi để không bị handler nền chạy xen giữa đọc và ghi.
  await runSerialized(async () => {
    const state = await readState();
    if (!state.paused) return;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      state.lastLat = pos.coords.latitude;
      state.lastLng = pos.coords.longitude;
      state.lastTs = pos.timestamp;
      state.lastAccuracy = pos.coords.accuracy ?? null;
    } catch { /* giữ mốc cũ - đã cập nhật liên tục trong lúc tạm dừng */ }
    state.paused = false;
    state.idleStartTs = null;
    await writeState(state);
  });
}

// Có hành trình đang ghi (đủ điều kiện lưu) không? -> để UI hỏi lưu/bỏ
export async function hasRecordableTrip(): Promise<boolean> {
  const state = await readState();
  return (state.status === 'active' || state.status === 'waiting_stop')
    && state.distanceKm >= MIN_TRIP_DISTANCE_KM;
}

export async function getTripState(): Promise<GpsTripState> {
  return readState();
}

export async function isTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
}

export async function setActiveVehicle(vehicleId: number): Promise<void> {
  // Nối vào hàng đợi để không bị handler nền chạy xen giữa đọc và ghi.
  await runSerialized(async () => {
    const state = await readState();
    state.vehicleId = vehicleId;
    await writeState(state);
  });
}

// Kiểm tra xem có hành trình bị gián đoạn (service bị kill) hay không.
// Gọi SAU maybeAutoShutdownStale() - nếu stale đã được dọn, hàm này trả false.
// Không đọc isTrackingActive() thêm lần nữa (đã được gọi trong maybeAutoShutdownStale)
// mà đọc state để suy luận: nếu state 'active'/'waiting_stop' + service không chạy.
export async function checkInterruptedTrip(): Promise<InterruptedTripInfo> {
  const state = await readState();
  const running = await isTrackingActive();
  const now = Date.now();

  const inTrip = state.status === 'active' || state.status === 'waiting_stop';

  // Nếu service đang chạy = trip bình thường (Case 3: background), hoặc không có trip
  if (!inTrip || running) {
    return { hasInterrupted: false, canResume: false, distanceKm: 0, durationMinutes: 0, timeSinceInterruptMin: 0, vehicleId: null };
  }

  const timeSinceLast = state.lastTs != null ? now - state.lastTs : Infinity;
  const canResume = timeSinceLast < RESUME_WINDOW_MS && state.vehicleId != null;
  const durationMinutes = state.startedAt
    ? Math.max(0, Math.round((now - new Date(state.startedAt).getTime()) / 60_000))
    : 0;
  const timeSinceInterruptMin = isFinite(timeSinceLast) ? Math.round(timeSinceLast / 60_000) : 99;

  return {
    hasInterrupted: true,
    canResume,
    distanceKm: state.distanceKm,
    durationMinutes,
    timeSinceInterruptMin,
    vehicleId: state.vehicleId,
  };
}

// Tiếp tục hành trình bị gián đoạn: khởi động lại GPS service với cùng xe.
// Backend claim() cho phép same device_id claim lại → không cần release trước.
export async function resumeInterruptedTrip(): Promise<StartResult> {
  const state = await readState();
  if (!state.vehicleId) {
    return { ok: false, reason: 'start_failed', backgroundGranted: false };
  }
  return requestPermissionsAndStart(state.vehicleId);
}
