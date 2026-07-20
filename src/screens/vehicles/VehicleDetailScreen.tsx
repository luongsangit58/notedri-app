import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Switch, ImageBackground, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useVehicle, useVehicleHealth, useVehicleReminders, useToggleVehicleRest, useUpdateVehicle } from '../../hooks/useVehicles';
import { useObdDtcEvents } from '../../hooks/useObd';
import { useMarkVehicleSold } from '../../hooks/useVehicleTransfer';
import { getPairingForVehicle } from '../../services/obd/pairedDevices';
import { getCachedCapability } from '../../services/obd/capabilityService';
import { useObdSessionStore } from '../../store/obdSessionStore';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { flattenReminders } from '../../utils/reminders';
import { formatKm } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { navigateFromUrl } from '../../utils/navigation';
import dayjs from 'dayjs';

// ─── Health helpers ──────────────────────────────────────────────────────────

type OrganStatus = 'urgent' | 'warn' | 'info' | 'ok' | 'na';

interface Organ {
  key: string;
  label: string;
  icon?: string;
  status: OrganStatus;
  verdict: string;
  detail?: string;
  note?: string;
  cta?: { label: string; url: string } | null;
  action?: string;
}

interface Pillar {
  score: number;
  max: number;
  label: string;
}

interface MissingDataItem {
  key: string;
  label: string;
}

interface HealthScore {
  total: number;
  pillars?: { a: Pillar; b: Pillar; c: Pillar; d: Pillar };
  band?: { key: string; label: string; color: string };
  confidence?: string;
  critical?: boolean;
  missing_data?: MissingDataItem[];
}

interface HealthData {
  overall?: OrganStatus;
  warn_count?: number;
  organs?: Organ[];
  score?: HealthScore;
  // legacy shape fallback
  health_score?: number;
}

function organStatusColor(status: OrganStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'urgent': return colors.error;
    case 'warn':   return colors.warning;
    case 'info':   return colors.primary;
    case 'ok':     return colors.success;
    default:       return colors.textSecondary;
  }
}

function scoreColor(score: number, colors: ReturnType<typeof useColors>): string {
  if (score >= 80) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.error;
}

