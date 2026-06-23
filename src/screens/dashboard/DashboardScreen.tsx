import React from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import QuickAddFAB from '../../components/QuickAddFAB';
import { colors } from '../../utils/colors';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useDashboard();

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được dữ liệu" onRetry={refetch} />;

  const vehicle = data?.default_vehicle;
  const stats = data?.stats;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Xin chào,</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 20 }}>{user?.name ?? 'Tài khoản'}</Text>

        {vehicle ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>Xe mặc định</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{vehicle.name}</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{vehicle.license_plate}</Text>
            {vehicle.current_odometer != null && (
              <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }}>
                ODO: {vehicle.current_odometer.toLocaleString('vi-VN')} km
              </Text>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary }}>Chưa có xe nào. Thêm xe để bắt đầu.</Text>
          </View>
        )}

        {stats && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12 }}>Tháng này</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700' }}>{stats.refuel_count ?? 0}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Lần đổ xăng</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700' }}>
                  {(stats.total_cost ?? 0).toLocaleString('vi-VN')}đ
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Tổng tiền</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700' }}>{stats.km_driven ?? 0}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>km đã đi</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <QuickAddFAB />
    </SafeAreaView>
  );
}
