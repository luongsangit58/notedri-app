// Nori: linh vật báo cáo sức khỏe xe - logic tâm trạng thuần (không phụ thuộc
// React/i18n) để dùng chung giữa card Nori ở HomeScreen và avatar ở HealthScreen.
export type NoriMood = 'happy' | 'warn' | 'urgent' | 'unknown';

// Rà soát 22/7 (user: muốn Nori trên app giống hệt Nori trên web) - lấy đúng màu
// dot trạng thái web đang dùng ở resources/views/garage/_nori_today.blade.php
// ($hsev: urgent->rose-500, warn->amber-500, info->sky-400, ok->emerald-500),
// KHÔNG tự bịa bảng màu riêng cho app nữa.
export const NORI_MOOD_COLOR: Record<NoriMood, string> = {
  happy: '#10B981', // emerald-500, khớp organ 'ok' bên web
  warn: '#F59E0B', // amber-500, khớp organ 'warn' bên web
  urgent: '#F43F5E', // rose-500, khớp organ 'urgent' bên web
  unknown: '#38BDF8', // sky-400, khớp organ 'info' bên web (chưa đủ dữ liệu)
};

// Ngưỡng khớp với scoreBand() ở HealthScreen.tsx (85 xuất sắc / 70 tốt / 55 khá
// / 40 kém) - gộp lại còn 3 mức cho biểu cảm Nori: >=70 vui, >=40 lo, còn lại báo động.
//
// Rà soát 22/7: điểm tổng cao (>=70) KHÔNG loại trừ việc có 1 organ đang ở mức
// 'warn' (vd sắp hết hạn đăng kiểm) - nếu chỉ xét hasUrgentOrgan thì mood hiện vui
// trong khi dòng chữ bên dưới (ưu tiên hiển thị organ warn/urgent nếu có, xem
// NoriDailyCard.tsx) lại nói "có điều cần xem", mâu thuẫn. Thêm hasWarnOrgan để
// ép xuống 'warn' trong trường hợp đó.
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
