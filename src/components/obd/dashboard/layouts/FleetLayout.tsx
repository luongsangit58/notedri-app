import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import RingProgress from '../primitives/RingProgress';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium · Doanh nghiệp "Thương hiệu riêng" - khung UI cho gara/hãng
// taxi/đội xe, bán theo hợp đồng B2B riêng (không theo user lẻ). Badge logo
// CHỈ là placeholder - luồng upload logo/màu thương hiệu thật là 1 tính năng
// backend/hợp đồng riêng, ngoài phạm vi UI lần này (đúng comment gốc trong
// gaugeThemes.ts về premium-gate là bước tối thiểu). Góp ý user (23/7): thêm
// bản sáng song song - nhiều gara/đội xe muốn giao diện sáng cho không gian
// văn phòng ban ngày thay vì luôn tối.
const DARK_PALETTE = { bg1: '#1A1A1A', bg2: '#2B2B2B', surface: '#232323', border: '#3A3A3A', text: '#F5F5F5', textDim: '#9CA3AF', accent: '#9CA3AF' };
const LIGHT_PALETTE = { bg1: '#F2F2F2', bg2: '#FFFFFF', surface: '#F7F7F7', border: '#DDDDDD', text: '#1A1A1A', textDim: '#6B7280', accent: '#4B5563' };

// Component RIÊNG cho từng thẻ - xem lý do trong CardsLayout.tsx (không gọi
// hook trực tiếp trong .map vì số lượng `metrics` có thể đổi giữa các lần render).
function MetricCard({ item, ringSize, cols, palette, animate }: { item: CockpitMetricValue; ringSize: number; cols: number; palette: typeof DARK_PALETTE; animate?: boolean }) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={{ width: `${100 / cols}%`, padding: 6 }}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <RingProgress value={value} max={def.max} size={ringSize} trackColor={palette.border} fillColor={palette.accent} animate={animate}>
          <FontAwesome5 name={def.icon} size={ringSize * 0.32} color={palette.accent} solid />
        </RingProgress>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.val, { color: palette.text }]} numberOfLines={1}>
            {display ?? '-'}
            <Text style={{ fontSize: 10, fontWeight: '600', color: palette.textDim }}> {def.unit}</Text>
          </Text>
          <Text style={[styles.label, { color: palette.textDim }]} numberOfLines={1}>{t(def.labelKey)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FleetLayout({ metrics, ringSize, isPortrait, animate }: CockpitLayoutProps) {
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const cols = isPortrait ? 2 : 4;

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg2 }]}>
      <View style={[styles.badge, { borderColor: PALETTE.textDim }]}>
        <Text style={[styles.badgeText, { color: PALETTE.textDim }]}>LOGO{'\n'}GARA</Text>
      </View>

      <View style={styles.grid}>
        {metrics.map((item) => (
          <MetricCard key={item.def.key} item={item} ringSize={ringSize} cols={cols} palette={PALETTE} animate={animate} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', borderRadius: 18, padding: 14, gap: 12, width: '100%' },
  badge: { alignSelf: 'flex-start', width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  val: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
});
