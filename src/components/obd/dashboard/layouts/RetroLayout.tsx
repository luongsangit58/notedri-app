import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import ArcGauge from '../primitives/ArcGauge';
import { serifFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { PRIMARY_METRIC_KEYS, FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Cổ điển" - bản sắc RIÊNG (mặt kem/crôm, kim đỏ mảnh) gợi bảng đồng
// hồ xe cổ thập niên 60-70. Góp ý user (23/7): thêm bản TỐI song song (mặt số
// nâu sẫm/đen thay vì kem, vẫn kim đỏ + viền đồng thau - gợi bảng đồng hồ xe
// cổ khi lái đêm, đèn dạ quang nâu ấm thay vì ánh sáng ban ngày).
const LIGHT_PALETTE = {
  bg1: '#F3E7C9', bg2: '#E7D6A6', chrome: '#B08D4F', needle: '#B3231C',
  text: '#2A2016', textDim: '#6B5A3D', track: '#E3D3A9',
};
const DARK_PALETTE = {
  bg1: '#2A2016', bg2: '#1A140D', chrome: '#8A6D3F', needle: '#E0453A',
  text: '#EDE0C8', textDim: '#A6957A', track: '#3A2E1E',
};

// Component RIÊNG cho từng ô - không gọi
// hook trực tiếp trong .map vì số ô có thể đổi giữa các lần render).
function MiniStat({ item, palette, animate }: { item: CockpitMetricValue; palette: typeof LIGHT_PALETTE; animate?: boolean }) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={[styles.mini, { borderColor: palette.chrome, backgroundColor: palette.bg1 + 'CC' }]}>
      <Text style={[styles.miniLabel, { color: palette.textDim, fontFamily: serifFontFamily }]} numberOfLines={1}>{t(def.labelKey)}</Text>
      <Text style={[styles.miniVal, { color: palette.text, fontFamily: serifFontFamily }]} numberOfLines={1}>
        {display ?? '-'}{def.unit}
      </Text>
    </View>
  );
}

export default function RetroLayout({ metrics, size, isPortrait, animate }: CockpitLayoutProps) {
  const t = useT();
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const rpm = metrics.find((m) => m.def.key === 'rpm');
  const secondary = metrics.filter((m) => !PRIMARY_METRIC_KEYS.includes(m.def.key));
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);

  // Rà soát 24/7 (góp ý user: nền mặt số không phủ hết bề ngang thẻ, để lộ
  // khoảng trống ở cạnh phải - ảnh chụp thật xác nhận) - xem comment tương tự
  // trong RacingLayout.tsx: đo kích thước THẬT bằng onLayout, truyền số px cụ
  // thể vào Svg thay vì chuỗi "100%" (không đáng tin cậy theo View cha trên
  // Android tuỳ thời điểm đo layout).
  const [bg, setBg] = useState({ w: 0, h: 0 });
  const onRootLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== bg.w || height !== bg.h) setBg({ w: width, h: height });
  };

  return (
    <View style={[styles.root, { borderColor: PALETTE.chrome }, isPortrait && { paddingVertical: 20 }]} onLayout={onRootLayout}>
      {bg.w > 0 && bg.h > 0 && (
        <Svg width={bg.w} height={bg.h} style={StyleSheet.absoluteFillObject}>
          <Defs>
            <RadialGradient id="cream" cx="50%" cy="38%" r="75%">
              <Stop offset="0%" stopColor={PALETTE.bg1} />
              <Stop offset="100%" stopColor={PALETTE.bg2} />
            </RadialGradient>
          </Defs>
          <Rect width={bg.w} height={bg.h} fill="url(#cream)" />
        </Svg>
      )}

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
          label={t('obd.stat_rpm')} unit="v/ph" quantizeStep={rpm?.def.quantizeStep}
          trackColor={PALETTE.track} fillColor={PALETTE.chrome} needleColor={PALETTE.needle} tickColor={PALETTE.chrome}
          valueColor={PALETTE.text} labelColor={PALETTE.textDim} valueFontFamily={serifFontFamily}
          glow={false} animate={animate} strokeWidth={4}
        />
      </View>

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map((item) => <MiniStat key={item.def.key} item={item} palette={PALETTE} animate={animate} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: 18, borderWidth: 3, overflow: 'hidden', width: '100%', minHeight: 220, paddingVertical: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', gap: 14 },
  gaugesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  gaugesCol: { flexDirection: 'column' },
  secondaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  mini: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center' },
  miniLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontWeight: '700', marginTop: 2 },
});
