import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';

export default function StatBox({
  label,
  value,
  unit,
  icon,
  color = '#3B82F6',
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  icon: string;
  color?: string;
}) {
  const colors = useColors();
  // Công thức đổi PID OBD (vd A*100/255 cho tải máy/bướm ga) sinh nhiễu số
  // thực (13.7399999999999998) do lỗi làm tròn dấu phẩy động - hiển thị thẳng
  // giá trị raw như trước sẽ tràn ô. Làm tròn 1 chữ số thập phân trước khi in.
  const displayValue =
    typeof value === 'number' ? Math.round(value * 10) / 10 : value;
  return (
    <View style={[styles.box, { backgroundColor: colors.card }]}>
      <FontAwesome5 name={icon} size={16} color={color} />
      <Text style={[styles.value, { color: colors.text }]}>
        {displayValue !== null ? `${displayValue}${unit ?? ''}` : '-'}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4, minWidth: 80 },
  value: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 11, textAlign: 'center' },
});
