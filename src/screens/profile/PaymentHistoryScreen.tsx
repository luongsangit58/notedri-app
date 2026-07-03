import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '../../api/payment';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';
import { formatVND } from '../../utils/format';
import dayjs from 'dayjs';

const AMBER = '#F59E0B';

// Đồng bộ lại authStore.user sau khi thanh toán thành công để gate đọc user?.is_premium
// (OBD, thành tích, chi tiết xe) mở khoá NGAY, không phải mở lại app.
async function refreshAuthUser() {
  try {
    const res = await authApi.me();
    const fresh = res.data?.data ?? res.data;
    if (fresh) useAuthStore.getState().setUser(fresh);
  } catch { /* bỏ qua - initialize() lần mở app sau sẽ tự đồng bộ */ }
}

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

interface OrderDetail extends OrderItem {
  payable: boolean;
  bank_code?: string;
  bank_account?: string;
  bank_holder?: string;
  qr_url?: string;
}

interface CodeUsage {
  id: number;
  code?: string | null;
  plan_months?: number | null;
  redeemed_at?: string | null;
}

function InfoRow({ label, value, amber, bold }: { label: string; value: string; amber?: boolean; bold?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: amber ? AMBER : colors.text, fontWeight: bold ? '700' : '400', fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function PaymentHistoryScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();

  const [payOrder, setPayOrder] = useState<OrderDetail | null>(null);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [loadingOrderId, setLoadingOrderId] = useState<number | null>(null);

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

  // Poll trạng thái đơn đang mở QR -> tự đóng khi đã thanh toán.
  const { data: statusData } = useQuery({
    queryKey: ['order-status', payOrder?.order_id],
    queryFn: () => paymentApi.status(payOrder!.order_id).then(r => r.data?.data ?? r.data),
    enabled: !!payOrder?.order_id && payModalVisible,
    refetchInterval: payModalVisible ? 8000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (statusData?.is_premium || statusData?.status === 'completed' || statusData?.status === 'paid') {
      setPayModalVisible(false);
      setPayOrder(null);
      qc.invalidateQueries({ queryKey: ['payment-orders'] });
      qc.invalidateQueries({ queryKey: ['premium-status'] });
      refreshAuthUser();
      Alert.alert(t('premium.notification_title'), t('premium.payment_success_msg'));
    }
  }, [statusData?.is_premium, statusData?.status]);

  const openPay = async (id: number) => {
    setLoadingOrderId(id);
    try {
      const res: any = await paymentApi.order(id);
      const detail: OrderDetail = res?.data?.data ?? res?.data;
      if (detail?.payable && detail.qr_url) {
        setPayOrder(detail);
        setPayModalVisible(true);
      } else {
        Alert.alert(t('payment.notice_title'), t('payment.not_payable'));
        refetch();
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.response?.data?.message ?? t('common.error_generic'));
    } finally {
      setLoadingOrderId(null);
    }
  };

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
              onPress={() => openPay(item.order_id)}
              disabled={loadingOrderId === item.order_id}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: AMBER, borderRadius: 8, paddingVertical: 9 }}>
              {loadingOrderId === item.order_id
                ? <ActivityIndicator size="small" color="#fff" />
                : <FontAwesome5 name="qrcode" size={13} color="#fff" solid />}
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('payment.continue_pay')}</Text>
            </TouchableOpacity>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom']}>
        <AppBgPattern />
        <ActivityIndicator color={AMBER} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.order_id)}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} />}
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

      {/* Payment QR Modal (tiếp tục thanh toán đơn còn chờ) */}
      <Modal visible={payModalVisible} animationType="slide" transparent onRequestClose={() => setPayModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{t('premium.payment_title')}</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)} style={{ padding: 4 }}>
                <FontAwesome5 name="times" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {payOrder && payOrder.qr_url && (
              <>
                <Image source={{ uri: payOrder.qr_url }} style={{ width: 200, height: 200, alignSelf: 'center', marginBottom: 16, borderRadius: 12 }} resizeMode="contain" />
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10, marginBottom: 10 }}>
                  <InfoRow label={t('premium.payment_bank')}    value={payOrder.bank_code ?? '-'} />
                  <InfoRow label={t('premium.payment_account')} value={payOrder.bank_account ?? '-'} />
                  <InfoRow label={t('premium.payment_holder')}  value={payOrder.bank_holder ?? '-'} />
                  <InfoRow label={t('premium.payment_amount')}  value={formatVND(payOrder.amount)} amber bold />
                  <InfoRow label={t('premium.payment_ref')}     value={payOrder.invoice_number ?? '-'} bold />
                </View>
                {payOrder.expires_at ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
                    {t('premium.payment_expires', { time: dayjs(payOrder.expires_at).format('HH:mm DD/MM/YYYY') })}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                  {t('premium.payment_auto_check')}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
