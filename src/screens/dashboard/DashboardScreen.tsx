import React, { useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Modal, FlatList, Pressable, Image,
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
import { useColors } from '../../utils/theme';
import { formatVND, formatKm } from '../../utils/format';
import { navigateFromCta } from '../../utils/navigation';
import { useAuthStore } from '../../store/authStore';
import client from '../../api/client';
import dayjs from 'dayjs';
import { useT } from '../../i18n';

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

function severityColor(s: string, primaryColor: string): string {
  if (s === 'urgent') return '#DC2626';
  if (s === 'warn') return '#D97706';
  if (s === 'good') return '#16A34A';
  return primaryColor;
}

function ctaNavigate(navigation: any, cta: { url?: string; action?: string }, vehicleId?: number) {
  navigateFromCta(navigation, cta ?? {}, vehicleId);
}

/* ─── helpers ─── */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} tr`;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />;
}
function Label({ children }: any) {
  const colors = useColors();
  return <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>{children}</Text>;
}

/* ─── vehicle selector modal ─── */
function VehicleSelector({ vehicles, selectedId, onSelect }: {
  vehicles: any[]; selectedId?: number; onSelect: (id: number) => void;
}) {
  const colors = useColors();
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = vehicles.find(v => v.id === selectedId) ?? vehicles[0];
  const label = current ? `${current.ten}${current.is_default ? ' ★' : ''}` : t('common.select_vehicle');

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
            <Text style={{ color: colors.textSecondary, fontSize: 12, padding: 14, paddingBottom: 6 }}>{t('common.select_vehicle')}</Text>
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

/* ─── Avatar component ─── */
function UserAvatar({ size = 38 }: { size?: number }) {
  const user = useAuthStore(s => s.user);
  const colors = useColors();
  const initials = (user?.name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  if (user?.avatar) {
    return (
      <Image
        source={{ uri: user.avatar }}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/* ─── screen ─── */
export default function DashboardScreen() {
  const t = useT();
  const colors = useColors();
  const nav = useNavigation<any>();
  const user = useAuthStore(s => s.user);
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

  const dashVehicleId: number | undefined =
    (raw as any)?.data?.vehicle?.id ?? selectedVehicleId;
  const { data: remindersRaw } = useQuery({
    queryKey: ['reminders', 'dash-summary', dashVehicleId],
    queryFn: () => client.get(`/vehicles/${dashVehicleId}/reminders`).then(r => r.data),
    enabled: !!dashVehicleId,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message={t('common.error_load')} onRetry={refetch} />;

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
  const odaStaleDays: number | null = d.odo_stale_days ?? null;

  const allReminders: any[] = Array.isArray(remindersRaw?.data) ? remindersRaw.data : [];
  const remindersDue = allReminders
    .filter((r: any) => r.is_active && (r.status === 'overdue' || r.status === 'danger' || r.status === 'warning'))
    .slice(0, 3);
  const remindersLoaded = !!remindersRaw;

  const healthOverall: string | null = health?.overall ?? null;
  const HEALTH_COLOR: Record<string, string> = { ok: colors.success, warn: colors.warning, urgent: colors.error };
  const HEALTH_LABEL: Record<string, string> = { ok: t('dashboard.health_band_good'), warn: t('dashboard.health_band_warn'), urgent: t('dashboard.health_band_danger'), na: t('dashboard.health_no_data') };
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fff" />}>

        {/* ── Amber header banner ── */}
        <View style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Avatar + greeting */}
            <TouchableOpacity
              onPress={() => nav.navigate('Profile')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <UserAvatar size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {dayjs().format('dddd, DD/MM')}
                </Text>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 22 }} numberOfLines={1}>
                  {t('dashboard.hello')} {user?.name?.split(' ').pop() ?? ''}
                </Text>
              </View>
            </TouchableOpacity>
            {/* Bell icon */}
            <View style={{ position: 'relative' }}>
              <TouchableOpacity
                onPress={() => nav.navigate('Notifications')}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
                  width: 42, height: 42, justifyContent: 'center', alignItems: 'center',
                }}>
                <FontAwesome5 name="bell" size={18} color="#fff" solid />
              </TouchableOpacity>
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  backgroundColor: colors.error, borderRadius: 9,
                  minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: colors.primaryText, fontSize: 10, fontWeight: '800' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Content area */}
        <View style={{ padding: 16 }}>

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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('dashboard.docs_expiring')}</Text>
              <TouchableOpacity onPress={() => effectiveVehicleId && nav.navigate('Reminders', { vehicleId: effectiveVehicleId })}>
                <Text style={{ color: colors.primary, fontSize: 12 }}>{t('dashboard.manage_arrow')}</Text>
              </TouchableOpacity>
            </View>
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
                      {l.hang_muc ?? l.label ?? l.loai}
                    </Text>
                    <Text style={{ color: chipColor, fontSize: 11 }}>
                      {days <= 0 ? t('dashboard.overdue') : t('dashboard.days_remaining', { days })}
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
              <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('dashboard.add_refuel')}</Text>
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
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{t('dashboard.add_odo')}</Text>
              {vehicle?.odo_hien_tai != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {formatKm(vehicle.odo_hien_tai)}
                </Text>
              )}
              <TouchableOpacity onPress={() => nav.navigate('OdometerList')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <FontAwesome5 name="history" size={11} color={colors.primary} solid />
                  <Text style={{ color: colors.primary, fontSize: 12 }}>{t('dashboard.odo_history_arrow')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('dashboard.log_now')}</Text>
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
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('dashboard.health')}</Text>
                <View style={{ backgroundColor: healthColor + '33', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: healthColor, fontSize: 12, fontWeight: '700' }}>{healthLabel}</Text>
                </View>
              </View>
              {health?.warn_count > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                  {t('dashboard.items_need_attention', { count: health.warn_count })}
                </Text>
              )}
            </View>
            <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}

        {/* Lời nhắc — always visible shortcut */}
        {remindersLoaded && (
          <View style={{
            backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: remindersDue.length > 0 ? 10 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome5
                  name="bell"
                  size={14}
                  color={remindersDue.length > 0 ? colors.warning : colors.textSecondary}
                  solid
                />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {t('dashboard.reminders_card_title')}
                </Text>
                {remindersDue.length > 0 && (
                  <View style={{ backgroundColor: colors.warning + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>
                      {t('dashboard.reminders_due', { count: remindersDue.length })}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => effectiveVehicleId && nav.navigate('Reminders', { vehicleId: effectiveVehicleId })}>
                <Text style={{ color: colors.primary, fontSize: 12 }}>{t('dashboard.manage_arrow')}</Text>
              </TouchableOpacity>
            </View>
            {remindersDue.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dashboard.reminders_empty')}</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {remindersDue.map((r: any, i: number) => {
                  const rColor = r.status === 'overdue' || r.status === 'danger' ? colors.error : colors.warning;
                  return (
                    <View key={i} style={{
                      backgroundColor: rColor + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                      borderWidth: 1, borderColor: rColor + '55',
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }}>
                      <FontAwesome5 name="tools" size={10} color={rColor} solid />
                      <Text style={{ color: rColor, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                        {r.hang_muc}
                      </Text>
                      {r.remaining_days != null && (
                        <Text style={{ color: rColor, fontSize: 11 }}>
                          {r.remaining_days <= 0 ? t('dashboard.overdue') : `${r.remaining_days}d`}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Gợi ý hôm nay */}
        {suggestions.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome5 name="lightbulb" size={16} color="#F59E0B" solid />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                  {t('dashboard.todo_today')}
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
                borderLeftWidth: 3, borderLeftColor: severityColor(s.severity, colors.primary),
              }}>
                <View style={{ width: 28, alignItems: 'center', marginRight: 10, marginTop: 2 }}>
                  <FontAwesome5 name={faToFA5(s.icon ?? 'fa-lightbulb')} size={16} color={severityColor(s.severity, colors.primary)} solid />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{s.title}</Text>
                  {s.why ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{s.why}</Text> : null}
                  {s.cta && (
                    <TouchableOpacity
                      onPress={() => ctaNavigate(nav, s.cta, effectiveVehicleId)}
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

        {/* ODO stale warning */}
        {odaStaleDays != null && odaStaleDays >= 14 && (
          <TouchableOpacity
            onPress={() => nav.navigate('AddOdometer')}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: colors.warning + '18', borderRadius: 12, padding: 12, marginBottom: 10,
              borderWidth: 1, borderColor: colors.warning + '44',
            }}>
            <FontAwesome5 name="road" size={14} color={colors.warning} solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 13 }}>
                {t('dashboard.odo_not_updated', { days: odaStaleDays })}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                Nhấn để nhập số ODO mới - giúp tính chính xác hơn
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={12} color={colors.warning} />
          </TouchableOpacity>
        )}

        {/* Thống kê 3 ô */}
        {thisMonth && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
              <FontAwesome5 name="gas-pump" size={12} color={colors.primary} solid />
              <Label>{t('dashboard.fuel_cost_month')}</Label>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                {formatVND(monthCost)}
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
                <Label>{t('dashboard.consumption_latest')}</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                  {consumption != null ? `${Number(consumption).toFixed(1)} L/100km` : '—'}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, flex: 1 }}>
                <FontAwesome5 name="coins" size={12} color="#34d399" solid />
                <Label>{t('dashboard.total_fuel_spend')}</Label>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                  {formatVND(Number(allTime?.tong_tien ?? 0))}
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
                {t('dashboard.prediction_title')}
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
                { label: 'Quanh mốc ODO', value: prediction.next_odo ? `~${formatKm(prediction.next_odo)}` : null },
                { label: 'Lượng dự kiến', value: prediction.liters ? `~${prediction.liters} L` : null },
                { label: 'Chi phí dự kiến', value: prediction.cost ? `~${formatVND(prediction.cost)}` : null },
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
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>{t('dashboard.urgent_title')}</Text>
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
                    {isOverdue ? t('dashboard.overdue') : days != null ? t('dashboard.days_remaining', { days }) : km != null ? formatKm(km) : ''}
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
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>{t('dashboard.maintenance_forecast')}</Text>
            </View>
            {forecastItems.slice(0, 3).map((item: any, i: number) => {
              const urg = (item.remaining_days != null && item.remaining_days <= 30)
                || (item.remaining_km != null && item.remaining_km <= 500) ? colors.warning : colors.textSecondary;
              const remaining = item.remaining_days != null
                ? t('dashboard.days_remaining', { days: item.remaining_days })
                : item.remaining_km != null ? `còn ${formatKm(item.remaining_km)}` : '';
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
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>{t('dashboard.recent_refuels')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => nav.navigate('RefuelsList')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <FontAwesome5 name="gas-pump" size={12} color={colors.primary} solid />
                    <Text style={{ color: colors.primary, fontSize: 13 }}>{t('dashboard.see_all_fuel')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => nav.navigate('Timeline')}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dashboard.timeline_arrow')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {recent.slice(0, 5).map((r: any, i: number) => (
              <View key={r.id ?? i} style={{
                paddingVertical: 8,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, width: 38 }}>{dayjs(r.ngay).format('DD/MM')}</Text>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {r.cay_xang ?? '—'}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'right' }}>
                    {formatVND(r.tong_tien)}
                  </Text>
                </View>
                {(r.so_lit || r.fuel_type) ? (
                  <View style={{ paddingLeft: 38, marginTop: 2 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                      {[r.so_lit ? `${Number(r.so_lit).toFixed(1)} L` : null, r.fuel_type].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Giá xăng hôm nay */}
        {fuelBoard.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <FontAwesome5 name="coins" size={14} color={colors.primary} solid />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                  Giá xăng · {fuelBoard[0]?.ngay ? dayjs(fuelBoard[0].ngay).format('DD/MM') : ''} · Petrolimex
                </Text>
              </View>
              <TouchableOpacity onPress={() => nav.navigate('Reports')}>
                <Text style={{ color: colors.primary, fontSize: 12 }}>{t('dashboard.chart_arrow')}</Text>
              </TouchableOpacity>
            </View>
            {fuelBoard.map((f: any, i: number) => (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 7, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{f.ten}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                    {formatVND(f.gia)}
                  </Text>
                  {f.delta != null && f.delta !== 0 && (
                    <Text style={{ color: f.delta > 0 ? colors.error : colors.success, fontSize: 11 }}>
                      {(f.delta > 0 ? '▲' : '▼') + formatVND(Math.abs(f.delta))}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {!vehicle && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary }}>{t('dashboard.no_vehicle')}</Text>
          </View>
        )}

        </View>{/* end content area */}
      </ScrollView>

      <QuickAddFAB />
    </SafeAreaView>
  );
}
