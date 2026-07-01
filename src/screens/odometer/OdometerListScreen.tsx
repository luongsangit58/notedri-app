import React, { useState, useMemo } from 'react';
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
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { odometerApi } from '../../api/odometer';
import { useOdometer } from '../../hooks/useOdometer';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';
import { formatKm } from '../../utils/format';
import { useT } from '../../i18n';

const PER_PAGE = 15;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

interface OdoItem {
  id: number;
  ngay: string;
  odometer: number;
  ghi_chu?: string | null;
  km_since_last?: number | null;
  delta?: number | null;
}

function OdoCard({ item, onPress }: { item: OdoItem; onPress: () => void }) {
  const colors = useColors();
  const styles = StyleSheet.create({
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
      alignItems: 'center',
    },
    leftCol: {
      width: 80,
      marginRight: 10,
    },
    centerCol: {
      flex: 1,
    },
    dateText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    odoValue: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: 18,
      marginBottom: 2,
    },
    odoUnit: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '400',
    },
    deltaText: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    noteText: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
      fontStyle: 'italic',
    },
    arrowText: {
      color: colors.textSecondary,
      fontSize: 20,
      marginLeft: 8,
    },
  });

  const kmChange = item.km_since_last ?? item.delta ?? null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardRow}>
        <View style={styles.leftCol}>
          <Text style={styles.dateText}>{formatDate(item.ngay)}</Text>
        </View>

        <View style={styles.centerCol}>
          <Text style={styles.odoValue}>
            {formatKm(item.odometer).replace(' km', '')}
            <Text style={styles.odoUnit}> km</Text>
          </Text>
          {kmChange != null && kmChange > 0 ? (
            <Text style={styles.deltaText}>{'+' + formatKm(kmChange)}</Text>
          ) : null}
          {item.ghi_chu ? (
            <Text style={styles.noteText} numberOfLines={2}>{item.ghi_chu}</Text>
          ) : null}
        </View>

        <Text style={styles.arrowText}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

/* Single-vehicle paginated list */
function SingleVehicleList({
  vehicleId,
  onNavigateEdit,
}: {
  vehicleId: number;
  onNavigateEdit: (id: number) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = StyleSheet.create({
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
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '500',
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
  });

  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<OdoItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isFetching, refetch } = useOdometer(vehicleId, page);

  const pageItems: OdoItem[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];

  React.useEffect(() => {
    if (page === 1) {
      setAllItems(pageItems);
    } else {
      setAllItems(prev => {
        const existingIds = new Set(prev.map((i: OdoItem) => i.id));
        const newItems = pageItems.filter((i: OdoItem) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
    }
  }, [data, page]);

  const odoMeta = data?.meta ?? null;
  const odoCurrentKm: number | null = odoMeta?.odo_current ?? null;
  const totalKmTracked: number | null = odoMeta?.total_km_tracked ?? null;

  const hasMore = odoMeta?.current_page != null && odoMeta?.last_page != null
    ? odoMeta.current_page < odoMeta.last_page
    : pageItems.length >= PER_PAGE;

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    setAllItems([]);
    await refetch();
    setRefreshing(false);
  };

  const ListFooter = hasMore && allItems.length > 0 ? (
    <TouchableOpacity
      style={styles.loadMoreBtn}
      onPress={() => { if (!isFetching && hasMore) setPage(p => p + 1); }}
      disabled={isFetching}
    >
      {isFetching && page > 1 ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Text style={styles.loadMoreText}>{t('common.load_more')}</Text>
      )}
    </TouchableOpacity>
  ) : null;

  const ListEmpty = isLoading && allItems.length === 0 ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  ) : (
    <View style={styles.emptyState}>
      <FontAwesome5 name="road" size={48} color={colors.textSecondary} solid />
      <Text style={[styles.emptyText, { marginTop: 12 }]}>{t('odometer.empty')}</Text>
    </View>
  );

  return (
    <FlatList
      data={allItems}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <OdoCard item={item} onPress={() => onNavigateEdit(item.id)} />
      )}
      ListHeaderComponent={
        (odoCurrentKm != null || totalKmTracked != null) ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            {odoCurrentKm != null && (
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('odometer.current')}</Text>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginTop: 2 }}>
                  {formatKm(odoCurrentKm)}
                </Text>
              </View>
            )}
            {totalKmTracked != null && totalKmTracked > 0 && (
              <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('odometer.tracked_km')}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15, marginTop: 2 }}>
                  {'+' + formatKm(totalKmTracked)}
                </Text>
              </View>
            )}
          </View>
        ) : null
      }
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
  );
}

