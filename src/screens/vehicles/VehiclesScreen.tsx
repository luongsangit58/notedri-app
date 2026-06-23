import React from 'react';
import { FlatList, View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useVehicles } from '../../hooks/useVehicles';
import VehicleCard from '../../components/VehicleCard';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

export default function VehiclesScreen() {
  const { data, isLoading, isError, refetch, isFetching } = useVehicles();
  const navigation = useNavigation<any>();

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được danh sách xe" onRetry={refetch} />;

  const vehicles = data?.data ?? data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        data={vehicles}
        keyExtractor={(item: any) => String(item.id)}
        renderItem={({ item }) => (
          <VehicleCard vehicle={item} onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id, vehicleName: item.name })} />
        )}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 48 }}><Text style={{ color: colors.textSecondary }}>Chưa có xe nào</Text></View>}
      />

      {/* TODO: Implement Add Vehicle form */}
      <TouchableOpacity
        style={{
          position: 'absolute', right: 20, bottom: 24,
          backgroundColor: colors.primary, width: 56, height: 56, borderRadius: 28,
          justifyContent: 'center', alignItems: 'center', elevation: 6,
        }}>
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
