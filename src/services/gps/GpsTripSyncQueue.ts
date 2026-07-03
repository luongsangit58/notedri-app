import AsyncStorage from '@react-native-async-storage/async-storage';
import { gpsTripsApi } from '../../api/gpsTrips';
import { GpsTripSummary } from './GpsTripTracker';

const KEY = 'gps_pending_trips';

type PendingTrip = GpsTripSummary & { retries: number; queuedAt: string };

async function readQueue(): Promise<PendingTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingTrip[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function enqueueTrip(summary: GpsTripSummary): Promise<void> {
  const queue = await readQueue();
  if (queue.length >= 30) queue.shift();
  queue.push({ ...summary, retries: 0, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
}

// Single-flight: chặn flush chạy chồng nhau (App.tsx + useGpsTrip + background task
// đều gọi khi foreground) -> nếu không sẽ upload trùng cùng 1 chuyến.
let isFlushingGps = false;
// Bộ đếm "đã xoá hàng đợi": tăng mỗi lần clearGpsQueue() (logout). flush chụp giá trị lúc
// bắt đầu; nếu đổi trước khi ghi lại -> đã có logout xen giữa -> KHÔNG hồi sinh item user cũ.
let gpsClearEpoch = 0;

export async function flushPendingGpsTrips(): Promise<{ synced: number; failed: number }> {
  if (isFlushingGps) return { synced: 0, failed: 0 };
  isFlushingGps = true;
  const epochAtStart = gpsClearEpoch;
  try {
    const queue = await readQueue();
    if (!queue.length) return { synced: 0, failed: 0 };

    const remaining: PendingTrip[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await gpsTripsApi.saveTrip(item);
        synced++;
      } catch (err: any) {
        // Phân biệt lỗi tạm thời vs vĩnh viễn để không âm thầm mất chuyến:
        // - 4xx (trừ 429) = lỗi client vĩnh viễn (payload sai, xe đã xoá...) -> BỎ, retry vô ích.
        // - Mạng lỗi / 5xx / 429 = tạm thời -> GIỮ vô thời hạn (không bỏ theo số lần thử).
        const status: number | undefined = err?.response?.status;
        const permanent = status !== undefined && status >= 400 && status < 500 && status !== 429;
        item.retries++;
        if (!permanent) remaining.push(item);
        failed++;
      }
    }

    // Nếu có logout (clearGpsQueue) xen giữa flush -> KHÔNG ghi lại: tránh hồi sinh chuyến của
    // user cũ vào hàng đợi để rồi đẩy sang tài khoản mới. Item đã enqueue sau clear vẫn còn nguyên.
    if (gpsClearEpoch !== epochAtStart) {
      return { synced, failed };
    }
    // Ghi lại: giữ item lỗi cần retry + item MỚI enqueue trong lúc flush (phần đuôi sau
    // queue.length) -> không ghi đè mất chuyến vừa được thêm khi đang upload.
    const after = await readQueue();
    const newItems = after.slice(queue.length);
    await writeQueue([...remaining, ...newItems]);
    return { synced, failed };
  } finally {
    isFlushingGps = false;
  }
}

export async function pendingGpsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/** Xoá sạch hàng đợi (gọi khi logout để không đẩy chuyến của user cũ sang tài khoản mới). */
export async function clearGpsQueue(): Promise<void> {
  gpsClearEpoch++; // báo cho flush đang chạy: hàng đợi đã bị xoá -> đừng ghi lại item cũ
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
