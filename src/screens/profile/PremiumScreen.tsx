import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
  TextInput,
} from 'react-native';
import { contentWide } from '../../utils/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { INPUT_FONT_FAMILY } from '../../utils/font';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';

const AMBER = '#F59E0B';

// Đồng bộ lại authStore.user sau khi kích hoạt Premium (redeem/dùng thử) để các
// gate đọc thẳng user?.is_premium (OBD, thành tích, chi tiết xe) mở khoá NGAY, không
// phải mở lại app.
async function refreshAuthUser() {
  try {
    const res = await authApi.me();
    const fresh = res.data?.data ?? res.data;
    if (fresh) useAuthStore.getState().setUser(fresh);
  } catch { /* bỏ qua - initialize() lần mở app sau sẽ tự đồng bộ */ }
}

export default function PremiumScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();
  const navigation = useNavigation<any>();

  const [redeemCode, setRedeemCode] = useState('');

  // Rà soát 14/8 (góp ý user: rà lại cho khớp thực tế gói Premium + web) - đối
  // chiếu config/plans.php (backend, nguồn xác thực duy nhất): "Tìm gần đây"
  // (xăng/sạc/gara/đăng kiểm) đã BỎ GATE Premium từ lâu (miễn phí cho mọi
  // user) - chuyển xuống danh sách Free thay vì quảng cáo nhầm thành quyền
  // lợi Premium. Free cũng giới hạn RÕ 1 xe / tối đa 4 lời nhắc / chỉ xem báo
  // cáo NĂM HIỆN TẠI (không phải "12 tháng gần nhất" như bản cũ - 2 cách tính
  // khác nhau, vd tháng 1 "năm hiện tại" chỉ có ~1 tháng dữ liệu).
  const FREE_FEATURES = [
    t('premium.free_feature_2_vehicles'),
    t('premium.free_feature_current_year'),
    t('premium.free_feature_basic_reports'),
    t('premium.free_feature_reminders'),
    t('premium.free_feature_dossier'),
    t('premium.free_feature_nearby'),
  ];

  // Rà soát 14/8: bản cũ hoàn toàn không nhắc tới OBD2 (kết nối cảm biến/chẩn
  // đoán ECU qua Bluetooth) và Nori AI Agent - 2 tính năng Premium ĐẮT GIÁ và
  // khác biệt nhất của app (OBD2 chặn cứng ở OBDSetupScreen, Nori chặn cứng ở
  // AiNoriController::chat() phía backend), lại chỉ liệt kê toàn "không giới
  // hạn X" chung chung. Đưa 2 tính năng này lên ĐẦU danh sách - đúng chiến
  // lược "dẫn bằng lợi ích cụ thể/hữu hình trước, giới hạn định lượng sau".
  const PREMIUM_FEATURES = [
    { icon: 'microchip',        text: t('premium.feature_obd2') },
    { icon: 'robot',            text: t('premium.feature_nori_agent') },
    { icon: 'crown',            text: t('premium.feature_unlimited_vehicles') },
    { icon: 'history',          text: t('premium.feature_unlimited_history') },
    { icon: 'bell',             text: t('premium.feature_unlimited_reminders') },
    { icon: 'envelope',         text: t('premium.feature_email_reminders') },
    { icon: 'file-export',      text: t('premium.feature_export') },
    { icon: 'palette',          text: t('premium.feature_dashboard_styles') },
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
      refreshAuthUser();
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message ?? t('common.error_generic'));
    },
  });

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const canRequest: boolean = data?.can_request ?? false;
  const requestStatus: string | null = data?.request_status ?? null;
  const trialUsed: boolean = data?.trial_used ?? false;
  // Rà soát 14/8: fallback khớp config/plans.php ("trial_days" => 30) thay vì
  // 14 - chỉ dùng khi API không trả field này (fallback phòng hờ, không phải
  // giá trị thật đang áp dụng).
  const trialDays: number = data?.trial_days ?? 30;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

  function statusLabel(s?: string | null): string {
    if (s === 'pending')  return t('premium.request_pending_label');
    if (s === 'approved') return t('premium.request_approved_label');
    if (s === 'rejected') return t('premium.request_rejected_label');
    return '';
  }

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
      <ScrollView
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} />}
        contentContainerStyle={[{ padding: 20, paddingBottom: 40 }, contentWide]}>

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

        {/* Premium features - rà soát 14/8 (góp ý user: chữ mô tả dài tràn ra ngoài viền
            thẻ, trình bày sơ sài) - Text thiếu `flex:1` trong hàng flexDirection:row là
            nguyên nhân tràn viền (RN không tự bọc chữ khi phần tử không co giãn được);
            thêm flex:1 + lineHeight, đồng thời bọc icon trong khối tròn màu để đồng bộ
            ngôn ngữ thiết kế với các thẻ CTA khác trên Home thay vì icon trần đơn điệu. */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: AMBER + '40' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: AMBER }} />
            <Text style={{ color: AMBER, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('premium.includes_title')}
            </Text>
          </View>
          {PREMIUM_FEATURES.map((f, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
              }}>
              <View style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: AMBER + '22', alignItems: 'center', justifyContent: 'center',
              }}>
                <FontAwesome5 name={f.icon} size={13} color={AMBER} solid />
              </View>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 19, flex: 1, marginTop: 5 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Free plan */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('premium.free_title')}
          </Text>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <FontAwesome5 name="check" size={12} color={colors.textSecondary} solid style={{ marginTop: 3 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, flex: 1 }}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA - trial */}
        {!isPremium && canRequest && (
          <>
            <TouchableOpacity
              onPress={() => requestTrial()}
              disabled={isPending}
              style={{ borderRadius: 14, marginBottom: 12, overflow: 'hidden', opacity: isPending ? 0.7 : 1 }}>
              <LinearGradient colors={['#fbbf24', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: 'center' }}>
                {isPending
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                      {t('premium.trial_cta', { days: trialDays })}
                    </Text>
                  )}
              </LinearGradient>
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
                  fontFamily: INPUT_FONT_FAMILY,
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
    </SafeAreaView>
  );
}
