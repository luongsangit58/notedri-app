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

  const items = useMemo(
    () => Array.from({ length: cols * rows }, (_, i) => ({
      icon: BG_ICONS[i % BG_ICONS.length],
      rotate: BG_ROTATIONS[i % 4],
      x: (i % cols) * 96,
      y: Math.floor(i / cols) * 96,
    })),
    [cols, rows],
  );

  // Nền sáng cần đậm hơn chút để thấy được, nền tối thì nhạt cho dịu mắt.
  const fade = opacity ?? (mode === 'light' ? 0.04 : 0.055);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade }}>
      {items.map((item, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: item.x,
            top: item.y,
            width: 96,
            height: 96,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: `${item.rotate}deg` }],
          }}>
          <FontAwesome5 name={item.icon} size={28} color={colors.text} solid />
        </View>
      ))}
    </View>
  );
}
