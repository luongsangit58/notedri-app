import { lookupDtcOffline } from './dtcOfflineDictionary';
import { formatVNDShort } from '../../utils/format';

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
  return `${formatVNDShort(e.cost_min)} - ${formatVNDShort(e.cost_max)}`;
}
