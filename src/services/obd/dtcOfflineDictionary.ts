import { DtcLookupResult } from '../../api/obd';
// Snapshot SINH TỰ ĐỘNG từ repo Laravel (npm run sync:dtc) - không sửa tay.
import snapshot from '../../data/dtcDictionary.json';

type RawEntry = {
  code: string;
  group: string;
  severity: 'critical' | 'warn' | 'info';
  can_drive: 'yes' | 'caution' | 'stop';
  en: string;
  vi: string;
  action_vi: string;
  cost_min: number;
  cost_max: number;
};

let byCode: Map<string, RawEntry> | null = null;

/**
 * Tra offline từ snapshot đóng gói trong app - fallback khi không có mạng
 * (trong hầm gửi xe là lúc cần tra mã nhất). Trả cùng shape với API server
 * để màn hình không cần phân biệt nguồn.
 */
export function lookupDtcOffline(code: string): DtcLookupResult {
  if (!byCode) {
    byCode = new Map(
      (snapshot.entries as RawEntry[]).map((e) => [e.code.toUpperCase(), e]),
    );
  }

  const normalized = code.trim().toUpperCase();
  const e = byCode.get(normalized);
  if (!e) return { code: normalized, known: false };

  return {
    code: normalized,
    known: true,
    group: e.group,
    severity: e.severity,
    can_drive: e.can_drive,
    title_vi: e.vi,
    title_en: e.en,
    action_vi: e.action_vi,
    cost_min: e.cost_min,
    cost_max: e.cost_max,
  };
}

/**
 * Rà soát 18/7 (user: phải gõ chữ "P" trước mới tìm được, trong khi P là hệ thống
 * mặc định/phổ biến nhất) - mã KHÔNG bắt đầu bằng chữ hệ thống (P/C/B/U) được ngầm
 * định P ở đầu, vd "03" -> "P03". Khớp DtcLookupController::withDefaultPrefix() bên
 * web. Chỉ áp dụng cho giá trị dùng để tìm/gợi ý/submit - KHÔNG dùng để ép sửa nội
 * dung đang hiển thị trong ô nhập (xem cách gọi ở DtcLookupScreen).
 */
export function withDefaultDtcPrefix(raw: string): string {
  const v = raw.trim().toUpperCase();
  return /^[0-9]/.test(v) ? `P${v}` : v;
}

export type DtcSuggestion = { code: string; title_vi: string; severity: RawEntry['severity'] };

/**
 * Gợi ý mã theo tiền tố khi đang gõ (vd "P03" -> P0300, P0301, ...) - lọc thẳng trên
 * Map đã dựng sẵn trong bộ nhớ (lookupDtcOffline ở trên), KHÔNG gọi mạng: cùng nguồn
 * dữ liệu offline, chi phí chỉ là 1 lượt duyệt ~300 mã trong RAM (dưới 1ms), không có
 * chi phí mạng/debounce nào để lo về hiệu năng.
 *
 * Rà soát 22/7 (user báo gõ chữ hệ thống "P" trước không ăn thua, phải gõ số mới
 * bắt đầu search): ngưỡng cũ yêu cầu prefix >= 2 ký tự. Gõ SỐ trước luôn đạt 2 ký
 * tự ngay từ phím đầu tiên nhờ withDefaultDtcPrefix tự thêm "P" (vd gõ "0" ->
 * normalized "P0"), nhưng gõ CHỮ hệ thống trước (P/C/B/U) thì ký tự đầu tiên chỉ
 * dài 1 (chưa có "P" nào để cộng thêm) -> không hiện gợi ý gì, tạo cảm giác màn
 * hình "đứng" đúng lúc người dùng gõ chữ. Hạ ngưỡng còn 1 ký tự để gõ riêng "P",
 * "C", "B" hay "U" cũng hiện ngay các mã thuộc hệ đó, đối xứng với đường gõ số.
 */
export function suggestDtcOffline(prefix: string, limit = 8): DtcSuggestion[] {
  const p = prefix.trim().toUpperCase();
  if (p.length < 1) return [];

  if (!byCode) {
    byCode = new Map(
      (snapshot.entries as RawEntry[]).map((e) => [e.code.toUpperCase(), e]),
    );
  }

  const out: DtcSuggestion[] = [];
  for (const [code, e] of byCode) {
    if (code.startsWith(p)) {
      out.push({ code, title_vi: e.vi, severity: e.severity });
      if (out.length >= limit) break;
    }
  }
  return out;
}
