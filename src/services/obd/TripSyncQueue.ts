import * as SecureStore from 'expo-secure-store';
import { obdApi } from '../../api/obd';
import { TripSummary } from './TripSession';

const QUEUE_KEY = 'obd_pending_trips';

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

function stripSnapshots(summary: TripSummary): StorableSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snapshots: _snapshots, ...rest } = summary;
  return rest;
}

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

export async function enqueueTripSync(
  summary: TripSummary,
  deviceId: string | null
): Promise<void> {
  const queue = await readQueue();

  // Cap at 30 trips (~30 × ~300 bytes = ~9 KB total, well within SecureStore)
  if (queue.length >= 30) queue.shift();

  queue.push({
    summary: stripSnapshots(summary),
    deviceId,
    queuedAt: new Date().toISOString(),
    retries: 0,
  });

  await writeQueue(queue);
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
        // Phân biệt lỗi tạm thời vs vĩnh viễn để không âm thầm mất chuyến:
        // - 4xx (trừ 429/401/403) = lỗi client vĩnh viễn (payload sai, xe đã xoá...) -> BỎ.
        // - Mạng lỗi / 5xx / 429 / 401 / 403 = tạm thời -> GIỮ (401/403 có thể do token chưa nạp
        //   lúc cold-start hoặc đang đổi phiên; bỏ sẽ mất chuyến thật).
        const status: number | undefined = err?.response?.status;
        const permanent = status !== undefined && status >= 400 && status < 500
          && status !== 429 && status !== 401 && status !== 403;
        item.retries++;
        if (!permanent) remaining.push(item);
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

export async function pendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
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
