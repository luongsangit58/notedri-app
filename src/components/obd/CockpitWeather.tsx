import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import client from '../../api/client';

const FA5_ICON_MAP: Record<string, string> = {
  'cloud-bolt': 'bolt',
  'cloud-showers-heavy': 'cloud-rain',
};

// Tái dùng nguyên pattern thời tiết đã chạy tốt ở HomeScreen.tsx: CHỈ đọc
// quyền vị trí đã có sẵn (getForegroundPermissionsAsync, không tự xin quyền -
// widget phụ không được ép user quyết định giữa lúc đang lái), ẩn hẳn khi
// chưa có quyền/chưa có dữ liệu thay vì hiện loading gây rối trên màn lái xe.
export default function CockpitWeather({ color }: { color: string }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <FontAwesome5 name={icon} size={13} color={color} solid />
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{data.temp}°</Text>
    </View>
  );
}
