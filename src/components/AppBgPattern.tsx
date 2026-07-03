import React, { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useThemeStore } from '../utils/theme';

// Hoạ tiết nền thương hiệu (icon xe/xăng/bảo dưỡng) - giống trang đăng nhập.
// Tự hợp sáng/tối: icon dùng màu chữ theme + độ mờ thấp nên luôn chìm sau nội dung.
const BG_ICONS = [
  'gas-pump', 'tint', 'motorcycle', 'car', 'oil-can',
  'wrench', 'car-side', 'gas-pump', 'tint', 'motorcycle',
] as const;
const BG_ROTATIONS = [0, 15, -10, 20];

export default function AppBgPattern({ opacity }: { opacity?: number }) {
  const colors = useColors();
  const mode = useThemeStore((s) => s.mode);
  // useWindowDimensions cập nhật khi xoay ngang/dọc -> hoạ tiết nền phủ đúng
  // kích thước hiện tại (Dimensions.get tĩnh giữ kích thước dọc -> thiếu ở landscape).
  const { width, height } = useWindowDimensions();
  const cols = Math.ceil(width / 96) + 1;
  const rows = Math.ceil(height / 96) + 2;

  // Memo hoá LƯỚI ĐÃ RENDER (không chỉ mảng): useWindowDimensions khiến component re-render mỗi
  // lần đổi kích thước (xoay/bàn phím/cỡ chữ). Chỉ dựng lại ~100 icon khi cols/rows hoặc màu đổi
  // -> tránh reconcile toàn bộ lưới ở những re-render không liên quan (bàn phím bật/tắt...).
  const grid = useMemo(
    () => Array.from({ length: cols * rows }, (_, i) => (
      <View
        key={i}
        style={{
          position: 'absolute',
          left: (i % cols) * 96,
          top: Math.floor(i / cols) * 96,
          width: 96,
          height: 96,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: `${BG_ROTATIONS[i % 4]}deg` }],
        }}>
        <FontAwesome5 name={BG_ICONS[i % BG_ICONS.length]} size={28} color={colors.text} solid />
      </View>
    )),
    [cols, rows, colors.text],
  );

  // Nền sáng cần đậm hơn chút để thấy được, nền tối thì nhạt cho dịu mắt.
  const fade = opacity ?? (mode === 'light' ? 0.04 : 0.055);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade }}>
      {grid}
    </View>
  );
}
