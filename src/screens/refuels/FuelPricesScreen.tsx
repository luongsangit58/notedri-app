import React from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import client from '../../api/client';
import LoadingView from '../../components/LoadingView';
import { colors } from '../../utils/colors';

function fmt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v) || v === 0) return '—';
  return v.toLocaleString('vi-VN') + 'đ/L';
}

const GROUP_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  xang:   { label: 'Xăng',   color: '#F59E0B', icon: 'fire' },
  diezel: { label: 'Dầu',    color: '#3B82F6', icon: 'tint' },
  dau:    { label: 'Dầu hỏa', color: '#8B5CF6', icon: 'burn' },
};

export default function FuelPricesScreen() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['fuel-types-prices'],
    queryFn: () => client.get('/fuel-types').then((r) => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 15,
  });

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 4 }}>
          Giá xăng dầu
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
          Giá hiện hành tại Việt Nam
        </Text>

        {active.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <FontAwesome5 name="gas-pump" size={36} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, marginTop: 12, textAlign: 'center' }}>
              Chưa có dữ liệu giá.
            </Text>
          </View>
        )}

        {Object.entries(byGroup).map(([group, items]) => {
          const cfg = GROUP_LABELS[group] ?? { label: group, color: colors.textSecondary, icon: 'gas-pump' };
          return (
            <View key={group} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FontAwesome5 name={cfg.icon} size={14} color={cfg.color} solid />
                <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {cfg.label}
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

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          Nguồn: dữ liệu nhà nước — cập nhật theo kỳ điều chỉnh
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
