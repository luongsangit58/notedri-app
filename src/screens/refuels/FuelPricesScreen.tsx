import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import client from '../../api/client';
import LoadingView from '../../components/LoadingView';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { useT } from '../../i18n';
import { formatVND } from '../../utils/format';

function fmt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v) || v === 0) return '—';
  return formatVND(v) + '/L';
}

const GROUP_LABELS: Record<string, { labelKey: string; color: string; icon: string }> = {
  xang:   { labelKey: 'fuel_prices.group_gasoline', color: '#F59E0B', icon: 'fire' },
  diezel: { labelKey: 'fuel_prices.group_diesel',   color: '#3B82F6', icon: 'tint' },
  dau:    { labelKey: 'fuel_prices.group_kerosene', color: '#8B5CF6', icon: 'burn' },
};

const SERIES_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#a855f7'];

/* ─── Mini line chart using Views ─── */
function MiniLineChart({ series, labels }: { series: any[]; labels: string[] }) {
  const colors = useColors();
  const t = useT();
  const CHART_H = 80;
  const CHART_W_PER_PT = 8;
  const visibleSeries = series.filter(s => s.data && s.data.some((v: any) => v != null));
  if (visibleSeries.length === 0 || labels.length < 2) return null;

  const n = labels.length;
  const allVals: number[] = visibleSeries.flatMap(s => s.data.filter((v: any) => v != null));
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const range = hi - lo || 1;

  const toY = (v: number | null) => {
    if (v == null) return null;
    return CHART_H - Math.round(((v - lo) / range) * (CHART_H - 8));
  };

  // Show last 2 date labels
  const firstLabel = labels[0]?.slice(5) ?? '';
  const lastLabel = labels[n - 1]?.slice(5) ?? '';

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
        {t('fuel_prices.history_6months')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ height: CHART_H + 16, position: 'relative', width: n * CHART_W_PER_PT + 4 }}>
          {visibleSeries.slice(0, 4).map((s, si) => {
            const points: { x: number; y: number }[] = [];
            s.data.forEach((v: any, i: number) => {
              const y = toY(v);
              if (y != null) points.push({ x: i * CHART_W_PER_PT + 2, y });
            });
            return points.map((pt, pi) => {
              if (pi === points.length - 1) return null;
              const next = points[pi + 1];
              const dx = next.x - pt.x;
              const dy = next.y - pt.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View key={`${si}-${pi}`} style={{
                  position: 'absolute',
                  left: pt.x, top: pt.y,
                  width: len, height: 2,
                  backgroundColor: s.color ?? SERIES_COLORS[si],
                  opacity: 0.85,
                  transform: [{ rotate: `${angle}deg` }, { translateY: -1 }],
                  transformOrigin: 'left center',
                }} />
              );
            });
          })}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{firstLabel}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{lastLabel}</Text>
      </View>
      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {visibleSeries.slice(0, 4).map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 3, backgroundColor: s.color ?? SERIES_COLORS[i], borderRadius: 2 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{s.label}</Text>
            {s.last != null && (
              <Text style={{ color: colors.text, fontSize: 10, fontWeight: '600' }}>
                {formatVND(s.last)}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── Tab ─── */
type TabKey = 'current' | 'history';

export default function FuelPricesScreen() {
  const colors = useColors();
  const t = useT();
  const [tab, setTab] = useState<TabKey>('current');

  const { data, isLoading, refetch: refetchTypes, isFetching: fetchingTypes } = useQuery({
    queryKey: ['fuel-types-prices'],
    queryFn: () => client.get('/fuel-types').then((r) => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 15,
  });

  const { data: histData, isFetching: fetchingHist, refetch: refetchHist } = useQuery({
    queryKey: ['fuel-price-history'],
    queryFn: () => client.get('/refuels/fuel-price-history').then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 30,
    enabled: tab === 'history',
  });

  const refetch = () => { refetchTypes(); if (tab === 'history') refetchHist(); };
  const isFetching = fetchingTypes || fetchingHist;

  if (isLoading) return <LoadingView />;

  const types: any[] = Array.isArray(data) ? data : [];
  const active = types.filter((t) => t.kich_hoat && t.gia_hien_tai != null);

  const byGroup: Record<string, any[]> = {};
  for (const t of active) {
    const g = t.nhom ?? 'khac';
    byGroup[g] = byGroup[g] ?? [];
    byGroup[g].push(t);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}
        contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, contentWide]}>

        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 4 }}>
          {t('fuel_prices.title')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
          {t('fuel_prices.subtitle')}
        </Text>

        {/* Tab switcher */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 4, marginBottom: 20 }}>
          {(['current', 'history'] as TabKey[]).map(key => (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                backgroundColor: tab === key ? colors.primary : 'transparent',
              }}>
              <Text style={{ color: tab === key ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                {key === 'current' ? t('fuel_prices.tab_current') : t('fuel_prices.tab_history')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Current prices */}
        {tab === 'current' && (
          <>
            {active.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <FontAwesome5 name="gas-pump" size={36} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('fuel_prices.no_current_data')}</Text>
              </View>
            )}
            {Object.entries(byGroup).map(([group, items]) => {
              const cfg = GROUP_LABELS[group] ?? { labelKey: '', color: colors.textSecondary, icon: 'gas-pump' };
              const groupLabel = cfg.labelKey ? t(cfg.labelKey as any) : group;
              return (
                <View key={group} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <FontAwesome5 name={cfg.icon} size={14} color={cfg.color} solid />
                    <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {groupLabel}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
                    {items.map((t, i) => (
                      <View key={t.id} style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 14,
                        borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
                      }}>
                        <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{t.ten}</Text>
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
                          {fmt(t.gia_hien_tai)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Price history chart */}
        {tab === 'history' && (
          <>
            {!histData || histData.empty ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <FontAwesome5 name="chart-line" size={36} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('fuel_prices.no_history_data')}</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16 }}>
                <MiniLineChart series={histData.series ?? []} labels={histData.labels ?? []} />
              </View>
            )}
          </>
        )}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 16 }}>
          {t('fuel_prices.source')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
