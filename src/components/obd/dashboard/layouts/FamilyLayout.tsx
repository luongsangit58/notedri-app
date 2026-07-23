import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useT } from '../../../../i18n';
import { usePremiumPalette } from '../../../../theme/cockpitPalettes';
import { CockpitLayoutProps, CockpitMetricValue } from '../types';
import { ObdMetricKey } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Gia đình" - bản sắc RIÊNG (pastel nhạt, thẻ bo tròn mềm, chữ to)
// chỉ giữ 4 chỉ số thiết yếu nhất - hợp người lớn tuổi/không rành kỹ thuật.
// Góp ý user (23/7): thêm bản TỐI song song - vẫn thẻ bo tròn/chữ to, đổi
// pastel xanh nhạt -> xanh navy sẫm dịu mắt, giữ đúng tinh thần dễ nhìn ban đêm.
const LIGHT_PALETTE = { bg: '#EFF6FF', card: '#FFFFFF', value: '#1D4ED8', label: '#6B7280' };
const DARK_PALETTE = { bg: '#0F1A2E', card: '#1B2740', value: '#60A5FA', label: '#94A3B8' };

// Chỉ giữ 4 chỉ số quan trọng nhất với người lái phổ thông (khác Analog/Cards
// hiển thị đủ 8) - đúng tinh thần "tối giản, hợp người không rành kỹ thuật".
const FAMILY_KEYS: ObdMetricKey[] = ['speedKmh', 'fuelLevelPct', 'coolantTempC', 'controlModuleVoltage'];

// Component RIÊNG cho từng thẻ - xem lý do trong CardsLayout.tsx (không gọi
// hook trực tiếp trong .map vì số thẻ có thể đổi giữa các lần render tuỳ PID xe hỗ trợ).
function FamilyCard({ item, cols, palette, animate }: { item: CockpitMetricValue; cols: number; palette: typeof LIGHT_PALETTE; animate?: boolean }) {
  const t = useT();
  const { def, value } = item;
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={{ width: `${100 / cols}%`, padding: 6 }}>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <FontAwesome5 name={def.icon} size={22} color={palette.value} solid />
        <Text style={[styles.val, { color: palette.value }]} numberOfLines={1} adjustsFontSizeToFit>
          {display ?? '-'}
        </Text>
        <Text style={[styles.unit, { color: palette.label }]}>{def.unit}</Text>
        <Text style={[styles.label, { color: palette.label }]} numberOfLines={1}>{t(def.labelKey)}</Text>
      </View>
    </View>
  );
}

export default function FamilyLayout({ metrics, isPortrait, animate }: CockpitLayoutProps) {
  const PALETTE = usePremiumPalette(DARK_PALETTE, LIGHT_PALETTE);
  const shown = FAMILY_KEYS
    .map((k) => metrics.find((m) => m.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const cols = isPortrait ? 2 : 4;

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }]}>
      {shown.map((item) => <FamilyCard key={item.def.key} item={item} cols={cols} palette={PALETTE} animate={animate} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 18, padding: 6, width: '100%' },
  card: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', gap: 3, shadowColor: '#1E40AF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  val: { fontSize: 24, fontWeight: '800' },
  unit: { fontSize: 11, fontWeight: '600', marginTop: -4 },
  label: { fontSize: 11, marginTop: 2 },
});
