import { lookupDtcOffline } from './dtcOfflineDictionary';
import { formatVND } from '../../utils/format';

/**
 * C2 (rà soát kiến trúc 14/7): khi rule finding có mã DTC tương ứng
 * (related_dtc), kéo khoảng chi phí sửa từ TỪ ĐIỂN offline để hiện kèm - trước
 * đây chỉ DTC mới có chi phí, rule finding thì không, dù cùng 1 vấn đề. Trả
 * null nếu không có mã hoặc mã không có chi phí trong từ điển.
 */
export function findingCostLabel(relatedDtc?: string): string | null {
  if (!relatedDtc) return null;
  const e = lookupDtcOffline(relatedDtc);
  if (e.cost_min == null || e.cost_max == null) return null;
  // formatVND: "300.000đ" (đầy đủ, chuyên nghiệp) thay vì "300k-2,4tr" viết tắt.
  return `${formatVND(e.cost_min)} - ${formatVND(e.cost_max)}`;
}
