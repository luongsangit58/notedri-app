import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { obdApi } from '../../api/obd';
import { evaluateSession } from '../../services/obd/sessionReport';
import { findingCostLabel } from '../../services/obd/findingCost';
import { refreshRulesFromServer } from '../../services/obd/diagnosticRulesStore';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

function Vital({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[styles.vitalBox, { backgroundColor: colors.card }]}>
      <FontAwesome5 name={icon} size={15} color={colors.primary} />
      <Text style={[styles.vitalValue, { color: colors.text }]}>{value}{unit ?? ''}</Text>
      <Text style={[styles.vitalLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export default function ObdReportScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';

  const t = useT();
  const colors = useColors();

  const { data, isLoading } = useQuery({
    queryKey: ['obd', 'sessions-recent', vehicleId],
    queryFn: () => obdApi.recentSessions(vehicleId).then((r) => r.data.data),
    enabled: !!vehicleId,
  });

  // Xem báo cáo không cần đang kết nối OBD - tranh thủ tải rule mới nhất ở đây
  useEffect(() => {
    refreshRulesFromServer().catch(() => {});
  }, []);

  const sessions = data ?? [];
  const latest = sessions[0];
  const previous = sessions[1];

  const findings = useMemo(
    () => (latest ? evaluateSession(latest.summary, latest.duration_seconds) : []),
    [latest],
  );

  // So sánh đơn giản với phiên trước - hướng thay đổi, không phải trend engine
  // đầy đủ (E2, cần nhiều phiên hơn để có ý nghĩa thống kê).
  const voltageDelta = latest?.summary.voltage_avg != null && previous?.summary.voltage_avg != null
    ? Number((latest.summary.voltage_avg - previous.summary.voltage_avg).toFixed(2))
    : null;

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

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !latest ? (
        <View style={styles.emptyState}>
          <FontAwesome5 name="stethoscope" size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('obd.report_empty')}
          </Text>
          <TouchableOpacity
            style={[styles.connectBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('OBDSetup', { vehicleId, vehicleName })}>
            <Text style={styles.connectBtnText}>{t('obd.report_connect_cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
            {dayjs(latest.connected_at).format('DD/MM/YYYY HH:mm')} · {latest.device_name ?? 'OBD2'}
          </Text>

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
              <Vital label={t('obd.report_coolant')} value={`${latest.summary.coolant_min ?? '-'}-${latest.summary.coolant_max ?? '-'}`} unit="°C" icon="thermometer-half" />
              <Vital label={t('obd.report_voltage')} value={`${latest.summary.voltage_avg ?? '-'}`} unit="V" icon="bolt" />
            </View>
            <View style={styles.vitalsRow}>
              <Vital label={t('obd.report_idle_rpm')} value={`${latest.summary.rpm_idle_avg ?? '-'}`} icon="cogs" />
              <Vital label={t('obd.report_load')} value={`${latest.summary.load_avg ?? '-'}`} unit="%" icon="fire" />
            </View>
            <View style={styles.vitalsRow}>
              <Vital label={t('obd.report_top_speed')} value={`${latest.summary.speed_max ?? '-'}`} unit=" km/h" icon="tachometer-alt" />
              <Vital label={t('obd.report_dtc')} value={`${latest.summary.dtc_count}`} icon="exclamation-circle" />
            </View>
            {/* Chấm điểm lái xe (Giai đoạn G) - phiên cũ trước 14/7 không có 2
                trường này (undefined), hiện "-" thay vì crash. */}
            {latest.summary.driving_score !== undefined && (
              <View style={styles.vitalsRow}>
                <Vital label={t('obd.report_driving_score')} value={`${latest.summary.driving_score}`} unit="/100" icon="user-check" />
                <Vital
                  label={t('obd.report_harsh_events')}
                  value={`${(latest.summary.harsh_brake_count ?? 0) + (latest.summary.harsh_accel_count ?? 0)}`}
                  icon="exclamation-triangle"
                />
              </View>
            )}
          </View>

          {voltageDelta !== null && Math.abs(voltageDelta) >= 0.1 && (
            <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
              <FontAwesome5
                name={voltageDelta < 0 ? 'arrow-down' : 'arrow-up'}
                size={13}
                color={voltageDelta < 0 ? '#F59E0B' : '#22C55E'}
              />
              <Text style={[styles.trendText, { color: colors.text }]}>
                {t('obd.report_voltage_trend', { delta: Math.abs(voltageDelta).toFixed(2) })}
              </Text>
            </View>
          )}

          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
            {t('obd.report_disclaimer')}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  connectBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sessionMeta: { fontSize: 12, marginBottom: 4 },
  okBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 14 },
  okText: { fontSize: 14, fontWeight: '600' },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, padding: 12 },
  warningTitle: { color: '#FEF3C7', fontSize: 13, fontWeight: '700' },
  warningAction: { color: '#FEF3C7', fontSize: 12, marginTop: 3, opacity: 0.9 },
  vitalsGrid: { gap: 10, marginTop: 4 },
  vitalsRow: { flexDirection: 'row', gap: 10 },
  vitalBox: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  vitalValue: { fontSize: 18, fontWeight: '700' },
  vitalLabel: { fontSize: 11, textAlign: 'center' },
  trendCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12 },
  trendText: { fontSize: 13, flex: 1 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 8, fontStyle: 'italic' },
});
