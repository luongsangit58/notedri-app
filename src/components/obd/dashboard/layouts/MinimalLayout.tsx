import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';
import ArcGauge from '../primitives/ArcGauge';

// Premium "Tối giản EV" - bản sắc RIÊNG: cung đồng hồ MẢNH, không tick, không
// glow (đơn sắc, tối giản đúng tinh thần EV hiện đại) - phân biệt với "Ban
// đêm" (cung dày, glow hổ phách rực) và "HUD Đua xe" (cung carbon đỏ/cam) qua
// PHONG CÁCH thay vì bố cục, vì rà soát 24/7 (góp ý user): mọi theme PHẢI LÀ
// đồng hồ đo có kim/cung, không được chỉ hiện số như đồng hồ điện tử - thanh
// ngang trước đây (dù không phải số thuần) vẫn không phải "đồng hồ", đổi hẳn
// sang ArcGauge như 2 style Analog/Retro.
const LIGHT_PALETTE = { bg: '#F4F4F2', text: '#111111', textDim: '#6B7280', track: '#11111116' };
const DARK_PALETTE = { bg: '#111112', text: '#F4F4F2', textDim: '#9AA0AC', track: '#F4F4F216' };

function MiniStat({ label, value, unit, palette, textSize, valSize, animate }: {
  label: string;
  value: number | null;
  unit: string;
  palette: typeof LIGHT_PALETTE;
  textSize: number;
  valSize: number;
  animate?: boolean;
}) {
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={styles.mini}>
      <Text style={[styles.secondaryText, { color: palette.textDim, fontSize: textSize }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniVal, { color: palette.text, fontSize: valSize }]} numberOfLines={1}>
        {display ?? '-'}{unit}
      </Text>
    </View>
  );
}

export default function MinimalLayout({ metrics, size, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const secondaryTextSize = Math.max(11, Math.min(18, size * 0.06));
  const miniValSize = Math.max(11, Math.min(20, size * 0.07));
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const secondary = metrics.filter((m) => m.def.key !== 'speedKmh');
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <ArcGauge
        value={speed?.value ?? null} min={0} max={220} size={size}
        label={t('obd.stat_speed')} unit="km/h"
        trackColor={PALETTE.track} fillColor={PALETTE.text} needleColor={PALETTE.text} tickColor={PALETTE.textDim}
        valueColor={PALETTE.text} labelColor={PALETTE.textDim} animate={animate}
        strokeWidth={Math.max(5, size * 0.025)} glow={false} showTicks={false} showMinMax={false}
      />

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }, i) => (
            <React.Fragment key={def.key}>
              {i > 0 && <View style={[styles.dot, { backgroundColor: PALETTE.textDim }]} />}
              <MiniStat label={t(def.labelKey)} value={value} unit={def.unit} palette={PALETTE} textSize={secondaryTextSize} valSize={miniValSize} animate={animate} />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: 18, width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' },
  secondaryText: { fontSize: 11, letterSpacing: 0.2 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniVal: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
