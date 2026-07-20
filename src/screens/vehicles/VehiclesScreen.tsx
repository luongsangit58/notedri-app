import React from 'react';
import { FlatList, View, Text, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useVehicles, useSetDefaultVehicle } from '../../hooks/useVehicles';
import VehicleCard from '../../components/VehicleCard';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { useT } from '../../i18n';

export default function VehiclesScreen() {
  const colors = useColors();
  const t = useT();
  const { data, isLoading, isError, refetch, isFetching } = useVehicles();
  const navigation = useNavigation<any>();
  const { mutate: setDefault } = useSetDefaultVehicle();
  // Rà soát 20/7 (car head-unit landscape): danh sách xe 1 cột trải rất rộng
  // trên head-unit ngang, để trống nhiều 2 bên. 2 cột khi landscape VÀ có >1
  // xe (không đáng chia cột khi chỉ 1 thẻ). key remount vì FlatList không cho
  // đổi numColumns khi đã mount.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message={t('vehicles.cannot_load_list')} onRetry={refetch} />;

  const vehicles: any[] = data?.data ?? data ?? [];
  const numColumns = isLandscape && vehicles.length > 1 ? 2 : 1;
  const scores: Record<number, { total: number; band: string }> = data?.meta?.scores ?? {};
  const canAddVehicle: boolean = data?.meta?.can_add_vehicle ?? true;
  const vehicleLimit: number | null = data?.meta?.vehicle_limit ?? null;

  return (
    // + left/right: FAB "+" ở góc phải (right:20) có thể lọt vào bezel vật lý bên phải
    // trên head-unit ô tô landscape - bottom-only không đủ ở cạnh dọc.
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <FlatList
        key={`vehicles-cols-${numColumns}`}
        data={vehicles}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
        keyExtractor={(item: any) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ position: 'relative', flex: numColumns > 1 ? 1 : undefined }}>
            <VehicleCard
              vehicle={item}
              onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id, vehicleName: item.ten ?? item.name })}
              score={scores[item.id] ?? null}
            />
            <TouchableOpacity
              onPress={() => navigation.navigate('EditVehicle', { vehicleId: item.id })}
              style={{ position: 'absolute', top: 12, right: 12, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FontAwesome5 name="pen" size={13} color={colors.textSecondary} solid />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('vehicles.edit_label')}</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={[{ padding: 16, paddingBottom: 80 }, contentWide]}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 64 }}>
            <FontAwesome5 name="car-side" size={48} color={colors.textSecondary} solid style={{ marginBottom: 12 }} />
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{t('vehicles.empty_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('vehicles.empty_subtitle')}</Text>
          </View>
        }
      />

      {!canAddVehicle && vehicleLimit != null && (
        <View style={{
          // Đẩy lên trên FAB (bottom:24 + cao 56 = ~80) để nút "+" không che chữ cảnh báo.
          marginHorizontal: 16, marginBottom: 92,
          backgroundColor: '#2C1B00', borderRadius: 10, padding: 12,
          borderWidth: 1, borderColor: '#F59E0B',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <FontAwesome5 name="crown" size={14} color="#F59E0B" solid />
          <Text style={{ color: '#F59E0B', fontSize: 13, flex: 1 }}>
            {t('vehicles.free_limit_warning', { limit: vehicleLimit })}
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => canAddVehicle
          ? navigation.navigate('AddVehicle')
          : null}
        style={{
          position: 'absolute', right: 20, bottom: 24,
          backgroundColor: canAddVehicle ? colors.primary : colors.textSecondary,
          width: 56, height: 56, borderRadius: 28,
          justifyContent: 'center', alignItems: 'center', elevation: 6,
          shadowColor: colors.primary, shadowOpacity: canAddVehicle ? 0.4 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}>
        <FontAwesome5 name="plus" size={22} color={colors.primaryText} solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
