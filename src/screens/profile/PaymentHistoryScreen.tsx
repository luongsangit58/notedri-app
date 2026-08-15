import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '../../api/payment';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';
import { formatVND } from '../../utils/format';
import dayjs from 'dayjs';

const AMBER = '#F59E0B';

interface OrderItem {
  order_id: number;
  status: 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
  amount: number;
  plan_months: number;
  invoice_number?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
}

interface CodeUsage {
  id: number;
  code?: string | null;
  plan_months?: number | null;
  redeemed_at?: string | null;
}

export default function PaymentHistoryScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['payment-orders'],
    queryFn: () => paymentApi.orders().then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 30,
  });

  const orders: OrderItem[] = data?.orders ?? [];
  const codeUsages: CodeUsage[] = data?.code_usages ?? [];

  const cancelMut = useMutation({
    mutationFn: (id: number) => paymentApi.cancel(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-orders'] }),
    onError: (err: any) => Alert.alert(t('common.error'), err?.response?.data?.message ?? t('common.error_generic')),
  });

  const confirmCancel = (id: number) => {
    Alert.alert(t('payment.cancel_confirm_title'), t('payment.cancel_confirm_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('payment.cancel_order'), style: 'destructive', onPress: () => cancelMut.mutate(id) },
    ]);
  };

  const statusMeta = (s: OrderItem['status']): { label: string; color: string } => {
    switch (s) {
      case 'completed': return { label: t('payment.status_completed'), color: '#059669' };
      case 'pending':   return { label: t('payment.status_pending'), color: AMBER };
      case 'cancelled': return { label: t('payment.status_cancelled'), color: colors.textSecondary };
      case 'expired':   return { label: t('payment.status_expired'), color: colors.textSecondary };
      case 'failed':    return { label: t('payment.status_failed'), color: colors.error };
      default:          return { label: s, color: colors.textSecondary };
    }
  };

  const planLabel = (m?: number | null) => (m ? t('payment.plan_months', { n: m }) : '');

  const renderOrder = ({ item }: { item: OrderItem }) => {
    const meta = statusMeta(item.status);
    const isPending = item.status === 'pending';
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{planLabel(item.plan_months)}</Text>
          <View style={{ backgroundColor: meta.color + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: meta.color, fontSize: 12, fontWeight: '700' }}>{meta.label}</Text>
          </View>
        </View>
        <Text style={{ color: AMBER, fontSize: 16, fontWeight: '800', marginBottom: 2 }}>{formatVND(item.amount)}</Text>
        {item.invoice_number ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('payment.ref')}: {item.invoice_number}</Text>
        ) : null}
        {item.created_at ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(item.created_at).format('HH:mm DD/MM/YYYY')}</Text>
        ) : null}

        {isPending && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => confirmCancel(item.order_id)}
              disabled={cancelMut.isPending}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.error, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 }}>
              <FontAwesome5 name="times" size={13} color={colors.error} solid />
              <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>{t('payment.cancel_order')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom', 'left', 'right']}>
        <AppBgPattern />
        <ActivityIndicator color={AMBER} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.order_id)}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} colors={[AMBER]} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 64, paddingHorizontal: 32 }}>
            <FontAwesome5 name="receipt" size={36} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 14, textAlign: 'center' }}>{t('payment.empty')}</Text>
          </View>
        }
        ListFooterComponent={
          codeUsages.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                {t('payment.code_section')}
              </Text>
              {codeUsages.map((u) => (
                <View key={u.id} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome5 name="ticket-alt" size={15} color={AMBER} solid />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{u.code ?? '-'}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {planLabel(u.plan_months)}{u.redeemed_at ? ` · ${dayjs(u.redeemed_at).format('DD/MM/YYYY')}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
