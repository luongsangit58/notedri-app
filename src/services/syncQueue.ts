// Khung hàng đợi đồng bộ offline dùng chung (GPS trip, OBD session, ...): AsyncStorage,
// cap kích thước, single-flight, epoch logout để chống hồi sinh item của user cũ sang tài khoản mới.
// Trước đây 3 bản copy-paste lệch nhau (GpsTripSyncQueue, ObdSessionSyncQueue, obd/TripSyncQueue).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPermanentSyncError } from './syncRetryPolicy';

export function createSyncQueue<TItem extends object>(opts: {
  key: string;
  cap: number;
  send: (item: TItem & { retries: number; queuedAt: string }) => Promise<unknown>;
}) {
  type QueuedItem = TItem & { retries: number; queuedAt: string };

  let isFlushing = false;
  let clearEpoch = 0;

  async function readQueue(): Promise<QueuedItem[]> {
    try {
      const raw = await AsyncStorage.getItem(opts.key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async function writeQueue(queue: QueuedItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(opts.key, JSON.stringify(queue));
    } catch {
      // Storage full or unavailable - drop silently rather than crashing
    }
  }

  async function enqueue(item: TItem): Promise<void> {
    const queue = await readQueue();
    if (queue.length >= opts.cap) queue.shift();
    queue.push({ ...item, retries: 0, queuedAt: new Date().toISOString() } as QueuedItem);
    await writeQueue(queue);
  }

  async function flush(): Promise<{ synced: number; failed: number }> {
    if (isFlushing) return { synced: 0, failed: 0 };
    isFlushing = true;
    const epochAtStart = clearEpoch;
    try {
      const queue = await readQueue();
      if (!queue.length) return { synced: 0, failed: 0 };

      const remaining: QueuedItem[] = [];
      let synced = 0;
      let failed = 0;

      for (const item of queue) {
        // Đổi tài khoản (logout -> login) xen giữa flush: token gắn ở request-time nên item còn
        // lại sẽ upload dưới tài khoản MỚI -> rò rỉ chéo. clear() tăng epoch -> dừng ngay.
        if (clearEpoch !== epochAtStart) break;
        try {
          await opts.send(item);
          synced++;
        } catch (err: any) {
          const status: number | undefined = err?.response?.status;
          item.retries++;
          if (!isPermanentSyncError(status, item.retries)) remaining.push(item);
          failed++;
        }
      }

      if (clearEpoch !== epochAtStart) {
        return { synced, failed };
      }
      // Giữ item lỗi cần retry + item MỚI enqueue trong lúc flush -> không mất item.
      const after = await readQueue();
      const newItems = after.slice(queue.length);
      await writeQueue([...remaining, ...newItems]);
      return { synced, failed };
    } finally {
      isFlushing = false;
    }
  }

  async function count(): Promise<number> {
    return (await readQueue()).length;
  }

  async function clear(): Promise<void> {
    clearEpoch++; // báo cho flush đang chạy: hàng đợi đã bị xoá -> đừng ghi lại item cũ
    try {
      await AsyncStorage.removeItem(opts.key);
    } catch {
      // ignore
    }
  }

  return { enqueue, flush, count, clear };
}
