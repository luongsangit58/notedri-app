import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import ArcGauge from '../primitives/ArcGauge';
import { serifFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { PRIMARY_METRIC_KEYS, FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';

// Premium "Cổ điển" - bản sắc CỐ ĐỊNH (mặt kem/crôm, kim đỏ mảnh) gợi bảng
// đồng hồ xe cổ thập niên 60-70, không đổi theo theme sáng/tối app.
const PALETTE = {
  bg1: '#F3E7C9', bg2: '#E7D6A6', chrome: '#B08D4F', needle: '#B3231C',
  text: '#2A2016', textDim: '#6B5A3D', track: '#E3D3A9',
};

export default function RetroLayout({ metrics, size, isPortrait, animate }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const rpm = metrics.find((m) => m.def.key === 'rpm');
  const secondary = metrics.filter((m) => !PRIMARY_METRIC_KEYS.includes(m.def.key));
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <View style={[styles.root, { borderColor: PALETTE.chrome }, isPortrait && { paddingVertical: 20 }]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id="cream" cx="50%" cy="38%" r="75%">
            <Stop offset="0%" stopColor={PALETTE.bg1} />
            <Stop offset="100%" stopColor={PALETTE.bg2} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cream)" />
      </Svg>

      <View style={[styles.gaugesRow, isPortrait && styles.gaugesCol]}>
        <ArcGauge
          value={speed?.value ?? null} min={0} max={220} size={size}
          label={t('obd.stat_speed')} unit="km/h"
          trackColor={PALETTE.track} fillColor={PALETTE.chrome} needleColor={PALETTE.needle} tickColor={PALETTE.chrome}
          valueColor={PALETTE.text} labelColor={PALETTE.textDim} valueFontFamily={serifFontFamily}
          glow={false} animate={animate} strokeWidth={4}
        />
        <ArcGauge
          value={rpm?.value ?? null} min={0} max={8000} size={size}
          label={t('obd.stat_rpm')} unit="v/ph"
          trackColor={PALETTE.track} fillColor={PALETTE.chrome} needleColor={PALETTE.needle} tickColor={PALETTE.chrome}
          valueColor={PALETTE.text} labelColor={PALETTE.textDim} valueFontFamily={serifFontFamily}
          glow={false} animate={animate} strokeWidth={4}
        />
      </View>

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }) => (
            <View key={def.key} style={[styles.mini, { borderColor: PALETTE.chrome, backgroundColor: PALETTE.bg1 + 'CC' }]}>
              <Text style={[styles.miniLabel, { color: PALETTE.textDim, fontFamily: serifFontFamily }]} numberOfLines={1}>{t(def.labelKey)}</Text>
              <Text style={[styles.miniVal, { color: PALETTE.text, fontFamily: serifFontFamily }]} numberOfLines={1}>
                {value != null ? Math.round(value * 10) / 10 : '-'}{def.unit}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, borderWidth: 3, overflow: 'hidden', width: '100%', minHeight: 220, paddingVertical: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', gap: 14 },
  gaugesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  gaugesCol: { flexDirection: 'column' },
  secondaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  mini: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center' },
  miniLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});
