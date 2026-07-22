// Nori: linh vật báo cáo sức khỏe xe - logic tâm trạng thuần (không phụ thuộc
// React/i18n) để dùng chung giữa card Nori ở HomeScreen và avatar ở HealthScreen.
export type NoriMood = 'happy' | 'warn' | 'urgent' | 'unknown';

export const NORI_MOOD_COLOR: Record<NoriMood, string> = {
  happy: '#22C55E',
  warn: '#F59E0B',
  urgent: '#EF4444',
  unknown: '#9CA3AF',
};

export const NORI_MOOD_ICON: Record<NoriMood, string> = {
  happy: 'grin-beam',
  warn: 'meh',
  urgent: 'sad-tear',
  unknown: 'question-circle',
};

// Ngưỡng khớp với scoreBand() ở HealthScreen.tsx (85 xuất sắc / 70 tốt / 55 khá
// / 40 kém) - gộp lại còn 3 mức cho biểu cảm Nori: >=70 vui, >=40 lo, còn lại báo động.
//
// Rà soát 22/7: điểm tổng cao (>=70) KHÔNG loại trừ việc có 1 organ đang ở mức
// 'warn' (vd sắp hết hạn đăng kiểm) - nếu chỉ xét hasUrgentOrgan thì mặt Nori
// hiện vui trong khi dòng chữ bên dưới (ưu tiên hiển thị organ warn/urgent nếu
// có, xem NoriDailyCard.tsx) lại nói "có điều cần xem", mâu thuẫn. Thêm
// hasWarnOrgan để ép xuống 'warn' trong trường hợp đó.
export function noriMoodFromScore(
  total: number | null | undefined,
  hasUrgentOrgan: boolean,
  hasWarnOrgan: boolean = false,
): NoriMood {
  if (hasUrgentOrgan) return 'urgent';
  if (total == null) return hasWarnOrgan ? 'warn' : 'unknown';
  if (total >= 70) return hasWarnOrgan ? 'warn' : 'happy';
  if (total >= 40) return 'warn';
  return 'urgent';
}
