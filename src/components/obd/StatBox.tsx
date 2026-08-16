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
  // Rà soát 19/8 (góp ý user: thẻ số liệu nhìn to/thô, chiếm nhiều diện tích) -
  // icon trần màu chói (size 16, không nền) đổi sang icon nhỏ trong khối màu
  // NHẠT (color+'22' - cùng công thức tint đã dùng ở FleetLayout.tsx), giảm
  // "gào" thị giác. Layout ngang (icon trái, số liệu+nhãn xếp phải) thay vì dọc
  // giữa - cùng dáng đã kiểm chứng ở FleetLayout, gọn chiều cao hơn hẳn kiểu cũ
  // xếp dọc 3 tầng. Số liệu vẫn là điểm nhấn chính (đậm, màu text chính), icon
  // + nhãn chỉ là chi tiết phụ hỗ trợ - không cạnh tranh thị giác với số liệu.
  return (
    <View style={[styles.box, { backgroundColor: colors.card }]}>
      <View style={[styles.iconChip, { backgroundColor: color + '22' }]}>
        <FontAwesome5 name={icon} size={11} color={color} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {displayValue !== null ? `${displayValue}${unit ?? ''}` : '-'}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 80,
  },
  iconChip: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, minWidth: 0 },
  value: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 10, marginTop: 1 },
});
