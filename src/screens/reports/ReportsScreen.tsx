import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
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
  icon: React.ReactNode;
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
      <View style={{ marginBottom: 6 }}>{icon}</View>
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

/* ─── year chip selector ─── */
function YearChips({
  years,
  selectedYear,
  onSelect,
}: {
  years: number[];
  selectedYear: number;
  onSelect: (year: number) => void;
}) {
  if (!years || years.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginBottom: 16 }}>
      {years.map((y) => {
        const active = y === selectedYear;
        return (
          <TouchableOpacity
            key={y}
            onPress={() => onSelect(y)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: active ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}>
            <Text
              style={{
                color: active ? '#fff' : colors.textSecondary,
                fontWeight: active ? '700' : '400',
                fontSize: 13,
              }}>
              {y}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ─── divider ─── */
function Divider({ index }: { index: number }) {
  if (index === 0) return null;
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 0,
      }}
    />
  );
}

/* ─── section card ─── */
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
      }}>
      <Text
        style={{
          color: colors.text,
          fontWeight: '700',
          fontSize: 15,
          marginBottom: 12,
        }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/* ─── row item inside a card ─── */
function CardRow({
  label,
  value,
  index,
  valueColor,
}: {
  label: string;
  value: string;
  index: number;
  valueColor?: string;
}) {
  return (
    <>
      <Divider index={index} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 8,
        }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
          {label}
        </Text>
        <Text
          style={{
            color: valueColor ?? colors.text,
            fontWeight: '600',
            fontSize: 13,
            marginLeft: 8,
          }}>
          {value}
        </Text>
      </View>
    </>
  );
}

