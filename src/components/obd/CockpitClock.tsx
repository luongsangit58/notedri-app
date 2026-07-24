import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import dayjs from 'dayjs';

// Màn Đồng hồ ẩn StatusBar hệ thống (full màn hình) nên user mất luôn đồng hồ
// giờ của máy - bù lại bằng 1 chữ HH:mm nhỏ trong toolbar dùng chung, tự động
// có mặt ở cả 8 style vì đặt ở GaugeCluster, không phải trong từng Layout.
// 30s đủ mượt cho hiển thị phút, khỏi re-render mỗi giây không cần thiết.
export default function CockpitClock({ color }: { color: string }) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{now.format('HH:mm')}</Text>
  );
}
