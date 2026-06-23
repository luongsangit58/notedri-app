import React from 'react';
import { FlatList, View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useVehicles, useSetDefaultVehicle } from '../../hooks/useVehicles';
import VehicleCard from '../../components/VehicleCard';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

export default function VehiclesScreen() {
  const { data, isLoading, isError, refetch, isFetching } = useVehicles();
  const navigation = useNavigation<any>();
  const { mutate: setDefault } = useSetDefaultVehicle();

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được danh sách xe" onRetry={refetch} />;

  const vehicles: any[] = data?.data ?? data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        data={vehicles}
        keyExtractor={(item: any) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ position: 'relative' }}>
            <VehicleCard
              vehicle={item}
              onPress={() => navigation.navigate('VehicleDetail', { vehicleId: item.id, vehicleName: item.ten ?? item.name })}
            />
            <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 }}>
              {!item.is_default && (
                <TouchableOpacity
                  onPress={() => setDefault(item.id)}
                  style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <FontAwesome5 name="star" size={14} color="#F59E0B" solid />
                </TouchableOpacity>
              )}
              {item.is_default && (
                <View style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <FontAwesome5 name="star" size={14} color="#F59E0B" solid />
                </View>
              )}
              <TouchableOpacity
                onPress={() => navigation.navigate('Dossier', { vehicleId: item.id })}
                style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="book" size={13} color={colors.textSecondary} solid />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Sổ tay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('EditVehicle', { vehicleId: item.id })}
                style={{ backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="pen" size={13} color={colors.textSecondary} solid />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Sửa</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🚗</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Chưa có xe nào</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Bấm + để thêm xe đầu tiên</Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('AddVehicle')}
        style={{
          position: 'absolute', right: 20, bottom: 24,
          backgroundColor: colors.primary, width: 56, height: 56, borderRadius: 28,
          justifyContent: 'center', alignItems: 'center', elevation: 6,
          shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}>
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
