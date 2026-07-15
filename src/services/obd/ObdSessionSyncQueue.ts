import AsyncStorage from '@react-native-async-storage/async-storage';
import { obdApi, ObdSessionPayload } from '../../api/obd';
import { isPermanentSyncError } from '../syncRetryPolicy';

/**
 * Hàng đợi phiên OBD (E2): trước 15/7 reportSession là fire-and-forget - đúng lúc
 * rút cáp mà mất mạng là MẤT LUÔN bản tóm tắt phiên, biểu đồ xu hướng thiếu ngày.
 * Mirror khung GpsTripSyncQueue (AsyncStorage, cap 30, single-flight, epoch logout);
 * thêm idempotency_key sinh lúc enqueue - server đã hỗ trợ sẵn (unique per vehicle)
 * nên retry sau timeout không tạo phiên trùng (trùng = cộng khống tổng giờ máy).
 */

const KEY = 'obd_pending_sessions';

type PendingSession = ObdSessionPayload & { retries: number; queuedAt: string };

// Đủ ngẫu nhiên cho phạm vi "1 xe, vài phiên/ngày" (unique index theo vehicle_id);
// không kéo lib uuid vào chỉ cho việc này. Luôn <64 ký tự (giới hạn cột server).
function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<PendingSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingSession[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function enqueueObdSession(
  payload: Omit<ObdSessionPayload, 'idempotency_key'>,
): Promise<void> {
  const queue = await readQueue();
  if (queue.length >= 30) queue.shift();
  queue.push({
    ...payload,
    idempotency_key: makeIdempotencyKey(),
    retries: 0,
    queuedAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

// Single-flight: chặn flush chạy chồng nhau -> tránh upload trùng cùng 1 phiên.
let isFlushingObdSessions = false;
// Bộ đếm "đã xoá hàng đợi": tăng mỗi lần clearObdSessionQueue() (logout) -> flush đang
// chạy biết để không hồi sinh phiên của user cũ vào hàng đợi của tài khoản mới.
let obdSessionClearEpoch = 0;

export async function flushPendingObdSessions(): Promise<{ synced: number; failed: number }> {
  if (isFlushingObdSessions) return { synced: 0, failed: 0 };
  isFlushingObdSessions = true;
  const epochAtStart = obdSessionClearEpoch;
  try {
    const queue = await readQueue();
    if (!queue.length) return { synced: 0, failed: 0 };

    const remaining: PendingSession[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      // Logout xen giữa flush: token gắn ở request-time nên item còn lại sẽ upload
      // dưới tài khoản MỚI -> rò rỉ chéo. Epoch đổi -> dừng ngay.
      if (obdSessionClearEpoch !== epochAtStart) break;
      try {
        const { retries: _r, queuedAt: _q, ...payload } = item;
        await obdApi.reportSession(payload);
        synced++;
      } catch (err: any) {
        const status: number | undefined = err?.response?.status;
        item.retries++;
        if (!isPermanentSyncError(status, item.retries)) remaining.push(item);
        failed++;
      }
    }

    if (obdSessionClearEpoch !== epochAtStart) {
      return { synced, failed };
    }
    // Giữ item lỗi cần retry + item MỚI enqueue trong lúc flush -> không mất phiên.
    const after = await readQueue();
    const newItems = after.slice(queue.length);
    await writeQueue([...remaining, ...newItems]);
    return { synced, failed };
  } finally {
    isFlushingObdSessions = false;
  }
}

export async function pendingObdSessionCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/** Xoá sạch hàng đợi (gọi khi logout để không đẩy phiên của user cũ sang tài khoản mới). */
export async function clearObdSessionQueue(): Promise<void> {
  obdSessionClearEpoch++;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
