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

export type DtcSuggestion = { code: string; title_vi: string; severity: RawEntry['severity'] };

/**
 * Gợi ý mã theo tiền tố khi đang gõ (vd "P03" -> P0300, P0301, ...) - lọc thẳng trên
 * Map đã dựng sẵn trong bộ nhớ (lookupDtcOffline ở trên), KHÔNG gọi mạng: cùng nguồn
 * dữ liệu offline, chi phí chỉ là 1 lượt duyệt ~300 mã trong RAM (dưới 1ms), không có
 * chi phí mạng/debounce nào để lo về hiệu năng.
 */
export function suggestDtcOffline(prefix: string, limit = 8): DtcSuggestion[] {
  const p = prefix.trim().toUpperCase();
  if (p.length < 2) return [];

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
