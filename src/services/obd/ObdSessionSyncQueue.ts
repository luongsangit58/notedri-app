import { obdApi, ObdSessionPayload } from '../../api/obd';
import { createSyncQueue } from '../syncQueue';
import { createLogger } from './obdLogger';

const obdLog = createLogger('sync');

/**
 * Hàng đợi phiên OBD (E2): trước 15/7 reportSession là fire-and-forget - đúng lúc
 * rút cáp mà mất mạng là MẤT LUÔN bản tóm tắt phiên, biểu đồ xu hướng thiếu ngày.
 * Dùng khung createSyncQueue chung (AsyncStorage, cap 30, single-flight, epoch logout);
 * thêm idempotency_key sinh lúc enqueue - server đã hỗ trợ sẵn (unique per vehicle)
 * nên retry sau timeout không tạo phiên trùng (trùng = cộng khống tổng giờ máy).
 */

const KEY = 'obd_pending_sessions';

// Đủ ngẫu nhiên cho phạm vi "1 xe, vài phiên/ngày" (unique index theo vehicle_id);
// không kéo lib uuid vào chỉ cho việc này. Luôn <64 ký tự (giới hạn cột server).
function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Cap 30 -> 100 (rà soát): offline kéo dài + dùng nhiều xe/ngày từng có nguy cơ
// rớt phiên cũ nhất âm thầm (queue.shift()); payload nhỏ nên nâng cap không
// đáng kể chi phí AsyncStorage. onDrop log lại để không còn hoàn toàn im lặng.
const queue = createSyncQueue<ObdSessionPayload>({
  key: KEY,
  cap: 100,
  send: (item) => {
    // Payload gửi đi không lẫn field nội bộ của hàng đợi
    const { retries: _r, queuedAt: _q, ...payload } = item;
    return obdApi.reportSession(payload);
  },
  onDrop: (item) => obdLog.warn('obd session dropped (queue full)', item.vehicle_id, item.connected_at),
});

export async function enqueueObdSession(
  payload: Omit<ObdSessionPayload, 'idempotency_key'>,
): Promise<void> {
  await queue.enqueue({ ...payload, idempotency_key: makeIdempotencyKey() } as ObdSessionPayload);
}

export const flushPendingObdSessions = queue.flush;
export const pendingObdSessionCount = queue.count;
/** Xoá sạch hàng đợi (gọi khi logout để không đẩy phiên của user cũ sang tài khoản mới). */
export const clearObdSessionQueue = queue.clear;
