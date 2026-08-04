import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { gpsTripsApi } from '../../api/gpsTrips';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

/**
 * Hành trình GPS "song hành" với 1 phiên OBD (rà soát 4/8, góp ý user: 2 tính năng
 * cứ như tách biệt hoàn toàn). CHỈ hiển thị tương quan theo thời gian, KHÔNG merge dữ
 * liệu - GPS vẫn là nguồn CHUYẾN ĐI duy nhất, OBD vẫn độc lập (useObd.ts:115). User
 * chỉ dùng OBD (xe đỗ tra lỗi) hoặc chỉ dùng GPS (không gắn OBD) vẫn hoạt động bình
 * thường, tách biệt - phần này chỉ là lớp hiển thị thêm khi CẢ 2 cùng có dữ liệu.
 */
export default function CorrelatedGpsTrips({
  vehicleId, vehicleName, connectedAt, durationSeconds,
}: {
  vehicleId: number;
  vehicleName: string;
  connectedAt: string;
  durationSeconds: number;
}) {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const t = useT();

  // Đệm ±10 phút: GPS bắt đầu ghi trễ hơn lúc cắm OBD vài phút (ngưỡng
  // WAITING_START_MS ở GpsTripTracker), và có thể còn "waiting_stop" sau khi
  // OBD đã ngắt (đỗ chờ vài phút trước khi tắt hẳn máy).
  const since = dayjs(connectedAt).subtract(10, 'minute').toISOString();
  const until = dayjs(connectedAt).add(durationSeconds, 'second').add(10, 'minute').toISOString();

  const { data } = useQuery({
    queryKey: ['gps-trips-range', vehicleId, connectedAt, durationSeconds],
    queryFn: () => gpsTripsApi.tripsInRange(vehicleId, since, until).then((r) => r.data.data),
    enabled: !!vehicleId,
    staleTime: 60_000,
  });

  const trips = data ?? [];
  if (trips.length === 0) return null;

  const totalKm = trips.reduce((sum, tr) => sum + (tr.distance_km ?? 0), 0);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={() => navigation.navigate('GpsTrips', { vehicleId, vehicleName })}>
      <FontAwesome5 name="route" size={13} color={colors.primary} />
      <Text style={[styles.text, { color: colors.text }]}>
        {t('obd.correlated_gps_trips', { n: trips.length, km: totalKm.toFixed(1) })}
      </Text>
      <FontAwesome5 name="chevron-right" size={11} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12 },
  text: { fontSize: 13, flex: 1 },
});
