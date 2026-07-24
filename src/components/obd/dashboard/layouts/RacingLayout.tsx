import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { monoFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { PRIMARY_METRIC_KEYS, FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';
import ArcGauge from '../primitives/ArcGauge';

// Premium "HUD Đua xe" - bản sắc RIÊNG (carbon fiber + số vòng tua khổng lồ +
// dải shift-light) không đổi theo NỘI DUNG (vẫn luôn "HUD đua xe"), nhưng góp
// ý user (23/7): cần có bản sáng+tối cho mỗi Premium thay vì cố định 1 hướng -
// bản sáng đổi carbon fiber sang tông xám nhạt kiểu pit-lane ban ngày, giữ
// nguyên màu đỏ/cam nhận diện RPM/tốc độ (đủ tương phản trên cả 2 nền).
const DARK_PALETTE = {
  bg: '#0B0D10', stripeA: '#14171C', stripeB: '#191D23', border: '#2A2F36',
  text: '#EDF1F7', textDim: '#8B93A3', rpmColor: '#FB4B4B', speedColor: '#FF8A3D',
  shiftOn: '#FF8A3D', shiftOff: '#232830',
};
const LIGHT_PALETTE = {
  bg: '#E8E9EB', stripeA: '#DCDEE1', stripeB: '#F0F1F3', border: '#C4C7CC',
  text: '#14171C', textDim: '#5B6270', rpmColor: '#D32F2F', speedColor: '#C4571F',
  shiftOn: '#C4571F', shiftOff: '#C4C7CC',
};

// Rà soát (góp ý user: dải đèn từng đổi xanh->đỏ ở ô thứ 6/8 như báo "sắp đỏ
// vòng tua" - nhưng KHÔNG có dữ liệu redline thật của xe (ObdSnapshot/
// VehicleCapability không có field này), 8000 chỉ là trần hiển thị chung cho
// mọi xe. Đổi màu ở 1 ngưỡng bịa đặt dễ khiến tài xế hiểu lầm "sắp đỏ vòng
// tua" sai thời điểm. Giữ lại cơ chế đèn sáng dần (vẫn đẹp/đúng chất đua xe)
// nhưng CHỈ 1 màu duy nhất - thuần tuý thanh tiến độ % vòng tua, không ngụ ý
// vùng nguy hiểm nào cả.
const SHIFT_SEGMENTS = 8;

// Component RIÊNG cho từng ô - không gọi
// hook trực tiếp trong .map vì số ô có thể đổi giữa các lần render).
function MiniStat({ item, palette, textSize, valSize, animate }: {
  item: CockpitMetricValue; palette: typeof DARK_PALETTE; textSize: number; valSize: number; animate?: boolean;
}) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={[styles.mini, { borderColor: palette.border, backgroundColor: palette.stripeA + 'AA' }]}>
      <Text style={[styles.miniLabel, { color: palette.textDim, fontSize: textSize }]} numberOfLines={1}>{t(def.labelKey)}</Text>
      <Text style={[styles.miniVal, { color: palette.text, fontFamily: monoFontFamily, fontSize: valSize }]} numberOfLines={1}>
        {display ?? '-'}{def.unit}
      </Text>
    </View>
  );
}

