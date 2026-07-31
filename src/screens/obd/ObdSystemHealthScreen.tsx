import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useObdConnection } from '../../hooks/useObd';
import { findingCostLabel } from '../../services/obd/findingCost';
import {
  buildSystemHealth,
  overallSystemStatus,
  SystemHealth,
  SystemStatus,
  SystemReading,
} from '../../services/obd/systemHealth';
import { obdLiveMonitor } from '../../services/obd/obdLiveMonitor';
import { readReadinessStatus, DtcCode } from '../../services/obd/ObdReader';
import { ReadinessStatus } from '../../services/obd/obdParser';
import { lookupDtcOffline } from '../../services/obd/dtcOfflineDictionary';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { contentWide } from '../../utils/layout';

const STATUS_COLOR: Record<SystemStatus, string> = {
  critical: '#EF4444',
  warn: '#F59E0B',
  ok: '#22C55E',
  na: '#9CA3AF',
};

const STATUS_ICON: Record<SystemStatus, string> = {
  critical: 'exclamation-circle',
  warn: 'exclamation-triangle',
  ok: 'check-circle',
  na: 'minus-circle',
};

const SYSTEM_ICON: Record<SystemHealth['key'], string> = {
  engine: 'cogs',
  cooling: 'thermometer-half',
  electrical: 'car-battery',
  fuel: 'gas-pump',
};

// Định dạng giá trị số liệu: rpm làm tròn, còn lại giữ như đọc (điện áp có phần
// thập phân, % là số nguyên sẵn) - không tự bịa độ chính xác thừa.
function formatReading(r: SystemReading): string {
  const v = r.key === 'rpm' ? Math.round(r.value) : r.value;
  return `${v}${r.unit ? (r.unit === '°C' || r.unit === 'V' ? r.unit : ` ${r.unit}`) : ''}`;
}

