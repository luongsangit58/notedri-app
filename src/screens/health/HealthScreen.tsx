import React, { useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, FlatList,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { useQueries } from '@tanstack/react-query';
import { useVehicles } from '../../hooks/useVehicles';
import { vehiclesApi } from '../../api/vehicles';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT, useI18nStore } from '../../i18n';

/* ─── types ─── */
type OrganStatus = 'urgent' | 'warn' | 'info' | 'ok' | 'na';

interface Organ {
  key: string;
  label: string;
  icon?: string;
  status: OrganStatus;
  verdict: string;
  detail?: string;
  note?: string;
  cta?: string;
}

interface Pillar {
  score: number;
  max: number;
  label: string;
}

interface HealthScore {
  total: number;
  pillars?: { a: Pillar; b: Pillar; c: Pillar; d: Pillar };
  band?: { key: string; label: string; color: string };
  confidence?: string;
  critical?: boolean;
}

interface HealthData {
  overall?: OrganStatus;
  warn_count?: number;
  organs?: Organ[];
  score?: HealthScore;
  health_score?: number;
}

/* ─── helpers ─── */
const PILLAR_KEYS = ['a', 'b', 'c', 'd'] as const;

function scoreColor(score: number): string {
  if (score >= 80) return '#4CAF50'; // success / emerald
  if (score >= 50) return '#FF9800'; // warning / amber
  return '#F44336'; // error / rose
}

function scoreBand(score: number): string {
  const t = useI18nStore.getState().t;
  if (score >= 85) return t('dashboard.health_band_excellent');
  if (score >= 70) return t('dashboard.health_band_good');
  if (score >= 55) return t('dashboard.health_band_warn');
  if (score >= 40) return t('dashboard.health_band_poor');
  return t('health.band_check_needed');
}

function pillarQualLabel(pct: number): string {
  const t = useI18nStore.getState().t;
  if (pct >= 80) return t('dashboard.health_band_good');
  if (pct >= 50) return t('health.pillar_fair');
  return t('dashboard.health_band_warn');
}

function organStatusColor(status: OrganStatus): string {
  switch (status) {
    case 'urgent': return '#F44336'; // rose
    case 'warn':   return '#FF9800'; // amber
    case 'info':   return '#0EA5E9'; // sky
    case 'ok':     return '#4CAF50'; // emerald
    default:       return '#9E9E9E';
  }
}

function OrganStatusIcon({ status }: { status: OrganStatus }) {
  const clr = organStatusColor(status);
  switch (status) {
    case 'urgent': return <FontAwesome5 name="exclamation-circle" size={13} color={clr} solid />;
    case 'warn':   return <FontAwesome5 name="exclamation-triangle" size={13} color={clr} solid />;
    case 'info':   return <FontAwesome5 name="info-circle" size={13} color={clr} solid />;
    case 'ok':     return <FontAwesome5 name="check-circle" size={13} color={clr} solid />;
    default:       return null;
  }
}

/* ─── PillarBar ─── */
function PillarBar({ pillar }: { pillar: Pillar }) {
  const colors = useColors();
  const pct = Math.min(100, Math.round((pillar.score / pillar.max) * 100));
  const clr = scoreColor(pct);
  const qualLabel = pillarQualLabel(pct);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{pillar.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{qualLabel}</Text>
          <Text style={{ color: clr, fontSize: 12, fontWeight: '700' }}>{pillar.score}/{pillar.max}</Text>
        </View>
      </View>
      <View style={{ height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 7, width: `${pct}%` as any, backgroundColor: clr, borderRadius: 4 }} />
      </View>
    </View>
  );
}

/* Backend trả cta = {label, url} (web route). App điều hướng theo organ.key. */
function ctaScreenForKey(key?: string): string {
  if (key === 'tieu_thu') return 'AddRefuel';
  if (key === 'chi_phi') return 'Stats';
  return 'Reminders'; // các organ nhắc nhở (bao_duong, giay_to, dang_kiem, bao_hiem...)
}
function ctaLabelOf(organ: any, t: any): string {
  if (organ?.cta && typeof organ.cta === 'object' && organ.cta.label) return organ.cta.label;
  if (organ?.cta === 'AddService') return t('health.cta_add_service');
  if (organ?.cta === 'AddReminder') return t('health.cta_add_reminder');
  if (organ?.cta === 'AddOdometer') return t('health.cta_update_odo');
  return t('health.cta_handle');
}

