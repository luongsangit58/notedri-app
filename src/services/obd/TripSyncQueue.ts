import * as SecureStore from 'expo-secure-store';
import { obdApi } from '../../api/obd';
import { isPermanentSyncError } from '../syncRetryPolicy';
import { ObdSnapshot, DtcCode } from './ObdReader';

const QUEUE_KEY = 'obd_pending_trips';

// Kiểu tóm tắt 1 chuyến OBD2 - trước đây sinh bởi TripSession (đã bỏ 14/7 khi
// obdLiveMonitor thay thế), giữ lại type này vì hàng đợi đồng bộ bên dưới vẫn
// cần cho các item CŨ còn tồn đọng trên máy user từ trước bản cập nhật đó.
export type TripSummary = {
  vehicleId: number;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgEngineLoad: number | null;
  avgCoolantTemp: number | null;
  fuelLevelStart: number | null;
  fuelLevelEnd: number | null;
  idleTimeSeconds: number;
  drivingTimeSeconds: number;
  snapshots: ObdSnapshot[];
  dtcCodes: DtcCode[];
};

// Strip raw snapshots before persisting — they are not sent to the API and
// can easily exceed SecureStore's ~2 KB per-key limit on iOS, causing a
// silent write failure that loses the entire queue.
type StorableSummary = Omit<TripSummary, 'snapshots'>;

type PendingTrip = {
  summary: StorableSummary;
  deviceId: string | null;
  queuedAt: string;
  retries: number;
};

async function readQueue(): Promise<PendingTrip[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingTrip[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable - drop silently rather than crashing
  }
}

// Single-flight: chặn flush chạy chồng nhau -> tránh upload trùng cùng 1 chuyến.
let isFlushingObd = false;
// Bộ đếm "đã xoá hàng đợi": tăng mỗi lần clearObdQueue() (logout) -> flush đang chạy biết để
// không hồi sinh chuyến của user cũ vào hàng đợi (rồi đẩy sang tài khoản mới).
let obdClearEpoch = 0;

export async function flushPendingTrips(): Promise<{ synced: number; failed: number }> {
  if (isFlushingObd) return { synced: 0, failed: 0 };
  isFlushingObd = true;
  const epochAtStart = obdClearEpoch;
  try {
    const queue = await readQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const remaining: PendingTrip[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      // Đổi tài khoản (logout -> login) xen giữa flush: token gắn ở request-time nên item CÒN LẠI
      // sẽ upload dưới tài khoản MỚI -> rò rỉ chéo. clearObdQueue() (logout) tăng epoch + xoá hàng
      // đợi -> dừng ngay, không upload tiếp chuyến của user cũ.
      if (obdClearEpoch !== epochAtStart) break;
      try {
        // obdApi.saveTrip accepts a StorableSummary - snapshots field is optional
        await obdApi.saveTrip(item.summary as TripSummary, item.deviceId);
        synced++;
      } catch (err: any) {
        const status: number | undefined = err?.response?.status;
        item.retries++;
        // Phân biệt lỗi tạm thời vs vĩnh viễn để không âm thầm mất chuyến (xem syncRetryPolicy.ts).
        if (!isPermanentSyncError(status, item.retries)) remaining.push(item);
        failed++;
      }
    }

    // Có logout (clearObdQueue) xen giữa flush -> KHÔNG ghi lại để tránh hồi sinh chuyến user cũ.
    if (obdClearEpoch !== epochAtStart) {
      return { synced, failed };
    }
    // Giữ item lỗi cần retry + item MỚI enqueue trong lúc flush -> không mất chuyến.
    const after = await readQueue();
    const newItems = after.slice(queue.length);
    await writeQueue([...remaining, ...newItems]);
    return { synced, failed };
  } finally {
    isFlushingObd = false;
  }
}

/** Xoá sạch hàng đợi (gọi khi logout để không đẩy chuyến của user cũ sang tài khoản mới). */
export async function clearObdQueue(): Promise<void> {
  obdClearEpoch++; // báo cho flush đang chạy: hàng đợi đã bị xoá -> đừng ghi lại item cũ
  try {
    await SecureStore.deleteItemAsync(QUEUE_KEY);
  } catch {
    // ignore
  }
}
