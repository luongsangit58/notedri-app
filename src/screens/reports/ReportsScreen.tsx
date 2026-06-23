import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useVehicles } from '../../hooks/useVehicles';
import client from '../../api/client';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

/* ─── helpers ─── */
function fmtVnd(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return '—';
  return v.toLocaleString('vi-VN') + 'đ';
}

function fmtNum(n: number | string | null | undefined, unit = ''): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return '—';
  return v.toLocaleString('vi-VN') + (unit ? ' ' + unit : '');
}

/* ─── stat card ─── */
function StatCard({
  icon, label, value, sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        flex: 1,
      }}>
      <Text style={{ fontSize: 20, marginBottom: 6 }}>{icon}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{value}</Text>
      {sub ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{sub}</Text>
      ) : null}
    </View>
  );
}

/* ─── vehicle chip selector ─── */
function VehicleChips({
  vehicles,
  selectedId,
  onSelect,
}: {
  vehicles: any[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginBottom: 16 }}>
      {vehicles.map((v: any) => {
        const active = v.id === selectedId;
        return (
          <TouchableOpacity
            key={v.id}
            onPress={() => onSelect(v.id)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: active ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}>
            <Text
              style={{
                color: active ? '#fff' : colors.textSecondary,
                fontWeight: active ? '700' : '400',
                fontSize: 14,
              }}>
              {v.ten}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ─── report content ─── */
function ReportContent({ vehicleId }: { vehicleId: number }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['report', vehicleId],
    queryFn: () =>
      client
        .get(`/vehicles/${vehicleId}/report`)
        .then((r) => r.data?.data ?? r.data),
    enabled: !!vehicleId,
  });

  if (isLoading) return <LoadingView />;
  if (isError)
    return (
      <ErrorView message="Không tải được báo cáo" onRetry={refetch} />
    );

  if (!data) return null;

  /* resolve fuel cost */
  const fuelCost =
    data.total_refuel_cost ??
    data.tong_tien_xang ??
    data.all_time?.tong_tien ??
    data.fuel?.total_cost ??
    null;

  /* resolve service cost */
  const serviceCost =
    data.total_service_cost ??
    data.tong_tien_dich_vu ??
    data.service?.total_cost ??
    null;

  /* resolve total cost */
  const totalCost =
    data.total_cost ??
    data.tong_tien ??
    (fuelCost != null && serviceCost != null
      ? Number(fuelCost) + Number(serviceCost)
      : fuelCost ?? serviceCost ?? null);

  /* resolve km */
  const totalKm =
    data.total_km ??
    data.tong_km ??
    data.km_driven ??
    data.all_time?.tong_km ??
    null;

  /* resolve refuel count */
  const refuelCount =
    data.total_refuels ??
    data.so_lan_do_xang ??
    data.refuel_count ??
    data.all_time?.so_lan ??
    null;

  /* resolve service count */
  const serviceCount =
    data.total_services ??
    data.so_lan_bao_duong ??
    data.service_count ??
    data.service?.count ??
    null;

  /* resolve total liters */
  const totalLiters =
    data.total_liters ??
    data.tong_lit ??
    data.all_time?.tong_lit ??
    null;

  /* resolve avg consumption */
  const avgConsumption =
    data.avg_consumption ??
    data.tieu_hao_trung_binh ??
    data.consumption ??
    null;

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* total cost banner */}
      {totalCost != null && (
        <View
          style={{
            backgroundColor: colors.primary + '22',
            borderRadius: 14,
            padding: 18,
            marginBottom: 12,
            borderLeftWidth: 3,
            borderLeftColor: colors.primary,
          }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
            Tổng chi phí
          </Text>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 26 }}>
            {fmtVnd(totalCost)}
          </Text>
        </View>
      )}

      {/* row 1: fuel + service */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <StatCard
          icon="⛽"
          label="Chi phí xăng"
          value={fuelCost != null ? fmtVnd(fuelCost) : '—'}
          sub={
            refuelCount != null
              ? `${fmtNum(refuelCount)} lần đổ${totalLiters != null ? ` · ${Number(totalLiters).toFixed(1)} L` : ''}`
              : undefined
          }
        />
        <StatCard
          icon="🔧"
          label="Chi phí dịch vụ"
          value={serviceCost != null ? fmtVnd(serviceCost) : '—'}
          sub={
            serviceCount != null
              ? `${fmtNum(serviceCount)} lần bảo dưỡng`
              : undefined
          }
        />
      </View>

      {/* row 2: km + consumption */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <StatCard
          icon="📍"
          label="Tổng quãng đường"
          value={totalKm != null ? fmtNum(totalKm, 'km') : '—'}
        />
        <StatCard
          icon="📊"
          label="Tiêu hao TB"
          value={
            avgConsumption != null
              ? `${Number(avgConsumption).toFixed(2)} L/100km`
              : '—'
          }
        />
      </View>

      {/* extra raw fields — display any unknown keys gracefully */}
      {((): React.ReactNode => {
        const knownKeys = new Set([
          'total_refuel_cost', 'tong_tien_xang', 'all_time', 'fuel',
          'total_service_cost', 'tong_tien_dich_vu', 'service',
          'total_cost', 'tong_tien',
          'total_km', 'tong_km', 'km_driven',
          'total_refuels', 'so_lan_do_xang', 'refuel_count',
          'total_services', 'so_lan_bao_duong', 'service_count',
          'total_liters', 'tong_lit',
          'avg_consumption', 'tieu_hao_trung_binh', 'consumption',
          'vehicle', 'vehicle_id',
        ]);
        const extras = Object.entries(data).filter(
          ([k, v]) =>
            !knownKeys.has(k) &&
            v !== null &&
            v !== undefined &&
            typeof v !== 'object',
        );
        if (extras.length === 0) return null;
        return (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 16,
              marginTop: 4,
            }}>
            <Text
              style={{
                color: colors.text,
                fontWeight: '700',
                fontSize: 14,
                marginBottom: 10,
              }}>
              Chi tiết khác
            </Text>
            {extras.map(([k, v], i) => (
              <View
                key={k}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: colors.border,
                }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {k.replace(/_/g, ' ')}
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: '600',
                    fontSize: 13,
                    marginLeft: 8,
                  }}>
                  {String(v)}
                </Text>
              </View>
            ))}
          </View>
        );
      })()}
    </ScrollView>
  );
}

