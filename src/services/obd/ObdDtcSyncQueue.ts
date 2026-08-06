import { obdApi } from '../../api/obd';
import { createSyncQueue } from '../syncQueue';
import { createLogger } from './obdLogger';

/**
 * Hàng đợi báo/xoá DTC realtime: trước đây reportDtc/resolveDtc là fire-and-forget
 * (`.catch(() => {})`) - mất mạng đúng lúc phát hiện/xoá lỗi là mất luôn báo cáo đó.
 * Không cần idempotency_key: server tự dedup theo code chưa resolve của xe khi báo
 * (POST /obd2/dtc), và resolve lại 1 record đã resolve là vô hại (POST .../resolve).
 */

const syncLog = createLogger('sync');

type DtcReportItem = {
  vehicle_id: number;
  codes: Array<{ code: string; description: string | null }>;
};

const reportQueue = createSyncQueue<DtcReportItem>({
  key: 'obd_pending_dtc_reports',
  cap: 100,
  send: (item) => obdApi.reportDtc(item.vehicle_id, item.codes),
  onDrop: (item) => syncLog.warn('dtc report dropped (queue full)', item.vehicle_id, item.codes.map((c) => c.code)),
});

export async function enqueueDtcReport(payload: DtcReportItem): Promise<void> {
  await reportQueue.enqueue(payload);
}

export const flushPendingDtcReports = reportQueue.flush;
export const pendingDtcReportCount = reportQueue.count;
export const clearDtcReportQueue = reportQueue.clear;

type DtcResolveItem = {
  vehicle_id: number;
  codes: string[];
};

// Đối chiếu mã vừa xoá (Mode 04 trên xe) với danh sách "chưa xử lý" server đang
// giữ (GET /obd2/dtc), rồi resolve từng bản ghi khớp code. Chạy GET tươi mỗi lần
// gửi (kể cả lúc retry sau khi offline) - đúng ý đồ gốc: luôn đối chiếu với
// danh sách mới nhất tại thời điểm gửi, không phụ thuộc state cũ.
async function resolveClearedCodes(vehicleId: number, codes: string[]): Promise<void> {
  const res = await obdApi.dtcEvents(vehicleId);
  const records = (res.data as any)?.data ?? [];
  const matches = records.filter(
    (r: any) => r && typeof r.id === 'number' && codes.includes(r.code) && !r.resolved_at,
  );
  // KHÔNG .catch() từng resolveDtc riêng lẻ: đây là send() của 1 item trong
  // hàng đợi có retry - 1 record lỗi phải làm cả batch fail để syncQueue giữ
  // lại và thử lại lần sau (đối chiếu GET + resolve lại từ đầu, resolve 1
  // record ĐÃ resolve là vô hại nên retry cả batch an toàn). Nuốt lỗi ở đây
  // (như bản fire-and-forget cũ) sẽ khiến flush() coi cả batch là THÀNH CÔNG
  // dù có record lỗi thật - record đó bị đánh dấu "đã xử lý" trong khi server
  // vẫn coi là chưa, không bao giờ được thử lại.
  await Promise.all(matches.map((r: any) => obdApi.resolveDtc(r.id)));
}

const resolveQueue = createSyncQueue<DtcResolveItem>({
  key: 'obd_pending_dtc_resolves',
  cap: 100,
  send: (item) => resolveClearedCodes(item.vehicle_id, item.codes),
  onDrop: (item) => syncLog.warn('dtc resolve dropped (queue full)', item.vehicle_id, item.codes),
});

export async function enqueueDtcResolve(payload: DtcResolveItem): Promise<void> {
  await resolveQueue.enqueue(payload);
}

export const flushPendingDtcResolves = resolveQueue.flush;
export const pendingDtcResolveCount = resolveQueue.count;
export const clearDtcResolveQueue = resolveQueue.clear;
