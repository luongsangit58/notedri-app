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
  ringSize: number;
  isPortrait: boolean;
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker.
  animate?: boolean;
}
