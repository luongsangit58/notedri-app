import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.sys_health_title')}</Text>
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
});
