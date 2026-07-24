import { ObdMetricDef } from '../../../constants/obdMetrics';

export interface CockpitMetricValue {
  def: ObdMetricDef;
  value: number | null;
}

// Props CHUNG cho mọi layout style (Analog, Lưới thẻ số, Racing HUD...) -
// mỗi style tự quyết định hiển thị `metrics` thế nào (2 key đầu 'speedKmh'/
// 'rpm' luôn là 2 chỉ số chính - xem PRIMARY_METRIC_KEYS), nhưng đều nhận
// đúng 1 nguồn dữ liệu duy nhất, đã lọc theo capability của xe.
export interface CockpitLayoutProps {
  metrics: CockpitMetricValue[];
  size: number;
  // Rà soát 24/7 (góp ý user: 1-2 đồng hồ cần TO/nổi bật gần full màn, không
  // thô quá) - kích thước riêng cho style chỉ có 1 đồng hồ làm chủ đạo
  // (Racing/Minimal/Night dùng cái này thay cho `size`), lớn hơn hẳn vì không
  // phải chia chỗ với đồng hồ thứ 2 như Analog/Retro (xem useCockpitLayout.ts).
  heroSize: number;
  ringSize: number;
  isPortrait: boolean;
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker.
  animate?: boolean;
}
