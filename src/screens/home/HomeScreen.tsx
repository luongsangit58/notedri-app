import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, FlatList, Pressable, Image, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { vehicleIcon } from '../../utils/vehicleIcon';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthStore } from '../../store/authStore';
import { useDashboard } from '../../hooks/useDashboard';
import { formatVND, formatKm } from '../../utils/format';
import client from '../../api/client';

function VehicleSelector({ vehicles, selectedId, onSelect }: {
  vehicles: any[]; selectedId?: number; onSelect: (id: number) => void;
}) {
  const colors = useColors();
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = vehicles.find((v) => v.id === selectedId) ?? vehicles[0];
  if (!current) return null;
  const nameOf = (v: any) => v?.ten ?? v?.name ?? v?.ten_xe ?? t('home.vehicle_fallback', { id: v?.id });

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
          borderWidth: 1, borderColor: colors.border,
        }}>
        <FontAwesome5 name={vehicleIcon(current)} size={16} color={colors.primary} solid />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={1}>
          {nameOf(current)}
        </Text>
        {vehicles.length > 1 && <FontAwesome5 name="chevron-down" size={13} color={colors.textSecondary} />}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 32 }} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }}>
            <FlatList
              data={vehicles}
              keyExtractor={(v) => String(v.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item.id); setOpen(false); }}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome5 name={vehicleIcon(item)} size={14} color={item.id === selectedId ? colors.primary : colors.textSecondary} solid />
                  <Text style={{ color: item.id === selectedId ? colors.primary : colors.text, fontWeight: item.id === selectedId ? '700' : '500', fontSize: 15 }}>
                    {nameOf(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const FA5_ICON_MAP: Record<string, string> = {
  'cloud-bolt': 'bolt',
  'cloud-showers-heavy': 'cloud-rain',
};

function WeatherCard({ data, loading }: { data: any; loading: boolean }) {
  const colors = useColors();
  if (loading) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FontAwesome5 name="cloud-sun" size={13} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>...</Text>
      </View>
    );
  }
  if (!data) return null;
  const rawIcon = (data.condition?.icon ?? 'fa-sun').replace('fa-', '');
  const icon = FA5_ICON_MAP[rawIcon] ?? rawIcon;
  const aqi = data.aqi;
  const aqiColors: Record<string, string> = {
    emerald: '#10b981', amber: '#f59e0b', orange: '#f97316', rose: '#f43f5e',
  };
  const aqiColor = aqiColors[aqi?.tone ?? ''] ?? colors.textSecondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <FontAwesome5 name={icon} size={14} color="#38bdf8" solid />
      {data.temp != null && (
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{data.temp}°</Text>
      )}
      {aqi && (
        <Text style={{ color: aqiColor, fontSize: 12, fontWeight: '600' }}>AQI {aqi.value}</Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const colors = useColors();
  const t = useT();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
          setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }).catch(() => {});
      }
    });
  }, []);

  const { data: weatherData, isLoading: isWeatherLoading } = useQuery({
    queryKey: ['weather', coords?.lat, coords?.lng],
    queryFn: () => client.get('/weather', { params: { lat: coords!.lat, lng: coords!.lng } }).then(r => r.data?.data ?? null),
    enabled: !!coords,
    staleTime: 1000 * 60 * 30,
  });

  const { data: notifData } = useNotifications();
  const unreadCount: number = notifData?.meta?.unread_count
    ?? (Array.isArray(notifData?.data) ? notifData.data.filter((n: any) => !n.read).length : 0);

  useEffect(() => {
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  const user = useAuthStore(s => s.user);

  const { data: vehiclesRaw, refetch: refetchVehicles, isFetching, isLoading: vehiclesLoading } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);
  const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
  const vehicleId = selectedVehicleId ?? defaultVehicle?.id;
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleName = vehicle?.ten ?? vehicle?.name ?? vehicle?.ten_xe ?? '';

  // Dashboard data for quick stats strip
  // Note: useDashboard returns r.data (Axios), but the actual fields are at r.data.data
  const { data: dashRaw, refetch: refetchDash } = useDashboard(vehicleId);
  const dash: any = (dashRaw as any)?.data ?? {};
  const thisMonth = dash.this_month;
  const allTime = dash.all_time;
  const consumption = dash.consumption;

  // Upcoming reminders
  const { data: remRaw, refetch: refetchRem, isFetching: remFetching } = useQuery({
    queryKey: ['home-reminders', vehicleId],
    queryFn: () => client.get(`/vehicles/${vehicleId}/reminders`).then((r) => r.data),
    enabled: !!vehicleId,
  });
  const reminders: any[] = (remRaw?.data ?? []).map((x: any) => (x && x.reminder ? { ...x.reminder, ...x.eval } : x));
  const upcomingAll = reminders
    .filter((r) => r.remaining_days != null)
    .sort((a, b) => (a.remaining_days ?? 9999) - (b.remaining_days ?? 9999));
  const topHighlight = upcomingAll.find((r) => r.remaining_days != null && r.remaining_days <= 30) ?? null;
  const upcoming = upcomingAll.slice(0, 3);

  const onRefresh = () => { refetchVehicles(); refetchRem(); refetchDash(); };

  // Chống "giật gây bấm nhầm": chờ dữ liệu chính (xe + lời nhắc quyết định banner NỔI BẬT)
  // load xong mới dựng dashboard, tránh các section pop-in đẩy nút xuống lúc user đang bấm.
  const booting = vehiclesLoading || (!!vehicleId && remRaw === undefined && remFetching);
  if (booting) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <AppBgPattern />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppBgPattern />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>NoteDri</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <WeatherCard data={weatherData} loading={isWeatherLoading && !!coords} />
            <TouchableOpacity onPress={() => nav.navigate('Profile')} style={{ position: 'relative' }}>
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border }}
                />
              ) : (
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: colors.primary + '22',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: colors.border,
                }}>
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                    {(user?.name ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => nav.navigate('Notifications')} style={{ padding: 2 }}>
              <View style={{ position: 'relative' }}>
                <FontAwesome5 name="bell" size={18} color={colors.text} solid />
                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute', top: -4, right: -4,
                    backgroundColor: '#ef4444', borderRadius: 8,
                    minWidth: 16, height: 16,
                    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 14 }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Vehicle selector */}
        {vehicles.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <VehicleSelector vehicles={vehicles} selectedId={vehicleId} onSelect={setSelectedVehicleId} />
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => nav.navigate('AddVehicle')}
            style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
            <FontAwesome5 name="plus-circle" size={20} color={colors.primary} solid />
            <Text style={{ color: colors.text, marginTop: 8, fontWeight: '600' }}>{t('vehicles.add')}</Text>
          </TouchableOpacity>
        )}

        {/* Noi bat - viec gap nhat */}
        {topHighlight && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => vehicleId && nav.navigate('Reminders', { vehicleId })}
            style={{
              borderRadius: 16, marginBottom: 12, overflow: 'hidden',
              borderWidth: 1, borderColor: topHighlight.remaining_days <= 0 ? '#ef4444' : colors.warning,
            }}>
          <LinearGradient
            colors={topHighlight.remaining_days <= 0 ? ['#991b1b', '#7f1d1d'] : ['#334155', '#1e293b']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff1a', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome5 name="exclamation-circle" size={20} color={topHighlight.remaining_days <= 0 ? '#fca5a5' : colors.warning} solid />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 2 }}>
                {t('home.highlight')}
              </Text>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{topHighlight.hang_muc}</Text>
              <Text style={{ color: '#cbd5e1', fontSize: 13, marginTop: 1 }}>
                {topHighlight.remaining_days <= 0
                  ? t('dashboard.overdue')
                  : t('dashboard.days_remaining', { days: topHighlight.remaining_days })}
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color="#94a3b8" />
          </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Rich CTA cards - 2 col */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>

          {/* Do xang - amber gradient (from-amber-300 to-amber-600, khớp web) */}
          <LinearGradient colors={['#fcd34d', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('AddRefuel')}
              style={{ padding: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>
                <FontAwesome5 name="gas-pump" size={16} color="#1c1917" solid />
              </View>
              <Text style={{ color: '#1c1917', fontWeight: '800', fontSize: 14 }}>
                {t('dashboard.add_refuel')}
              </Text>
              <Text style={{ color: 'rgba(0,0,0,0.55)', fontSize: 11, marginTop: 2 }}>
                {t('home.refuel_subtitle')}
              </Text>
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('NearbyStations', { standalone: true, latitude: coords?.lat, longitude: coords?.lng })}
              style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <FontAwesome5 name="map-marker-alt" size={9} color="rgba(0,0,0,0.65)" solid />
              <Text style={{ color: 'rgba(0,0,0,0.65)', fontSize: 11, fontWeight: '600' }}>
                {t('home.find_station')}
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Cap nhat ODO - slate gradient (from-slate-600 to-slate-800, khớp web) */}
          <LinearGradient colors={['#475569', '#1e293b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('AddOdometer')}
              style={{ padding: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(245,158,11,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>
                <FontAwesome5 name="road" size={16} color="#f59e0b" solid />
              </View>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {t('dashboard.add_odo')}
              </Text>
              {vehicle?.odo_hien_tai != null ? (
                <Text style={{ color: '#f1f5f9', fontSize: 12, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                  {formatKm(vehicle.odo_hien_tai)}
                </Text>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
                  {t('home.odo_hint')}
                </Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('OdometerList')}
              style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <FontAwesome5 name="history" size={9} color="rgba(255,255,255,0.7)" solid />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>
                {t('home.odo_history')}
              </Text>
            </TouchableOpacity>
          </LinearGradient>

        </View>

        {/* Bảo dưỡng - Nhật ký thứ 3 (gọn hơn, 1 hàng) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => nav.navigate('Services')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 12,
            borderWidth: 1, borderColor: colors.border,
          }}>
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: '#10b98122', alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="wrench" size={15} color="#10b981" solid />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{t('home.service_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{t('home.service_subtitle')}</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* GPS hero */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => vehicleId ? nav.navigate('GpsTrips', { vehicleId, vehicleName }) : nav.navigate('AddVehicle')}
          style={{
            borderRadius: 18, marginBottom: 12, overflow: 'hidden',
            shadowColor: '#16A34A', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
          }}>
          {/* GPS green gradient (from-green-500 to-green-700, khớp web) */}
          <LinearGradient colors={['#22c55e', '#15803d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesome5 name="route" size={26} color="#fff" solid />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                {t('home.gps_title')}
              </Text>
              <View style={{ backgroundColor: '#ffffff33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                  {t('home.gps_new')}
                </Text>
              </View>
            </View>
            <Text style={{ color: '#ffffffcc', fontSize: 13, marginTop: 2 }}>
              {t('home.gps_subtitle')}
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={16} color="#ffffffcc" />
          </LinearGradient>
        </TouchableOpacity>

        {/* So lieu nhanh (stats strip) */}
        {vehicleId && dashRaw && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => nav.navigate('Overview')}
            style={{
              flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14,
              paddingVertical: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border,
            }}>
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 3 }}>
                {t('home.stat_this_month')}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                {thisMonth ? formatVND(Number(thisMonth.tong_tien ?? 0)) : '-'}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 3 }}>L/100KM</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                {consumption != null ? `${Number(consumption).toFixed(1)}` : '-'}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 3 }}>
                {t('home.stat_total')}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                {allTime ? formatVND(Number(allTime.tong_tien ?? 0)) : '-'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Upcoming reminders */}
        {upcoming.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t('vehicles.upcoming_reminders')}</Text>
              <TouchableOpacity onPress={() => vehicleId && nav.navigate('Reminders', { vehicleId })}>
                <Text style={{ color: colors.primary, fontSize: 13 }}>
                  {t('home.see_all')}
                </Text>
              </TouchableOpacity>
            </View>
            {upcoming.map((r, i) => {
              const days = r.remaining_days;
              const urgent = days != null && days <= 30 ? colors.error : days != null && days <= 90 ? colors.warning : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={r.id ?? i}
                  activeOpacity={0.6}
                  onPress={() => r.id != null && nav.navigate('EditReminder', { reminderId: r.id, vehicleId })}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 }}>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{r.hang_muc}</Text>
                  <Text style={{ color: urgent, fontSize: 13, fontWeight: '700' }}>
                    {days <= 0 ? t('dashboard.overdue') : t('dashboard.days_remaining', { days })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Link to full overview */}
        <TouchableOpacity
          onPress={() => nav.navigate('Overview')}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: colors.border,
          }}>
          <FontAwesome5 name="chart-pie" size={15} color={colors.primary} solid />
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>
            {t('home.overview_report')}
          </Text>
          <FontAwesome5 name="arrow-right" size={13} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
