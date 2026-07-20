import * as SecureStore from 'expo-secure-store';
import { obdApi } from '../../api/obd';
import { ObdSnapshot, DtcCode } from './ObdReader';

const QUEUE_KEY = 'obd_pending_trips';

// Kiểu tóm tắt 1 chuyến OBD2 - trước đây sinh bởi TripSession (đã bỏ 14/7 khi
// obdLiveMonitor thay thế), giữ lại type này vì hàng đợi bên dưới vẫn cần cho
// các item CŨ còn tồn đọng trên máy user từ trước bản cập nhật đó.
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

type StorableSummary = Omit<TripSummary, 'snapshots'>;
type PendingTrip = { summary: StorableSummary; deviceId: string | null };

let isFlushing = false;

/**
 * Không còn ai enqueue vào hàng đợi này (path cũ đã bỏ 14/7) - chỉ còn để xả một lần
 * các item tồn đọng trên máy user từ trước, rồi xoá hẳn key. Không retry, không rewrite.
 */
export async function flushPendingTrips(): Promise<{ synced: number; failed: number }> {
  if (isFlushing) return { synced: 0, failed: 0 };
  isFlushing = true;
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    if (!raw) return { synced: 0, failed: 0 };

    let queue: PendingTrip[] = [];
    try {
      queue = JSON.parse(raw);
    } catch {
      queue = [];
    }

    let synced = 0;
    let failed = 0;
    for (const item of queue) {
      try {
        await obdApi.saveTrip(item.summary as TripSummary, item.deviceId);
        synced++;
      } catch {
        failed++;
      }
    }

    await clearObdQueue();
    return { synced, failed };
  } finally {
    isFlushing = false;
  }
}

/** Xoá sạch hàng đợi (gọi khi logout để không đẩy chuyến của user cũ sang tài khoản mới). */
export async function clearObdQueue(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(QUEUE_KEY);
  } catch {
    // ignore
  }
}
