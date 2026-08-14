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
// thông không đổi màu theo theme).
//
// Rà soát 27/7 (góp ý user, so ảnh đồng hồ cơ thật): CHỈ cung (colorStops)
// đổi màu theo tốc độ/vòng tua - kim và số liệu LUÔN giữ màu trắng/màu chữ
// mặc định (p.text), không ăn theo dải màu nữa. Trước đây `zones` (danh sách
// mốc phẳng) tô CẢ kim/số/glow theo đúng màu dải hiện tại - đúng ý ban đầu
// "sinh động" nhưng user thấy rối, muốn thanh thoát hơn giống đồng hồ cơ thật
// (chỉ vạch chia + số trắng, không đổi màu kim/số theo tốc độ). Bỏ hẳn
// `zones` ở cả 2 đồng hồ dưới, chỉ giữ `colorStops` cho cung.
//
// Rà soát 29/7 (góp ý user: dải màu "quá nhiều gradient, chưa hài hoà") - 5
// mốc cũ nhồi hết vào 0-80km/h trong khi cung chạy tới 220km/h, khiến 3/4
// cung còn lại chỉ 1 màu đỏ phẳng và đoạn đầu đổi màu dồn dập, loè loẹt. Giãn
// còn 4 mốc trải ĐỀU trên toàn thang 0-220 (đúng nhịp cung thật), giữ đúng thứ
// tự ngữ nghĩa xanh dương (êm) -> xanh lục (ổn định) -> vàng cam (nhanh) -> đỏ
// (rất nhanh) nhưng chuyển tiếp thong thả hơn.
const SPEED_BANDS = [
  { value: 0, color: '#3B82F6' },
  { value: 80, color: '#22C55E' },
  { value: 140, color: '#F59E0B' },
  { value: 180, color: '#EF4444' },
];
// Vòng tua: xanh lục (bình thường) -> vàng (~3/4 thang, tương đương mốc warn
// cũ) -> đỏ (gần kịch kim, tương đương mốc crit cũ) - cùng logic màu với
// SPEED_BANDS, chỉ đổi mốc cho hợp thang 0-8000v/ph.
const RPM_BANDS = [
  { value: 0, color: '#22C55E' },
  { value: 3000, color: '#EAB308' },
  { value: 4000, color: '#EF4444' },
];

function MiniStat({ item, size, animate }: { item: CockpitMetricValue; size: number; animate?: boolean }) {
  const p = useCockpitPalette();
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  // Rà soát 24/7 (góp ý user: chữ quá nhỏ, khó đọc) - cỡ chữ tỉ lệ theo
  // gaugeSize thay vì cố định 15/10, cùng nhịp phóng to với 2 đồng hồ chính.
  // Rà soát 13/8 (góp ý user: khối 3 ô phụ nhìn nặng/thô, muốn gọn gàng tinh tế
  // hơn) - hạ trần labelSize (18->16) để nhãn không phình to cạnh tranh với số
  // liệu chính trên màn lớn, nâng sàn valSize (15->16) để số liệu không quá bé
  // trên màn nhỏ - rõ tôn ti giữa nhãn phụ và số liệu chính hơn.
  const labelSize = Math.max(10, Math.min(16, size * 0.065));
  const valSize = Math.max(16, Math.min(26, size * 0.11));
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
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <View style={[styles.gaugesRow, isPortrait && styles.gaugesCol]}>
        <ArcGauge
          value={speed?.value ?? null} min={0} max={220} size={size}
          label={t('obd.stat_speed')} unit="km/h"
          trackColor={p.surface2} fillColor={p.accent} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
          colorStops={SPEED_BANDS}
        />
        <ArcGauge
          value={rpm?.value ?? null} min={0} max={8000} size={size}
          label={t('obd.stat_rpm')} unit="v/ph" quantizeStep={rpm?.def.quantizeStep}
          trackColor={p.surface2} fillColor={p.accent2} needleColor={p.text} tickColor={p.textDim}
          valueColor={p.text} labelColor={p.textDim} animate={animate}
          colorStops={RPM_BANDS}
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
  // Rà soát 6/8: bỏ borderRadius/borderWidth - nền theme (p.bg) giờ tràn hết
  // màn Đồng hồ thay vì "đóng khung" cách mép (xem GaugeCluster.tsx). Giữ
  // nguyên padding 16 - vẫn cần khoảng cách cho 2 đồng hồ kim không sát mép.
  root: { flex: 1, padding: 16, gap: 14, width: '100%', alignItems: 'center', justifyContent: 'center' },
  gaugesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  gaugesCol: { flexDirection: 'column' },
  sideStack: { flexDirection: 'row', gap: 12, width: '100%' },
  // Rà soát 13/8 (góp ý user: 3 ô phụ nhìn nặng/thô, muốn gọn gàng tinh tế
  // hơn) - bo góc rộng hơn (10->14, đồng bộ cảm giác "viên thuốc" mềm mại thay
  // vì hộp vuông vức) + nới padding dọc (9->12) cho nhãn/số liệu có khoảng
  // thở, không còn cảm giác chật/ép sát viền.
  mini: { borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, flex: 1, alignItems: 'center' },
  miniLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  miniVal: { fontSize: 15, fontWeight: '800', marginTop: 4 },
});