/* ─── report content ─── */
function ReportContent({
  vehicleId,
  selectedYear,
  onYearsLoaded,
  onViewYearReview,
}: {
  vehicleId: number;
  selectedYear: number;
  onYearsLoaded: (years: number[]) => void;
  onViewYearReview?: (yr: any, year: number) => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['report', vehicleId, selectedYear],
    queryFn: () =>
      client
        .get(`/vehicles/${vehicleId}/report`, { params: { nam: selectedYear } })
        .then((r) => {
          const d = r.data?.data ?? r.data;
          if (Array.isArray(d?.years) && d.years.length > 0) {
            onYearsLoaded(d.years.map(Number));
          }
          return d;
        }),
    enabled: !!vehicleId,
  });

  if (isLoading) return <LoadingView />;
  if (isError)
    return (
      <ErrorView message="Không tải được báo cáo" onRetry={refetch} />
    );

  if (!data) return null;

  /* ── resolve fuel cost ── */
  const fuelCost =
    data.total_refuel_cost ??
    data.tong_tien_xang ??
    data.all_time?.tong_tien ??
    data.fuel?.total_cost ??
    null;

  /* ── resolve service cost ── */
  const serviceCost =
    data.total_service_cost ??
    data.tong_tien_dich_vu ??
    data.service?.total_cost ??
    null;

  /* ── resolve total cost ── */
  const totalCost =
    data.total_cost ??
    data.tong_tien ??
    (fuelCost != null && serviceCost != null
      ? Number(fuelCost) + Number(serviceCost)
      : fuelCost ?? serviceCost ?? null);

  /* ── resolve km ── */
  const totalKm =
    data.total_km ??
    data.tong_km ??
    data.km_driven ??
    data.all_time?.tong_km ??
    null;

  /* ── resolve refuel count ── */
  const refuelCount =
    data.total_refuels ??
    data.so_lan_do_xang ??
    data.refuel_count ??
    data.all_time?.so_lan ??
    null;

  /* ── resolve service count ── */
  const serviceCount =
    data.total_services ??
    data.so_lan_bao_duong ??
    data.service_count ??
    data.service?.count ??
    null;

  /* ── resolve total liters ── */
  const totalLiters =
    data.total_liters ??
    data.tong_lit ??
    data.all_time?.tong_lit ??
    null;

  /* ── resolve avg consumption ── */
  const avgConsumption =
    data.avg_consumption ??
    data.tieu_hao_trung_binh ??
    data.consumption ??
    null;

  /* ── year review ── */
  const yr = data.year_review ?? null;
  const yrKm =
    yr?.total_km ?? yr?.tong_km ?? null;
  const yrCost =
    yr?.total_cost ?? yr?.tong_tien ?? null;
  const yrRefuels =
    yr?.total_refuels ?? yr?.so_lan_do ?? yr?.so_lan ?? null;
  const yrConsumption =
    yr?.avg_consumption ?? yr?.tieu_hao ?? null;

  /* ── monthly top 3 ── */
  const monthly: any[] = Array.isArray(data.monthly) ? data.monthly : [];
  const top3Months = [...monthly]
    .sort(
      (a, b) =>
        Number(b.chi_phi ?? b.cost ?? b.total_cost ?? 0) -
        Number(a.chi_phi ?? a.cost ?? a.total_cost ?? 0),
    )
    .slice(0, 3);

  /* ── stations top 3 ── */
  const stations: any[] = Array.isArray(data.stations) ? data.stations : [];
  const top3Stations = stations.slice(0, 3);

  /* ── TCO ── */
  const tco = data.tco ?? null;
  const tcoTotal =
    tco?.total ?? tco?.tong_tien ?? tco?.total_cost ?? null;
  const tcoFuel =
    tco?.fuel ?? tco?.xang ?? tco?.fuel_cost ?? null;
  const tcoService =
    tco?.service ?? tco?.dich_vu ?? tco?.service_cost ?? null;
  const tcoPerKm =
    tco?.per_km ?? tco?.dong_per_km ?? null;
  const tcoKm =
    tco?.km ?? tco?.total_km ?? null;

  /* ── spend forecast ── */
  const sf = data.spend_forecast ?? null;
  const sfTotal = sf?.total ?? sf?.tong_tien ?? null;
  const sfFuel = sf?.fuel ?? sf?.xang ?? null;
  const sfService = sf?.service ?? sf?.dich_vu ?? null;
  const sfPct = sf?.pct_elapsed ?? null;

  /* ── by category ── */
  const byCategory: any[] = Array.isArray(data.by_category)
    ? data.by_category.slice(0, 5)
    : [];

  /* ── has locked years ── */
  const hasLockedYears: boolean = data.has_locked_years ?? false;

  /* ── benchmark ── */
  const benchmark = data.benchmark ?? null;

  /* ── consumption vs official ── */
  const cvo = data.consumption_vs_official ?? null;

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
          icon={<FontAwesome5 name="gas-pump" size={20} color={colors.primary} solid />}
          label="Chi phí xăng"
          value={fuelCost != null ? fmtVnd(fuelCost) : '—'}
          sub={
            refuelCount != null
              ? `${fmtNum(refuelCount)} lần đổ${totalLiters != null ? ` · ${Number(totalLiters).toFixed(1)} L` : ''}`
              : undefined
          }
        />
        <StatCard
          icon={<FontAwesome5 name="wrench" size={20} color={colors.primary} solid />}
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
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <StatCard
          icon={<FontAwesome5 name="road" size={20} color={colors.primary} solid />}
          label="Tổng quãng đường"
          value={totalKm != null ? fmtNum(totalKm, 'km') : '—'}
        />
        <StatCard
          icon={<FontAwesome5 name="chart-bar" size={20} color={colors.primary} solid />}
          label="Tiêu hao TB"
          value={
            avgConsumption != null
              ? `${Number(avgConsumption).toFixed(2)} L/100km`
              : '—'
          }
        />
      </View>

      {/* ── year review card ── */}
      {yr != null && (
        <SectionCard title={`Nhìn lại năm ${selectedYear}`}>
          {yrKm != null && (
            <CardRow index={0} label="Km đã đi" value={fmtNum(yrKm, 'km')} />
          )}
          {yrCost != null && (
            <CardRow
              index={yrKm != null ? 1 : 0}
              label="Tổng chi"
              value={fmtVnd(yrCost)}
              valueColor={colors.primary}
            />
          )}
          {yrRefuels != null && (
            <CardRow
              index={[yrKm, yrCost].filter(Boolean).length}
              label="Lần đổ xăng"
              value={fmtNum(yrRefuels, 'lần')}
            />
          )}
          {yrConsumption != null && (
            <CardRow
              index={[yrKm, yrCost, yrRefuels].filter(Boolean).length}
              label="Tiêu hao TB"
              value={`${Number(yrConsumption).toFixed(2)} L/100km`}
            />
          )}
          <TouchableOpacity
            onPress={() => onViewYearReview && onViewYearReview(yr, selectedYear)}
            style={{
              marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#F59E0B22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
              alignSelf: 'flex-start',
            }}>
            <FontAwesome5 name="magic" size={12} color="#F59E0B" solid />
            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>
              Xem bản Nhìn lại {selectedYear}
            </Text>
          </TouchableOpacity>
        </SectionCard>
      )}

      {/* ── benchmark / so sánh cộng đồng ── */}
      {benchmark != null && (
        <SectionCard title="So sánh cộng đồng">
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
            {benchmark.model} · {benchmark.sample} xe cùng dòng
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Xe bạn</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
                {Number(benchmark.mine).toFixed(1)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Cộng đồng</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
                {Number(benchmark.avg).toFixed(1)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km TB</Text>
            </View>
            <View style={{
              flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
              backgroundColor: (benchmark.diff_pct ?? 0) <= 0 ? '#10B98122' : '#F43F5E22',
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>So sánh</Text>
              <Text style={{
                fontWeight: '800', fontSize: 20,
                color: (benchmark.diff_pct ?? 0) <= 0 ? '#10B981' : '#F43F5E',
              }}>
                {(benchmark.diff_pct ?? 0) > 0 ? '+' : ''}{benchmark.diff_pct}%
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center' }}>
                {(benchmark.diff_pct ?? 0) <= 0 ? 'tiết kiệm hơn' : 'tiêu nhiều hơn'}
              </Text>
            </View>
          </View>
        </SectionCard>
      )}

      {/* ── tiêu hao vs nhà sản xuất ── */}
      {cvo != null && (
        <SectionCard title="Thực tế vs Nhà sản xuất">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Thực tế</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>{Number(cvo.real).toFixed(1)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>NSX công bố</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>{Number(cvo.official).toFixed(1)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{
              flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
              backgroundColor: (cvo.diff_pct ?? 0) <= 0 ? '#10B98122' : '#F43F5E22',
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Chênh lệch</Text>
              <Text style={{
                fontWeight: '800', fontSize: 20,
                color: (cvo.diff_pct ?? 0) <= 0 ? '#10B981' : '#F43F5E',
              }}>
                {(cvo.diff_pct ?? 0) > 0 ? '+' : ''}{cvo.diff_pct}%
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                {(cvo.diff_pct ?? 0) <= 0 ? 'tốt hơn' : 'kém hơn'}
              </Text>
            </View>
          </View>
        </SectionCard>
      )}

      {/* ── top 3 months by spend ── */}
      {top3Months.length > 0 && (
        <SectionCard title="Tháng chi nhiều nhất">
          {top3Months.map((m, i) => {
            const month =
              m.thang ?? m.month ?? m.month_number ?? (i + 1);
            const cost =
              m.chi_phi ?? m.cost ?? m.total_cost ?? m.tong_tien ?? null;
            return (
              <CardRow
                key={`month-${i}`}
                index={i}
                label={`Tháng ${month}`}
                value={cost != null ? fmtVnd(cost) : '—'}
                valueColor={i === 0 ? colors.primary : undefined}
              />
            );
          })}
        </SectionCard>
      )}

      {/* ── top 3 stations ── */}
      {top3Stations.length > 0 && (
        <SectionCard title="Trạm xăng hay dùng">
          {top3Stations.map((s, i) => {
            const name =
              s.ten ?? s.name ?? s.station_name ?? `Trạm ${i + 1}`;
            const count =
              s.so_lan ?? s.count ?? s.visits ?? null;
            const amount =
              s.tong_tien ?? s.total_amount ?? s.amount ?? null;
            const sub =
              count != null
                ? `${fmtNum(count)} lần${amount != null ? ` · ${fmtVnd(amount)}` : ''}`
                : amount != null
                ? fmtVnd(amount)
                : '—';
            return (
              <CardRow
                key={`station-${i}`}
                index={i}
                label={String(name)}
                value={sub}
              />
            );
          })}
        </SectionCard>
      )}

      {/* ── spend forecast ── */}
      {sf != null && sfTotal != null && (
        <SectionCard title={`Dự báo chi tiêu năm ${selectedYear}`}>
          {sfPct != null && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
              Theo đà thực chi tới nay ({sfPct}% năm đã qua) — ước tính thô
            </Text>
          )}
          <CardRow index={0} label="Dự báo tổng" value={fmtVnd(sfTotal)} valueColor={colors.primary} />
          {sfFuel != null && (
            <CardRow index={1} label="Dự báo xăng" value={fmtVnd(sfFuel)} />
          )}
          {sfService != null && (
            <CardRow index={sfFuel != null ? 2 : 1} label="Dự báo dịch vụ" value={fmtVnd(sfService)} />
          )}
        </SectionCard>
      )}

      {/* ── TCO (chi phí toàn đời xe) ── */}
      {tco != null && (
        <SectionCard title="Chi phí toàn đời xe (TCO)">
          {tcoTotal != null && (
            <CardRow
              index={0}
              label="Tổng tích lũy"
              value={fmtVnd(tcoTotal)}
              valueColor={colors.primary}
            />
          )}
          {tcoFuel != null && (
            <CardRow
              index={tcoTotal != null ? 1 : 0}
              label="Chi phí xăng"
              value={fmtVnd(tcoFuel)}
            />
          )}
          {tcoService != null && (
            <CardRow
              index={[tcoTotal, tcoFuel].filter(Boolean).length}
              label="Chi phí dịch vụ"
              value={fmtVnd(tcoService)}
            />
          )}
          {tcoPerKm != null && (
            <CardRow
              index={[tcoTotal, tcoFuel, tcoService].filter(x => x != null).length}
              label="Chi phí / km"
              value={`${fmtNum(tcoPerKm)}đ/km${tcoKm != null ? ` · ${fmtNum(tcoKm)} km` : ''}`}
            />
          )}
        </SectionCard>
      )}

      {/* ── by category ── */}
      {byCategory.length > 0 && (
        <SectionCard title="Chi tiêu theo danh mục">
          {byCategory.map((c: any, i: number) => {
            const label = c.loai_label ?? c.label ?? c.loai ?? `Khác`;
            const cost = c.tong_tien ?? c.total_cost ?? c.cost ?? 0;
            return (
              <CardRow
                key={i}
                index={i}
                label={String(label)}
                value={fmtVnd(cost)}
              />
            );
          })}
        </SectionCard>
      )}

      {/* ── premium lock nudge ── */}
      {hasLockedYears && (
        <View style={{
          backgroundColor: '#2C1B00', borderRadius: 10, padding: 12,
          borderWidth: 1, borderColor: '#F59E0B',
          flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <FontAwesome5 name="crown" size={14} color="#F59E0B" solid />
          <Text style={{ color: '#F59E0B', fontSize: 13, flex: 1 }}>
            Nâng cấp Premium để xem báo cáo các năm trước.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

/* ─── screen ─── */
export default function ReportsScreen() {
  const navigation = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);

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
          onSelect={(id) => {
            setSelectedVehicleId(id);
            setAvailableYears([]);
          }}
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

      {/* year chips — shown when years are available */}
      {availableYears.length > 0 && (
        <YearChips
          years={availableYears}
          selectedYear={selectedYear}
          onSelect={setSelectedYear}
        />
      )}

      {/* report body */}
      {effectiveId != null ? (
        <ReportContent
          vehicleId={effectiveId}
          selectedYear={selectedYear}
          onYearsLoaded={(years) => {
            setAvailableYears((prev) => {
              const sorted = [...years].sort((a, b) => b - a);
              if (JSON.stringify(prev) === JSON.stringify(sorted)) return prev;
              return sorted;
            });
          }}
          onViewYearReview={(yr, year) => navigation.navigate('YearReview', { yr, year })}
        />
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