function organStatusIconName(status: OrganStatus, colors: ReturnType<typeof useColors>): { name: string; color: string } {
  switch (status) {
    case 'urgent': return { name: 'exclamation-triangle', color: colors.error };
    case 'warn':   return { name: 'exclamation-triangle', color: colors.warning };
    case 'info':   return { name: 'info-circle', color: colors.primary };
    case 'ok':     return { name: 'check-circle', color: colors.success };
    default:       return { name: 'info-circle', color: colors.textSecondary };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PillarBar({ pillar }: { pillar: Pillar }) {
  const colors = useColors();
  const pct = Math.min(100, Math.round((pillar.score / pillar.max) * 100));
  const clr = scoreColor(Math.round((pillar.score / pillar.max) * 100), colors);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: 12 }}>{pillar.label}</Text>
        <Text style={{ color: clr, fontSize: 12, fontWeight: '700' }}>
          {pillar.score}/{pillar.max}
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: clr, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function OrganRow({ organ, vehicleId, navigation }: { organ: Organ; vehicleId: number; navigation: any }) {
  const t = useT();
  const colors = useColors();
  const statusClr = organStatusColor(organ.status, colors);
  const iconInfo = organStatusIconName(organ.status, colors);
  if (organ.status === 'na') return null;
  const showCta = organ.cta?.url && (organ.status === 'urgent' || organ.status === 'warn');
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderLeftWidth: 3,
      borderLeftColor: statusClr,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
        <FontAwesome5 name={iconInfo.name as any} size={14} color={iconInfo.color} solid style={{ marginRight: 6 }} />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 }}>{organ.label}</Text>
        <Text style={{ color: statusClr, fontSize: 12, fontWeight: '600' }}>{organ.verdict}</Text>
      </View>
      {!!organ.detail && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{organ.detail}</Text>
      )}
      {!!organ.note && (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>{organ.note}</Text>
      )}
      {!!organ.action && (organ.status === 'urgent' || organ.status === 'warn') && (
        <Text style={{ color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 16 }}>
          <Text style={{ fontWeight: '700' }}>{t('health.action_label')}: </Text>
          {organ.action}
        </Text>
      )}
      {showCta && (
        <TouchableOpacity
          onPress={() => navigateFromUrl(navigation, organ.cta!.url, vehicleId)}
          style={{
            marginTop: 8, alignSelf: 'flex-start',
            backgroundColor: statusClr + '22', borderRadius: 6,
            paddingHorizontal: 10, paddingVertical: 5,
          }}>
          <Text style={{ color: statusClr, fontSize: 12, fontWeight: '700' }}>
            {organ.cta!.label || t('health.cta_handle')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HealthBreakdownCard({ health, vehicleId, navigation }: { health: HealthData; vehicleId: number; navigation: any }) {
  const t = useT();
  const colors = useColors();
  const scoreData = health.score;
  const total = scoreData?.total;
  const pillars = scoreData?.pillars;
  const organs = health.organs ?? [];
  const bandLabel = scoreData?.band?.label;
  const confidence = scoreData?.confidence;
  const warnCount = health.warn_count ?? 0;
  const critical = scoreData?.critical ?? false;

  const visibleOrgans = organs.filter(o => o.status !== 'na');

  const confidenceLabel = (c?: string) => {
    switch (c) {
      case 'high':     return t('vehicle_detail.confidence_high');
      case 'medium':   return t('vehicle_detail.confidence_medium');
      case 'low':      return t('vehicle_detail.confidence_low');
      default:         return t('vehicle_detail.confidence_very_low');
    }
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <FontAwesome5 name="stethoscope" size={15} color={colors.text} solid />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t('vehicle_detail.health_card_title')}</Text>
        </View>
        {warnCount > 0 && (
          <View style={{
            backgroundColor: critical ? colors.error : colors.warning,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome5 name="exclamation-triangle" size={11} color={colors.primaryText} solid />
              <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '700' }}>{t('vehicle_detail.warn_count', { n: warnCount })}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Score + band row */}
      {total != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: colors.card,
            borderWidth: 3, borderColor: scoreColor(total, colors),
            alignItems: 'center', justifyContent: 'center',
            marginRight: 14,
          }}>
            <Text style={{ color: scoreColor(total, colors), fontSize: 20, fontWeight: '800' }}>{total}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {bandLabel && (
              <Text style={{ color: scoreColor(total, colors), fontWeight: '700', fontSize: 14 }}>{bandLabel}</Text>
            )}
            {confidence && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                {confidenceLabel(confidence)}
              </Text>
            )}
            {critical && (
              <Text style={{ color: colors.error, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                {t('vehicle_detail.combined_risk')}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Rà soát 17/7 (thêm xe điểm thấp không biết cần bổ sung gì, vd thiếu
          ODO): checklist cụ thể từ score.missing_data. */}
      {!!scoreData?.missing_data?.length && (
        <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12, marginBottom: 6 }}>
            {t('health.missing_data_title')}
          </Text>
          {scoreData.missing_data.map(m => (
            <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <FontAwesome5 name="circle" size={5} color={colors.textSecondary} solid />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Pillar progress bars */}
      {pillars && (
        <View style={{ marginBottom: 8 }}>
          {(['a', 'b', 'c', 'd'] as const).map(key => (
            <PillarBar key={key} pillar={pillars[key]} />
          ))}
        </View>
      )}

      {/* Divider */}
      {visibleOrgans.length > 0 && pillars && (
        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
      )}

      {/* Organ rows */}
      {visibleOrgans.map(organ => (
        <OrganRow key={organ.key} organ={organ} vehicleId={vehicleId} navigation={navigation} />
      ))}
    </View>
  );
}

// Rà soát 16/7 (UX audit: 10+ khối xếp chồng không phân nhóm, phải lướt rất dài
// mới tìm được đúng chức năng) - tiêu đề nhóm nhỏ, không phải card riêng, chỉ để
// mắt nghỉ giữa các cụm chức năng khác nhau (ghi nhanh / theo dõi / sức khoẻ /
// quản lý xe) thay vì 1 cột phẳng liên tục.
function SectionHeader({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{
      color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4,
      textTransform: 'uppercase', marginTop: 4, marginBottom: 8,
    }}>
      {children}
    </Text>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function VehicleDetailScreen() {
  const t = useT();
  const colors = useColors();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params;
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);

  const { data: vehicle, isLoading, isError, refetch, isFetching } = useVehicle(vehicleId);
  const { data: health } = useVehicleHealth(vehicleId);
  const { data: remindersData } = useVehicleReminders(vehicleId);
  const { data: dtcData } = useObdDtcEvents(vehicleId);
  const { mutate: toggleRest, isPending: togglingRest } = useToggleVehicleRest();
  const { mutate: updateVehicle, isPending: savingVin } = useUpdateVehicle();
  const { mutate: markSold, isPending: markingSold } = useMarkVehicleSold();

  // VIN prefill (checklist C4): VIN đọc được qua OBD (mode 09, chính xác 100% -
  // không phải suy đoán như hãng/model) - chỉ đề nghị lưu khi hồ sơ xe CHƯA có VIN.
  const [obdDecodedVin, setObdDecodedVin] = useState<string | null>(null);
  useEffect(() => {
    getCachedCapability(vehicleId).then((cap) => setObdDecodedVin(cap?.vin ?? null)).catch(() => {});
  }, [vehicleId]);

  // Decay state OBD (ý #12/#13): xe từng ghép Vgate nhưng lâu không kết nối →
  // phụ đề thẻ OBD tự nhắc nhẹ, không bắn push. 14 ngày mới coi là "lâu".
  const [obdLastSeenDays, setObdLastSeenDays] = useState<number | null>(null);
  const obdSession = useObdSessionStore();
  const obdConnectedThisVehicle = obdSession.connected && obdSession.vehicleId === vehicleId;
  useEffect(() => {
    getPairingForVehicle(vehicleId).then((p) => {
      if (p?.lastConnectedAt) {
        setObdLastSeenDays(Math.floor((Date.now() - p.lastConnectedAt) / 86400000));
      }
    }).catch(() => {});
  }, [vehicleId]);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message={t('vehicles.cannot_load_detail')} onRetry={refetch} />;

  const v = vehicle?.data ?? vehicle;
  const showVinPrefill = !!obdDecodedVin && !v?.vin;

  // API returns { data: { vehicle, overall, warn_count, organs, score } }
  // useVehicleHealth does .then(r => r.data), so health = the axios response body = { data: {...} }
  // We need the inner data object:
  const healthData: HealthData | undefined = health?.data ?? health;

  // Score number for the badge — prefer score.total, fall back to legacy shape
  const scoreTotal: number | undefined =
    healthData?.score?.total ?? (health?.health_score as number | undefined);

  const badgeColor = scoreTotal == null ? colors.textSecondary : scoreColor(scoreTotal, colors);
  const badgeLabel = scoreTotal == null ? null
    : scoreTotal >= 80 ? t('vehicles.score_good')
    : scoreTotal >= 50 ? t('vehicles.score_medium')
    : t('vehicles.score_warn');

  const reminders = flattenReminders(remindersData);
  const activeDtc: any[] = dtcData?.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <ScrollView
        contentContainerStyle={[{ padding: 16, paddingBottom: 32 }, contentWide]}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Thông tin xe — ảnh làm background nếu có */}
        <ImageBackground
          source={v?.anh_url ? { uri: v.anh_url } : undefined}
          style={{ borderRadius: 14, marginBottom: 12, overflow: 'hidden', backgroundColor: colors.surface }}
          imageStyle={{ opacity: 0.2 }}
          resizeMode="cover">
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{v?.ten ?? v?.name}</Text>
                {(v?.bien_so ?? v?.license_plate) ? (
                  <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 14 }}>
                    {v?.bien_so ?? v?.license_plate}
                  </Text>
                ) : null}
                {(v?.odo_hien_tai ?? v?.current_odometer) != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <FontAwesome5 name="road" size={14} color={colors.primary} solid />
                    <Text style={{ color: colors.primary, marginLeft: 6, fontWeight: '700', fontSize: 16 }}>
                      {formatKm(v?.odo_hien_tai ?? v?.current_odometer)}
                    </Text>
                  </View>
                )}
                {(v?.make || v?.model || v?.nam) && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                    {[v?.make, v?.model, v?.nam].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {(v?.fuel_type || v?.tank_capacity_l || v?.consumption_official) && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {[
                      v?.fuel_type,
                      v?.tank_capacity_l ? t('vehicle_detail.tank_short', { size: v.tank_capacity_l }) : null,
                      v?.consumption_official ? t('vehicle_detail.consumption_short', { value: v.consumption_official }) : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              {scoreTotal != null && (
                <View style={{ alignItems: 'center', marginLeft: 16 }}>
                  <Text style={{ color: badgeColor, fontSize: 36, fontWeight: '800' }}>{scoreTotal}</Text>
                  <Text style={{ color: badgeColor, fontSize: 12 }}>{badgeLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </ImageBackground>

        {/* ═══ Ghi nhanh: thao tác thường dùng nhất ═══ */}
        <SectionHeader>{t('vehicle_detail.section_quick')}</SectionHeader>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddRefuel', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="gas-pump" size={14} color={colors.primaryText} solid />
            <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{t('vehicles.detail_add_refuel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddOdometer', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="road" size={14} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600' }}>{t('vehicle_detail.update_odo')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ gap: 8, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('AddService')}
              style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <FontAwesome5 name="wrench" size={13} color={colors.text} solid />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{t('vehicles.detail_service')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Management', { tab: 0, vehicleId, _ts: Date.now() })}
              style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <FontAwesome5 name="bell" size={13} color={colors.text} solid />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{t('vehicles.detail_reminders')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nhắc nhở sắp tới - đặt ngay sau Ghi nhanh vì có tính thời hạn, cần
            thấy sớm thay vì cuộn tới tận cuối trang mới biết. */}
        {reminders.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>{t('vehicles.upcoming_reminders')}</Text>
            {reminders.slice(0, 5).map((r: any, i: number) => {
              const days = r.remaining_days ?? r.days_remaining;
              const urgentColor = days != null && days <= 30 ? colors.error : days != null && days <= 90 ? colors.warning : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={r.id ?? i}
                  activeOpacity={0.6}
                  disabled={r.id == null}
                  onPress={() => r.id != null && navigation.navigate('EditReminder', { reminderId: r.id, vehicleId })}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{r.hang_muc ?? r.service_type ?? r.title}</Text>
                  {days != null ? (
                    <Text style={{ color: urgentColor, fontSize: 12, fontWeight: '700' }}>
                      {days <= 0 ? t('dashboard.overdue') : t('dashboard.days_remaining', { days })}
                    </Text>
                  ) : r.due_date ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(r.due_date).format('DD/MM/YYYY')}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ═══ Theo dõi & chẩn đoán ═══ */}
        <SectionHeader>{t('vehicle_detail.section_tracking')}</SectionHeader>

        {/* GPS Hành trình - Free feature */}
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('GpsTrips', {
              vehicleId,
              vehicleName: v?.ten ?? v?.name ?? '',
            })
          }
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
          }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="route" size={16} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('vehicle_detail.gps_trips_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              {t('vehicle_detail.gps_trips_desc')}
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* OBD */}
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('OBDSetup', {
              vehicleId,
              vehicleName: v?.ten ?? v?.name ?? '',
              consumptionOfficial: v?.consumption_official ?? null,
            })
          }
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
          }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="microchip" size={16} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('obd.setup_title')}</Text>
              {!isPremium && (
                <FontAwesome5 name="crown" size={11} color={colors.warning} solid />
              )}
            </View>
            <Text
              style={{
                color: obdConnectedThisVehicle ? '#22C55E' : colors.textSecondary,
                fontSize: 12, marginTop: 1, fontWeight: obdConnectedThisVehicle ? '700' : '400',
              }}>
              {obdConnectedThisVehicle
                ? t('obd.entry_connected')
                : obdLastSeenDays !== null && obdLastSeenDays >= 14
                ? t('obd.entry_last_seen', { n: obdLastSeenDays })
                : t('obd.entry_desc')}
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Tra mã lỗi OBD: chuyển ra màn hình chính (17/7), ngay dưới khối kết
            nối OBD - tránh trùng lặp lối vào, đỡ dài trang chi tiết xe. */}

        {/* Báo cáo sức khoẻ từ dữ liệu OBD (E6/C3). Hiện kèm KHOÁ cho Free thay
            vì ẩn hoàn toàn (bài học audit 14/7: tính năng vô hình = mất cơ hội
            upsell + user không biết là có). Free chạm -> màn Premium. */}
        <TouchableOpacity
          onPress={() => navigation.navigate(isPremium ? 'ObdReport' : 'Premium', isPremium ? { vehicleId, vehicleName: v?.ten ?? v?.name ?? '' } : undefined)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border,
          }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="file-medical-alt" size={16} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('obd.report_title')}</Text>
              {!isPremium && <FontAwesome5 name="crown" size={11} color={colors.warning} solid />}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              {t('obd.report_entry_desc')}
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* VIN prefill (checklist C4): VIN đọc qua OBD chính xác 100%, chỉ đề
            nghị lưu khi hồ sơ xe chưa có - không tự động ghi đè im lặng */}
        {showVinPrefill && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12,
            borderWidth: 1, borderColor: colors.primary + '55',
          }}>
            <FontAwesome5 name="fingerprint" size={16} color={colors.primary} solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{t('vehicle_detail.vin_prefill_title')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{obdDecodedVin}</Text>
            </View>
            <TouchableOpacity
              disabled={savingVin}
              // 'ten' bắt buộc trong validation update kể cả khi không đổi (backend yêu cầu)
              onPress={() => updateVehicle({ id: vehicleId, data: { ten: v?.ten ?? v?.name, vin: obdDecodedVin } })}
              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                {savingVin ? t('common.loading') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ Sức khoẻ xe ═══ */}
        {healthData != null && (
          <>
            <SectionHeader>{t('vehicle_detail.section_health')}</SectionHeader>
            <HealthBreakdownCard health={healthData} vehicleId={vehicleId} navigation={navigation} />
            <TouchableOpacity
              onPress={() => navigation.navigate('Health', { vehicleId })}
              style={{
                alignSelf: 'flex-end', marginTop: -6, marginBottom: 12,
                paddingHorizontal: 14, paddingVertical: 7,
                backgroundColor: colors.surface, borderRadius: 10,
              }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('vehicles.health_detail_arrow')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ═══ Quản lý xe ═══ */}
        <SectionHeader>{t('vehicle_detail.section_manage')}</SectionHeader>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditVehicle', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="pen" size={13} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{t('vehicles.edit_label')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Dossier', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="book" size={13} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{t('vehicles.notebook_label')}</Text>
          </TouchableOpacity>
        </View>

        {/* Chuyển nhượng xe (Premium) - hiện kèm khoá cho Free thay vì ẩn hoàn
            toàn (bài học audit 14/7: tính năng vô hình = mất cơ hội upsell). */}
        <TouchableOpacity
          onPress={() => navigation.navigate(isPremium ? 'VehicleTransferRequests' : 'Premium')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
          }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="file-signature" size={16} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{t('transfer.entry_title')}</Text>
              {!isPremium && <FontAwesome5 name="crown" size={11} color={colors.warning} solid />}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{t('transfer.entry_desc')}</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* At Rest toggle */}
        <TouchableOpacity
          onPress={() => toggleRest(vehicleId)}
          disabled={togglingRest}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: v?.dang_nghi ? colors.warning + '22' : colors.surface,
            borderRadius: 12, padding: 14, marginBottom: 10,
            borderWidth: 1, borderColor: v?.dang_nghi ? colors.warning + '66' : colors.border,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <FontAwesome5
              name={v?.dang_nghi ? 'pause-circle' : 'play-circle'}
              size={18}
              color={v?.dang_nghi ? colors.warning : colors.textSecondary}
              solid
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                {t('vehicles.rest_toggle')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                {t('vehicles.rest_toggle_hint')}
              </Text>
            </View>
          </View>
          <Switch
            value={!!(v?.dang_nghi)}
            onValueChange={() => toggleRest(vehicleId)}
            disabled={togglingRest}
            trackColor={{ false: colors.border, true: colors.warning }}
            thumbColor={colors.text}
          />
        </TouchableOpacity>

        {/* VIN #30: chủ tự đánh dấu "đã bán" KHÔNG cần chờ ai gửi yêu cầu -
            tắt xe khỏi danh sách đang dùng. Không premium-gated (quản lý xe
            của chính mình). Dùng button xác nhận (không phải Switch) vì đây
            là hành động đáng kể hơn "tạm nghỉ", tránh vô ý chạm nhầm. */}
        {!v?.is_sold && (
          <TouchableOpacity
            onPress={() => Alert.alert(t('vehicles.mark_sold_title'), t('vehicles.mark_sold_confirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.confirm'), onPress: () => markSold({ vehicleId, sold: true }) },
            ])}
            disabled={markingSold}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
              borderWidth: 1, borderColor: colors.border,
            }}>
            <FontAwesome5 name="hand-holding-usd" size={16} color={colors.textSecondary} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14, flex: 1 }}>{t('vehicles.mark_sold_title')}</Text>
          </TouchableOpacity>
        )}
        {v?.is_sold && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
            borderWidth: 1, borderColor: colors.border, opacity: 0.7,
          }}>
            <FontAwesome5 name="hand-holding-usd" size={16} color={colors.textSecondary} solid />
            <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{t('vehicles.mark_sold_hint')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
