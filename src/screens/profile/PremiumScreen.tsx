import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { contentWide } from '../../utils/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';
import { getOfferings, purchase as purchasePackage, restorePurchases, isEntitled } from '../../services/iap/RevenueCatService';

const AMBER = '#F59E0B';

// Đồng bộ lại authStore.user sau khi kích hoạt Premium (mua IAP/dùng thử) để các
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

  // Danh sách gói (chỉ còn Lifetime, mua 1 lần) lấy trực tiếp từ RevenueCat offering
  // hiện tại (cấu hình trong RevenueCat dashboard, không hardcode giá ở đây) - packages
  // rỗng nếu chưa cấu hình offering hoặc API key trống (dev chưa điền .env). Dùng thử
  // 1 tháng giờ tự động cấp khi đăng ký tài khoản (backend) - không còn nút yêu cầu
  // dùng thử thủ công như trước.
  const { data: offering } = useQuery({
    queryKey: ['revenuecat-offering'],
    queryFn: getOfferings,
    staleTime: 1000 * 60 * 5,
  });
  const packages: PurchasesPackage[] = offering?.availablePackages ?? [];

  // Sau khi mua/restore thành công qua StoreKit/Play Billing, backend cần thời
  // gian ngắn để nhận webhook RevenueCat rồi mới cập nhật is_premium - refetch
  // /premium NGAY (thường đã kịp vì RevenueCat gửi webhook gần như tức thì), UI
  // vẫn đúng dù có trễ vài giây vì user quay lại màn này sẽ tự refetch lần nữa.
  const { mutate: purchaseMutate, isPending: isPurchasing } = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: (info) => {
      if (isEntitled(info)) {
        Alert.alert(t('premium.notification_title'), t('premium.purchase_success'));
      }
      qc.invalidateQueries({ queryKey: ['premium-status'] });
      refreshAuthUser();
    },
    onError: (err: any) => {
      if (err?.userCancelled) return;
      Alert.alert(t('common.error'), err?.message ?? t('common.error_generic'));
    },
  });

  const { mutate: restoreMutate, isPending: isRestoring } = useMutation({
    mutationFn: () => restorePurchases(),
    onSuccess: (info) => {
      Alert.alert(
        t('premium.notification_title'),
        isEntitled(info) ? t('premium.purchase_success') : t('premium.restore_empty')
      );
      qc.invalidateQueries({ queryKey: ['premium-status'] });
      refreshAuthUser();
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.message ?? t('common.error_generic'));
    },
  });

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

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
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} colors={[AMBER]} />}
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

        {/* Gói Lifetime mua 1 lần qua App Store/Play Billing (RevenueCat) - thay cho
            redeem code (bị Apple 3.1.1 reject 18/8/2026, xem
            docs/apple-hardware-bundle-compliance.md) và cho gói subscription 3/6/12
            tháng cũ (bỏ 19/8/2026, xem docs/revenuecat-iap-backend-spec.md). Dùng thử
            1 tháng đầu tự động cấp khi đăng ký tài khoản (backend), không cần thao tác
            gì ở đây - hết hạn thì mua Lifetime nếu muốn tiếp tục. packages rỗng nếu
            offering chưa cấu hình trong RevenueCat dashboard hoặc API key .env trống -
            không hiện gì thay vì hiện danh sách trống khó hiểu. */}
        {!isPremium && packages.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 10 }}>
              {t('premium.plans_section_title')}
            </Text>
            {packages.map((pkg) => (
              <TouchableOpacity
                key={pkg.identifier}
                onPress={() => purchaseMutate(pkg)}
                disabled={isPurchasing}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
                  borderWidth: 1, borderColor: colors.border, opacity: isPurchasing ? 0.6 : 1,
                }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>
                  {pkg.product.title}
                </Text>
                <Text style={{ color: AMBER, fontSize: 15, fontWeight: '800' }}>
                  {pkg.product.priceString}
                </Text>
              </TouchableOpacity>
            ))}
            {isPurchasing && <ActivityIndicator color={AMBER} style={{ marginTop: 4 }} />}
          </View>
        )}

        {/* Restore Purchases - bắt buộc phải có theo App Store Review Guidelines
            khi app bán subscription (khách đổi máy/cài lại app vẫn lấy lại được gói
            đã mua qua đúng Apple ID/Google account, không cần mua lại). */}
        <TouchableOpacity
          onPress={() => restoreMutate()}
          disabled={isRestoring}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: colors.border, opacity: isRestoring ? 0.6 : 1,
          }}>
          {isRestoring
            ? <ActivityIndicator size="small" color={AMBER} />
            : <FontAwesome5 name="rotate-right" size={16} color={AMBER} solid />
          }
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('premium.restore_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('premium.restore_desc')}</Text>
          </View>
        </TouchableOpacity>

        {/* Liên hệ hỗ trợ chung (không còn "cấp mã kích hoạt" - mọi kích hoạt/gia hạn
            đi qua IAP thật ở trên). */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Feedback', {
            initialLoai: 'khac',
            initialContent: t('premium.contact_prefill'),
          })}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
            borderWidth: 1, borderColor: colors.border,
          }}>
          <FontAwesome5 name="headset" size={16} color={AMBER} solid />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('premium.contact_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('premium.contact_desc')}</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
          {t('premium.pricing_note')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
