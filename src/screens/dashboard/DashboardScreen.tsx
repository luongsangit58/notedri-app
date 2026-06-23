import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import QuickAddFAB from '../../components/QuickAddFAB';
import { colors } from '../../utils/colors';
import dayjs from 'dayjs';

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
      <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function SectionCard({ children, style }: any) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ children }: any) {
  return <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>{children}</Text>;
}

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const { data: raw, isLoading, isError, refetch, isFetching } = useDashboard();

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được dữ liệu" onRetry={refetch} />;

  const d = raw?.data ?? {};
  const vehicle = d.vehicle;
  const thisMonth = d.this_month;
  const health = d.health_report;
  const legal = (d.legal ?? []) as any[];
  const forecast = (d.forecast ?? []) as any[];
  const suggestions = (d.suggestions ?? []) as any[];
  const recent = (d.recent ?? []) as any[];
  const consumption = d.consumption;

  const healthScore = health?.score ?? health?.health_score ?? null;
  const healthColor = healthScore == null ? colors.textSecondary
    : healthScore >= 80 ? colors.success
    : healthScore >= 50 ? colors.warning
    : colors.error;

  const statusItems = [
    ...legal.slice(0, 2),
    ...forecast.slice(0, 2),
  ].slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Xin chào,</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{user?.name ?? 'Tài khoản'}</Text>
        </View>

        {/* Vehicle card */}
        {vehicle ? (
          <SectionCard style={{ borderWidth: 1, borderColor: colors.primary + '44' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{vehicle.ten}</Text>
                {vehicle.bien_so ? <Text style={{ color: colors.textSecondary, marginTop: 3 }}>{vehicle.bien_so}</Text> : null}
              </View>
              {healthScore != null && (
                <View style={{ alignItems: 'center', marginLeft: 16 }}>
                  <Text style={{ color: healthColor, fontSize: 28, fontWeight: '800' }}>{healthScore}</Text>
                  <Text style={{ color: healthColor, fontSize: 11 }}>Sức khoẻ</Text>
                </View>
              )}
            </View>
            {vehicle.odo_hien_tai != null && (
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>
                  📍 {Number(vehicle.odo_hien_tai).toLocaleString('vi-VN')} km
                </Text>
                {consumption != null && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 12 }}>
                    · {Number(consumption).toFixed(1)} L/100km
                  </Text>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('AddRefuel')}
                style={{ flex: 1, backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>⛽ Đổ xăng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('AddOdometer')}
                style={{ flex: 1, backgroundColor: colors.background, padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>📍 ODO</Text>
              </TouchableOpacity>
            </View>
          </SectionCard>
        ) : (
          <SectionCard>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Chưa có xe nào. Thêm xe để bắt đầu.</Text>
          </SectionCard>
        )}

        {/* Thống kê tháng này */}
        {thisMonth && (
          <SectionCard>
            <SectionTitle>Tháng này</SectionTitle>
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
              <StatBox
                value={`${thisMonth.so_lan ?? 0}`}
                label="Lần đổ xăng"
              />
              <View style={{ width: 1, backgroundColor: colors.border }} />
              <StatBox
                value={`${Number(thisMonth.tong_lit ?? 0).toFixed(1)} L`}
                label="Tổng lít"
              />
              <View style={{ width: 1, backgroundColor: colors.border }} />
              <StatBox
                value={Number(thisMonth.tong_tien ?? 0) >= 1000000
                  ? `${(Number(thisMonth.tong_tien) / 1000000).toFixed(1)}tr`
                  : `${Number(thisMonth.tong_tien ?? 0).toLocaleString('vi-VN')}đ`}
                label="Chi phí"
              />
            </View>
          </SectionCard>
        )}

        {/* Gợi ý */}
        {suggestions.length > 0 && (
          <SectionCard style={{ borderLeftWidth: 3, borderLeftColor: colors.warning }}>
            <SectionTitle>💡 Gợi ý hôm nay</SectionTitle>
            {suggestions.slice(0, 2).map((s: any, i: number) => (
              <Text key={i} style={{ color: colors.text, marginBottom: 4, fontSize: 13 }}>• {s.message ?? s.text ?? JSON.stringify(s)}</Text>
            ))}
          </SectionCard>
        )}

        {/* Nhắc nhở & pháp lý */}
        {statusItems.length > 0 && (
          <SectionCard>
            <SectionTitle>⚠️ Cần chú ý</SectionTitle>
            {statusItems.map((item: any, i: number) => {
              const days = item.remaining_days ?? item.days_remaining;
              const label = item.hang_muc ?? item.label ?? item.service_type;
              const urgentColor = days != null && days <= 30 ? colors.error : days != null && days <= 90 ? colors.warning : colors.textSecondary;
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{label}</Text>
                  {days != null && (
                    <Text style={{ color: urgentColor, fontSize: 12, fontWeight: '700' }}>
                      {days <= 0 ? 'Quá hạn' : `${days} ngày`}
                    </Text>
                  )}
                </View>
              );
            })}
          </SectionCard>
        )}

        {/* Đổ xăng gần nhất */}
        {recent.length > 0 && (
          <SectionCard>
            <SectionTitle>⛽ Đổ xăng gần đây</SectionTitle>
            {recent.slice(0, 3).map((r: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{dayjs(r.ngay).format('DD/MM')}</Text>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  {r.so_lit ? `${Number(r.so_lit).toFixed(1)} L` : ''}
                  {r.fuel_type ? ` · ${r.fuel_type}` : ''}
                </Text>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                  {Number(r.tong_tien).toLocaleString('vi-VN')}đ
                </Text>
              </View>
            ))}
          </SectionCard>
        )}
      </ScrollView>

      <QuickAddFAB />
    </SafeAreaView>
  );
}
