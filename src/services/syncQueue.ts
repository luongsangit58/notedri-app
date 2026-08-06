// Khung hàng đợi đồng bộ offline dùng chung (GPS trip, OBD session, ...): AsyncStorage,
// cap kích thước, single-flight, epoch logout để chống hồi sinh item của user cũ sang tài khoản mới.
// Trước đây 3 bản copy-paste lệch nhau (GpsTripSyncQueue, ObdSessionSyncQueue, obd/TripSyncQueue).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPermanentSyncError } from './syncRetryPolicy';

export function createSyncQueue<TItem extends object>(opts: {
  key: string;
  cap: number;
  send: (item: TItem & { retries: number; queuedAt: string }) => Promise<unknown>;
  // Gọi ngay trước khi rớt item cũ nhất do đầy cap - queue dùng chung này không
  // tự kéo logger vào, để mỗi hàng đợi cụ thể tự quyết định có log hay không.
  onDrop?: (item: TItem & { retries: number; queuedAt: string }) => void;
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
    // Rà soát: logout() gọi clear() có thể xen giữa lúc enqueue() đang đọc/ghi
    // (vd disconnect BLE lúc logout -> enqueueObdSession() chạy dở, vài await
    // sau logout mới tới lượt clearObdSessionQueue()). AsyncStorage không đảm
    // bảo thứ tự HOÀN TẤT giữa 2 lời gọi native độc lập (setItem của ta có thể
    // "thắng", hoàn tất SAU removeItem() của clear()) -> item hồi sinh dưới tài
    // khoản MỚI vừa đăng nhập = rò rỉ chéo tài khoản. Chụp epoch trước khi đọc,
    // kiểm tra lại sau đọc (bỏ luôn nếu đã bị clear() trong lúc đọc) VÀ sau khi
    // ghi (nếu epoch đổi trong lúc ghi, có thể vừa hồi sinh key đã bị xoá -> xoá
    // lại ngay) - đối xứng với cách flush() đã tự bảo vệ ở dưới.
    const epochAtStart = clearEpoch;
    const queue = await readQueue();
    if (clearEpoch !== epochAtStart) return;
    if (queue.length >= opts.cap) {
      const dropped = queue.shift();
      if (dropped) opts.onDrop?.(dropped);
    }
    queue.push({ ...item, retries: 0, queuedAt: new Date().toISOString() } as QueuedItem);
    await writeQueue(queue);
    if (clearEpoch !== epochAtStart) {
      await AsyncStorage.removeItem(opts.key).catch(() => {});
    }
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
