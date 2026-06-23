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

  const score = health?.score ?? health?.health_score;
  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.error;
  const reminders = remindersData?.data ?? remindersData ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{vehicle?.name}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{vehicle?.license_plate}</Text>
          {vehicle?.current_odometer != null && (
            <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }}>
              ODO: {vehicle.current_odometer.toLocaleString('vi-VN')} km
            </Text>
          )}
        </View>

        {score != null && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Sức khoẻ xe</Text>
            <Text style={{ color: scoreColor, fontSize: 48, fontWeight: '800' }}>{score}</Text>
            <Text style={{ color: scoreColor, fontSize: 14 }}>{score >= 80 ? 'Tốt' : score >= 50 ? 'Trung bình' : 'Cần chú ý'}</Text>
          </View>
        )}

        {reminders.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12 }}>Nhắc nhở sắp tới</Text>
            {reminders.slice(0, 3).map((r: any) => (
              <View key={r.id} style={{ marginBottom: 10 }}>
                <Text style={{ color: colors.text }}>{r.title ?? r.service_type}</Text>
                {r.due_date && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(r.due_date).format('DD/MM/YYYY')}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddRefuel')}
            style={{ flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>⛽ Đổ xăng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddOdometer')}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>📍 Cập nhật ODO</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
