import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRefuels } from '../../hooks/useRefuels';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';
import { formatVND, formatKm } from '../../utils/format';
import { useT } from '../../i18n';

const PER_PAGE = 15;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

interface RefuelItem {
  id: number;
  ngay: string;
  fuel_type?: string;
  tong_tien: number;
  so_lit: number;
  gia_lit: number;
  odometer?: number;
  est_odo?: number | null;
  day_binh?: boolean;
  cay_xang?: string;
  ghi_chu?: string | null;
  km_since_last?: number | null;
  l100km?: number | null;
}

function RefuelCard({ item, onPress }: { item: RefuelItem; onPress: () => void }) {
  const colors = useColors();
  const t = useT();
  const consumptionValue = item.l100km != null ? item.l100km : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Left: date + fuel_type chip */}
        <View style={{ marginRight: 10, maxWidth: 105 }}>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
            {formatDate(item.ngay)}
          </Text>
          {item.fuel_type ? (
            <View style={{
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 2,
              alignSelf: 'flex-start',
            }}>
              <Text style={{ color: colors.primaryText, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
                {item.fuel_type.replace(/^Xăng\s+/i, '')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Center: cost + details */}
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15, marginBottom: 2 }}>
            {formatVND(item.tong_tien)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 2 }}>
            {Number(item.so_lit).toFixed(2)} L · {formatVND(item.gia_lit)}/L
          </Text>
          {item.cay_xang ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 2 }} numberOfLines={1}>
              {item.cay_xang}
            </Text>
          ) : null}
          {consumptionValue != null ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {Number(consumptionValue).toFixed(1)} L/100km
            </Text>
          ) : null}
        </View>

        {/* Right: ODO + not-full badge */}
        <View style={{ alignItems: 'flex-end', minWidth: 72 }}>
          {item.odometer != null ? (
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
              {formatKm(item.odometer)}
            </Text>
          ) : item.est_odo != null ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>
              ~{formatKm(item.est_odo)}
            </Text>
          ) : null}
          {item.day_binh === false ? (
            <View style={{ backgroundColor: colors.primary + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>
                {t('refuels.not_full_badge')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {item.ghi_chu ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' }} numberOfLines={1}>
          {item.ghi_chu}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function RefuelsListScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<RefuelItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data)
    ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const { data, isLoading, isFetching, refetch } = useRefuels(selectedVehicleId, page);

  const pageItems: RefuelItem[] = Array.isArray(data?.data) ? data.data
    : Array.isArray(data) ? data : [];

  React.useEffect(() => {
    if (pageItems.length === 0 && page === 1) { setAllItems([]); return; }
    if (page === 1) {
      setAllItems(pageItems);
    } else {
      setAllItems(prev => {
        const ids = new Set(prev.map((i: RefuelItem) => i.id));
        return [...prev, ...pageItems.filter((i: RefuelItem) => !ids.has(i.id))];
      });
    }
  }, [data, page]);

  const hasMore = data?.next_page_url != null || pageItems.length >= PER_PAGE;

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

  const meta = data?.meta ?? null;
  const consumption = meta?.consumption ?? null;
  const prediction = meta?.prediction ?? null;

  const ListHeader = (
    <View style={{ marginBottom: 4 }}>
      {/* Vehicle filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <TouchableOpacity
          onPress={() => handleSelectVehicle(undefined)}
          style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: selectedVehicleId === undefined ? colors.primary : colors.surface,
            borderWidth: 1,
            borderColor: selectedVehicleId === undefined ? colors.primary : colors.border,
          }}>
          <Text style={{
            color: selectedVehicleId === undefined ? colors.primaryText : colors.textSecondary,
            fontSize: 13, fontWeight: selectedVehicleId === undefined ? '700' : '400',
          }}>
            {t('common.all')}
          </Text>
        </TouchableOpacity>
        {vehicles.map((v: any) => (
          <TouchableOpacity
            key={v.id}
            onPress={() => handleSelectVehicle(v.id)}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
              backgroundColor: selectedVehicleId === v.id ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: selectedVehicleId === v.id ? colors.primary : colors.border,
            }}>
            <Text style={{
              color: selectedVehicleId === v.id ? colors.primaryText : colors.textSecondary,
              fontSize: 13, fontWeight: selectedVehicleId === v.id ? '700' : '400',
            }}>
              {v.ten}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats tổng */}
      {consumption != null && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
          {consumption.l100km != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>{t('refuels.consumption_avg')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                {Number(consumption.l100km).toFixed(1)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>L/100km</Text>
            </View>
          )}
          {consumption.tong_lit != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>{t('refuels.total_liters')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                {Number(consumption.tong_lit).toFixed(0)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('refuels.unit_l')}</Text>
            </View>
          )}
          {consumption.tong_tien != null && (
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 2 }}>{t('refuels.total_cost')}</Text>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                {formatVND(consumption.tong_tien)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Dự đoán */}
      {prediction?.days_left != null && (
        <View style={{
          marginHorizontal: 16, marginBottom: 10,
          backgroundColor: colors.success + '18', borderRadius: 10, padding: 10,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: colors.success + '44',
        }}>
          <FontAwesome5 name="magic" size={13} color={colors.success} solid />
          <Text style={{ color: colors.success, fontSize: 12, flex: 1 }}>
            {t('refuels.prediction', { days: prediction.days_left })}
            {prediction.next_date ? ` (${formatDate(prediction.next_date)})` : ''}
          </Text>
        </View>
      )}
    </View>
  );

  const ListFooter = hasMore && allItems.length > 0 ? (
    <TouchableOpacity
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border,
        borderRadius: 10, paddingVertical: 12,
        alignItems: 'center', marginTop: 4, marginBottom: 16,
      }}
      onPress={() => { if (!isFetching && hasMore) setPage(p => p + 1); }}
      disabled={isFetching}
    >
      {isFetching && page > 1
        ? <ActivityIndicator color={colors.primary} size="small" />
        : <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>{t('common.load_more')}</Text>
      }
    </TouchableOpacity>
  ) : null;

  const ListEmpty = isLoading && allItems.length === 0
    ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
        <FontAwesome5 name="gas-pump" size={48} color={colors.textSecondary} solid />
        <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 12 }}>
          {t('refuels.empty')}
        </Text>
      </View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
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
        contentContainerStyle={
          allItems.length === 0
            ? { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 88 }
            : { paddingHorizontal: 16, paddingBottom: 88 }
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      />

      <TouchableOpacity
        style={{
          position: 'absolute', right: 20, bottom: 28,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.primary,
          justifyContent: 'center', alignItems: 'center',
          elevation: 6,
          shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.4, shadowRadius: 6,
        }}
        onPress={() => navigation.navigate('AddRefuel')}
        activeOpacity={0.85}
      >
        <FontAwesome5 name="plus" size={22} color={colors.primaryText} solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
