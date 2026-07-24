import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Tối giản EV" - bản sắc RIÊNG gợi cụm đồng hồ xe điện đời mới
// (Tesla/Polestar: thanh tốc độ NGANG thay vì kim/số tròn). Góp ý user (23/7):
// thêm bản TỐI song song bản sáng gốc. Rà soát tiếp (góp ý user: trùng khung
// với style "Ban đêm" - cả 2 đều "1 số to giữa màn + hàng phụ nhỏ") - đổi hẳn
// bố cục sang thanh ngang lớn làm chủ đạo (không phải số tròn cô lập) để 2
// style không còn là bản recolor của nhau, dù cùng tinh thần "tối giản".
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

// Rà soát 24/7 (góp ý user: số "43" cô đơn giữa mảng đen mênh mông trên đầu
// xe, ảnh chụp thật xác nhận) - layout này KHÔNG nhận `size` (gaugeSize) như
// các layout có kim/cung khác, chữ khoá cứng 48px bất kể màn hình to bao
// nhiêu -> chưa ăn theo lần nâng trần gaugeSize (useCockpitLayout.ts) trước
// đó. Nhận `size` và tỉ lệ theo nó, giống mọi layout khác.
export default function MinimalLayout({ metrics, size, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const speedValSize = Math.max(48, Math.min(140, size * 0.55));
  const speedUnitSize = Math.max(15, Math.min(30, size * 0.1));
  const secondaryTextSize = Math.max(11, Math.min(18, size * 0.06));
  const miniValSize = Math.max(11, Math.min(20, size * 0.07));
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
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const markerLeft = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <Text style={[styles.speedVal, { color: PALETTE.text, fontSize: speedValSize }]} numberOfLines={1} adjustsFontSizeToFit>
        {speedDisplay ?? '-'}
        <Text style={[styles.speedUnit, { color: PALETTE.textDim, fontSize: speedUnitSize }]}> km/h</Text>
      </Text>

      {/* Thanh tốc độ NGANG làm chủ đạo (thay vì số tròn cô lập như "Ban đêm") -
          đúng gu cụm đồng hồ EV hiện đại (Tesla/Polestar). Marker nằm NGOÀI
          track (không bị overflow:hidden của track cắt mất ở 2 đầu thang). */}
      <View style={styles.trackWrap}>
        <View style={[styles.track, { backgroundColor: PALETTE.track }]}>
          <Animated.View style={[styles.fill, { backgroundColor: PALETTE.text, width: fillWidth }]} />
        </View>
        <Animated.View pointerEvents="none" style={[styles.marker, { backgroundColor: PALETTE.bg, borderColor: PALETTE.text, left: markerLeft }]} />
      </View>

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
  speedVal: { fontSize: 48, fontWeight: '200', letterSpacing: -1 },
  speedUnit: { fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },
  trackWrap: { width: '78%', height: 18, justifyContent: 'center', marginTop: 24 },
  track: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  marker: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, marginLeft: -8 },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' },
  secondaryText: { fontSize: 11, letterSpacing: 0.2 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniVal: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
