import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { ObdMetricKey } from '../../../../constants/obdMetrics';

// Premium "Gia đình" - bản sắc CỐ ĐỊNH (pastel nhạt, thẻ bo tròn mềm, chữ to)
// chỉ giữ 4 chỉ số thiết yếu nhất - hợp người lớn tuổi/không rành kỹ thuật,
// không đổi theo theme sáng/tối app.
const PALETTE = { bg: '#EFF6FF', card: '#FFFFFF', value: '#1D4ED8', label: '#6B7280' };

// Chỉ giữ 4 chỉ số quan trọng nhất với người lái phổ thông (khác Analog/Cards
// hiển thị đủ 8) - đúng tinh thần "tối giản, hợp người không rành kỹ thuật".
const FAMILY_KEYS: ObdMetricKey[] = ['speedKmh', 'fuelLevelPct', 'coolantTempC', 'controlModuleVoltage'];

export default function FamilyLayout({ metrics, isPortrait }: CockpitLayoutProps) {
  const t = useT();
  const shown = FAMILY_KEYS
    .map((k) => metrics.find((m) => m.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const cols = isPortrait ? 2 : 4;

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }]}>
      {shown.map(({ def, value }) => (
        <View key={def.key} style={{ width: `${100 / cols}%`, padding: 6 }}>
          <View style={[styles.card, { backgroundColor: PALETTE.card }]}>
            <FontAwesome5 name={def.icon} size={22} color={PALETTE.value} solid />
            <Text style={[styles.val, { color: PALETTE.value }]} numberOfLines={1} adjustsFontSizeToFit>
              {value != null ? Math.round(value * 10) / 10 : '-'}
            </Text>
            <Text style={[styles.unit, { color: PALETTE.label }]}>{def.unit}</Text>
            <Text style={[styles.label, { color: PALETTE.label }]} numberOfLines={1}>{t(def.labelKey)}</Text>
          </View>
        </View>
      ))}
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
