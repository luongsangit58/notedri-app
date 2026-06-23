import React, { useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Modal, FlatList, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { useDashboard } from '../../hooks/useDashboard';
import { useVehicles } from '../../hooks/useVehicles';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import QuickAddFAB from '../../components/QuickAddFAB';
import { colors } from '../../utils/colors';
import { navigateFromUrl } from '../../utils/navigation';
import client from '../../api/client';
import dayjs from 'dayjs';

/* ─── FA6 class → FA5 icon name ─── */
const FA_MAP: Record<string, string> = {
  'fa-triangle-exclamation': 'exclamation-triangle',
  'fa-id-card': 'id-card',
  'fa-screwdriver-wrench': 'tools',
  'fa-list-check': 'tasks',
  'fa-road': 'road',
  'fa-pen-to-square': 'edit',
  'fa-calendar-plus': 'calendar-plus',
  'fa-tags': 'tags',
  'fa-arrow-trend-up': 'chart-line',
  'fa-thumbs-up': 'thumbs-up',
  'fa-lightbulb': 'lightbulb',
  'fa-heart-pulse': 'heartbeat',
  'fa-comment-dots': 'comment-dots',
  'fa-rotate': 'sync',
};
function faToFA5(name: string): string {
  return FA_MAP[name] ?? name.replace(/^fa-/, '');
}

function severityColor(s: string): string {
  if (s === 'urgent') return '#DC2626';
  if (s === 'warn') return '#D97706';
  if (s === 'good') return '#16A34A';
  return colors.primary;
}

function ctaNavigate(navigation: any, cta: { url?: string }) {
  navigateFromUrl(navigation, cta?.url ?? '');
}

/* ─── helpers ─── */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} tr`;
  return n.toLocaleString('vi-VN');
}
function fmtFull(n: number) { return Number(n).toLocaleString('vi-VN') + 'đ'; }

function Divider() { return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />; }
function Label({ children }: any) { return <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>{children}</Text>; }

/* ─── vehicle selector modal ─── */
function VehicleSelector({ vehicles, selectedId, onSelect }: {
  vehicles: any[]; selectedId?: number; onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = vehicles.find(v => v.id === selectedId) ?? vehicles[0];
  const label = current ? `${current.ten}${current.is_default ? ' ★' : ''}` : 'Chọn xe';

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
          marginBottom: 14,
        }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>▼</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, padding: 14, paddingBottom: 6 }}>Chọn xe</Text>
            <FlatList
              data={vehicles}
              keyExtractor={v => String(v.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item.id); setOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ flex: 1, color: item.id === selectedId ? colors.primary : colors.text, fontWeight: '600' }}>
                    {item.ten}{item.is_default ? ' ★' : ''}
                  </Text>
                  {item.bien_so ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.bien_so}</Text> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ─── screen ─── */
export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const { data: raw, isLoading, isError, refetch, isFetching } = useDashboard(selectedVehicleId);

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: () => client.get('/notifications', { params: { page: 1 } }).then(r => r.data),
  });
  const unreadCount = notifData?.meta?.unread_count ?? notifData?.data?.filter?.((n: any) => !n.read)?.length ?? 0;

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
  const legal: any[] = Array.isArray(d.legal) ? d.legal : [];
  const forecastData = d.forecast ?? {};
  const forecastItems: any[] = Array.isArray(forecastData.items) ? forecastData.items : [];
  const suggestions: any[] = (Array.isArray(d.suggestions) ? d.suggestions : [])
    .filter((s: any) => !dismissedSuggestions.has(s.key));
  const recent: any[] = Array.isArray(d.recent) ? d.recent : [];
  const fuelBoard: any[] = Array.isArray(d.fuel_board) ? d.fuel_board : [];

  const healthOverall: string | null = health?.overall ?? null;
  const HEALTH_COLOR: Record<string, string> = { ok: colors.success, warn: colors.warning, urgent: colors.error };
  const HEALTH_LABEL: Record<string, string> = { ok: 'Tốt', warn: 'Cần chú ý', urgent: 'Nguy hiểm', na: 'Chưa đủ dữ liệu' };
  const healthColor = healthOverall ? (HEALTH_COLOR[healthOverall] ?? colors.textSecondary) : colors.textSecondary;
  const healthLabel = healthOverall ? (HEALTH_LABEL[healthOverall] ?? '') : '';

  const monthCost = Number(thisMonth?.tong_tien ?? 0);
  const lastCost = Number(lastMonth?.tong_tien ?? 0);
  const monthDelta = lastCost > 0 ? Math.round(((monthCost - lastCost) / lastCost) * 100) : null;

  const urgentItems = [
    ...legal.filter((i: any) => (i.remaining_days ?? 999) <= 90),
    ...forecastItems.filter((i: any) => (i.remaining_days ?? 999) <= 30 || (i.remaining_km ?? 999) <= 500),
  ].slice(0, 3);

  const effectiveVehicleId = selectedVehicleId ?? vehicle?.id;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Header row: greeting + bell */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{dayjs().format('dddd, DD/MM/YYYY')}</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Xin chào!</Text>
          </View>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              onPress={() => nav.navigate('Notifications')}
              style={{
                backgroundColor: colors.surface, borderRadius: 12,
                width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
              }}>
              <FontAwesome5 name="bell" size={22} color={colors.text} solid />
            </TouchableOpacity>
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -6,
                backgroundColor: '#F44336', borderRadius: 9,
                minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
                paddingHorizontal: 4,
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Vehicle selector */}
        {vehicles.length > 0 && (
          <VehicleSelector
            vehicles={vehicles}
            selectedId={effectiveVehicleId}
            onSelect={setSelectedVehicleId}
          />
        )}

        {/* Giấy tờ sắp hết hạn — chip strip */}
        {legal.filter((l: any) => (l.remaining_days ?? 999) <= 30).length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
              {legal.filter((l: any) => (l.remaining_days ?? 999) <= 30).map((l: any, i: number) => {
                const days = l.remaining_days ?? 0;
                const chipColor = days <= 0 ? '#F43F5E' : days <= 14 ? '#F59E0B' : '#0EA5E9';
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: chipColor + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: chipColor + '66' }}>
                    <FontAwesome5 name="id-card" size={11} color={chipColor} solid />
                    <Text style={{ color: chipColor, fontSize: 12, fontWeight: '700' }}>
                      {l.label ?? l.loai}
                    </Text>
                    <Text style={{ color: chipColor, fontSize: 11 }}>
                      {days <= 0 ? 'Quá hạn' : `còn ${days}ngày`}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Quick action: Đổ xăng — kiểu web: card cam lớn */}
        <TouchableOpacity
          onPress={() => nav.navigate('AddRefuel')}
          style={{
            backgroundColor: colors.primary, borderRadius: 14,
            padding: 18, marginBottom: 10,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 10, marginRight: 14 }}>
              <FontAwesome5 name="gas-pump" size={20} color="#fff" solid />
            </View>
            <View>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Đổ xăng</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>Ghi nhanh, tự động tính toán</Text>
            </View>
          </View>
          <Text style={{ color: '#fff', fontSize: 22 }}>→</Text>
        </TouchableOpacity>

        {/* Quick action: Cập nhật ODO — kiểu web: card tối */}
        <TouchableOpacity
          onPress={() => nav.navigate('AddOdometer')}
          style={{
            backgroundColor: colors.surface, borderRadius: 14,
            padding: 18, marginBottom: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 10, marginRight: 14 }}>
              <FontAwesome5 name="road" size={20} color={colors.textSecondary} solid />
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Cập nhật ODO</Text>
              {vehicle?.odo_hien_tai != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {Number(vehicle.odo_hien_tai).toLocaleString('vi-VN')} km
                </Text>
              )}
              <TouchableOpacity onPress={() => nav.navigate('OdometerList')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <FontAwesome5 name="history" size={11} color={colors.primary} solid />
                  <Text style={{ color: colors.primary, fontSize: 12 }}>Lịch sử ODO →</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Ghi ngay</Text>
          </View>
        </TouchableOpacity>

        {/* Sức khoẻ xe */}
        {healthOverall != null && (
          <TouchableOpacity
            onPress={() => nav.navigate('Health')}
            style={{
              backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10,
              borderLeftWidth: 4, borderLeftColor: healthColor,
              flexDirection: 'row', alignItems: 'center',
            }}>
            <View style={{ marginRight: 10 }}>
              {healthOverall !== 'ok' && (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: healthColor }} />
              )}
              {healthOverall === 'ok' && (
                <FontAwesome5 name="check-circle" size={14} color={healthColor} solid />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <FontAwesome5 name="heartbeat" size={14} color={healthColor} solid />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Sức khoẻ xe</Text>
                <View style={{ backgroundColor: healthColor + '33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: healthColor, fontSize: 12, fontWeight: '700' }}>{healthLabel}</Text>
                </View>
              </View>
              {health?.warn_count > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                  {health.warn_count} mục cần để ý — bấm xem chẩn đoán đầy đủ.
                </Text>
              )}
            </View>
            <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}

        {/* Gợi ý hôm nay */}
        {suggestions.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome5 name="lightbulb" size={16} color="#F59E0B" solid />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                  Việc cần làm hôm nay
                  <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: 12 }}> ({dayjs().format('DD/MM/YYYY')})</Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDismissedSuggestions(new Set(suggestions.map((s: any) => s.key)))}>
                <Text style={{ color: colors.textSecondary, fontSize: 18 }}>×</Text>
              </TouchableOpacity>
            </View>
            {suggestions.map((s: any, i: number) => (
              <View key={s.key ?? i} style={{
                backgroundColor: colors.background, borderRadius: 10, padding: 12,
                marginBottom: i < suggestions.length - 1 ? 8 : 0,
                flexDirection: 'row', alignItems: 'flex-start',
                borderLeftWidth: 3, borderLeftColor: severityColor(s.severity),
              }}>
                <View style={{ width: 28, alignItems: 'center', marginRight: 10, marginTop: 2 }}>
                  <FontAwesome5 name={faToFA5(s.icon ?? 'fa-lightbulb')} size={16} color={severityColor(s.severity)} solid />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{s.title}</Text>
                  {s.why ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{s.why}</Text> : null}
                  {s.cta && (
                    <TouchableOpacity
                      onPress={() => ctaNavigate(nav, s.cta)}
                      style={{
                        alignSelf: 'flex-end', marginTop: 8,
                        backgroundColor: colors.primary + '22', borderRadius: 8,
                        paddingHorizontal: 12, paddingVertical: 5,
                      }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{s.cta.label ?? 'Xem'} →</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setDismissedSuggestions(prev => new Set([...prev, s.key]))}
                  style={{ padding: 4, marginLeft: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 18 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Thống kê 3 ô */}
        {thisMonth && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
              <FontAwesome5 name="gas-pump" size={12} color={colors.primary} solid />
              <Label>Chi xăng tháng này</Label>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                {fmtFull(monthCost)}
              </Text>
              {monthDelta !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <Text style={{ color: monthDelta <= 0 ? colors.success : colors.error, fontSize: 12, fontWeight: '700' }}>
                    {monthDelta > 0 ? '▲' : '▼'}{Math.abs(monthDelta)}%
                  </Text>
                </View>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                {thisMonth.so_lan} lần · {Number(thisMonth.tong_lit ?? 0).toFixed(1)} L
              </Text>
            </View>

            <View style={{ gap: 8, flex: 1 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, flex: 1 }}>
                <FontAwesome5 name="chart-bar" size={12} color="#38bdf8" solid />
                <Label>Tiêu thụ gần nhất</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                  {consumption != null ? `${Number(consumption).toFixed(1)} L/100km` : '—'}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, flex: 1 }}>
                <FontAwesome5 name="coins" size={12} color="#34d399" solid />
                <Label>Tổng chi xăng</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                  {fmtFull(Number(allTime?.tong_tien ?? 0))}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {allTime?.so_lan ?? 0} lần đổ
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Dự đoán lần đổ tiếp theo */}
        {prediction && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <FontAwesome5 name="magic" size={14} color={colors.primary} solid />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                Dự đoán lần đổ tiếp theo
                {prediction.samples > 0 && (
                  <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: 12 }}>
                    {' '}(trung bình {prediction.samples} lần gần nhất)
                  </Text>
                )}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[
                { label: 'Dự kiến vào', value: prediction.next_date ? dayjs(prediction.next_date).format('DD/MM/YYYY') : null, sub: prediction.days_left != null ? `còn ~${prediction.days_left} ngày` : null },
                { label: 'Quanh mốc ODO', value: prediction.next_odo ? `~${Number(prediction.next_odo).toLocaleString('vi-VN')} km` : null },
                { label: 'Lượng dự kiến', value: prediction.liters ? `~${prediction.liters} L` : null },
                { label: 'Chi phí dự kiến', value: prediction.cost ? `~${fmtFull(prediction.cost)}` : null },
              ].filter(x => x.value).map((x, i) => (
                <View key={i} style={{ width: '50%', paddingRight: i % 2 === 0 ? 8 : 0, marginBottom: 10 }}>
                  <Label>{x.label}</Label>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>{x.value}</Text>
                  {x.sub ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{x.sub}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Cảnh báo urgent */}
        {urgentItems.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.error }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <FontAwesome5 name="exclamation-triangle" size={14} color={colors.warning} solid />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Cần chú ý</Text>
            </View>
            {urgentItems.map((item: any, i: number) => {
              const days = item.remaining_days;
              const km = item.remaining_km;
              const isOverdue = (days != null && days <= 0) || (km != null && km <= 0);
              const urg = isOverdue ? colors.error : (days != null && days <= 30) ? colors.warning : colors.textSecondary;
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{item.hang_muc ?? item.label}</Text>
                  <Text style={{ color: urg, fontWeight: '700', fontSize: 12, marginLeft: 8 }}>
                    {isOverdue ? 'Quá hạn' : days != null ? `${days} ngày` : km != null ? `${Number(km).toLocaleString('vi-VN')} km` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Dự kiến bảo dưỡng */}
        {forecastItems.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <FontAwesome5 name="wrench" size={14} color={colors.textSecondary} solid />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Dự kiến bảo dưỡng sắp tới</Text>
            </View>
            {forecastItems.slice(0, 3).map((item: any, i: number) => {
              const urg = (item.remaining_days != null && item.remaining_days <= 30)
                || (item.remaining_km != null && item.remaining_km <= 500) ? colors.warning : colors.textSecondary;
              const remaining = item.remaining_days != null
                ? `còn ${item.remaining_days} ngày`
                : item.remaining_km != null ? `còn ${Number(item.remaining_km).toLocaleString('vi-VN')} km` : '';
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>{item.hang_muc}</Text>
                    {remaining ? <Text style={{ color: urg, fontSize: 12 }}>{remaining}</Text> : null}
                  </View>
                  {item.est_cost ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>~{fmt(item.est_cost)}đ</Text> : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Lần đổ gần đây */}
        {recent.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome5 name="gas-pump" size={14} color={colors.text} solid />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Lần đổ gần đây</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => nav.navigate('RefuelsList')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <FontAwesome5 name="gas-pump" size={12} color={colors.primary} solid />
                    <Text style={{ color: colors.primary, fontSize: 13 }}>Xem tất cả xăng →</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => nav.navigate('Timeline')}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Dòng thời gian →</Text>
                </TouchableOpacity>
              </View>
            </View>
            {recent.slice(0, 5).map((r: any, i: number) => (
              <View key={r.id ?? i} style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, width: 38 }}>{dayjs(r.ngay).format('DD/MM')}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                  {r.so_lit ? `${Number(r.so_lit).toFixed(1)} L` : ''}
                  {r.fuel_type ? ` · ${r.fuel_type}` : ''}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {r.cay_xang ?? ''}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'right' }}>
                  {Number(r.tong_tien).toLocaleString('vi-VN')}đ
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Giá xăng hôm nay */}
        {fuelBoard.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <FontAwesome5 name="coins" size={14} color={colors.primary} solid />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                Giá xăng hôm nay · {fuelBoard[0]?.ngay ? dayjs(fuelBoard[0].ngay).format('DD/MM') : ''} · Petrolimex Vùng 1
              </Text>
            </View>
            {fuelBoard.map((f: any, i: number) => (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 7, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{f.ten}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                    {Number(f.gia).toLocaleString('vi-VN')}đ
                  </Text>
                  {f.delta != null && f.delta !== 0 && (
                    <Text style={{ color: f.delta > 0 ? colors.error : colors.success, fontSize: 11 }}>
                      {f.delta > 0 ? `▲${f.delta}` : `▼${Math.abs(f.delta)}`}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {!vehicle && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary }}>Chưa có xe nào. Vào tab Xe để thêm.</Text>
          </View>
        )}
      </ScrollView>

      <QuickAddFAB />
    </SafeAreaView>
  );
}