/* All-vehicles merged list (page 1 of each vehicle, sorted newest first) */
function AllVehiclesList({
  vehicles,
  onNavigateEdit,
  onRefresh,
}: {
  vehicles: any[];
  onNavigateEdit: (id: number) => void;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const styles = StyleSheet.create({
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '500',
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
  });

  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  const queries = useQueries({
    queries: vehicles.map(v => ({
      queryKey: ['odometer', v.id, 1],
      queryFn: () => odometerApi.list(v.id, 1).then((r: any) => r.data),
      enabled: !!v.id,
    })),
  });

  const isLoading = queries.some(q => q.isLoading);

  const allItems: OdoItem[] = useMemo(() => {
    const merged: OdoItem[] = [];
    queries.forEach(q => {
      const raw = q.data;
      const items: OdoItem[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      merged.push(...items);
    });
    // sort newest first by date
    merged.sort((a, b) => new Date(b.ngay).getTime() - new Date(a.ngay).getTime());
    return merged;
  }, [queries]);

  const handleRefresh = async () => {
    setRefreshing(true);
    vehicles.forEach(v => {
      qc.invalidateQueries({ queryKey: ['odometer', v.id, 1] });
    });
    await Promise.all(queries.map(q => q.refetch()));
    setRefreshing(false);
    onRefresh();
  };

  const ListEmpty = isLoading ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  ) : (
    <View style={styles.emptyState}>
      <FontAwesome5 name="road" size={48} color={colors.textSecondary} solid />
      <Text style={[styles.emptyText, { marginTop: 12 }]}>{t('odometer.empty')}</Text>
    </View>
  );

  return (
    <FlatList
      data={allItems}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <OdoCard item={item} onPress={() => onNavigateEdit(item.id)} />
      )}
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
  );
}

export default function OdometerListScreen() {
  const colors = useColors();
  const t = useT();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    filterHeader: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
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
      color: colors.primaryText,
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

  const navigation = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data)
    ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw)
    ? vehiclesRaw
    : [];

  const handleNavigateEdit = (odometerReadingId: number) => {
    navigation.navigate('EditOdometer', { odometerReadingId });
  };

  const FilterHeader = (
    <View style={styles.filterHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <TouchableOpacity
          onPress={() => setSelectedVehicleId(undefined)}
          style={[styles.chip, selectedVehicleId === undefined && styles.chipActive]}
        >
          <Text style={[styles.chipText, selectedVehicleId === undefined && styles.chipTextActive]}>
            {t('common.all')}
          </Text>
        </TouchableOpacity>
        {vehicles.map((v: any) => (
          <TouchableOpacity
            key={v.id}
            onPress={() => setSelectedVehicleId(v.id)}
            style={[styles.chip, selectedVehicleId === v.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, selectedVehicleId === v.id && styles.chipTextActive]}>
              {v.ten}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AppBgPattern />
      {FilterHeader}

      {selectedVehicleId != null ? (
        <SingleVehicleList
          key={selectedVehicleId}
          vehicleId={selectedVehicleId}
          onNavigateEdit={handleNavigateEdit}
        />
      ) : (
        <AllVehiclesList
          key={refreshKey}
          vehicles={vehicles}
          onNavigateEdit={handleNavigateEdit}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddOdometer')}
        activeOpacity={0.85}
      >
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
