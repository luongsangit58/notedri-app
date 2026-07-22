import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { monoFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { PRIMARY_METRIC_KEYS, FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "HUD Đua xe" - bản sắc CỐ ĐỊNH (nền carbon tối, số vòng tua khổng
// lồ, dải shift-light) không đổi theo theme sáng/tối app - đây chính là lý do
// nó là 1 skin đáng mua riêng, không phải recolor của style Miễn phí.
const PALETTE = {
  bg: '#0B0D10', stripeA: '#14171C', stripeB: '#191D23', border: '#2A2F36',
  text: '#EDF1F7', textDim: '#8B93A3', rpmColor: '#FB4B4B', speedColor: '#FF8A3D',
  shiftOn: '#2ECC71', shiftHot: '#FB4B4B', shiftOff: '#232830',
};

const SHIFT_SEGMENTS = 8;
const SHIFT_HOT_FROM = 6;

// Component RIÊNG cho từng ô - xem lý do trong CardsLayout.tsx (không gọi
// hook trực tiếp trong .map vì số ô có thể đổi giữa các lần render).
function MiniStat({ item, animate }: { item: CockpitMetricValue; animate?: boolean }) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={[styles.mini, { borderColor: PALETTE.border }]}>
      <Text style={[styles.miniLabel, { color: PALETTE.textDim }]} numberOfLines={1}>{t(def.labelKey)}</Text>
      <Text style={[styles.miniVal, { color: PALETTE.text, fontFamily: monoFontFamily }]} numberOfLines={1}>
        {display ?? '-'}{def.unit}
      </Text>
    </View>
  );
}

export default function RacingLayout({ metrics, isPortrait, animate }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const rpm = metrics.find((m) => m.def.key === 'rpm');
  const speedDisplay = useCountingNumber(speed?.value ?? null, 0, animate);
  const rpmDisplay = useCountingNumber(rpm?.value ?? null, 0, animate);
  const rpmFrac = rpm ? Math.max(0, Math.min(1, (rpm.value ?? 0) / rpm.def.max)) : 0;
  const litSegments = Math.round(rpmFrac * SHIFT_SEGMENTS);
  const secondary = metrics.filter((m) => !PRIMARY_METRIC_KEYS.includes(m.def.key));
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 20 }]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <Pattern id="carbon" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Rect width={14} height={14} fill={PALETTE.stripeA} />
            <Rect width={7} height={14} fill={PALETTE.stripeB} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#carbon)" />
      </Svg>

      <View style={styles.speedBadge}>
        <Text style={[styles.speedVal, { color: PALETTE.speedColor, fontFamily: monoFontFamily }]}>
          {speedDisplay ?? '-'}
        </Text>
        <Text style={[styles.speedUnit, { color: PALETTE.textDim }]}>km/h</Text>
      </View>

      <View style={styles.center}>
        <Text
          style={[styles.rpmVal, { color: PALETTE.rpmColor, fontFamily: monoFontFamily, textShadowColor: PALETTE.rpmColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {rpmDisplay != null ? Number(rpmDisplay).toLocaleString('vi-VN') : '-'}
        </Text>
        <Text style={[styles.rpmUnit, { color: PALETTE.textDim }]}>{t('obd.stat_rpm')}</Text>

        <View style={styles.shiftRow}>
          {Array.from({ length: SHIFT_SEGMENTS }, (_, i) => {
            const lit = i < litSegments;
            const hot = i >= SHIFT_HOT_FROM;
            const color = lit ? (hot ? PALETTE.shiftHot : PALETTE.shiftOn) : PALETTE.shiftOff;
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
          {featured.map((item) => <MiniStat key={item.def.key} item={item} animate={animate} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, overflow: 'hidden', width: '100%', minHeight: 220, paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', gap: 14 },
  speedBadge: { position: 'absolute', top: 14, right: 16, alignItems: 'flex-end' },
  speedVal: { fontSize: 22, fontWeight: '800' },
  speedUnit: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: -2 },
  center: { alignItems: 'center', gap: 6 },
  rpmVal: { fontSize: 56, fontWeight: '800', letterSpacing: -1, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 },
  rpmUnit: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  shiftRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  shiftSeg: { width: 20, height: 10, borderRadius: 3 },
  secondaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  mini: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', backgroundColor: '#00000055' },
  miniLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});
