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

/* ─── helpers ─── */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString('vi-VN');
}
function fmtFull(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ'; }

function Card({ children, style }: any) {
  return <View style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }, style]}>{children}</View>;
}
function Label({ children }: any) {
  return <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 2 }}>{children}</Text>;
}
function SectionTitle({ children }: any) {
  return <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 10 }}>{children}</Text>;
}
function Divider() {
  return <View style={{ width: 1, backgroundColor: colors.border }} />;
}

/* ─── screen ─── */
export default function DashboardScreen() {
  const { user } = useAuthStore();
  const nav = useNavigation<any>();
  const { data: raw, isLoading, isError, refetch, isFetching } = useDashboard();

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được dữ liệu" onRetry={refetch} />;

  const d = raw?.data ?? {};
  const vehicle = d.vehicle;
  const thisMonth = d.this_month;
  const lastMonth = d.last_month;
  const allTime = d.all_time;
  const consumption = d.consumption;
  const prediction = d.prediction;
  const health = d.health_report;
  const legal = Array.isArray(d.legal) ? d.legal : [];
  const forecastData = d.forecast ?? {};
  const forecastItems: any[] = Array.isArray(forecastData.items) ? forecastData.items : [];
  const suggestions: any[] = Array.isArray(d.suggestions) ? d.suggestions : [];
  const recent: any[] = Array.isArray(d.recent) ? d.recent : [];
  const fuelBoard: any[] = Array.isArray(d.fuel_board) ? d.fuel_board : [];

  const healthScore = health?.score ?? health?.health_score ?? null;
  const healthColor = healthScore == null ? colors.textSecondary
    : healthScore >= 80 ? colors.success
    : healthScore >= 50 ? colors.warning : colors.error;
  const healthLabel = healthScore == null ? '' : healthScore >= 80 ? 'Tốt' : healthScore >= 50 ? 'Trung bình' : 'Cần chú ý';

  // % thay đổi chi xăng so tháng trước
  const monthCost = Number(thisMonth?.tong_tien ?? 0);
  const lastCost = Number(lastMonth?.tong_tien ?? 0);
  const monthDelta = lastCost > 0 ? Math.round(((monthCost - lastCost) / lastCost) * 100) : null;

  // Các cảnh báo: legal + forecast items urgent
  const urgentItems = [
    ...legal.filter((i: any) => (i.remaining_days ?? 999) <= 90),
    ...forecastItems.filter((i: any) => (i.remaining_days ?? 999) <= 30 || (i.remaining_km ?? 999) <= 500),
  ].slice(0, 4);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Greeting */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Xin chào,</Text>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{user?.name}</Text>
        </View>

        {/* Quick actions */}
        {vehicle && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => nav.navigate('AddRefuel')}
              style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>⛽ Đổ xăng</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>Ghi nhanh, tự động tính toán</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => nav.navigate('AddOdometer')}
              style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>📍 Cập nhật ODO</Text>
              {vehicle.odo_hien_tai != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {Number(vehicle.odo_hien_tai).toLocaleString('vi-VN')} km
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Sức khoẻ xe */}
        {healthScore != null && (
          <Card style={{
            borderLeftWidth: 3,
            borderLeftColor: healthColor,
            flexDirection: 'row', alignItems: 'center',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                💪 Sức khoẻ xe · <Text style={{ color: healthColor }}>{healthLabel}</Text>
              </Text>
              {health?.issues_count > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                  Có {health.issues_count} mục cần để ý
                </Text>
              )}
            </View>
            <Text style={{ color: healthColor, fontSize: 32, fontWeight: '800', marginLeft: 12 }}>{healthScore}</Text>
          </Card>
        )}

        {/* Gợi ý hôm nay */}
        {suggestions.length > 0 && (
          <Card style={{ borderLeftWidth: 3, borderLeftColor: colors.warning }}>
            <SectionTitle>💡 Việc cần làm hôm nay</SectionTitle>
            {suggestions.slice(0, 3).map((s: any, i: number) => (
              <View key={s.key ?? i} style={{ marginBottom: i < suggestions.length - 1 ? 10 : 0 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{s.title}</Text>
                {s.why ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{s.why}</Text> : null}
              </View>
            ))}
          </Card>
        )}

        {/* Thống kê 3 cột */}
        {(thisMonth || consumption || allTime) && (
          <Card>
            <SectionTitle>📊 Thống kê</SectionTitle>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Label>Chi xăng tháng này</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
                  {fmt(monthCost)}đ
                </Text>
                {monthDelta !== null && (
                  <Text style={{ color: monthDelta <= 0 ? colors.success : colors.error, fontSize: 11, marginTop: 1 }}>
                    {monthDelta > 0 ? '▲' : '▼'}{Math.abs(monthDelta)}% vs tháng trước
                  </Text>
                )}
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {thisMonth?.so_lan ?? 0} lần · {Number(thisMonth?.tong_lit ?? 0).toFixed(1)} L
                </Text>
              </View>
              <Divider />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Label>Tiêu thụ gần nhất</Label>
                {consumption != null ? (
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
                    {Number(consumption).toFixed(1)} <Text style={{ fontSize: 12 }}>L/100km</Text>
                  </Text>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Chưa đủ data</Text>
                )}
              </View>
              <Divider />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Label>Tổng chi xăng</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
                  {fmt(Number(allTime?.tong_tien ?? 0))}đ
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {allTime?.so_lan ?? 0} lần đổ
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Dự đoán lần đổ tiếp theo */}
        {prediction && (
          <Card>
            <SectionTitle>🔮 Dự đoán lần đổ tiếp theo</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {prediction.next_date && (
                <View style={{ flex: 1, minWidth: 100 }}>
                  <Label>Dự kiến vào</Label>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>
                    {dayjs(prediction.next_date).format('DD/MM/YYYY')}
                  </Text>
                  {prediction.days_left != null && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      còn ~{prediction.days_left} ngày
                    </Text>
                  )}
                </View>
              )}
              {prediction.next_odo && (
                <View style={{ flex: 1, minWidth: 100 }}>
                  <Label>Quanh mốc ODO</Label>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                    ~{Number(prediction.next_odo).toLocaleString('vi-VN')} km
                  </Text>
                </View>
              )}
              {prediction.liters && (
                <View style={{ flex: 1, minWidth: 100 }}>
                  <Label>Lượng dự kiến</Label>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>~{prediction.liters} L</Text>
                </View>
              )}
              {prediction.cost && (
                <View style={{ flex: 1, minWidth: 100 }}>
                  <Label>Chi phí dự kiến</Label>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                    ~{fmtFull(prediction.cost)}
                  </Text>
                </View>
              )}
            </View>
            {prediction.samples > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
                Trung bình ~{prediction.avg_km} km/lần · dựa trên {prediction.samples} lần gần nhất
              </Text>
            )}
          </Card>
        )}

        {/* Cảnh báo pháp lý + bảo dưỡng */}
        {urgentItems.length > 0 && (
          <Card style={{ borderLeftWidth: 3, borderLeftColor: colors.error }}>
            <SectionTitle>⚠️ Cần chú ý</SectionTitle>
            {urgentItems.map((item: any, i: number) => {
              const days = item.remaining_days;
              const km = item.remaining_km;
              const label = item.hang_muc ?? item.label ?? item.service_type;
              const isOverdue = (days != null && days <= 0) || (km != null && km <= 0);
              const urgentColor = isOverdue ? colors.error : (days != null && days <= 30) ? colors.warning : colors.textSecondary;
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{label}</Text>
                  <Text style={{ color: urgentColor, fontSize: 12, fontWeight: '700', marginLeft: 8 }}>
                    {isOverdue ? 'Quá hạn'
                      : days != null ? `${days} ngày`
                      : km != null ? `${km} km` : ''}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        {/* Dự kiến bảo dưỡng */}
        {forecastItems.length > 0 && (
          <Card>
            <SectionTitle>🔧 Dự kiến bảo dưỡng sắp tới</SectionTitle>
            {forecastItems.slice(0, 3).map((item: any, i: number) => {
              const remaining = item.remaining_days != null
                ? `còn ${item.remaining_days} ngày`
                : item.remaining_km != null
                ? `còn ${Number(item.remaining_km).toLocaleString('vi-VN')} km`
                : '';
              const urgentColor = (item.remaining_days != null && item.remaining_days <= 30)
                || (item.remaining_km != null && item.remaining_km <= 500)
                ? colors.warning : colors.textSecondary;
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>{item.hang_muc}</Text>
                    {remaining ? <Text style={{ color: urgentColor, fontSize: 12 }}>{remaining}</Text> : null}
                  </View>
                  {item.est_cost ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                      ~{fmt(item.est_cost)}đ
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}

        {/* Lần đổ gần đây */}
        {recent.length > 0 && (
          <Card>
            <SectionTitle>⛽ Lần đổ gần đây</SectionTitle>
            {recent.slice(0, 5).map((r: any, i: number) => (
              <View key={r.id ?? i} style={{
                flexDirection: 'row', justifyContent: 'space-between',
                alignItems: 'center', paddingVertical: 7,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, width: 42 }}>
                  {dayjs(r.ngay).format('DD/MM')}
                </Text>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  {r.so_lit ? `${Number(r.so_lit).toFixed(1)} L` : ''}
                  {r.fuel_type ? ` · ${r.fuel_type}` : ''}
                  {r.cay_xang ? ` · ${r.cay_xang}` : ''}
                </Text>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                  {Number(r.tong_tien).toLocaleString('vi-VN')}đ
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Giá xăng hôm nay */}
        {fuelBoard.length > 0 && (
          <Card>
            <SectionTitle>
              💰 Giá xăng hôm nay · {fuelBoard[0]?.ngay ? dayjs(fuelBoard[0].ngay).format('DD/MM') : ''}
            </SectionTitle>
            {fuelBoard.map((f: any, i: number) => (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{f.ten}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                    {Number(f.gia).toLocaleString('vi-VN')}đ
                  </Text>
                  {f.delta != null && (
                    <Text style={{ color: f.delta > 0 ? colors.error : f.delta < 0 ? colors.success : colors.textSecondary, fontSize: 11 }}>
                      {f.delta > 0 ? `▲${f.delta}` : f.delta < 0 ? `▼${Math.abs(f.delta)}` : '–'}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}

        {!vehicle && (
          <Card>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Chưa có xe nào. Vào tab Xe để thêm.</Text>
          </Card>
        )}
      </ScrollView>

      <QuickAddFAB />
    </SafeAreaView>
  );
}
