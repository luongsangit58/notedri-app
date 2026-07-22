import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Finding } from '../../services/obd/diagnosticEngine';
import { ObdWarning } from '../../hooks/useObd';
import { findingCostLabel } from '../../services/obd/findingCost';
import { useT } from '../../i18n';

// Tách khỏi OBDDashboardScreen (trước đây khối JSX này bị copy-paste 2 lần y
// hệt - 1 bản cho chế độ Lưới, 1 bản cho chế độ Đồng hồ) - dùng chung cho cả
// 2 chế độ, đảm bảo cảnh báo an toàn (VIN lệch, no-data, findings Diagnostic
// Engine, mất sóng) luôn hiện GIỐNG HỆT nhau dù đang xem kiểu nào.
export interface SafetyAlertsProps {
  vinMismatch: { expected: string; actual: string } | null;
  vehicleName?: string;
  warning: ObdWarning;
  findings: Finding[];
  isConnected: boolean;
  hasSnapshot: boolean;
}

export function hasSafetyAlerts({ vinMismatch, warning, findings, isConnected, hasSnapshot }: SafetyAlertsProps): boolean {
  return !!vinMismatch || warning?.type === 'no_data' || findings.length > 0 || (!isConnected && hasSnapshot);
}

export default function SafetyAlerts({ vinMismatch, vehicleName, warning, findings, isConnected, hasSnapshot }: SafetyAlertsProps) {
  const t = useT();
  return (
    <>
      {vinMismatch && (
        <View style={[styles.warningBanner, { backgroundColor: '#B45309' }]}>
          <FontAwesome5 name="car-crash" size={13} color="#FEF3C7" solid />
          <View style={{ flex: 1 }}>
            <Text style={[styles.warningText, { fontWeight: '700' }]}>
              {t('obd.vin_mismatch_title', { name: vehicleName || 'xe này' })}
            </Text>
            <Text style={[styles.warningText, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
              {t('obd.vin_mismatch_desc')}
            </Text>
          </View>
        </View>
      )}

      {warning?.type === 'no_data' && (
        <View style={styles.warningBanner}>
          <FontAwesome5 name="exclamation-triangle" size={13} color="#FEF3C7" solid />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningText}>{t('obd.no_data_warning')}</Text>
            {warning.rawResponse ? (
              <Text style={[styles.warningText, { fontSize: 10, opacity: 0.65, marginTop: 4 }]}>
                Raw: {warning.rawResponse.replace(/[\r\n]+/g, ' ').trim().slice(0, 60)}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {findings.map((f) => {
        const cost = findingCostLabel(f.related_dtc);
        return (
          <View
            key={f.ruleId}
            style={[
              styles.warningBanner,
              { backgroundColor: f.severity === 'critical' ? '#B91C1C' : '#B45309' },
            ]}>
            <FontAwesome5
              name={f.can_drive === 'stop' ? 'hand-paper' : 'exclamation-triangle'}
              size={13}
              color="#FEF3C7"
              solid
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningText, { fontWeight: '700' }]}>
                {f.title_vi}{f.beta ? ` (${t('obd.finding_beta')})` : ''}
              </Text>
              <Text style={[styles.warningText, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
                {f.action_vi}
              </Text>
              {cost && (
                <Text style={[styles.warningText, { fontSize: 11, opacity: 0.85, marginTop: 3, fontStyle: 'italic' }]}>
                  {t('obd.finding_cost', { range: cost })}
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {!isConnected && hasSnapshot && (
        <View style={[styles.warningBanner, { backgroundColor: '#78716C22' }]}>
          <FontAwesome5 name="pause-circle" size={13} color="#A8A29E" solid />
          <Text style={[styles.warningText, { color: '#A8A29E', fontSize: 12 }]}>
            {t('obd.data_paused')}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#78350F',
    borderRadius: 10,
    padding: 12,
  },
  warningText: { color: '#FEF3C7', fontSize: 13, flex: 1, lineHeight: 18 },
});
