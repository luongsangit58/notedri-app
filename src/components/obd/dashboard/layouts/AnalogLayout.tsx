import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ArcGauge from '../primitives/ArcGauge';
import { useCockpitPalette } from '../../../../theme/cockpitPalettes';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

function MiniStat({ item, size, animate }: { item: CockpitMetricValue; size: number; animate?: boolean }) {
  const p = useCockpitPalette();
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  // Rà soát 24/7 (góp ý user: chữ quá nhỏ, khó đọc) - cỡ chữ tỉ lệ theo
  // gaugeSize thay vì cố định 15/10, cùng nhịp phóng to với 2 đồng hồ chính.
  const labelSize = Math.max(10, Math.min(18, size * 0.065));
  const valSize = Math.max(15, Math.min(26, size * 0.11));
  return (
    <View style={[styles.mini, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.miniLabel, { color: p.textDim, fontSize: labelSize }]} numberOfLines={1}>{t(def.labelKey)}</Text>
      <Text style={[styles.miniVal, { color: p.text, fontSize: valSize }]} numberOfLines={1}>
        {display ?? '-'}
        <Text style={{ fontSize: labelSize, fontWeight: '600', color: p.textDim }}> {def.unit}</Text>
      </Text>
    </View>
  );
}

// Style MIỄN PHÍ #1 - kim tốc độ + vòng tua ở giữa, chỉ số phụ xếp 2 bên,
// giống Car Scanner ELM327 (đúng bố cục ".stage-a" trong bản thiết kế). Theo
// theme sáng/tối app (useCockpitPalette).
//
// Rà soát (góp ý user: quá nhiều thứ trên 1 màn hình, rối mắt) - CHỈ hiện 3
// chỉ số phụ ưu tiên nhất (FEATURED_SECONDARY_KEYS), bỏ hàng phụ tràn thêm
// (trước đây nhồi thêm engineLoad/oilTemp/throttle bên dưới khiến có tới 8 số
// liệu cùng lúc). Đúng tinh thần bản thiết kế gốc: Analog ưu tiên sự tập
// trung vào 2 đồng hồ chính, ai cần xem đủ 8 chỉ số thì chuyển sang style
// "Lưới thẻ số".
export default function AnalogLayout({ metrics, size, isPortrait, animate }: CockpitLayoutProps) {
  const p = useCockpitPalette();
  const t = useT();

  const speed = metrics.find((m) => m.def.key === 'speedKmh') ?? null;
  const rpm = metrics.find((m) => m.def.key === 'rpm') ?? null;
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => metrics.find((s) => s.def.key === k))
    .filter((x): x is CockpitMetricValue => !!x);

  return (
    <View style={[styles.root, { backgroundColor: p.bg, borderColor: p.border }]}>
      <View style={[styles.gaugesRow, isPortrait && styles.gaugesCol]}>
        <ArcGauge
          value={speed?.value ?? null} min={0} max={220} size={size}
          label={t('obd.stat_speed')} unit="km/h"
          trackColor={p.surface2} fillColor={p.accent} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
        />
        <ArcGauge
          value={rpm?.value ?? null} min={0} max={8000} size={size}
          label={t('obd.stat_rpm')} unit="v/ph" quantizeStep={rpm?.def.quantizeStep}
          trackColor={p.surface2} fillColor={p.accent2} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
        />
      </View>
      {featured.length > 0 && (
        <View style={styles.sideStack}>
          {featured.map((item) => <MiniStat key={item.def.key} item={item} size={size} animate={animate} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 16, gap: 14, width: '100%', alignItems: 'center', justifyContent: 'center' },
  gaugesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  gaugesCol: { flexDirection: 'column' },
  sideStack: { flexDirection: 'row', gap: 10, width: '100%' },
  mini: { borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 10, flex: 1, alignItems: 'center' },
  miniLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 15, fontWeight: '700', marginTop: 3 },
});
