import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import RingProgress from '../primitives/RingProgress';
import { useCockpitPalette, CockpitPalette } from '../../../../theme/cockpitPalettes';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Component RIÊNG cho từng thẻ (không gọi hook ngay trong .map của layout) -
// bắt buộc vì `metrics` có thể đổi SỐ LƯỢNG giữa các lần render (capability
// dò được PID hỗ trợ sau khi kết nối) - gọi hook trong callback .map trực
// tiếp sẽ vi phạm rules-of-hooks khi số lượng phần tử thay đổi.
function MetricCard({ item, ringSize, cols, palette, animate }: {
  item: CockpitMetricValue; ringSize: number; cols: number; palette: CockpitPalette; animate?: boolean;
}) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  const ringColor = def.key === 'speedKmh' ? palette.accent : def.key === 'rpm' ? palette.accent2 : def.color;
  return (
    <View style={{ width: `${100 / cols}%`, padding: 6 }}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <RingProgress value={value} max={def.max} size={ringSize} trackColor={palette.surface2} fillColor={ringColor} animate={animate}>
          <FontAwesome5 name={def.icon} size={ringSize * 0.32} color={ringColor} solid />
        </RingProgress>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.val, { color: palette.text }]} numberOfLines={1}>
            {display ?? '-'}
            <Text style={{ fontSize: 10, fontWeight: '600', color: palette.textDim }}> {def.unit}</Text>
          </Text>
          <Text style={[styles.label, { color: palette.textDim }]} numberOfLines={1}>{t(def.labelKey)}</Text>
        </View>
      </View>
    </View>
  );
}

// Style MIỄN PHÍ #2 - lưới thẻ có vòng tiến độ riêng từng chỉ số, giống
// Torque Pro (đúng bố cục ".stage-b" trong bản thiết kế). Theo theme sáng/tối
// app; tốc độ/vòng tua dùng màu accent/accent2 của palette, các chỉ số phụ
// giữ màu nhận diện riêng (obdMetrics.ts) để dễ phân biệt khi liếc nhanh.
// Rà soát (góp ý user: cỡ chữ/khoảng cách chưa đồng đều) - khoảng đệm giữa
// các thẻ tăng lên để đỡ cảm giác nhồi nhét khi đủ 8 thẻ cùng lúc.
export default function CardsLayout({ metrics, ringSize, isPortrait, animate }: CockpitLayoutProps) {
  const p = useCockpitPalette();
  const cols = isPortrait ? 2 : 4;

  return (
    <View style={[styles.grid, { backgroundColor: p.bg, borderColor: p.border }]}>
      {metrics.map((item) => (
        <MetricCard key={item.def.key} item={item} ringSize={ringSize} cols={cols} palette={p} animate={animate} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 18, borderWidth: 1, padding: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  val: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
});
