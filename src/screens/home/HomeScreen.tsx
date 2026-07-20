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
import { fuelTypeMeta } from '../../utils/fuelType';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthStore } from '../../store/authStore';
import AdMobBanner from '../../components/AdMobBanner';
import { useDashboard } from '../../hooks/useDashboard';
import { formatVND, formatKm } from '../../utils/format';
import { flattenReminders } from '../../utils/reminders';
import { getMostRecentPairing, PairedDevice } from '../../services/obd/pairedDevices';
import { useObdSessionStore } from '../../store/obdSessionStore';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
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
        {/* Icon nhiên liệu theo màu - đồng bộ cách hiển thị với danh sách "Xe của tôi" */}
        {current.fuel_type && (
          <FontAwesome5 name={fuelTypeMeta(current).icon} size={13} color={fuelTypeMeta(current).color} solid />
        )}
        {vehicles.length > 1 && <FontAwesome5 name="chevron-down" size={13} color={colors.textSecondary} />}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 32 }} onPress={() => setOpen(false)}>
          {/* Cap bề rộng danh sách chọn xe - màn ngang (head-unit) rất rộng nên list không kéo dài hết ngang */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            <FlatList
              data={vehicles}
              keyExtractor={(v) => String(v.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item.id); setOpen(false); }}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome5 name={vehicleIcon(item)} size={14} color={item.id === selectedId ? colors.primary : colors.textSecondary} solid />
                  <Text style={{ color: item.id === selectedId ? colors.primary : colors.text, fontWeight: item.id === selectedId ? '700' : '500', fontSize: 15, flex: 1 }}>
                    {nameOf(item)}
                  </Text>
                  {item.fuel_type && (
                    <FontAwesome5 name={fuelTypeMeta(item).icon} size={12} color={fuelTypeMeta(item).color} solid />
                  )}
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

  // Lưu TOÀN CỤC (không phải state riêng của Home) - để Lời nhắc/ODO/Đổ xăng mở
  // qua tab bar/FAB (không có route.params.vehicleId) vẫn hiểu đúng xe đang xem
  // thay vì luôn rơi về xe mặc định (tester báo bấm thẳng icon "Lời nhắc" ở tab
  // bar vẫn hiện xe mặc định dù đang chọn xe khác trên Home).
  const selectedVehicleId = useSelectedVehicleStore(s => s.selectedVehicleId) ?? undefined;
  const setSelectedVehicleId = useSelectedVehicleStore(s => s.setSelectedVehicleId);
  const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
  const vehicleId = selectedVehicleId ?? defaultVehicle?.id;
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleName = vehicle?.ten ?? vehicle?.name ?? vehicle?.ten_xe ?? '';
  // Xe hybrid (xăng lai điện): có CẢ xăng lẫn điện -> hiện cả cây xăng + trạm sạc.
  const isHybrid: boolean = vehicle?.is_hybrid ?? /hybrid/i.test(String(vehicle?.fuel_type ?? ''));
  // Xe điện? Ưu tiên cờ is_ev từ API, dự phòng đoán theo fuel_type -> hiện UI sạc điện.
  // Hybrid KHÔNG tính là xe điện thuần (vẫn đổ xăng là chính).
  const isEv: boolean = !isHybrid && (vehicle?.is_ev ?? /điện|electric|\bev\b/i.test(String(vehicle?.fuel_type ?? '')));
  // Xe điện: thẻ nạp năng lượng dùng green gradient + chữ trắng (khác xe xăng amber/chữ tối).
  // Xe hybrid: gradient xanh+cam (vừa xăng vừa điện) - rà soát 20/7 (tester báo card
  // hybrid cũ ghép 2 dòng riêng "Cây xăng"/"Trạm sạc" trông rối).
  const energyColors = (isEv ? ['#10b981', '#047857'] : isHybrid ? ['#10b981', '#f59e0b'] : ['#fcd34d', '#d97706']) as [string, string];
  const energyText = (isEv || isHybrid) ? '#ffffff' : '#1c1917';
  const energySub = (isEv || isHybrid) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';

  // Thẻ OBD quick-connect (C4): CHỈ hiện khi user có thiết bị đã ghép - user chưa
  // có adapter không bị spam; pairing dùng gần nhất quyết định xe mặc định.
  // Refresh mỗi lần tab Home được focus: Home mount TRƯỚC lần ghép đầu tiên nên
  // chỉ load lúc mount là thẻ không bao giờ xuất hiện trong phiên đó (bug Sang báo).
  const [obdPairing, setObdPairing] = useState<PairedDevice | null>(null);
  const obdSession = useObdSessionStore();
  const isPremiumUser = useAuthStore((s) => s.user?.is_premium ?? false);
  useEffect(() => {
    const refresh = () => getMostRecentPairing().then(setObdPairing).catch(() => {});
    refresh();
    const unsubscribe = nav.addListener('focus', refresh);
    return unsubscribe;
  }, [nav]);
  // Cá nhân hoá độ nổi bật OBD2 (rà soát 16/7, góp ý user): user ĐÃ từng ghép/
  // đang kết nối OBD2 -> đây rõ ràng là tính năng họ dùng thật, nâng lên hero
  // NGANG HÀNG GPS (trước đây OBD2 luôn là card nhỏ dù đã dùng, GPS luôn hero -
  // lệch cảm nhận "GPS mới là chính"). User CHƯA từng dùng (đặc biệt Free) ->
  // giữ nguyên card nhỏ + crown để dẫn phễu nâng cấp, không áp đảo ngay từ đầu
  // bằng 1 tính năng họ chưa chắc sẽ mua adapter để dùng.
  const obdEngaged = !!(obdPairing || obdSession.connected);

  // Dashboard data for quick stats strip
  // Note: useDashboard returns r.data (Axios), but the actual fields are at r.data.data
  const { data: dashRaw, refetch: refetchDash } = useDashboard(vehicleId, { enabled: !!vehicleId });
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
  const reminders: any[] = flattenReminders(remRaw);
  const upcomingAll = reminders
    .filter((r) => r.remaining_days != null)
    .sort((a, b) => (a.remaining_days ?? 9999) - (b.remaining_days ?? 9999));
  const topHighlight = upcomingAll.find((r) => r.remaining_days != null && r.remaining_days <= 30) ?? null;
  const upcoming = upcomingAll.slice(0, 3);

  const onRefresh = () => { refetchVehicles(); refetchRem(); refetchDash(); };

  // Chỉ chặn màn hình chờ DUY NHẤT /vehicles (dữ liệu tối thiểu để dựng UI: chọn
  // xe, các thẻ CTA chính). Trước đây còn đợi CẢ /reminders xong mới bỏ spinner -
  // 2 request chạy nối đuôi (reminders cần vehicleId lấy từ vehicles) cộng dồn
  // thời gian chờ thay vì song song, "lâu lâu" (mạng yếu/cache hết hạn sau 5 phút
  // không mở app) có thể treo spinner toàn màn hình gần 1-2 phút (phản hồi 15/7).
  // Đánh đổi: banner "Nổi bật" + khối "Sắp tới" (phụ thuộc reminders) giờ pop-in
  // sau khi vehicles đã hiện - chấp nhận được, tốt hơn nhiều so với treo cả màn.
  const booting = vehiclesLoading;
  if (booting) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
        <AppBgPattern />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <AppBgPattern />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          {/* Two-tone khớp logo: "Note" theo màu chữ (đổi theo chế độ), "Dri" amber */}
          <Text style={{ fontSize: 22, fontWeight: '800' }}>
            <Text style={{ color: colors.text }}>Note</Text>
            <Text style={{ color: '#F59E0B' }}>Dri</Text>
          </Text>
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
                    position: 'absolute', top: -5, right: -6,
                    backgroundColor: '#ef4444', borderRadius: 9,
                    minWidth: 18, height: 18,
                    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
                  }}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Vehicle selector */}
        {vehicles.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <VehicleSelector vehicles={vehicles} selectedId={vehicleId} onSelect={setSelectedVehicleId} />
          </View>
        )}

        {/* Chưa có xe -> mời thêm xe làm điểm khởi đầu (hầu hết tính năng cần 1 chiếc xe) */}
        {vehicles.length === 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 8 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '1f', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <FontAwesome5 name="car-side" size={30} color={colors.primary} solid />
            </View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{t('home.no_vehicle_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{t('home.no_vehicle_desc')}</Text>
            <TouchableOpacity
              onPress={() => nav.navigate('AddVehicle')}
              activeOpacity={0.85}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 13, marginTop: 20 }}>
              <FontAwesome5 name="plus" size={14} color={colors.primaryText} solid />
              <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 15 }}>{t('vehicles.add')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {vehicles.length > 0 && (
        <>
        {/* Noi bat - viec gap nhat */}
        {topHighlight && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => nav.navigate('Management', { tab: 0, vehicleId, _ts: Date.now() })}
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

        {/* Rà soát 17/7 (yêu cầu Sang): gộp 3 ô GPS / Kết nối OBD2 / Tra mã OBD2 thành
            1 khối - OBD2 là CTA CHÍNH (đồng nhất với logic obdEngaged/Free-upsell cũ),
            GPS + Tra mã là 2 mục phụ bên dưới. Cùng cấu trúc "hero + hàng mục phụ" như
            thẻ Đổ xăng (hero + "Cây xăng gần đây") bên dưới, thay vì 3 khối rời rạc
            chiếm quá nhiều chỗ ở đầu Home. overflow+borderRadius để trên LinearGradient
            (không chung view với elevation) - tránh lỗi Android đã vá ở rà soát trước. */}
        <View style={{
          borderRadius: 18, marginBottom: 12,
          shadowColor: obdEngaged ? '#5b21b6' : '#1e40af', shadowOpacity: 0.35, shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 }, elevation: 5,
        }}>
          <LinearGradient
            colors={obdEngaged ? ['#8b5cf6', '#4c1d95'] : ['#3b82f6', '#1e3a8a']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 18, overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (obdEngaged) {
                  nav.navigate('OBDSetup', {
                    vehicleId: obdSession.connected ? obdSession.vehicleId : obdPairing?.vehicleId ?? vehicleId,
                    vehicleName: (obdSession.connected ? obdSession.vehicleName : obdPairing?.vehicleName ?? vehicleName) ?? '',
                    consumptionOfficial: null,
                  });
                } else if (vehicleId) {
                  nav.navigate('OBDSetup', { vehicleId, vehicleName: vehicleName ?? '', consumptionOfficial: null });
                } else {
                  nav.navigate('AddVehicle');
                }
              }}
              style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome5 name="microchip" size={26} color="#fff" solid />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {obdSession.connected && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' }} />
                  )}
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{t('obd.setup_title')}</Text>
                  <View style={{ backgroundColor: '#ffffff33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{t('home.gps_new')}</Text>
                  </View>
                  {!obdEngaged && !isPremiumUser && (
                    <FontAwesome5 name="crown" size={12} color="#fbbf24" solid />
                  )}
                </View>
                <Text style={{ color: '#ffffffcc', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                  {obdEngaged
                    ? (obdSession.connected
                        ? t('home.obd_quick_connected', { name: obdSession.vehicleName ?? 'OBD2' })
                        : t('home.obd_quick_sub', { name: obdPairing?.vehicleName ?? '' }))
                    : (isPremiumUser ? t('home.obd_quick_setup') : t('home.obd_quick_upsell'))}
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={16} color="#ffffffcc" />
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => vehicleId ? nav.navigate('GpsTrips', { vehicleId, vehicleName }) : nav.navigate('AddVehicle')}
                style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome5 name="route" size={13} color="#ffffffcc" solid />
                <Text style={{ color: '#ffffffe6', fontSize: 12.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {t('home.gps_title')}
                </Text>
              </TouchableOpacity>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => nav.navigate('DtcLookup')}
                style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome5 name="search" size={13} color="#ffffffcc" solid />
                <Text style={{ color: '#ffffffe6', fontSize: 12.5, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {t('dtc.lookup_title')}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* Rich CTA cards - 2 col */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>

          {/* Do xang (amber) hoac Tram sac xe dien (green gradient) */}
          <LinearGradient colors={energyColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => isEv
                ? nav.navigate('NearbyStations', { standalone: true, mode: 'charging', latitude: coords?.lat, longitude: coords?.lng })
                : nav.navigate('AddRefuel')}
              style={{ padding: 12 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>
                <FontAwesome5 name={isEv ? 'charging-station' : 'gas-pump'} size={16} color={energyText} solid />
              </View>
              <Text style={{ color: energyText, fontWeight: '800', fontSize: 14 }}>
                {isEv ? t('home.charging_short') : t('dashboard.add_refuel')}
              </Text>
              <Text style={{ color: energySub, fontSize: 11, marginTop: 2 }}>
                {isEv ? t('home.charging_hint') : t('home.refuel_subtitle')}
              </Text>
            </TouchableOpacity>
            {/* Cây xăng/trạm sạc gần đây (xe xăng/dầu/hybrid). Hybrid gộp 1 dòng duy nhất
                thay vì 2 dòng riêng cây xăng + trạm sạc (rà soát 20/7, tester báo rối mắt). */}
            {!isEv && (
            <>
            <View style={{ height: 1, backgroundColor: isHybrid ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)' }} />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('NearbyStations', { standalone: true, mode: 'fuel', latitude: coords?.lat, longitude: coords?.lng })}
              style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <FontAwesome5 name="map-marker-alt" size={9} color={isHybrid ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)'} solid />
              <Text style={{ color: isHybrid ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)', fontSize: 11, fontWeight: '600' }}>
                {isHybrid ? t('home.find_station_hybrid') : t('home.find_station')}
              </Text>
            </TouchableOpacity>
            </>
            )}
          </LinearGradient>

          {/* Cap nhat ODO - slate gradient (from-slate-600 to-slate-800, khớp web) */}
          <LinearGradient colors={['#475569', '#1e293b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => nav.navigate('AddOdometer', { vehicleId })}
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
              onPress={() => nav.navigate('OdometerList', { vehicleId })}
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

        {/* So lieu nhanh (stats strip) */}
        {vehicleId && dashRaw && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => nav.navigate('Stats', { tab: 1 })}
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
              <TouchableOpacity onPress={() => nav.navigate('Management', { tab: 0, vehicleId, _ts: Date.now() })}>
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
                  onPress={() => r.id != null
                    ? nav.navigate('EditReminder', { reminderId: r.id, vehicleId })
                    : nav.navigate('Management', { tab: 0, _ts: Date.now() })}
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

        </>
        )}

        <AdMobBanner />

      </ScrollView>
    </SafeAreaView>
  );
}
