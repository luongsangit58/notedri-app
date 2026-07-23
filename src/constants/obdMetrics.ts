import { ObdSnapshot } from '../services/obd/ObdReader';
import { TranslationKey } from '../i18n/vi';

// Nguồn DUY NHẤT cho 8 chỉ số OBD2 mà Dashboard hiển thị - trước đây định
// nghĩa lặp lại 3 lần (OBDDashboardScreen, GaugeCluster, GaugeThemePicker) với
// dữ liệu hơi khác nhau mỗi chỗ. Thứ tự đúng theo bản thiết kế artifact
// (tốc độ, vòng tua, tải máy, nước làm mát, nhiên liệu, dầu, bướm ga, điện áp).
export type ObdMetricKey =
  | 'speedKmh'
  | 'rpm'
  | 'engineLoadPct'
  | 'coolantTempC'
  | 'fuelLevelPct'
  | 'oilTempC'
  | 'throttlePct'
  | 'controlModuleVoltage';

export interface ObdMetricDef {
  key: ObdMetricKey;
  pid: string;
  labelKey: TranslationKey;
  unit: string;
  max: number;
  icon: string;
  // Màu nhận diện riêng của chỉ số này (dùng cho icon/vòng tiến độ) - CỐ ĐỊNH,
  // không đổi theo theme sáng/tối hay style đồng hồ, giữ đúng thói quen màu đã
  // có trong app (StatBox trước đây).
  color: string;
  // Làm tròn về bậc N trước khi hiển thị (góp ý user: vòng tua nhảy số liên
  // tục vì lấy từ fastSnapshot RAW 500ms không làm mượt - nhiễu cảm biến/ECU
  // vài chục rpm mỗi lần đọc). Chỉ set cho chỉ số thật sự cần - undefined =
  // hiển thị đúng giá trị gốc như cũ.
  quantizeStep?: number;
}

export const OBD_METRICS: ObdMetricDef[] = [
  { key: 'speedKmh', pid: '0D', labelKey: 'obd.stat_speed', unit: 'km/h', max: 220, icon: 'tachometer-alt', color: '#FF8A3D' },
  { key: 'rpm', pid: '0C', labelKey: 'obd.stat_rpm', unit: 'v/ph', max: 8000, icon: 'cogs', color: '#34D5C4', quantizeStep: 50 },
  { key: 'engineLoadPct', pid: '04', labelKey: 'obd.stat_engine_load', unit: '%', max: 100, icon: 'fire', color: '#F59E0B' },
  { key: 'coolantTempC', pid: '05', labelKey: 'obd.stat_coolant', unit: '°C', max: 120, icon: 'thermometer-half', color: '#EF4444' },
  { key: 'fuelLevelPct', pid: '2F', labelKey: 'obd.stat_fuel', unit: '%', max: 100, icon: 'gas-pump', color: '#10B981' },
  { key: 'oilTempC', pid: '5C', labelKey: 'obd.stat_oil_temp', unit: '°C', max: 150, icon: 'oil-can', color: '#F97316' },
  { key: 'throttlePct', pid: '11', labelKey: 'obd.stat_throttle', unit: '%', max: 100, icon: 'sliders-h', color: '#14B8A6' },
  { key: 'controlModuleVoltage', pid: '42', labelKey: 'obd.stat_voltage', unit: 'V', max: 15, icon: 'battery-full', color: '#6366F1' },
];

// 2 chỉ số chính (kim/đồng hồ trung tâm) - các style khác nhau tự quyết định
// hiển thị chúng khác "phụ" thế nào (vd Racing HUD phóng to RPM, Tối giản EV
// chỉ giữ tốc độ), nhưng đều dùng chung nhãn "chính" này để không phải lặp
// lại danh sách 2 key ở từng layout.
export const PRIMARY_METRIC_KEYS: ObdMetricKey[] = ['speedKmh', 'rpm'];

// 3 chỉ số ưu tiên hiển thị khi 1 style chỉ có chỗ cho ít số liệu phụ (Tối
// giản EV, Gia đình, Ban đêm...) - đúng bộ 3 phổ biến nhất tài xế quan tâm.
export const FEATURED_SECONDARY_KEYS: ObdMetricKey[] = ['coolantTempC', 'fuelLevelPct', 'controlModuleVoltage'];

export function filterSupportedMetrics(
  metrics: ObdMetricDef[],
  supportedPids: string[] | null,
): ObdMetricDef[] {
  return supportedPids ? metrics.filter((m) => supportedPids.includes(m.pid)) : metrics;
}

export function readMetricValue(snapshot: ObdSnapshot | null, key: ObdMetricKey): number | null {
  return snapshot ? snapshot[key] : null;
}

// Làm tròn về bội số của `step` (vd 2280 -> 2300 với step=50) - giữ nguyên
// null/không có step. Đặt tên riêng thay vì gọi thẳng Math.round tại chỗ
// dùng để 1 lần đọc là hiểu ngay đây là bước xử lý CÓ CHỦ ĐÍCH (chống nhảy số
// vặt), không phải làm tròn hiển thị thông thường.
export function quantizeValue(value: number | null, step: number | undefined): number | null {
  if (value == null || !step) return value;
  return Math.round(value / step) * step;
}
