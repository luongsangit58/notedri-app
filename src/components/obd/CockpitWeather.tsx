import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import client from '../../api/client';
import { PermissionManager } from '../../services/permissions/PermissionManager';

const FA5_ICON_MAP: Record<string, string> = {
  'cloud-bolt': 'bolt',
  'cloud-showers-heavy': 'cloud-rain',
};

// Tái dùng nguyên pattern thời tiết đã chạy tốt ở HomeScreen.tsx: CHỈ đọc
// quyền vị trí đã có sẵn (getForegroundPermissionsAsync, không tự xin quyền -
// widget phụ không được ép user quyết định giữa lúc đang lái), ẩn hẳn khi
// chưa có quyền/chưa có dữ liệu thay vì hiện loading gây rối trên màn lái xe.
export default function CockpitWeather({ color, fontSize = 18 }: { color: string; fontSize?: number }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    PermissionManager.getLocationForegroundStatus().then(({ granted }) => {
      if (!granted) return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
        .catch(() => {});
    });
  }, []);

  const { data } = useQuery({
    queryKey: ['weather', coords?.lat, coords?.lng],
    queryFn: () => client.get('/weather', { params: { lat: coords!.lat, lng: coords!.lng } }).then((r) => r.data?.data ?? null),
    enabled: !!coords,
    staleTime: 1000 * 60 * 30,
  });

  if (!data || data.temp == null) return null;
  const rawIcon = (data.condition?.icon ?? 'fa-sun').replace('fa-', '');
  const icon = FA5_ICON_MAP[rawIcon] ?? rawIcon;
  // Rà soát 30/7 (ảnh thật: thời tiết từng đứng CHUNG 1 pill với giờ, icon đè
  // lên chữ giờ) - tự vẽ pill RIÊNG của mình ở đây thay vì nhận từ ngoài, nhờ
  // đó khi chưa có dữ liệu (return null ở trên) không để lại 1 pill rỗng lơ
  // lửng cạnh đồng hồ.
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: color + '33', borderColor: color + '77',
      }}
    >
      <FontAwesome5 name={icon} size={fontSize * 0.94} color={color} solid />
      <Text style={{ color, fontWeight: '800', fontSize }}>{data.temp}°</Text>
    </View>
  );
}
