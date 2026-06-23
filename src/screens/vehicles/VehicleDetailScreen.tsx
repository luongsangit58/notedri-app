import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useVehicle, useVehicleHealth, useVehicleReminders } from '../../hooks/useVehicles';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';
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
  // legacy shape fallback
  health_score?: number;
}

function organStatusColor(status: OrganStatus): string {
  switch (status) {
    case 'urgent': return colors.error;
    case 'warn':   return colors.warning;
    case 'info':   return '#42A5F5'; // blue-ish for info
    case 'ok':     return colors.success;
    default:       return colors.textSecondary;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.error;
}

function organStatusIconName(status: OrganStatus): { name: string; color: string } {
  switch (status) {
    case 'urgent': return { name: 'exclamation-triangle', color: colors.error };
    case 'warn':   return { name: 'exclamation-triangle', color: colors.warning };
    case 'info':   return { name: 'info-circle', color: '#42A5F5' };
    case 'ok':     return { name: 'check-circle', color: colors.success };
    default:       return { name: 'info-circle', color: colors.textSecondary };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PillarBar({ pillar }: { pillar: Pillar }) {
  const pct = Math.min(100, Math.round((pillar.score / pillar.max) * 100));
  const clr = scoreColor(Math.round((pillar.score / pillar.max) * 100));
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

function OrganRow({ organ }: { organ: Organ }) {
  const statusClr = organStatusColor(organ.status);
  const iconInfo = organStatusIconName(organ.status);
  if (organ.status === 'na') return null;
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
    </View>
  );
}

function HealthBreakdownCard({ health }: { health: HealthData }) {
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
      case 'high':     return 'Độ tin cậy: Cao';
      case 'medium':   return 'Độ tin cậy: Trung bình';
      case 'low':      return 'Độ tin cậy: Thấp';
      default:         return 'Độ tin cậy: Rất thấp — cần thêm dữ liệu';
    }
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <FontAwesome5 name="stethoscope" size={15} color={colors.text} solid />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Sức khoẻ xe</Text>
        </View>
        {warnCount > 0 && (
          <View style={{
            backgroundColor: critical ? colors.error : colors.warning,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <FontAwesome5 name="exclamation-triangle" size={11} color="#fff" solid />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{warnCount} cần chú ý</Text>
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
            borderWidth: 3, borderColor: scoreColor(total),
            alignItems: 'center', justifyContent: 'center',
            marginRight: 14,
          }}>
            <Text style={{ color: scoreColor(total), fontSize: 20, fontWeight: '800' }}>{total}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {bandLabel && (
              <Text style={{ color: scoreColor(total), fontWeight: '700', fontSize: 14 }}>{bandLabel}</Text>
            )}
            {confidence && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                {confidenceLabel(confidence)}
              </Text>
            )}
            {critical && (
              <Text style={{ color: colors.error, fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                ⚡ Rủi ro gộp: bảo dưỡng + giấy tờ đều quá hạn
              </Text>
            )}
          </View>
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
        <OrganRow key={organ.key} organ={organ} />
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function VehicleDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params;

  const { data: vehicle, isLoading, isError, refetch, isFetching } = useVehicle(vehicleId);
  const { data: health } = useVehicleHealth(vehicleId);
  const { data: remindersData } = useVehicleReminders(vehicleId);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được chi tiết xe" onRetry={refetch} />;

  const v = vehicle?.data ?? vehicle;

  // API returns { data: { vehicle, overall, warn_count, organs, score } }
  // useVehicleHealth does .then(r => r.data), so health = the axios response body = { data: {...} }
  // We need the inner data object:
  const healthData: HealthData | undefined = health?.data ?? health;

  // Score number for the badge — prefer score.total, fall back to legacy shape
  const scoreTotal: number | undefined =
    healthData?.score?.total ?? (health?.health_score as number | undefined);

  const badgeColor = scoreTotal == null ? colors.textSecondary : scoreColor(scoreTotal);
  const badgeLabel = scoreTotal == null ? null
    : scoreTotal >= 80 ? 'Tốt'
    : scoreTotal >= 50 ? 'Trung bình'
    : 'Cần chú ý';

  const reminders = remindersData?.data ?? remindersData ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

        {/* Thông tin xe */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
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
                    {Number(v?.odo_hien_tai ?? v?.current_odometer).toLocaleString('vi-VN')} km
                  </Text>
                </View>
              )}
              {/* Specs row */}
              {(v?.make || v?.model || v?.nam) && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
                  {[v?.make, v?.model, v?.nam].filter(Boolean).join(' · ')}
                </Text>
              )}
              {(v?.fuel_type || v?.tank_capacity_l || v?.consumption_official) && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {[
                    v?.fuel_type,
                    v?.tank_capacity_l ? `Bình ${v.tank_capacity_l}L` : null,
                    v?.consumption_official ? `NSX ${v.consumption_official}L/100km` : null,
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

        {/* Actions row */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditVehicle', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="pen" size={13} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Sửa xe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Reminders', { vehicleId })}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="bell" size={13} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Lời nhắc</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddService')}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="wrench" size={13} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Bảo dưỡng</Text>
          </TouchableOpacity>
        </View>

        {/* Nhanh */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddRefuel')}
            style={{ flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="gas-pump" size={14} color="#fff" solid />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Đổ xăng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddOdometer')}
            style={{ flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <FontAwesome5 name="road" size={14} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '600' }}>Cập nhật ODO</Text>
          </TouchableOpacity>
        </View>

        {/* Sức khoẻ xe — breakdown card */}
        {healthData != null && (
          <>
            <HealthBreakdownCard health={healthData} />
            <TouchableOpacity
              onPress={() => navigation.navigate('Health')}
              style={{
                alignSelf: 'flex-end', marginTop: -6, marginBottom: 12,
                paddingHorizontal: 14, paddingVertical: 7,
                backgroundColor: colors.surface, borderRadius: 10,
              }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Xem chi tiết →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Nhắc nhở */}
        {reminders.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>Nhắc nhở sắp tới</Text>
            {reminders.slice(0, 5).map((r: any, i: number) => {
              const days = r.remaining_days ?? r.days_remaining;
              const urgentColor = days != null && days <= 30 ? colors.error : days != null && days <= 90 ? colors.warning : colors.textSecondary;
              return (
                <View key={r.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{r.hang_muc ?? r.service_type ?? r.title}</Text>
                  {days != null ? (
                    <Text style={{ color: urgentColor, fontSize: 12, fontWeight: '700' }}>
                      {days <= 0 ? 'Quá hạn' : `${days} ngày`}
                    </Text>
                  ) : r.due_date ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(r.due_date).format('DD/MM/YYYY')}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