// Rà soát 24/7 (góp ý user: theme phải LÀ đồng hồ đo có kim/cung, không chỉ
// hiện số như đồng hồ điện tử) - số vòng tua khổng lồ ở giữa đổi sang
// ArcGauge (đúng primitive Analog/Retro đã dùng), giữ nguyên dải shift-light
// bên dưới (không phải số, vẫn đúng chất HUD đua xe) + badge tốc độ góc trên
// (số phụ nhỏ, cùng vai trò với sideStack số phụ của Analog/Retro).
export default function RacingLayout({ metrics, size, isPortrait, animate }: CockpitLayoutProps) {
  const t = useT();
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const speedValSize = Math.max(22, Math.min(48, size * 0.16));
  const miniLabelSize = Math.max(9, Math.min(15, size * 0.05));
  const miniValSize = Math.max(14, Math.min(22, size * 0.075));
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const rpm = metrics.find((m) => m.def.key === 'rpm');
  const speedDisplay = useCountingNumber(speed?.value ?? null, 0, animate);
  const rpmFrac = rpm ? Math.max(0, Math.min(1, (rpm.value ?? 0) / rpm.def.max)) : 0;
  const litSegments = Math.round(rpmFrac * SHIFT_SEGMENTS);
  const secondary = metrics.filter((m) => !PRIMARY_METRIC_KEYS.includes(m.def.key));
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  // Rà soát 24/7 (góp ý user: nền carbon không phủ hết bề ngang, để lộ khoảng
  // trống màu nền phía sau ở cạnh phải - ảnh chụp thật xác nhận) - Svg/Rect
  // width="100%" height="100%" (chuỗi %) có thể không đồng bộ đúng theo kích
  // thước thật của View cha trên Android tuỳ thời điểm đo layout. Đo kích
  // thước THẬT bằng onLayout rồi truyền số px cụ thể vào Svg, khớp tuyệt đối
  // với View cha - không còn phụ thuộc cách Yoga/react-native-svg diễn giải %.
  const [bg, setBg] = useState({ w: 0, h: 0 });
  const onRootLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== bg.w || height !== bg.h) setBg({ w: width, h: height });
  };

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 20 }]} onLayout={onRootLayout}>
      {bg.w > 0 && bg.h > 0 && (
        <Svg width={bg.w} height={bg.h} style={StyleSheet.absoluteFillObject}>
          <Defs>
            <Pattern id="carbon" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect width={14} height={14} fill={PALETTE.stripeA} />
              <Rect width={7} height={14} fill={PALETTE.stripeB} />
            </Pattern>
          </Defs>
          <Rect width={bg.w} height={bg.h} fill="url(#carbon)" />
        </Svg>
      )}

      <View style={styles.speedBadge}>
        <Text style={[styles.speedVal, { color: PALETTE.speedColor, fontFamily: monoFontFamily, fontSize: speedValSize }]}>
          {speedDisplay ?? '-'}
        </Text>
        <Text style={[styles.speedUnit, { color: PALETTE.textDim }]}>km/h</Text>
      </View>

      <View style={styles.center}>
        <ArcGauge
          value={rpm?.value ?? null} min={0} max={rpm?.def.max ?? 8000} size={size}
          unit={t('obd.stat_rpm')} valueFontFamily={monoFontFamily} quantizeStep={rpm?.def.quantizeStep}
          trackColor={PALETTE.stripeA} fillColor={PALETTE.rpmColor} needleColor={PALETTE.rpmColor} tickColor={PALETTE.textDim}
          valueColor={PALETTE.rpmColor} labelColor={PALETTE.textDim} animate={animate}
        />

        <View style={styles.shiftRow}>
          {Array.from({ length: SHIFT_SEGMENTS }, (_, i) => {
            const lit = i < litSegments;
            const color = lit ? PALETTE.shiftOn : PALETTE.shiftOff;
            return (
              <View
                key={i}
                style={[
                  styles.shiftSeg,
                  { backgroundColor: color, shadowColor: color, shadowOpacity: lit ? 0.8 : 0, shadowRadius: 6, elevation: lit ? 3 : 0 },
                ]}
              />
            );
          })}
        </View>
      </View>

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map((item) => <MiniStat key={item.def.key} item={item} palette={PALETTE} textSize={miniLabelSize} valSize={miniValSize} animate={animate} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: 18, overflow: 'hidden', width: '100%', minHeight: 220, paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', gap: 14 },
  // Góc trên-trái (không phải trên-phải) - nút đổi style của GaugeCluster luôn
  // nằm cố định trên-phải, đặt speedBadge cùng góc sẽ bị nút đó đè lên.
  speedBadge: { position: 'absolute', top: 14, left: 16, alignItems: 'flex-start' },
  speedVal: { fontSize: 22, fontWeight: '800' },
  speedUnit: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: -2 },
  center: { alignItems: 'center', gap: 6 },
  shiftRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  shiftSeg: { width: 20, height: 10, borderRadius: 3 },
  secondaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  mini: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center' },
  miniLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});