/* ─── OrganRow ─── */
function OrganRow({ organ, onCta }: { organ: Organ & { cta?: any }; onCta?: (screen: string) => void }) {
  const colors = useColors();
  const t = useT();
  if (organ.status === 'na') return null;
  const clr = organStatusColor(organ.status);
  return (
    <View style={{
      backgroundColor: colors.background, borderRadius: 8,
      padding: 10, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: clr,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
        <View style={{ marginRight: 6 }}>
          <OrganStatusIcon status={organ.status} />
        </View>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12, flex: 1 }}>{organ.label}</Text>
        <Text style={{ color: clr, fontSize: 11, fontWeight: '600' }}>{organ.verdict}</Text>
      </View>
      {!!organ.detail && (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{organ.detail}</Text>
      )}
      {!!organ.note && (
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>{organ.note}</Text>
      )}
      {organ.cta && (organ.status === 'urgent' || organ.status === 'warn') && (
        <TouchableOpacity
          onPress={() => onCta && onCta(ctaScreenForKey(organ.key))}
          style={{
            marginTop: 6, alignSelf: 'flex-start',
            backgroundColor: clr + '22', borderRadius: 6,
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
          <Text style={{ color: clr, fontSize: 11, fontWeight: '700' }}>
            {ctaLabelOf(organ, t)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─── ScoreTrendChart ─── */
interface TrendPoint { total: number; band: string; date: string }

function ScoreTrendChart({ points }: { points: TrendPoint[] }) {
  const colors = useColors();
  const t = useT();
  if (points.length < 2) return null;
  const BAR_W = 6;
  const GAP = 3;
  const CHART_H = 48;
  const latest = points[0]; // most recent first

  const reversed = [...points].reverse().slice(-20);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <FontAwesome5 name="chart-line" size={11} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{t('health.trend_title')}</Text>
        <Text style={{ color: scoreColor(latest.total), fontWeight: '700', fontSize: 11, marginLeft: 'auto' }}>
          {latest.total} {t('health.current_label')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H + 12 }}>
        {reversed.map((p, i) => {
          const barH = Math.max(3, Math.round((p.total / 100) * CHART_H));
          const clr = scoreColor(p.total);
          return (
            <View key={i} style={{ marginRight: GAP, alignItems: 'center' }}>
              <View style={{
                width: BAR_W, height: barH,
                backgroundColor: clr + (i === reversed.length - 1 ? 'ff' : '99'),
                borderRadius: 2,
              }} />
            </View>
          );
        })}
        <View style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 9 }}>
          {reversed[0]?.date?.slice(5)}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 9 }}>
          {reversed[reversed.length - 1]?.date?.slice(5)}
        </Text>
      </View>
    </View>
  );
}

/* ─── HealthCard ─── */
interface HealthCardProps {
  vehicle: any;
  health: HealthData | null | undefined;
  loading: boolean;
  onAddReminder: () => void;
  onCta?: (screen: string) => void;
  history?: TrendPoint[];
}

function HealthCard({ vehicle, health, loading, onAddReminder, onCta, history }: HealthCardProps) {
  const colors = useColors();
  const t = useT();
  const name = vehicle.ten ?? vehicle.name ?? t('common.vehicle');
  const plate = vehicle.bien_so ?? vehicle.license_plate ?? '';

  const scoreData = health?.score;
  const total = scoreData?.total ?? (health?.health_score != null ? Number(health.health_score) : null);
  const pillars = scoreData?.pillars;
  const organs = (Array.isArray(health?.organs) ? health.organs : []).filter((o: any) => o.status !== 'na');
  const bandLabel = scoreData?.band?.label ?? (total != null ? scoreBand(total) : null);

  const needsAttention = health?.warn_count != null
    ? health.warn_count > 0
    : organs.some(o => o.status === 'urgent' || o.status === 'warn');

  const borderClr = total != null ? scoreColor(total) : colors.border;

  return (
    <View style={{
      backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 14,
      borderLeftWidth: 3, borderLeftColor: borderClr,
    }}>
      {/* Vehicle name + plate */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{name}</Text>
          {plate ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{plate}</Text>
          ) : null}
        </View>
        {/* Score badge */}
        {total != null && (
          <View style={{
            width: 60, height: 60, borderRadius: 30,
            borderWidth: 3, borderColor: scoreColor(total),
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.card, marginLeft: 12,
          }}>
            <Text style={{ color: scoreColor(total), fontSize: 20, fontWeight: '800' }}>{total}</Text>
          </View>
        )}
        {loading && <ActivityIndicator color={colors.primary} style={{ marginLeft: 12 }} />}
      </View>

      {/* Band label + confidence */}
      {bandLabel && total != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <View style={{
            backgroundColor: scoreColor(total) + '33', borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 3,
          }}>
            <Text style={{ color: scoreColor(total), fontWeight: '700', fontSize: 13 }}>{bandLabel}</Text>
          </View>
          {scoreData?.confidence && scoreData.confidence !== 'high' && (
            <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                {scoreData.confidence === 'medium' ? t('health.confidence_medium')
                  : scoreData.confidence === 'low' ? t('health.confidence_low')
                  : t('health.confidence_minimal')}
              </Text>
            </View>
          )}
          {scoreData?.critical && (
            <View style={{ backgroundColor: '#F4433622', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#F44336', fontSize: 11, fontWeight: '700' }}>{t('health.high_risk')}</Text>
            </View>
          )}
        </View>
      )}

      {/* Pillar bars */}
      {pillars && (
        <View style={{ marginBottom: 8 }}>
          {PILLAR_KEYS.map(k => (
            <PillarBar key={k} pillar={pillars[k]} />
          ))}
        </View>
      )}

      {/* Organ rows */}
      {organs.length > 0 && (
        <View style={{ marginTop: pillars ? 6 : 0, marginBottom: 4 }}>
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }} />
          {organs.map(o => (
            <OrganRow key={o.key} organ={o as any} onCta={onCta} />
          ))}
        </View>
      )}

      {/* No health data */}
      {!loading && total == null && organs.length === 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {t('health.no_health_data')}
        </Text>
      )}

      {/* Cách tăng điểm */}
      {organs.filter(o => o.status === 'urgent' || o.status === 'warn').length > 0 && (
        <View style={{ marginTop: 12 }}>
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <FontAwesome5 name="chart-line" size={12} color={colors.primary} solid />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{t('health.improve_score_tip')}</Text>
          </View>
          {organs.filter(o => o.status === 'urgent' || o.status === 'warn').slice(0, 3).map(o => (
            <TouchableOpacity
              key={o.key}
              onPress={() => onCta && onCta(ctaScreenForKey(o.key))}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.background, borderRadius: 8,
                padding: 10, marginBottom: 6,
              }}>
              <FontAwesome5
                name={o.status === 'urgent' ? 'exclamation-circle' : 'wrench'}
                size={13}
                color={organStatusColor(o.status)}
                solid
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{o.label}</Text>
                {!!o.verdict && (
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{o.verdict}</Text>
                )}
              </View>
              {(o as any).cta && (
                <FontAwesome5 name="chevron-right" size={10} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action: add reminder */}
      {needsAttention && (
        <TouchableOpacity
          onPress={onAddReminder}
          style={{
            marginTop: 8, alignSelf: 'flex-start',
            backgroundColor: colors.warning + '22', borderRadius: 8,
            paddingHorizontal: 12, paddingVertical: 6,
          }}>
          <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 13 }}>
            {t('health.add_reminder_arrow')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Trend chart */}
      {history && history.length >= 2 && (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginTop: 12 }} />
          <ScoreTrendChart points={history} />
        </>
      )}
    </View>
  );
}

/* ─── Main screen ─── */
export default function HealthScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();

  const { data: vehiclesRaw, isLoading: vehiclesLoading, isError: vehiclesError, refetch: refetchVehicles } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  // Load health for each vehicle in parallel
  const healthQueries = useQueries({
    queries: vehicles.map(v => ({
      queryKey: ['vehicles', v.id, 'health'],
      queryFn: () => vehiclesApi.health(v.id).then(r => r.data),
      enabled: !!v.id,
      retry: 1,
    })),
  });

  // Load score history for trend chart
  const historyQueries = useQueries({
    queries: vehicles.map(v => ({
      queryKey: ['vehicles', v.id, 'health-history'],
      queryFn: () =>
        client.get(`/vehicles/${v.id}/health/history`, { params: { limit: 30 } })
          .then(r => (r.data?.data ?? []) as TrendPoint[]),
      enabled: !!v.id,
      staleTime: 1000 * 60 * 60,
    })),
  });

  const isAnyLoading = healthQueries.some(q => q.isLoading);
  const isRefreshing = vehiclesLoading || isAnyLoading;

  const handleRefresh = useCallback(() => {
    refetchVehicles();
    healthQueries.forEach(q => q.refetch());
    historyQueries.forEach(q => q.refetch());
  }, [refetchVehicles, healthQueries, historyQueries]);

  if (vehiclesLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom']}>
        <AppBgPattern />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('health.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (vehiclesError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }} edges={['bottom']}>
        <AppBgPattern />
        <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{t('common.error_load')}</Text>
        <TouchableOpacity
          onPress={() => refetchVehicles()}
          style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 12 }}>
          <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (vehicles.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }} edges={['bottom']}>
        <AppBgPattern />
        <FontAwesome5 name="car-side" size={48} color={colors.textSecondary} solid style={{ marginBottom: 12 }} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{t('health.no_vehicles')}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {t('health.no_vehicles_subtitle')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
          {t('health.check_subtitle', { count: vehicles.length })}
        </Text>
        {vehicles.map((v, idx) => {
          const q = healthQueries[idx];
          const hq = historyQueries[idx];
          const healthRaw = q?.data;
          // API returns { data: { vehicle, overall, warn_count, organs, score } }
          const healthData: HealthData | null = healthRaw?.data ?? healthRaw ?? null;
          const historyData: TrendPoint[] = hq?.data ?? [];
          return (
            <HealthCard
              key={v.id}
              vehicle={v}
              health={healthData}
              loading={q?.isLoading ?? false}
              onAddReminder={() => navigation.navigate('AddReminder', { vehicleId: v.id })}
              onCta={(screen) => navigation.navigate(screen, { vehicleId: v.id })}
              history={historyData}
            />
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
