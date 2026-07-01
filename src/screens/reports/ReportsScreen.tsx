import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useVehicles } from '../../hooks/useVehicles';
import client from '../../api/client';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { formatVND, formatKm } from '../../utils/format';

/* ─── helpers ─── */
function fmtVnd(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return '—';
  return formatVND(v);
}

function fmtNum(n: number | string | null | undefined, unit = ''): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return '—';
  if (unit === 'km') return formatKm(v);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (unit ? ' ' + unit : '');
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
  const colors = useColors();
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
  const colors = useColors();
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
                color: active ? colors.primaryText : colors.textSecondary,
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
  const colors = useColors();
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
                color: active ? colors.primaryText : colors.textSecondary,
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
  const colors = useColors();
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
  const colors = useColors();
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
  const colors = useColors();
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
  const colors = useColors();
  const t = useT();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['report', vehicleId, selectedYear],
    queryFn: () =>
      client
        .get(`/vehicles/${vehicleId}/report`, { params: { nam: selectedYear } })
        .then((r) => r.data?.data ?? r.data),
    enabled: !!vehicleId,
  });

  // Side effect tách riêng - không gọi setState bên trong queryFn
  useEffect(() => {
    if (data && Array.isArray(data.years) && data.years.length > 0) {
      onYearsLoaded(data.years.map(Number));
    }
  }, [data]);

  if (isLoading) return <LoadingView />;
  if (isError)
    return (
      <ErrorView message={t('common.error_load')} onRetry={refetch} />
    );

  if (!data) return null;

  /* year_review is the authoritative source for per-year aggregates */
  const yr = data.year_review ?? null;

  /* ── resolve fuel cost ── */
  const fuelCost =
    data.total_refuel_cost ??
    data.tong_tien_xang ??
    yr?.fuel_cost ??
    data.all_time?.tong_tien ??
    data.fuel?.total_cost ??
    null;

  /* ── resolve service cost ── */
  const serviceCost =
    data.total_service_cost ??
    data.tong_tien_dich_vu ??
    yr?.service_cost ??
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
    yr?.km ??
    data.all_time?.tong_km ??
    null;

  /* ── resolve refuel count ── */
  const refuelCount =
    data.total_refuels ??
    data.so_lan_do_xang ??
    data.refuel_count ??
    yr?.fill_count ??
    data.all_time?.so_lan ??
    null;

  /* ── resolve service count ── */
  const serviceCount =
    data.total_services ??
    data.so_lan_bao_duong ??
    data.service_count ??
    yr?.service_count ??
    data.service?.count ??
    null;

  /* ── resolve total liters ── */
  const totalLiters =
    data.total_liters ??
    data.tong_lit ??
    yr?.liters ??
    data.all_time?.tong_lit ??
    null;

  /* ── resolve avg consumption ──
     CHÚ Ý: KHÔNG fallback vào data.consumption — đó là MẢNG điểm tiêu hao
     (consumptionPoints), không phải số. Number(mảng) -> NaN/0 gây hiện "NaN L/100km". */
  const avgConsumptionRaw =
    data.avg_consumption ??
    data.tieu_hao_trung_binh ??
    data.overall_consumption?.l100 ??
    null;
  const avgConsumptionNum = Number(avgConsumptionRaw);
  const avgConsumption =
    avgConsumptionRaw != null && Number.isFinite(avgConsumptionNum) && avgConsumptionNum > 0
      ? avgConsumptionNum
      : null;

  /* ── year review derived totals ── */
  const yrKm = yr?.km ?? null;
  const yrCost =
    yr?.fuel_cost != null && yr?.service_cost != null
      ? (yr.fuel_cost as number) + (yr.service_cost as number)
      : yr?.fuel_cost ?? yr?.service_cost ?? null;
  const yrRefuels = yr?.fill_count ?? null;

  /* ── monthly top 3 ── */
  const monthly: any[] = Array.isArray(data.monthly) ? data.monthly : [];
  const top3Months = [...monthly]
    .sort(
      (a, b) =>
        Number(b.tong_tien ?? b.chi_phi ?? b.cost ?? b.total_cost ?? 0) -
        Number(a.tong_tien ?? a.chi_phi ?? a.cost ?? a.total_cost ?? 0),
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

  /* ── by category ── API returns a dict {label: amount}, not array */
  const byCategory: { label: string; amount: number }[] =
    data.by_category && typeof data.by_category === 'object' && !Array.isArray(data.by_category)
      ? Object.entries(data.by_category as Record<string, number>)
          .map(([label, amount]) => ({ label, amount }))
          .slice(0, 5)
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
            {t('reports.total_cost')}
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
          label={t('reports.fuel_cost')}
          value={fuelCost != null ? fmtVnd(fuelCost) : '—'}
          sub={
            refuelCount != null
              ? `${t('reports.refuels_count', { count: fmtNum(refuelCount) })}${totalLiters != null ? ` · ${Number(totalLiters).toFixed(1)} L` : ''}`
              : undefined
          }
        />
        <StatCard
          icon={<FontAwesome5 name="wrench" size={20} color={colors.primary} solid />}
          label={t('reports.service_cost')}
          value={serviceCost != null ? fmtVnd(serviceCost) : '—'}
          sub={
            serviceCount != null
              ? t('reports.services_count', { count: fmtNum(serviceCount) })
              : undefined
          }
        />
      </View>

      {/* row 2: km + consumption */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <StatCard
          icon={<FontAwesome5 name="road" size={20} color={colors.primary} solid />}
          label={t('reports.total_km')}
          value={totalKm != null ? fmtNum(totalKm, 'km') : '—'}
        />
        <StatCard
          icon={<FontAwesome5 name="chart-bar" size={20} color={colors.primary} solid />}
          label={t('reports.avg_consumption')}
          value={
            avgConsumption != null
              ? `${Number(avgConsumption).toFixed(2)} L/100km`
              : '—'
          }
        />
      </View>

      {/* ── year review card ── */}
      {yr != null && (
        <SectionCard title={t('reports.year_review_link', { year: selectedYear })}>
          {yrKm != null && (
            <CardRow index={0} label={t('year_review.total_km')} value={fmtNum(yrKm, 'km')} />
          )}
          {yrCost != null && (
            <CardRow
              index={yrKm != null ? 1 : 0}
              label={t('year_review.total_cost')}
              value={fmtVnd(yrCost)}
              valueColor={colors.primary}
            />
          )}
          {yrRefuels != null && (
            <CardRow
              index={[yrKm, yrCost].filter(Boolean).length}
              label={t('reports.refuel_label')}
              value={t('reports.times_count', { count: fmtNum(yrRefuels) })}
            />
          )}
          {yr?.service_cost != null && yr.service_cost > 0 && (
            <CardRow
              index={[yrKm, yrCost, yrRefuels].filter(x => x != null).length}
              label={t('year_review.service_cost')}
              value={fmtVnd(yr.service_cost)}
            />
          )}
          <TouchableOpacity
            onPress={() => onViewYearReview && onViewYearReview(yr, selectedYear)}
            style={{
              marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
              alignSelf: 'flex-start',
            }}>
            <FontAwesome5 name="magic" size={12} color={colors.primary} solid />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
              {t('reports.year_review_link', { year: selectedYear })}
            </Text>
          </TouchableOpacity>
        </SectionCard>
      )}

      {/* ── benchmark / so sánh cộng đồng ── */}
      {benchmark != null && (
        <SectionCard title={t('reports.benchmark_title')}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
            {t('reports.benchmark_subtitle', { model: benchmark.model ?? '?', count: benchmark.sample ?? '?' })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.your_vehicle')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
                {benchmark.mine != null ? Number(benchmark.mine).toFixed(1) : "—"}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.community_avg')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
                {benchmark.avg != null ? Number(benchmark.avg).toFixed(1) : "—"}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{
              flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
              backgroundColor: (benchmark.diff_pct ?? 0) <= 0 ? colors.success + '22' : colors.error + '22',
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.vs_label')}</Text>
              <Text style={{
                fontWeight: '800', fontSize: 20,
                color: (benchmark.diff_pct ?? 0) <= 0 ? colors.success : colors.error,
              }}>
                {(benchmark.diff_pct ?? 0) > 0 ? '+' : ''}{benchmark.diff_pct}%
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center' }}>
                {(benchmark.diff_pct ?? 0) <= 0 ? t('reports.saves_more') : t('reports.consumes_more')}
              </Text>
            </View>
          </View>
        </SectionCard>
      )}

      {/* ── tiêu hao vs nhà sản xuất ── */}
      {cvo != null && (
        <SectionCard title={t('reports.actual_vs_spec')}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.actual')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>{cvo.real != null ? Number(cvo.real).toFixed(1) : "—"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.manufacturer_spec')}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>{cvo.official != null ? Number(cvo.official).toFixed(1) : "—"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>L/100km</Text>
            </View>
            <View style={{
              flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
              backgroundColor: (cvo.diff_pct ?? 0) <= 0 ? colors.success + '22' : colors.error + '22',
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{t('reports.difference')}</Text>
              <Text style={{
                fontWeight: '800', fontSize: 20,
                color: (cvo.diff_pct ?? 0) <= 0 ? colors.success : colors.error,
              }}>
                {(cvo.diff_pct ?? 0) > 0 ? '+' : ''}{cvo.diff_pct}%
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10 }}>
                {(cvo.diff_pct ?? 0) <= 0 ? t('reports.better_than_spec') : t('reports.worse_than_spec')}
              </Text>
            </View>
          </View>
        </SectionCard>
      )}

      {/* ── top 3 months by spend ── */}
      {top3Months.length > 0 && (
        <SectionCard title={t('reports.top_spending_month')}>
          {top3Months.map((m, i) => {
            const month =
              m.thang ?? m.month ?? m.month_number ?? (i + 1);
            const cost =
              m.chi_phi ?? m.cost ?? m.total_cost ?? m.tong_tien ?? null;
            return (
              <CardRow
                key={`month-${i}`}
                index={i}
                label={t('reports.month_label', { n: month })}
                value={cost != null ? fmtVnd(cost) : '—'}
                valueColor={i === 0 ? colors.primary : undefined}
              />
            );
          })}
        </SectionCard>
      )}

      {/* ── top 3 stations ── */}
      {top3Stations.length > 0 && (
        <SectionCard title={t('year_review.top_station')}>
          {top3Stations.map((s, i) => {
            const name =
              s.cay_xang ?? s.ten ?? s.name ?? s.station_name ?? t('reports.station_fallback', { n: i + 1 });
            const count =
              s.so_lan ?? s.count ?? s.visits ?? null;
            const amount =
              s.tong_tien ?? s.total_amount ?? s.amount ?? null;
            const sub =
              count != null
                ? `${t('reports.times_count', { count: fmtNum(count) })}${amount != null ? ` · ${fmtVnd(amount)}` : ''}`
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
        <SectionCard title={t('reports.forecast_title', { year: selectedYear })}>
          {sfPct != null && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
              {t('reports.forecast_note', { pct: sfPct })}
            </Text>
          )}
          <CardRow index={0} label={t('reports.forecast_total')} value={'~' + fmtVnd(sfTotal)} valueColor={colors.primary} />
          {sfFuel != null && (
            <CardRow index={1} label={t('reports.forecast_fuel')} value={'~' + fmtVnd(sfFuel)} />
          )}
          {sfService != null && (
            <CardRow index={sfFuel != null ? 2 : 1} label={t('reports.forecast_service')} value={'~' + fmtVnd(sfService)} />
          )}
        </SectionCard>
      )}

      {/* ── TCO (chi phí toàn đời xe) ── */}
      {tco != null && (
        <SectionCard title={t('reports.tco_title')}>
          {tcoTotal != null && (
            <CardRow
              index={0}
              label={t('reports.cumulative_total')}
              value={fmtVnd(tcoTotal)}
              valueColor={colors.primary}
            />
          )}
          {tcoFuel != null && (
            <CardRow
              index={tcoTotal != null ? 1 : 0}
              label={t('reports.fuel_cost')}
              value={fmtVnd(tcoFuel)}
            />
          )}
          {tcoService != null && (
            <CardRow
              index={[tcoTotal, tcoFuel].filter(Boolean).length}
              label={t('reports.service_cost')}
              value={fmtVnd(tcoService)}
            />
          )}
          {tcoPerKm != null && (
            <CardRow
              index={[tcoTotal, tcoFuel, tcoService].filter(x => x != null).length}
              label={t('reports.cost_per_km')}
              value={`${fmtNum(tcoPerKm)}đ/km${tcoKm != null ? ` · ${fmtNum(tcoKm)} km` : ''}`}
            />
          )}
        </SectionCard>
      )}

      {/* ── by category ── */}
      {byCategory.length > 0 && (
        <SectionCard title={t('reports.spending_by_category')}>
          {byCategory.map((c, i) => (
            <CardRow
              key={i}
              index={i}
              label={c.label}
              value={fmtVnd(c.amount)}
            />
          ))}
        </SectionCard>
      )}

      {/* ── premium lock nudge ── */}
      {hasLockedYears && (
        <View style={{
          backgroundColor: colors.primary + '15', borderRadius: 10, padding: 12,
          borderWidth: 1, borderColor: colors.primary,
          flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <FontAwesome5 name="crown" size={14} color={colors.primary} solid />
          <Text style={{ color: colors.primary, fontSize: 13, flex: 1 }}>
            {t('reports.premium_lock')}
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

/* ─── screen ─── */
export default function ReportsScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  // Khởi tạo với năm hiện tại để YearChips hiển thị ngay, không giật khi data về
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

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
      <AppBgPattern />
      {/* header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
        }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20 }}>
          {t('reports.title')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          {t('reports.subtitle')}
        </Text>
      </View>

      {/* vehicle + year chips — luôn chiếm chiều cao cố định, không gây layout shift */}
      {vehicles.length > 0 ? (
        <View>
          <VehicleChips
            vehicles={vehicles}
            selectedId={effectiveId}
            onSelect={(id) => {
              setSelectedVehicleId(id);
              setAvailableYears([new Date().getFullYear()]);
            }}
          />
          <YearChips
            years={availableYears}
            selectedYear={selectedYear}
            onSelect={setSelectedYear}
          />
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 15 }}>
            {t('reports.no_vehicle')}
          </Text>
        </View>
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
          <Text style={{ color: colors.textSecondary }}>{t('reports.select_vehicle_hint')}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
