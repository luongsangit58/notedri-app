import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList, RefreshControl, View, Text, ActivityIndicator,
  TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTimeline } from '../../hooks/useTimeline';
import { useVehicles } from '../../hooks/useVehicles';
import TimelineItem from '../../components/TimelineItem';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

type TypeFilter = 'all' | 'refuel' | 'service' | 'odometer';

const TYPE_CHIPS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'refuel', label: '⛽ Xăng' },
  { key: 'service', label: '🔧 Bảo dưỡng' },
  { key: 'odometer', label: '📍 ODO' },
];

export default function TimelineScreen() {
  const navigation = useNavigation<any>();

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { data: vehiclesData } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData)
    ? vehiclesData
    : [];

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = useTimeline(selectedVehicleId);

  const allItems = data?.pages.flatMap((p: any) => p.data ?? p) ?? [];

  const filteredItems = useMemo(() => {
    if (typeFilter === 'all') return allItems;
    return allItems.filter((item: any) => item.type === typeFilter);
  }, [allItems, typeFilter]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được nhật ký" onRetry={refetch} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item: any) => `${item.type}-${item.id}`}
        renderItem={({ item }) => (
          <TimelineItem
            item={item}
            onPress={
              item.type === 'refuel' && item.id
                ? () => navigation.navigate('EditRefuel', { refuelId: item.id })
                : item.type === 'service' && item.id
                ? () => navigation.navigate('EditService', { serviceId: item.id })
                : item.type === 'odometer' && item.id
                ? () => navigation.navigate('EditOdometer', { odometerReadingId: item.id })
                : undefined
            }
          />
        )}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isFetchingNextPage}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View style={styles.filterHeader}>
            {/* Vehicle chips */}
            {vehicles.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
                style={styles.chipRow}
              >
                <TouchableOpacity
                  onPress={() => setSelectedVehicleId(undefined)}
                  style={[
                    styles.chip,
                    selectedVehicleId === undefined && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedVehicleId === undefined && styles.chipTextActive,
                    ]}
                  >
                    Tất cả xe
                  </Text>
                </TouchableOpacity>
                {vehicles.map((v: any) => {
                  const active = v.id === selectedVehicleId;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setSelectedVehicleId(v.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {v.ten}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Type chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContainer}
              style={styles.chipRow}
            >
              {TYPE_CHIPS.map(({ key, label }) => {
                const active = key === typeFilter;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTypeFilter(key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Text style={{ color: colors.textSecondary }}>Chưa có sự kiện nào</Text>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  filterHeader: {
    marginBottom: 8,
  },
  chipRow: {
    marginBottom: 8,
  },
  chipsContainer: {
    gap: 8,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '400',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
