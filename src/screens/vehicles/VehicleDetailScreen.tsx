import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useVehicle, useVehicleHealth, useVehicleReminders } from '../../hooks/useVehicles';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';
import dayjs from 'dayjs';

export default function VehicleDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params;

  const { data: vehicle, isLoading, isError, refetch, isFetching } = useVehicle(vehicleId);
  const { data: health } = useVehicleHealth(vehicleId);
  const { data: remindersData } = useVehicleReminders(vehicleId);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được chi tiết xe" onRetry={refetch} />;

  const v = vehicle?.data ?? vehicle;
  const score = health?.score ?? health?.health_score;
  const scoreColor = score == null ? colors.textSecondary
    : score >= 80 ? colors.success
    : score >= 50 ? colors.warning
    : colors.error;
  const reminders = remindersData?.data ?? remindersData ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Thông tin xe */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{v?.ten ?? v?.name}</Text>
              {(v?.bien_so ?? v?.license_plate) ? (
                <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 14 }}>
                  {v?.bien_so ?? v?.license_plate}
                </Text>
              ) : null}
              {(v?.odo_hien_tai ?? v?.current_odometer) != null && (
                <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '700', fontSize: 16 }}>
                  📍 {Number(v?.odo_hien_tai ?? v?.current_odometer).toLocaleString('vi-VN')} km
                </Text>
              )}
            </View>
            {score != null && (
              <View style={{ alignItems: 'center', marginLeft: 16 }}>
                <Text style={{ color: scoreColor, fontSize: 36, fontWeight: '800' }}>{score}</Text>
                <Text style={{ color: scoreColor, fontSize: 12 }}>
                  {score >= 80 ? 'Tốt' : score >= 50 ? 'Trung bình' : 'Cần chú ý'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Nhanh */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddRefuel')}
            style={{ flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>⛽ Đổ xăng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddOdometer')}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>📍 Cập nhật ODO</Text>
          </TouchableOpacity>
        </View>

        {/* Nhắc nhở */}
        {reminders.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>Nhắc nhở sắp tới</Text>
            {reminders.slice(0, 5).map((r: any, i: number) => {
              const days = r.remaining_days ?? r.days_remaining;
              const urgentColor = days != null && days <= 30 ? colors.error : days != null && days <= 90 ? colors.warning : colors.textSecondary;
              return (
                <View key={r.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{r.hang_muc ?? r.service_type ?? r.title}</Text>
                  {days != null ? (
                    <Text style={{ color: urgentColor, fontSize: 12, fontWeight: '700' }}>
                      {days <= 0 ? 'Quá hạn' : `${days} ngày`}
                    </Text>
                  ) : r.due_date ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(r.due_date).format('DD/MM/YYYY')}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
