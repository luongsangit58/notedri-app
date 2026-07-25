import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import dayjs from 'dayjs';

// Màn Đồng hồ ẩn StatusBar hệ thống (full màn hình) nên user mất luôn đồng hồ
// giờ của máy - bù lại bằng 1 chữ HH:mm trong toolbar dùng chung, tự động có
// mặt ở cả 8 style vì đặt ở GaugeCluster, không phải trong từng Layout.
// 30s đủ mượt cho hiển thị phút, khỏi re-render mỗi giây không cần thiết.
// Rà soát 24/7 (góp ý user: chữ vẫn nhỏ trên màn đầu xe to) - nhận `fontSize`
// từ GaugeCluster (tỉ lệ theo heroGaugeSize/kích thước màn hình thật) thay vì
// khoá cứng 1 mức cho mọi kích thước màn hình.
export default function CockpitClock({ color, fontSize = 18 }: { color: string; fontSize?: number }) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={{ color, fontWeight: '800', fontSize, letterSpacing: 0.3 }}>{now.format('HH:mm')}</Text>
  );
}
