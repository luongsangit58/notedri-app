import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRefuels } from '../../hooks/useRefuels';
import { useVehicles } from '../../hooks/useVehicles';
import { colors } from '../../utils/colors';

const PER_PAGE = 15;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface RefuelItem {
  id: number;
  ngay: string;
  fuel_type?: string;
  tong_tien: number;
  so_lit: number;
  gia_lit: number;
  odometer?: number;
  day_binh?: boolean;
  cay_xang?: string;
  km_since_last?: number | null;
  l100km?: number | null;
}

function RefuelCard({ item, onPress }: { item: RefuelItem; onPress: () => void }) {
  const consumption = item.l100km ?? item.km_since_last ?? null;
  const consumptionValue = item.l100km != null
    ? item.l100km
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardRow}>
        {/* Left: date + fuel_type */}
        <View style={styles.leftCol}>
          <Text style={styles.dateText}>{formatDate(item.ngay)}</Text>
          {item.fuel_type ? (
            <View style={styles.fuelChip}>
              <Text style={styles.fuelChipText}>{item.fuel_type}</Text>
            </View>
          ) : null}
        </View>

        {/* Center: cost + volume/price */}
        <View style={styles.centerCol}>
          <Text style={styles.tongTien}>
            {Number(item.tong_tien).toLocaleString('vi-VN')}đ
          </Text>
          <Text style={styles.subInfo}>
            {Number(item.so_lit).toFixed(2)} L · {Number(item.gia_lit).toLocaleString('vi-VN')}đ/L
          </Text>
          {item.cay_xang ? (
            <Text style={styles.stationText} numberOfLines={1}>{item.cay_xang}</Text>
          ) : null}
          {consumptionValue != null ? (
            <Text style={styles.consumptionText}>{Number(consumptionValue).toFixed(1)} L/100km</Text>
          ) : null}
        </View>

        {/* Right: odometer + not-full badge */}
        <View style={styles.rightCol}>
          {item.odometer != null ? (
            <Text style={styles.odoText}>
              {Number(item.odometer).toLocaleString('vi-VN')} km
            </Text>
          ) : null}
          {item.day_binh === false ? (
            <View style={styles.notFullBadge}>
              <Text style={styles.notFullText}>Không đầy</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RefuelsListScreen() {
  const navigation = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<RefuelItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data)
    ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw)
    ? vehiclesRaw
    : [];

  const { data, isLoading, isFetching, refetch } = useRefuels(selectedVehicleId, page);

  const pageItems: RefuelItem[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];

  // Merge pages into allItems when page data arrives
  React.useEffect(() => {
    if (pageItems.length === 0 && page === 1) {
      setAllItems([]);
      return;
    }
    if (page === 1) {
      setAllItems(pageItems);
    } else {
      setAllItems(prev => {
        const existingIds = new Set(prev.map((i: RefuelItem) => i.id));
        const newItems = pageItems.filter((i: RefuelItem) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
    }
  }, [data, page]);

  const hasMore = data?.next_page_url != null
    || (pageItems.length >= PER_PAGE);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    setAllItems([]);
    await refetch();
    setRefreshing(false);
  };

  const handleSelectVehicle = (id: number | undefined) => {
    setSelectedVehicleId(id);
    setPage(1);
    setAllItems([]);
  };

  const handleLoadMore = () => {
    if (!isFetching && hasMore) {
      setPage(p => p + 1);
    }
  };

  const meta = data?.meta ?? null;
  const consumption = meta?.consumption ?? null;
  const prediction = meta?.prediction ?? null;

  const ListHeader = (
    <View style={styles.filterHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <TouchableOpacity
          onPress={() => handleSelectVehicle(undefined)}
          style={[styles.chip, selectedVehicleId === undefined && styles.chipActive]}
        >
          <Text style={[styles.chipText, selectedVehicleId === undefined && styles.chipTextActive]}>
            Tất cả
          </Text>
        </TouchableOpacity>
        {vehicles.map((v: any) => (
          <TouchableOpacity
            key={v.id}
            onPress={() => handleSelectVehicle(v.id)}
            style={[styles.chip, selectedVehicleId === v.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, selectedVehicleId === v.id && styles.chipTextActive]}>
              {v.ten}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Consumption stats */}
      {consumption != null && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
          {consumption.l100km != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>Tiêu hao TB</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                {Number(consumption.l100km).toFixed(1)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>L/100km</Text>
            </View>
          )}
          {consumption.tong_lit != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>Tổng lít</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                {Number(consumption.tong_lit).toFixed(0)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>lít</Text>
            </View>
          )}
          {consumption.tong_tien != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>Tổng tiền</Text>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                {Number(consumption.tong_tien).toLocaleString('vi-VN')}đ
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Prediction */}
      {prediction?.days_left != null && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1C2D1C', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FontAwesome5 name="gas-pump" size={13} color="#10B981" solid />
          <Text style={{ color: '#10B981', fontSize: 12, flex: 1 }}>
            Dự đoán đổ xăng lần tới sau ~{prediction.days_left} ngày
            {prediction.date_est ? ` (${prediction.date_est})` : ''}
          </Text>
        </View>
      )}
    </View>
  );

  const ListFooter = hasMore && allItems.length > 0 ? (
    <TouchableOpacity
      style={styles.loadMoreBtn}
      onPress={handleLoadMore}
      disabled={isFetching}
    >
      {isFetching && page > 1 ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Text style={styles.loadMoreText}>Tải thêm</Text>
      )}
    </TouchableOpacity>
  ) : null;

  const ListEmpty = isLoading && allItems.length === 0 ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  ) : (
    <View style={styles.emptyState}>
      <FontAwesome5 name="gas-pump" size={48} color={colors.textSecondary} solid />
      <Text style={[styles.emptyText, { marginTop: 12 }]}>Chưa có lần đổ xăng nào</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={allItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RefuelCard
            item={item}
            onPress={() => navigation.navigate('EditRefuel', { refuelId: item.id })}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={allItems.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddRefuel')}
        activeOpacity={0.85}
      >
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterHeader: {
    paddingBottom: 8,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 4,
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
  listContent: {
    padding: 16,
    paddingBottom: 88,
  },
  emptyContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 88,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftCol: {
    width: 80,
    marginRight: 10,
    alignItems: 'flex-start',
  },
  centerCol: {
    flex: 1,
    marginRight: 8,
  },
  rightCol: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  dateText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  fuelChip: {
    backgroundColor: '#0EA5E9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  fuelChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  tongTien: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 2,
  },
  subInfo: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  stationText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  consumptionText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  odoText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'right',
  },
  notFullBadge: {
    backgroundColor: '#F59E0B' + '33',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  notFullText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  loadMoreBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
  },
});
