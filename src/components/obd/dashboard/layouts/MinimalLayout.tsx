import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Tối giản EV" - bản sắc CỐ ĐỊNH (nền trắng/xám khói, gần như chỉ 1
// con số) gợi cụm đồng hồ xe điện đời mới, không đổi theo theme sáng/tối app.
const PALETTE = { bg: '#F4F4F2', line: '#111111', text: '#111111', textDim: '#6B7280' };

function MiniStat({ label, value, unit, animate }: {
  label: string;
  value: number | null;
  unit: string;
  animate?: boolean;
}) {
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={styles.mini}>
      <Text style={[styles.secondaryText, { color: PALETTE.textDim }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniVal, { color: PALETTE.text }]} numberOfLines={1}>
        {display ?? '-'}{unit}
      </Text>
    </View>
  );
}

export default function MinimalLayout({ metrics, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const speedDisplay = useCountingNumber(speed?.value ?? null, 0, animate);
  const frac = speed ? Math.max(0, Math.min(1, (speed.value ?? 0) / speed.def.max)) : 0;
  const secondary = metrics.filter((m) => m.def.key !== 'speedKmh');
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  const progress = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    if (!animate) { progress.setValue(frac); return; }
    Animated.timing(progress, { toValue: frac, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, animate]);
  const lineWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <Text style={[styles.speedVal, { color: PALETTE.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {speedDisplay ?? '-'}
      </Text>
      <Text style={[styles.speedUnit, { color: PALETTE.textDim }]}>km/h</Text>
      <View style={[styles.track, { backgroundColor: PALETTE.text + '22' }]}>
        <Animated.View style={[styles.fill, { backgroundColor: PALETTE.text, width: lineWidth }]} />
      </View>
      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }, i) => (
            <React.Fragment key={def.key}>
              {i > 0 && <View style={[styles.dot, { backgroundColor: PALETTE.textDim }]} />}
              <MiniStat label={t(def.labelKey)} value={value} unit={def.unit} animate={animate} />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 4 },
  speedVal: { fontSize: 64, fontWeight: '200', letterSpacing: -1 },
  speedUnit: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: -6 },
  track: { width: '55%', height: 2, borderRadius: 1, marginTop: 18, overflow: 'hidden' },
  fill: { height: 2, borderRadius: 1 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' },
  secondaryText: { fontSize: 11, letterSpacing: 0.2 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniVal: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
