import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import dayjs from 'dayjs';
import { ObdSessionRecord } from '../../api/obd';
import { evaluateSession } from '../../services/obd/sessionReport';
import { findingCostLabel } from '../../services/obd/findingCost';
import { Vital } from './ObdReportScreen';
import CorrelatedGpsTrips from './CorrelatedGpsTrips';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { contentWide } from '../../utils/layout';

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// Chi tiết 1 phiên OBD cụ thể (rà soát 4/8, user báo tab "Lịch sử" chỉ liệt kê được,
// không bấm vào xem chi tiết như tab "Phiên gần nhất") - tái dùng đúng bố cục vitals/
// findings của tab "Phiên gần nhất" nhưng cho MỘT phiên bất kỳ đã bấm chọn, không cần
// gọi API mới (session đã có đủ summary từ list truyền qua route params).
export default function ObdSessionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const session: ObdSessionRecord = route.params?.session;
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';
  const t = useT();
  const colors = useColors();

  const findings = useMemo(
    () => (session ? evaluateSession(session.summary, session.duration_seconds) : []),
    [session],
  );

  if (!session) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.report_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, contentWide]}>
        <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
          {dayjs(session.connected_at).format('DD/MM/YYYY HH:mm')} · {session.device_name ?? 'OBD2'}
        </Text>

        <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
          <FontAwesome5 name="clock" size={13} color={colors.primary} />
          <Text style={[styles.trendText, { color: colors.text }]}>
            {formatHms(session.duration_seconds)}
            {session.summary.engine_run_seconds ? ` · ${t('obd.session_engine_run', { hours: (session.summary.engine_run_seconds / 3600).toFixed(1) })}` : ''}
          </Text>
        </View>

        {!!vehicleId && (
          <CorrelatedGpsTrips
            vehicleId={vehicleId}
            vehicleName={vehicleName}
            connectedAt={session.connected_at}
            durationSeconds={session.duration_seconds}
          />
        )}

        {findings.length === 0 ? (
          <View style={[styles.okBanner, { backgroundColor: '#16653422' }]}>
            <FontAwesome5 name="check-circle" size={16} color="#22C55E" solid />
            <Text style={[styles.okText, { color: '#22C55E' }]}>{t('obd.report_all_good')}</Text>
          </View>
        ) : (
          findings.map((f) => {
            const cost = findingCostLabel(f.related_dtc);
            return (
              <View
                key={f.ruleId}
                style={[styles.warningBanner, { backgroundColor: f.severity === 'critical' ? '#B91C1C' : '#B45309' }]}>
                <FontAwesome5
                  name={f.can_drive === 'stop' ? 'hand-paper' : 'exclamation-triangle'}
                  size={13} color="#FEF3C7" solid
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>{f.title_vi} ({t('obd.finding_beta')})</Text>
                  <Text style={styles.warningAction}>{f.action_vi}</Text>
                  {cost && (
                    <Text style={[styles.warningAction, { fontStyle: 'italic', opacity: 0.85 }]}>
                      {t('obd.finding_cost', { range: cost })}
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={styles.vitalsGrid}>
          <View style={styles.vitalsRow}>
            <Vital
              label={t('obd.report_coolant')}
              value={
                session.summary.coolant_min != null && session.summary.coolant_max != null
                  ? session.summary.coolant_min === session.summary.coolant_max
                    ? `${session.summary.coolant_min}`
                    : `${session.summary.coolant_min}-${session.summary.coolant_max}`
                  : `${session.summary.coolant_min ?? session.summary.coolant_max ?? '-'}`
              }
              unit="°C"
              icon="thermometer-half"
            />
            <Vital label={t('obd.report_voltage')} value={session.summary.voltage_avg != null ? session.summary.voltage_avg.toFixed(1) : '-'} unit="V" icon="bolt" />
          </View>
          <View style={styles.vitalsRow}>
            <Vital label={t('obd.report_idle_rpm')} value={session.summary.rpm_idle_avg != null ? `${Math.round(session.summary.rpm_idle_avg)}` : '-'} icon="cogs" />
            <Vital label={t('obd.report_load')} value={session.summary.load_avg != null ? `${Math.round(session.summary.load_avg)}` : '-'} unit="%" icon="fire" />
          </View>
          <View style={styles.vitalsRow}>
            <Vital label={t('obd.report_top_speed')} value={`${session.summary.speed_max ?? '-'}`} unit=" km/h" icon="tachometer-alt" />
            <Vital label={t('obd.report_dtc')} value={`${session.summary.dtc_count ?? 0}`} icon="exclamation-circle" />
          </View>
          {session.summary.fuel_used_liters_est != null && (
            <View style={styles.vitalsRow}>
              <Vital label={t('obd.report_fuel_used')} value={session.summary.fuel_used_liters_est.toFixed(1)} unit=" L" icon="gas-pump" />
            </View>
          )}
        </View>

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          {t('obd.report_disclaimer')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  sessionMeta: { fontSize: 12, marginBottom: 4 },
  okBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 14 },
  okText: { fontSize: 14, fontWeight: '600' },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, padding: 12 },
  warningTitle: { color: '#FEF3C7', fontSize: 13, fontWeight: '700' },
  warningAction: { color: '#FEF3C7', fontSize: 12, marginTop: 3, opacity: 0.9 },
  vitalsGrid: { gap: 10, marginTop: 4 },
  vitalsRow: { flexDirection: 'row', gap: 10 },
  trendCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12 },
  trendText: { fontSize: 13, flex: 1 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 8, fontStyle: 'italic' },
});
