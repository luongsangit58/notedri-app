import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
  TextInput, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';
import { formatVND } from '../../utils/format';
import dayjs from 'dayjs';

const AMBER = '#F59E0B';

const PLAN_MONTHS: (1 | 3 | 6 | 12)[] = [1, 3, 6, 12];

interface OrderData {
  order_id: number;
  amount: number;
  plan_months: number;
  invoice_number: string;
  bank_code: string;
  bank_account: string;
  bank_holder: string;
  qr_url: string;
  expires_at: string;
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

export default function PremiumScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();
  const navigation = useNavigation<any>();

  const [redeemCode, setRedeemCode] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<1 | 3 | 6 | 12>(3);
  const [payOrder, setPayOrder] = useState<OrderData | null>(null);
  const [payModalVisible, setPayModalVisible] = useState(false);

  const FREE_FEATURES = [
    t('premium.free_feature_2_vehicles'),
    t('premium.free_feature_12months'),
    t('premium.free_feature_basic_reports'),
    t('premium.free_feature_reminders'),
    t('premium.free_feature_dossier'),
  ];

  const PREMIUM_FEATURES = [
    { icon: 'crown',            text: t('premium.feature_unlimited_vehicles') },
    { icon: 'history',          text: t('premium.feature_unlimited_history') },
    { icon: 'chart-line',       text: t('premium.feature_all_year_reports') },
    { icon: 'search-location',  text: t('premium.feature_nearby_stations') },
    { icon: 'envelope',         text: t('premium.feature_email_reminders') },
    { icon: 'file-export',      text: t('premium.feature_export') },
  ];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['premium-status'],
    queryFn: () => client.get('/premium').then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 5,
  });

  const { mutate: requestTrial, isPending } = useMutation({
    mutationFn: () => client.post('/premium/trial', { context: 'mobile' }),
    onSuccess: (res: any) => {
      const msg = res?.data?.message ?? t('common.send');
      Alert.alert(t('premium.notification_title'), msg);
      qc.invalidateQueries({ queryKey: ['premium-status'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? t('common.error_generic');
      Alert.alert(t('premium.notification_title'), msg);
    },
  });

  const { mutate: redeemMutate, isPending: isRedeeming } = useMutation({
    mutationFn: () => client.post('/premium/redeem', { code: redeemCode.trim().toUpperCase() }),
    onSuccess: (res: any) => {
      Alert.alert(t('premium.notification_title'), res?.data?.message ?? t('premium.notification_title'));
      setRedeemCode('');
      qc.invalidateQueries({ queryKey: ['premium-status'] });
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message ?? t('common.error_generic'));
    },
  });

  const { mutate: checkoutMutate, isPending: isCheckingOut } = useMutation({
    mutationFn: () => client.post('/payment/checkout', { plan_months: selectedPlan }),
    onSuccess: (res: any) => {
      const order: OrderData = res?.data?.data;
      if (order) {
        setPayOrder(order);
        setPayModalVisible(true);
      }
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message ?? t('common.error_generic'));
    },
  });

  const { data: statusData } = useQuery({
    queryKey: ['order-status', payOrder?.order_id],
    queryFn: () =>
      client.get(`/payment/orders/${payOrder!.order_id}/status`).then(r => r.data?.data ?? r.data),
    enabled: !!payOrder?.order_id && payModalVisible,
    refetchInterval: payModalVisible ? 8000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (statusData?.is_premium) {
      setPayModalVisible(false);
      setPayOrder(null);
      qc.invalidateQueries({ queryKey: ['premium-status'] });
      Alert.alert(t('premium.notification_title'), t('premium.payment_success_msg'));
    }
  }, [statusData?.is_premium]);

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const canRequest: boolean = data?.can_request ?? false;
  const requestStatus: string | null = data?.request_status ?? null;
  const trialUsed: boolean = data?.trial_used ?? false;
  const trialDays: number = data?.trial_days ?? 14;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

  function statusLabel(s?: string | null): string {
    if (s === 'pending')  return t('premium.request_pending_label');
    if (s === 'approved') return t('premium.request_approved_label');
    if (s === 'rejected') return t('premium.request_rejected_label');
    return '';
  }

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
      <ScrollView
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: AMBER + '22', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, borderWidth: 2, borderColor: AMBER,
          }}>
            <FontAwesome5 name="crown" size={32} color={AMBER} solid />
          </View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 24, letterSpacing: -0.5 }}>
            {t('premium.title')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            {t('premium.tagline')}
          </Text>
        </View>

        {/* Current plan status */}
        {isPremium ? (
          <View style={{
            backgroundColor: AMBER + '22', borderRadius: 14, padding: 16,
            borderWidth: 1.5, borderColor: AMBER, marginBottom: 24,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <FontAwesome5 name="check-circle" size={22} color={AMBER} solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: AMBER, fontWeight: '800', fontSize: 16 }}>
                {onTrial ? t('premium.trial_active_label') : t('premium.active_label')}
              </Text>
              {planExpiresAt && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {t('premium.expires_label', { date: planExpiresAt })}
                </Text>
              )}
            </View>
          </View>
        ) : requestStatus === 'pending' ? (
          <View style={{
            backgroundColor: '#0EA5E922', borderRadius: 14, padding: 16,
            borderWidth: 1, borderColor: '#0EA5E9', marginBottom: 24,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <FontAwesome5 name="clock" size={20} color="#0EA5E9" solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0EA5E9', fontWeight: '700', fontSize: 15 }}>
                {t('premium.pending_title')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {t('premium.pending_desc')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Premium features */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: AMBER, fontWeight: '800', fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('premium.includes_title')}
          </Text>
          {PREMIUM_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <FontAwesome5 name={f.icon} size={14} color={AMBER} solid style={{ width: 18 }} />
              <Text style={{ color: colors.text, fontSize: 14 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Free plan */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('premium.free_title')}
          </Text>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FontAwesome5 name="check" size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA - trial */}
        {!isPremium && canRequest && (
          <>
            <TouchableOpacity
              onPress={() => requestTrial()}
              disabled={isPending}
              style={{
                backgroundColor: AMBER, borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 12,
                opacity: isPending ? 0.7 : 1,
              }}>
              {isPending
                ? <ActivityIndicator color="#fff" />
                : (
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                    {t('premium.trial_cta', { days: trialDays })}
                  </Text>
                )}
            </TouchableOpacity>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
              {t('premium.request_flow_desc')}
            </Text>
          </>
        )}

        {!isPremium && !canRequest && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 20 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {trialUsed
                ? t('premium.trial_used_msg')
                : statusLabel(requestStatus)
              }
            </Text>
          </View>
        )}

        {/* Redeem code */}
        {!isPremium && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 10 }}>
              {t('premium.redeem_section_title')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={redeemCode}
                onChangeText={setRedeemCode}
                placeholder={t('premium.redeem_placeholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: colors.text,
                  fontSize: 15,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <TouchableOpacity
                onPress={() => redeemMutate()}
                disabled={isRedeeming || !redeemCode.trim()}
                style={{
                  backgroundColor: AMBER,
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: (isRedeeming || !redeemCode.trim()) ? 0.5 : 1,
                }}>
                {isRedeeming
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('premium.redeem_btn')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Buy Premium - plan picker + checkout */}
        {!isPremium && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>
              {t('premium.buy_title')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {PLAN_MONTHS.map(months => (
                <TouchableOpacity
                  key={months}
                  onPress={() => setSelectedPlan(months)}
                  style={{
                    flex: 1,
                    backgroundColor: selectedPlan === months ? AMBER : colors.card,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    borderWidth: selectedPlan === months ? 0 : 1,
                    borderColor: colors.border,
                  }}>
                  <Text style={{
                    color: selectedPlan === months ? '#fff' : colors.textSecondary,
                    fontWeight: '700',
                    fontSize: 13,
                  }}>
                    {t('premium.plan_months', { months })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => checkoutMutate()}
              disabled={isCheckingOut}
              style={{
                backgroundColor: AMBER, borderRadius: 12,
                paddingVertical: 14, alignItems: 'center',
                opacity: isCheckingOut ? 0.7 : 1,
              }}>
              {isCheckingOut
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome5 name="qrcode" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{t('premium.checkout_btn')}</Text>
                  </View>
                )}
            </TouchableOpacity>
            <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              {t('premium.checkout_note')}
            </Text>
          </View>
        )}

        {/* Lịch sử thanh toán */}
        <TouchableOpacity
          onPress={() => navigation.navigate('PaymentHistory')}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: colors.border,
          }}>
          <FontAwesome5 name="receipt" size={15} color={colors.textSecondary} solid />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{t('payment.history_title')}</Text>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
          {t('premium.pricing_note')}
        </Text>
      </ScrollView>

      {/* Payment QR Modal */}
      <Modal visible={payModalVisible} animationType="slide" transparent onRequestClose={() => setPayModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 20, paddingBottom: 40,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{t('premium.payment_title')}</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)} style={{ padding: 4 }}>
                <FontAwesome5 name="times" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {payOrder && (
              <>
                <Image
                  source={{ uri: payOrder.qr_url }}
                  style={{ width: 200, height: 200, alignSelf: 'center', marginBottom: 16, borderRadius: 12 }}
                  resizeMode="contain"
                />
                <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10, marginBottom: 10 }}>
                  <InfoRow label={t('premium.payment_bank')}    value={payOrder.bank_code} />
                  <InfoRow label={t('premium.payment_account')} value={payOrder.bank_account} />
                  <InfoRow label={t('premium.payment_holder')}  value={payOrder.bank_holder} />
                  <InfoRow label={t('premium.payment_amount')}  value={formatVND(payOrder.amount)} amber bold />
                  <InfoRow label={t('premium.payment_ref')}     value={payOrder.invoice_number} bold />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
                  {t('premium.payment_expires', { time: dayjs(payOrder.expires_at).format('HH:mm DD/MM/YYYY') })}
                </Text>
                {statusData?.status === 'paid' || statusData?.is_premium ? (
                  <View style={{ backgroundColor: '#059669' + '22', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontWeight: '700' }}>{t('premium.payment_success_msg')}</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                    {t('premium.payment_auto_check')}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
