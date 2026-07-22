import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { monoFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Ban đêm" - bản sắc CỐ ĐỊNH (đơn sắc đỏ trên nền đen tuyệt đối),
// nguyên lý buồng lái máy bay ban đêm, giữ mắt quen bóng tối khi lái xa -
// không đổi theo theme sáng/tối app (đây LÀ chế độ tối, luôn tối).
const PALETTE = { bg: '#000000', red: '#FF3B30', redDim: '#8A2620' };

function MiniStat({ label, value, unit, animate }: {
  label: string;
  value: number | null;
  unit: string;
  animate?: boolean;
}) {
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniLabel, { color: PALETTE.redDim, fontFamily: monoFontFamily }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniVal, { color: PALETTE.red, fontFamily: monoFontFamily }]} numberOfLines={1}>
        {display ?? '-'}{unit}
      </Text>
    </View>
  );
}

export default function NightLayout({ metrics, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const secondary = metrics.filter((m) => m.def.key !== 'speedKmh');
  const speedDisplay = useCountingNumber(speed?.value ?? null, 0, animate);
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <Text
        style={[styles.speedVal, { color: PALETTE.red, fontFamily: monoFontFamily, textShadowColor: PALETTE.red }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {speedDisplay ?? '-'}
      </Text>
      <Text style={[styles.speedUnit, { color: PALETTE.redDim, fontFamily: monoFontFamily }]}>KM/H</Text>

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }) => (
            <MiniStat key={def.key} label={t(def.labelKey)} value={value} unit={def.unit} animate={animate} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 2 },
  speedVal: { fontSize: 60, fontWeight: '800', letterSpacing: -1, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 },
  speedUnit: { fontSize: 11, letterSpacing: 2, marginTop: -4 },
  secondaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 },
  mini: { alignItems: 'center' },
  miniLabel: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  miniVal: { fontSize: 15, fontWeight: '700', marginTop: 2 },
});
