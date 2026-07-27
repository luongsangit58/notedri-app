import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ArcGauge from '../primitives/ArcGauge';
import { useCockpitPalette } from '../../../../theme/cockpitPalettes';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { pickFeaturedSecondary } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Rà soát 24/7 (góp ý user: cung tốc độ chỉ 1 màu cam nhìn đơn điệu, muốn dải
// màu đổi theo tốc độ như đồng hồ đua - 0-20 xanh dương, 20-40 xanh lục, 40-60
// vàng, 60-80 cam, trên 80 đỏ) - màu CỐ ĐỊNH theo ngữ nghĩa tốc độ (không ăn
// theo theme sáng/tối như warn/crit của cockpitPalette, đúng kiểu đèn giao
// thông không đổi màu theo theme). `pulse: false` ở các dải thấp - chỉ dải đỏ
// (>80, gần giống mốc "crit" cũ) mới nhấp nháy để không rối mắt lúc chạy chậm.
const SPEED_BANDS = [
  { value: 0, color: '#3B82F6' },
  { value: 20, color: '#22C55E' },
  { value: 40, color: '#EAB308' },
  { value: 60, color: '#F97316' },
  { value: 80, color: '#EF4444' },
];
const SPEED_ZONES = SPEED_BANDS.map((b, i) => ({ min: b.value, color: b.color, pulse: i === SPEED_BANDS.length - 1 }));

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
      {/* Rà soát (góp ý user: nhãn dài như "Nhiệt độ nước"/"Tải động cơ" bị cắt
          thành "..." khi màn dọc chia 3 cột hẹp) - cho phép xuống 2 dòng thay
          vì ép 1 dòng rồi cắt, co chữ thêm nếu 2 dòng vẫn chưa vừa. */}
      <Text
        style={[styles.miniLabel, { color: p.textDim, fontSize: labelSize }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {t(def.labelKey)}
      </Text>
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
// chỉ số phụ ưu tiên nhất (pickFeaturedSecondary), bỏ hàng phụ tràn thêm
// (trước đây nhồi thêm engineLoad/oilTemp/throttle bên dưới khiến có tới 8 số
// liệu cùng lúc). Đúng tinh thần bản thiết kế gốc: Analog ưu tiên sự tập
// trung vào 2 đồng hồ chính, ai cần xem đủ 8 chỉ số thì chuyển sang style
// "Lưới thẻ số".
export default function AnalogLayout({ metrics, size, isPortrait, animate }: CockpitLayoutProps) {
  const p = useCockpitPalette();
  const t = useT();

  const speed = metrics.find((m) => m.def.key === 'speedKmh') ?? null;
  const rpm = metrics.find((m) => m.def.key === 'rpm') ?? null;
  const featured = pickFeaturedSecondary(metrics);

  // Rà soát 24/7 (góp ý user: kim chỉ lên xuống đơn điệu, muốn "sinh động"
  // hơn khi qua 1 mốc nào đó) - mốc thuần hiệu ứng thị giác (KHÔNG phải cảnh
  // báo redline thật của xe). Riêng tốc độ giờ dùng dải màu SPEED_ZONES/
  // SPEED_BANDS cố định (xem comment đầu file) thay vì warn/crit theo theme;
  // vòng tua vẫn giữ nguyên cặp warn/crit cũ.

  return (
    <View style={[styles.root, { backgroundColor: p.bg, borderColor: p.border }]}>
      <View style={[styles.gaugesRow, isPortrait && styles.gaugesCol]}>
        <ArcGauge
          value={speed?.value ?? null} min={0} max={220} size={size}
          label={t('obd.stat_speed')} unit="km/h"
          trackColor={p.surface2} fillColor={p.accent} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
          zones={SPEED_ZONES}
          colorStops={SPEED_BANDS}
        />
        <ArcGauge
          value={rpm?.value ?? null} min={0} max={8000} size={size}
          label={t('obd.stat_rpm')} unit="v/ph" quantizeStep={rpm?.def.quantizeStep}
          trackColor={p.surface2} fillColor={p.accent2} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
          zones={[{ min: 3000, color: p.warn }, { min: 4000, color: p.crit }]}
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
  miniLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  miniVal: { fontSize: 15, fontWeight: '700', marginTop: 3 },
});