function SystemCard({ sys }: { sys: SystemHealth }) {
  const colors = useColors();
  const t = useT();
  const clr = STATUS_COLOR[sys.status];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: clr }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name={SYSTEM_ICON[sys.key]} size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t(`obd.sys_${sys.key}` as any)}</Text>
        <View style={[styles.statusPill, { backgroundColor: clr + '22' }]}>
          <FontAwesome5 name={STATUS_ICON[sys.status]} size={11} color={clr} solid />
          <Text style={[styles.statusPillText, { color: clr }]}>
            {t(`obd.sys_status_${sys.status}` as any)}
          </Text>
        </View>
      </View>

      {/* Số liệu sống của hệ */}
      {sys.readings.length > 0 && (
        <View style={styles.readingsRow}>
          {sys.readings.map((r) => (
            <View key={r.key} style={styles.reading}>
              <Text style={[styles.readingValue, { color: colors.text }]}>{formatReading(r)}</Text>
              <Text style={[styles.readingLabel, { color: colors.textSecondary }]}>
                {t(`obd.sys_reading_${r.key}` as any)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Cảnh báo thuộc hệ (findings) */}
      {sys.findings.map((f) => {
        const cost = findingCostLabel(f.related_dtc);
        return (
          <View key={f.ruleId} style={[styles.findingRow, { borderTopColor: colors.border }]}>
            <FontAwesome5
              name={f.can_drive === 'stop' ? 'hand-paper' : 'exclamation-triangle'}
              size={12}
              color={STATUS_COLOR[f.severity === 'critical' ? 'critical' : 'warn']}
              solid
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.findingTitle, { color: colors.text }]}>
                {f.title_vi}{f.beta ? ` (${t('obd.finding_beta')})` : ''}
              </Text>
              <Text style={[styles.findingAction, { color: colors.textSecondary }]}>{f.action_vi}</Text>
              {cost && (
                <Text style={[styles.findingCost, { color: colors.textSecondary }]}>
                  {t('obd.finding_cost', { range: cost })}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function useDtcState() {
  const [confirmed, setConfirmed] = useState<DtcCode[]>(() => obdLiveMonitor.getLastConfirmedDtc());
  const [pending, setPending] = useState<DtcCode[]>(() => obdLiveMonitor.getLastPendingDtc());

  useEffect(() => {
    const offConfirmed = obdLiveMonitor.onDtcFound(setConfirmed);
    const offPending = obdLiveMonitor.onPendingDtcFound(setPending);
    return () => {
      offConfirmed();
      offPending();
    };
  }, []);

  return { confirmed, pending };
}

function DtcCard({ isConnected, onCleared }: { isConnected: boolean; onCleared: () => void }) {
  const colors = useColors();
  const t = useT();
  const { confirmed, pending } = useDtcState();
  const [clearing, setClearing] = useState(false);
  // Rà soát (code review): tránh setState sau khi màn hình đã unmount (user
  // rời màn giữa lúc đang chờ clearDtcAndRefresh()) - Alert.alert là API toàn
  // cục, nếu không chặn sẽ hiện dialog "xoá xong" cả khi user đã rời màn.
  const mountedRef = React.useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const hasAny = confirmed.length > 0 || pending.length > 0;
  const canClear = isConnected && confirmed.length > 0 && !clearing;
  const borderColor = confirmed.length > 0 ? '#EF4444' : pending.length > 0 ? '#F59E0B' : '#22C55E';

  const handleClear = () => {
    Alert.alert(t('obd.dtc_clear_confirm_title') || 'Xoá mã lỗi?', t('obd.dtc_clear_confirm_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.dtc_clear_confirm_cta'),
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          const ok = await obdLiveMonitor.clearDtcAndRefresh();
          if (!mountedRef.current) return;
          setClearing(false);
          if (ok) onCleared();
          // Fix #9: Alert title không được rỗng, có thể gây crash.
          const title = ok ? t('obd.dtc_clear_success') : t('obd.dtc_clear_fail');
          const body = ok ? t('obd.readiness_disclaimer') : undefined;
          Alert.alert(title || (ok ? 'Thành công' : 'Thất bại'), body);
        },
      },
    ]);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name="microchip" size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('obd.dtc_card_title')}</Text>
      </View>

      {!hasAny ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('obd.dtc_none')}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {confirmed.length > 0 && (
            <View style={{ gap: 3 }}>
              <Text style={[styles.dtcGroupLabel, { color: colors.textSecondary }]}>{t('obd.dtc_confirmed')}</Text>
              {confirmed.map((c) => {
                const info = lookupDtcOffline(c.code);
                return (
                  <Text key={c.code} style={{ color: colors.text, fontSize: 13 }}>
                    {c.code}{info.known ? ` — ${info.title_vi}` : ''}
                  </Text>
                );
              })}
            </View>
          )}
          {pending.length > 0 && (
            <View style={{ gap: 3 }}>
              <Text style={[styles.dtcGroupLabel, { color: colors.textSecondary }]}>{t('obd.dtc_pending')}</Text>
              {pending.map((c) => (
                <Text key={c.code} style={{ color: colors.textSecondary, fontSize: 13 }}>{c.code}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={handleClear}
        disabled={!canClear}
        style={[styles.clearBtn, { opacity: canClear ? 1 : 0.4 }]}
      >
        <FontAwesome5 name="eraser" size={13} color="#EF4444" />
        <Text style={styles.clearBtnText}>{t('obd.dtc_clear_btn')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ReadinessCard() {
  const colors = useColors();
  const t = useT();
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // Rà soát (code review): tương tự DtcCard - chặn setState sau unmount (BLE
  // mất kết nối giữa lúc đang chờ readReadinessStatus() -> component unmount
  // qua {isConnected && <ReadinessCard/>} ở parent).
  const mountedRef = React.useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await readReadinessStatus();
    if (!mountedRef.current) return;
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: status?.milOn ? '#EF4444' : '#22C55E' }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name="clipboard-check" size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('obd.readiness_title')}</Text>
        <TouchableOpacity onPress={load} disabled={loading} accessibilityLabel={t('common.retry')}>
          <FontAwesome5 name="sync" size={13} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Chỉ báo "không phản hồi" khi đã đọc xong mà không có dữ liệu - lúc
          đang tải (loading) không hiện thông báo này, tránh nhấp nháy "lỗi"
          mỗi lần mở màn trong khi thực chất chỉ đang chờ round-trip BLE. */}
      {!status && !loading ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {t('obd.readiness_not_available')}
        </Text>
      ) : !status && loading ? (
        // Fix #5: Hiển thị rõ đang tải, thay vì không hiện gì (trông như lỗi)
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
          {t('common.loading')}
        </Text>
      ) : status ? (
        <>
          <Text style={{ color: status.milOn ? '#EF4444' : '#22C55E', fontSize: 14, fontWeight: '700' }}>
            {status.milOn ? t('obd.readiness_mil_on') : t('obd.readiness_mil_off')}
          </Text>
          {status.dtcCount > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {t('obd.readiness_dtc_count', { n: status.dtcCount })}
            </Text>
          )}
          <View style={styles.readinessMonitorGrid}>
            {status.monitors.map((m) => {
              // 3 trạng thái đúng theo thiết kế gốc: đã xong / chưa xong / xe
              // không có monitor này (N/A) - Fix #13: trước đây ẨN HẲN monitor
              // N/A, khiến người dùng không phân biệt được "xe không có" với
              // "lỗi đọc". Giờ hiện rõ N/A.
              const icon = !m.supported ? 'minus-circle' : m.ready ? 'check-circle' : 'clock';
              const color = !m.supported ? colors.textSecondary : m.ready ? '#22C55E' : '#F59E0B'; // warn
              return (
                <View key={m.key} style={styles.readinessMonitorRow}>
                  <FontAwesome5 name={icon} size={12} color={color} solid={m.supported} />
                  <Text style={{ color: m.supported ? colors.text : colors.textSecondary, fontSize: 12 }}>
                    {t(`obd.readiness_monitor_${m.key}` as any)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('obd.readiness_disclaimer')}</Text>
        </>
      ) : null}
    </View>
  );
}

export default function ObdSystemHealthScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';

  const t = useT();
  const colors = useColors();
  const { connectionState, liveSnapshot, findings } = useObdConnection(vehicleId, vehicleName);
  const isConnected = connectionState === 'connected';

  const systems = buildSystemHealth(findings, {
    rpm: liveSnapshot?.rpm ?? null,
    engineLoadPct: liveSnapshot?.engineLoadPct ?? null,
    throttlePct: liveSnapshot?.throttlePct ?? null,
    coolantTempC: liveSnapshot?.coolantTempC ?? null,
    controlModuleVoltage: liveSnapshot?.controlModuleVoltage ?? null,
    fuelLevelPct: liveSnapshot?.fuelLevelPct ?? null,
  });
  const overall = overallSystemStatus(systems);
  const overallClr = STATUS_COLOR[overall];
  // Rà soát (code review): xoá lỗi thành công phải kéo ReadinessCard đọc lại
  // ngay (MIL có thể vừa tắt) - trước đây 2 card độc lập, xoá xong DtcCard đã
  // hết mã nhưng ReadinessCard bên dưới vẫn hiện "đèn sáng" cũ tới khi user tự
  // bấm "Kiểm tra lại". Đổi key của ReadinessCard để remount = tự load lại.
  const [readinessRefreshKey, setReadinessRefreshKey] = useState(0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.dtc_card_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, contentWide]}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('obd.sys_health_subtitle')}</Text>

        {/* Chưa kết nối: không bịa trạng thái, nói thẳng cần kết nối */}
        {!isConnected && !liveSnapshot ? (
          <View style={[styles.notConnected, { backgroundColor: colors.card }]}>
            <FontAwesome5 name="plug" size={22} color={colors.textSecondary} />
            <Text style={[styles.notConnectedText, { color: colors.textSecondary }]}>
              {t('obd.sys_not_connected')}
            </Text>
          </View>
        ) : (
          <>
            {/* Badge tổng quan */}
            <View style={[styles.overallBadge, { backgroundColor: overallClr + '18' }]}>
              <FontAwesome5 name={STATUS_ICON[overall]} size={16} color={overallClr} solid />
              <Text style={[styles.overallText, { color: overallClr }]}>
                {t('obd.sys_overall')}: {t(`obd.sys_status_${overall}` as any)}
              </Text>
            </View>

            <DtcCard isConnected={isConnected} onCleared={() => setReadinessRefreshKey((k) => k + 1)} />
            {isConnected && <ReadinessCard key={readinessRefreshKey} />}

            {systems.map((sys) => (
              <SystemCard key={sys.key} sys={sys} />
            ))}

            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('obd.sys_disclaimer')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  overallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  overallText: { fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  readingsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  reading: { minWidth: 64 },
  readingValue: { fontSize: 18, fontWeight: '700' },
  readingLabel: { fontSize: 11, marginTop: 1 },
  findingRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 10 },
  findingTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  findingAction: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  findingCost: { fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  notConnected: { borderRadius: 12, padding: 24, alignItems: 'center', gap: 12 },
  notConnectedText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  disclaimer: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, marginTop: 4 },
  dtcGroupLabel: { fontSize: 11, fontWeight: '700' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 8,
  },
  clearBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  readinessMonitorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  readinessMonitorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: '45%' },
});
