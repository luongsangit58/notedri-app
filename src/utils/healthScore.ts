import { useI18nStore } from '../i18n';

/**
 * Màu/nhãn cho điểm sức khoẻ xe (0-100, backend tính từ hồ sơ bảo dưỡng/giấy
 * tờ/chi phí - GET /vehicles/{id}/health, xem HealthScreen.tsx). Tách ra đây
 * để dùng lại ở nơi khác (vd badge tóm tắt trên màn Chẩn đoán OBD2) mà không
 * lặp lại ngưỡng màu - tránh 2 nơi hiển thị cùng 1 điểm nhưng lệch màu nhau.
 */
export function scoreColor(score: number): string {
  if (score >= 80) return '#4CAF50'; // success / emerald
  if (score >= 50) return '#FF9800'; // warning / amber
  return '#F44336'; // error / rose
}

export function scoreBand(score: number): string {
  const t = useI18nStore.getState().t;
  if (score >= 85) return t('dashboard.health_band_excellent');
  if (score >= 70) return t('dashboard.health_band_good');
  if (score >= 55) return t('dashboard.health_band_warn');
  if (score >= 40) return t('dashboard.health_band_poor');
  return t('health.band_check_needed');
}
