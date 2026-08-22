import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
  Platform, Linking,
} from 'react-native';
import { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { contentWide } from '../../utils/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';
import {
  getOfferings, purchase as purchasePackage, restorePurchases, isEntitled,
  presentCodeRedemptionSheet, addCustomerInfoUpdateListener, removeCustomerInfoUpdateListener,
} from '../../services/iap/RevenueCatService';

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

// Rà soát 20/8 (user test thật: redeem/restore xong, Alert báo thành công ngay,
// nhưng is_premium vẫn hiện "dùng thử" - phải TỰ TAY thoát màn/reload mới thấy
// lên Premium) - gọi invalidateQueries() đúng 1 LẦN ngay sau khi StoreKit/
// RevenueCat xác nhận xong sẽ refetch /premium QUÁ SỚM: backend cần thời gian
// nhận webhook RevenueCat rồi mới cập nhật users.plan. Poll lại nhiều lần thay
// vì 1 lần - dừng ngay khi thấy is_premium=true.
//
// Rà soát 20/8 (2): 7 lần x 3s (~18-21s) KHÔNG ĐỦ - test thật với Offer Code
// redeem qua Sandbox mất tới 1-2 PHÚT mới thấy webhook về (môi trường Sandbox
// của Apple đẩy thông báo giao dịch chậm hơn hẳn production). Tăng lên 24 lần
// x 5s (~2 phút) để trùm qua độ trễ Sandbox thực tế - vẫn không mất gì nếu hết
// giờ mà chưa xong (lần mở lại màn/kéo refresh tay sau đó vẫn tự lấy đúng dữ
// liệu). JS timer tự dừng khi app bị background (RN treo JS thread), không tốn
// pin/mạng trong lúc user rời app qua Safari để redeem.
async function pollPremiumStatus(qc: QueryClient): Promise<void> {
  for (let attempt = 0; attempt < 24; attempt++) {
    await qc.invalidateQueries({ queryKey: ['premium-status'] });
    const status = qc.getQueryData<{ is_premium?: boolean }>(['premium-status']);
    if (status?.is_premium) {
      // Rà soát 21/8 (user test thật: Premium screen lên đúng nhưng gate OBD2 ở Home
      // vẫn đẩy ngược vào màn Premium, phải tắt/mở lại app mới hết) - refreshAuthUser()
      // trước đây bị gọi NGAY khi bắt đầu poll (song song, không đợi) nên gần như luôn
      // lấy về user CŨ (webhook backend thường chưa kịp xử lý) rồi không gọi lại lần
      // nào nữa dù vòng lặp này sau đó tìm ra is_premium=true - authStore.user kẹt giá
      // trị cũ tới lúc mở lại app. Gọi ở ĐÂY, đúng lúc /premium đã xác nhận đổi, để
      // authStore đồng bộ cùng lúc với Premium screen thay vì lệch pha.
      await refreshAuthUser();
      return;
    }
    if (attempt < 23) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
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
  // gian để nhận webhook RevenueCat rồi mới cập nhật is_premium - pollPremiumStatus()
  // tự retry tới 2 phút, và chỉ đồng bộ authStore.user (gate OBD2/thành tích...) SAU
  // KHI xác nhận đổi xong, không đồng bộ sớm (xem ghi chú trong pollPremiumStatus).
  const { mutate: purchaseMutate, isPending: isPurchasing } = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: (info) => {
      if (isEntitled(info)) {
        Alert.alert(t('premium.notification_title'), t('premium.purchase_success'));
      }
      void pollPremiumStatus(qc);
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
      void pollPremiumStatus(qc);
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.message ?? t('common.error_generic'));
    },
  });

  // Redemption qua sheet hệ thống (mở bằng redeemMutate bên dưới) chạy ngoài luồng
  // JS - lắng nghe CustomerInfo đổi để tự làm mới is_premium ngay khi StoreKit xác
  // nhận xong, không cần user tự kéo refresh (xem RevenueCatService.ts).
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      if (isEntitled(info)) {
        void pollPremiumStatus(qc);
      }
    };
    addCustomerInfoUpdateListener(listener);
    return () => removeCustomerInfoUpdateListener(listener);
  }, [qc]);

  // Bán kèm KW906 trên Shopee - user nhập mã Offer Code (Apple StoreKit) thay vì
  // mua lần 2. iOS-only, xem presentCodeRedemptionSheet() trong RevenueCatService.ts.
  const { mutate: redeemMutate, isPending: isRedeeming } = useMutation({
    mutationFn: () => presentCodeRedemptionSheet(),
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.message ?? t('common.error_generic'));
    },
  });

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

  // Android không có sheet nhập mã hệ thống như iOS (presentCodeRedemptionSheet) - Google Play
  // redeem qua chính app Play Store, nhưng có thể mở thẳng bằng deep link kèm mã có sẵn
  // (https://play.google.com/redeem?code=...) để trải nghiệm gần giống iOS thay vì bắt user
  // tự mở Play Store rồi gõ lại mã.
  const [showRedeemInput, setShowRedeemInput] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const openAndroidRedeem = () => {
    const code = redeemCode.trim();
    if (!code) return;
    Linking.openURL(`https://play.google.com/redeem?code=${encodeURIComponent(code)}`);
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
            gì ở đây. Rà soát 20/8: vẫn hiện nút mua khi đang trong 30 ngày dùng thử
            (onTrial) - cho phép mua sớm để giữ Premium vĩnh viễn ngay, chỉ ẩn hẳn khi
            đã mua Lifetime thật (isPremium && !onTrial). packages rỗng nếu offering
            chưa cấu hình trong RevenueCat dashboard hoặc API key .env trống - không
            hiện gì thay vì hiện danh sách trống khó hiểu. */}
        {(!isPremium || onTrial) && packages.length > 0 && (
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
                  {/* Play Billing tự thêm "(tên app)" vào cuối title sản phẩm trên Android
                      (StoreKit/iOS không có hậu tố này) - cắt bỏ để khớp giao diện iOS. */}
                  {Platform.OS === 'android' ? pkg.product.title.replace(/\s*\([^)]*\)\s*$/, '') : pkg.product.title}
                </Text>
                <Text style={{ color: AMBER, fontSize: 15, fontWeight: '800' }}>
                  {pkg.product.priceString}
                </Text>
              </TouchableOpacity>
            ))}
            {isPurchasing && <ActivityIndicator color={AMBER} style={{ marginTop: 4 }} />}
          </View>
        )}

        {/* Nhập mã ưu đãi (Offer Code) - iOS only. Dành cho khách mua KW906 kèm gói
            Premium trên Shopee: nhập mã thay vì trả tiền qua nút mua ở trên. Chỉ
            hiện khi chưa phải Premium thật (giữ nguyên tắc ẩn/hiện như khối packages
            phía trên) - đổi mã cho tài khoản đã Premium không có ý nghĩa gì. */}
        {Platform.OS === 'ios' && (!isPremium || onTrial) && (
          <TouchableOpacity
            onPress={() => redeemMutate()}
            disabled={isRedeeming}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
              borderWidth: 1, borderColor: colors.border, opacity: isRedeeming ? 0.6 : 1,
            }}>
            {isRedeeming
              ? <ActivityIndicator size="small" color={AMBER} />
              : <FontAwesome5 name="ticket-alt" size={16} color={AMBER} solid />
            }
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('premium.redeem_code_title')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('premium.redeem_code_desc')}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Nhập mã ưu đãi - Android. Không có sheet hệ thống như iOS nên dùng ô nhập mã +
            mở deep link redeem của Play Store (xem openAndroidRedeem ở trên). */}
        {Platform.OS === 'android' && (!isPremium || onTrial) && (
          <View style={{ marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setShowRedeemInput((s) => !s)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: colors.surface, borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: colors.border,
              }}>
              <FontAwesome5 name="ticket-alt" size={16} color={AMBER} solid />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('premium.redeem_code_title')}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('premium.redeem_code_desc')}</Text>
              </View>
              <FontAwesome5 name={showRedeemInput ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} solid />
            </TouchableOpacity>
            {showRedeemInput && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  value={redeemCode}
                  onChangeText={setRedeemCode}
                  placeholder={t('premium.redeem_code_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={{
                    flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1,
                    borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 10,
                  }}
                />
                <TouchableOpacity
                  onPress={openAndroidRedeem}
                  disabled={!redeemCode.trim()}
                  style={{
                    backgroundColor: AMBER, borderRadius: 10, paddingHorizontal: 16,
                    alignItems: 'center', justifyContent: 'center', opacity: redeemCode.trim() ? 1 : 0.5,
                  }}>
                  <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 13 }}>{t('premium.redeem_code_submit')}</Text>
                </TouchableOpacity>
              </View>
            )}
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
      </ScrollView>
    </SafeAreaView>
  );
}
