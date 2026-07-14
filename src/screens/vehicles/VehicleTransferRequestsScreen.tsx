import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import {
  useIncomingTransferRequests, useOutgoingTransferRequests, useRespondTransferRequest, useSharedHistory,
} from '../../hooks/useVehicleTransfer';
import { TransferRequestRecord, TransferRequestStatus } from '../../api/vehicleTransfer';

// VIN #30 "Hộ chiếu bảo dưỡng khi sang tên xe" (Premium) - xem
// _bmad-output/maintenance-passport-design-proposal-2026-07-14.md.

function StatusBadge({ status }: { status: TransferRequestStatus }) {
  const t = useT();
  const map: Record<TransferRequestStatus, { color: string; label: string }> = {
    pending: { color: '#F59E0B', label: t('transfer.status_pending') },
    approved: { color: '#22C55E', label: t('transfer.status_approved') },
    denied: { color: '#EF4444', label: t('transfer.status_denied') },
    expired: { color: '#6B7280', label: t('transfer.status_expired') },
  };
  const { color, label } = map[status];
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function IncomingCard({ item }: { item: TransferRequestRecord }) {
  const colors = useColors();
  const t = useT();
  const respond = useRespondTransferRequest();

  function handle(approve: boolean) {
    Alert.alert(
      approve ? t('transfer.confirm_approve_title') : t('transfer.confirm_deny_title'),
      approve ? t('transfer.confirm_approve_body') : t('transfer.confirm_deny_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'), onPress: () => respond.mutate({ id: item.id, approve }, {
            onError: (e: any) => Alert.alert(t('common.error'), e?.response?.data?.message ?? t('vehicles.error_generic')),
          }),
        },
      ],
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
            {t('transfer.incoming_title', { name: item.requester_vehicle_name ?? '?' })}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>VIN: {item.vin}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {dayjs(item.requested_at).format('DD/MM/YYYY HH:mm')}
          </Text>
        </View>
        <StatusBadge status={item.status} />
      </View>
      {item.status === 'pending' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => handle(true)}
            disabled={respond.isPending}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 13 }}>{t('transfer.approve_btn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handle(false)}
            disabled={respond.isPending}
            style={[styles.actionBtn, { borderWidth: 1, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{t('transfer.deny_btn')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function OutgoingCard({ item }: { item: TransferRequestRecord }) {
  const colors = useColors();
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const canView = item.status === 'approved';
  const history = useSharedHistory(item.requester_vehicle_id, expanded && canView);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        disabled={!canView}
        onPress={() => setExpanded((e) => !e)}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>VIN: {item.vin}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {dayjs(item.requested_at).format('DD/MM/YYYY HH:mm')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={item.status} />
          {canView && <FontAwesome5 name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />}
        </View>
      </TouchableOpacity>

      {expanded && canView && (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
          {history.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !history.data ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('transfer.no_shared_data')}</Text>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 6 }}>
                {t('transfer.dtc_total_count', { n: history.data.dtc_total_count })}
              </Text>
              {history.data.service_history.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('transfer.no_service_history')}</Text>
              ) : (
                history.data.service_history.map((s, i) => (
                  <Text key={i} style={{ color: colors.text, fontSize: 12, marginBottom: 3 }}>
                    {s.ngay ? dayjs(s.ngay).format('DD/MM/YYYY') : '-'} · {s.hang_muc}
                  </Text>
                ))
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function VehicleTransferRequestsScreen() {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const t = useT();
  const incoming = useIncomingTransferRequests();
  const outgoing = useOutgoingTransferRequests();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{t('transfer.screen_title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>{t('transfer.screen_subtitle')}</Text>

        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('transfer.section_incoming')}</Text>
          {incoming.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !incoming.data || incoming.data.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('transfer.no_incoming')}</Text>
          ) : (
            incoming.data.map((item) => <IncomingCard key={item.id} item={item} />)
          )}
        </View>

        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('transfer.section_outgoing')}</Text>
          {outgoing.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !outgoing.data || outgoing.data.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('transfer.no_outgoing')}</Text>
          ) : (
            outgoing.data.map((item) => <OutgoingCard key={item.id} item={item} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
});
