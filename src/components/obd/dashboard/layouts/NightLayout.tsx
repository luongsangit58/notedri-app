import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { monoFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { pickFeaturedSecondary } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';
import ArcGauge from '../primitives/ArcGauge';

// Premium "Ban đêm" - bản sắc CỐ ĐỊNH (đơn sắc trên nền đen tuyệt đối),
// nguyên lý buồng lái máy bay ban đêm, giữ mắt quen bóng tối khi lái xa -
// không đổi theo theme sáng/tối app (đây LÀ chế độ tối, luôn tối).
// Rà soát 24/7 (góp ý user: đỏ trên đen khó đọc, số không sắc nét) - đổi
// sang hổ phách/vàng cam (amber), vẫn giữ đúng nguyên lý ánh sáng ấm/bước
// sóng dài bảo vệ thị lực đêm như cách phi công dùng, nhưng độ sáng/tương
// phản với nền đen cao hơn hẳn đỏ thuần (mắt người nhạy với vàng-cam hơn đỏ
// ở điều kiện thiếu sáng) - dễ đọc số hơn mà không mất tinh thần "buồng lái
// ban đêm" ban đầu.
// Rà soát 29/7 (góp ý user, ảnh thật màn Đồng hồ đầu Android ô tô: nền đen
// tuyệt đối + KHÔNG viền -> hoà lẫn vào nền đen chung quanh, mất luôn ranh
// giới khung đồng hồ) - thêm viền hổ phách mờ, đủ tách khung khỏi nền đen mà
// không phá nguyên lý "buồng lái ban đêm" (vẫn tông ấm, rất mờ).
const PALETTE = { bg: '#000000', red: '#FFB300', redDim: '#8A6100', border: '#FFB30026' };

function MiniStat({ label, value, unit, textSize, valSize, animate }: {
  label: string;
  value: number | null;
  unit: string;
  textSize: number;
  valSize: number;
  animate?: boolean;
}) {
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniLabel, { color: PALETTE.redDim, fontFamily: monoFontFamily, fontSize: textSize }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniVal, { color: PALETTE.red, fontFamily: monoFontFamily, fontSize: valSize }]} numberOfLines={1}>
        {display ?? '-'}{unit}
      </Text>
    </View>
  );
}

// Rà soát 24/7 (góp ý user: theme phải LÀ đồng hồ đo (kim/cung), không chỉ
// hiện số như đồng hồ điện tử) - đổi số tốc độ khổng lồ sang ArcGauge (đúng
// primitive đã dùng ở Analog/Retro), giữ nguyên bản sắc "buồng lái ban đêm"
// qua màu hổ phách/nền đen tuyệt đối + glow + font mono, không đổi theo bố cục.
export default function NightLayout({ metrics, size, heroSize, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const secondary = metrics.filter((m) => m.def.key !== 'speedKmh');
  const featured = pickFeaturedSecondary(secondary);
  const secondaryTextSize = Math.max(9, Math.min(16, size * 0.05));
  const miniValSize = Math.max(15, Math.min(24, size * 0.08));

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <ArcGauge
        value={speed?.value ?? null} min={0} max={220} size={heroSize}
        label={t('obd.stat_speed')} unit="km/h" valueFontFamily={monoFontFamily}
        trackColor={PALETTE.redDim + '55'} fillColor={PALETTE.red} needleColor={PALETTE.red} tickColor={PALETTE.redDim}
        valueColor={PALETTE.red} labelColor={PALETTE.redDim} animate={animate}
        // Vẫn giữ tông ấm (nguyên lý bảo vệ thị lực đêm) khi "sink động" hơn -
        // cam rồi mới tới đỏ tươi, không nhảy sang màu lạnh phá tinh thần buồng lái ban đêm.
        zones={[{ min: 80, color: '#FF7A1A' }, { min: 100, color: '#FF3B30' }]}
      />

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }) => (
            <MiniStat key={def.key} label={t(def.labelKey)} value={value} unit={def.unit} textSize={secondaryTextSize} valSize={miniValSize} animate={animate} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rà soát 6/8: bỏ borderRadius/borderWidth - nền theme (PALETTE.bg) giờ
  // tràn hết màn Đồng hồ thay vì "đóng khung" cách mép (xem GaugeCluster.tsx).
  root: { flex: 1, width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 2 },
  secondaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 },
  mini: { alignItems: 'center' },
  miniLabel: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  miniVal: { fontSize: 15, fontWeight: '700', marginTop: 2 },
});
