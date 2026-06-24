import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useObdTrips, useObdDtcEvents } from '../../hooks/useObd';
import { refuelsApi } from '../../api/refuels';
import { useColors } from '../../utils/theme';
import { formatVND, formatVNDShort, formatKm } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import dayjs from 'dayjs';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}g ${m}p`;
  return `${m} phut`;
}

function StatChip({
  icon,
  label,
  color = '#64748B',
}: {
  icon: string;
  label: string;
  color?: string;
}) {
  const colors = useColors();
  return (
    <View style={chipStyles.chip}>
      <FontAwesome5 name={icon} size={11} color={color} solid />
      <Text style={[chipStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 12 },
});

export default function OBDTripsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? 'Xe';
  const consumptionOfficial: number | null = route.params?.consumptionOfficial ?? null;

  const colors = useColors();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);

  // Redirect non-premium users away
  useEffect(() => {
    if (!isPremium) navigation.replace('Premium');
  }, [isPremium]);

  const { data: tripsData, isLoading, refetch, isFetching } = useObdTrips(vehicleId);
  const { data: dtcData } = useObdDtcEvents(vehicleId);
  const { data: fuelPriceData } = useQuery({
    queryKey: ['fuel-price', 'E5'],
    queryFn: () => refuelsApi.fuelPrice('E5').then((r) => r.data),
    staleTime: 1000 * 60 * 60,
  });

  const trips = tripsData?.data ?? [];
  const meta = tripsData?.meta ?? {};
  const activeDtc: any[] = dtcData?.data ?? [];
  const fuelPricePerLiter: number = fuelPriceData?.data?.gia_moi_lit ?? 21000;
  const consumption = consumptionOfficial ?? 8; // L/100km fallback

  const totalStats = useMemo(() => {
    if (!trips.length) return null;
    const totalKm = meta.total_km ?? trips.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);
    const totalIdleSec = trips.reduce((s: number, t: any) => s + (t.idle_time_seconds ?? 0), 0);
    const estimatedFuelL = (totalKm / 100) * consumption;
    const estimatedCost = estimatedFuelL * fuelPricePerLiter;
    return { totalKm, totalIdleSec, estimatedCost, totalTrips: meta.total_trips ?? trips.length };
  }, [trips, meta, consumption, fuelPricePerLiter]);

  function estimateTripCost(trip: any): number {
    const km = trip.distance_km ?? 0;
    return (km / 100) * consumption * fuelPricePerLiter;
  }

  function renderTrip({ item: trip }: { item: any }) {
    const cost = estimateTripCost(trip);
    const totalSec = (trip.driving_time_seconds ?? 0) + (trip.idle_time_seconds ?? 0);
    const idlePct = totalSec > 0 ? Math.round((trip.idle_time_seconds / totalSec) * 100) : 0;
    const date = dayjs(trip.started_at);

    return (
      <View style={[styles.tripCard, { backgroundColor: colors.card }]}>
        {/* Header row */}
        <View style={styles.tripHeader}>
          <View>
            <Text style={[styles.tripDate, { color: colors.text }]}>
              {date.format('DD/MM/YYYY')}
            </Text>
            <Text style={[styles.tripTime, { color: colors.textSecondary }]}>
              {date.format('HH:mm')} - {dayjs(trip.ended_at).format('HH:mm')}
            </Text>
          </View>
          <View style={styles.costBadge}>
            <Text style={styles.costText}>{formatVNDShort(cost)}</Text>
          </View>
        </View>

        {/* Main stat */}
        <View style={styles.mainStatRow}>
          <Text style={[styles.distanceText, { color: colors.text }]}>
            {trip.distance_km ?? 0} km
          </Text>
          {trip.avg_speed_kmh != null && (
            <Text style={[styles.speedText, { color: colors.textSecondary }]}>
              TB {trip.avg_speed_kmh} km/h
            </Text>
          )}
        </View>

        {/* Chips row */}
        <View style={styles.chipsRow}>
          {totalSec > 0 && (
            <StatChip icon="clock" label={formatDuration(totalSec)} />
          )}
          {idlePct > 0 && (
            <StatChip
              icon="parking"
              label={`${idlePct}% cho`}
              color={idlePct > 30 ? '#F59E0B' : '#64748B'}
            />
          )}
          {trip.max_speed_kmh != null && (
            <StatChip icon="tachometer-alt" label={`Max ${trip.max_speed_kmh} km/h`} />
          )}
          {trip.avg_coolant_temp_c != null && (
            <StatChip icon="thermometer-half" label={`${trip.avg_coolant_temp_c}°C`} />
          )}
        </View>

        {/* Fuel level change */}
        {trip.fuel_level_start_pct != null && trip.fuel_level_end_pct != null && (
          <View style={[styles.fuelBar, { backgroundColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                Xang: {trip.fuel_level_start_pct}% → {trip.fuel_level_end_pct}%
              </Text>
              <Text style={{ color: '#10B981', fontSize: 11 }}>
                -{trip.fuel_level_start_pct - trip.fuel_level_end_pct}%
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{
                height: 4,
                width: `${trip.fuel_level_end_pct}%` as any,
                backgroundColor: '#10B981',
                borderRadius: 2,
              }} />
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Lich su chuyen di</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{vehicleName}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* DTC alert banner */}
      {activeDtc.length > 0 && (
        <View style={styles.dtcBanner}>
          <FontAwesome5 name="exclamation-triangle" size={13} color="#FEF3C7" solid />
          <Text style={styles.dtcBannerText}>
            {activeDtc.length} ma loi dong co chua xu ly: {activeDtc.slice(0, 3).map((d: any) => d.code).join(', ')}
          </Text>
        </View>
      )}

      {/* Summary card */}
      {totalStats && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {totalStats.totalTrips}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>chuyen</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {formatKm(totalStats.totalKm)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>tong km</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>
              {formatVNDShort(totalStats.estimatedCost)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>uoc tinh xang</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[
              styles.summaryValue,
              { color: totalStats.totalIdleSec > 1800 ? '#F59E0B' : colors.text },
            ]}>
              {formatDuration(totalStats.totalIdleSec)}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>thoi gian cho</Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : trips.length === 0 ? (
        <View style={styles.empty}>
          <FontAwesome5 name="route" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Chua co chuyen di nao duoc ghi lai.{'\n'}Ket noi OBD va bat dau lai xe.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={renderTrip}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  dtcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C2D12',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dtcBannerText: { color: '#FEF3C7', fontSize: 13, flex: 1 },
  summaryCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryLabel: { fontSize: 10, textAlign: 'center' },
  summaryDivider: { width: 1, marginVertical: 4 },
  tripCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tripDate: { fontSize: 14, fontWeight: '600' },
  tripTime: { fontSize: 12, marginTop: 2 },
  costBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  costText: { color: '#1D4ED8', fontWeight: '700', fontSize: 14 },
  mainStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  distanceText: { fontSize: 24, fontWeight: '800' },
  speedText: { fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fuelBar: { borderRadius: 6, padding: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