/* ─── screen ─── */
export default function ReportsScreen() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const { data: vehiclesRaw, isLoading: loadingVehicles } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data)
    ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw)
    ? vehiclesRaw
    : [];

  /* auto-select first (or default) vehicle */
  const effectiveId: number | null = (() => {
    if (vehicles.length === 0) return null;
    if (selectedVehicleId != null && vehicles.some((v) => v.id === selectedVehicleId))
      return selectedVehicleId;
    const def = vehicles.find((v) => v.is_default);
    return def?.id ?? vehicles[0]?.id ?? null;
  })();

  if (loadingVehicles) return <LoadingView />;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['bottom']}>
      {/* header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
        }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
          Báo cáo
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          Tổng hợp chi phí và hành trình
        </Text>
      </View>

      {/* vehicle chips */}
      {vehicles.length > 0 ? (
        <VehicleChips
          vehicles={vehicles}
          selectedId={effectiveId}
          onSelect={setSelectedVehicleId}
        />
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 15 }}>
            Chưa có xe nào. Vào tab Xe để thêm.
          </Text>
        </View>
      )}

      {/* report body */}
      {effectiveId != null ? (
        <ReportContent vehicleId={effectiveId} />
      ) : vehicles.length > 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <Text style={{ color: colors.textSecondary }}>Chọn xe để xem báo cáo</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
