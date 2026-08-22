import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Platform, Image, Linking } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { AuthContainer, C } from './_authLayout';

// Rà soát 21/8 (5): bỏ hẳn đăng nhập/đăng ký bằng email+password - CHỈ còn Apple/Google
// (xem comment AuthController.php phía backend). 1 nút vừa là đăng nhập vừa là đăng ký
// (backend tự tạo tài khoản mới nếu apple_id/google_id chưa từng thấy).
export default function LoginScreen(): React.ReactElement {
  const t = useT();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);

  // Rà soát 22/8: đổi từ WebBrowser mở Custom Tab sang GoogleSignin native (cùng kiểu native
  // như Apple ở dưới) - trước đây "đăng nhập Google" trên app vẫn phải gọi ra web (route
  // garage.google.mobile) rồi mới nhận token qua deep link, thay vì lấy idToken thẳng từ máy.
  const handleGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') return; // user tự huỷ -> im lặng như Apple
      const idToken = response.data.idToken;
      if (!idToken) {
        Alert.alert(t('common.error'), t('auth.login_google_failed'));
        return;
      }
      const { authApi } = await import('../../api/auth');
      const res = await authApi.loginWithGoogle(idToken);
      const { token } = res.data?.data ?? res.data;
      const me = await authApi.me(token);
      const userData = me.data?.data ?? me.data;
      await useAuthStore.getState().setSession(token, userData); // đổi token -> RootNavigator tự chuyển màn
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return; // user tự huỷ
      Alert.alert(t('common.error'), e?.response?.data?.message ?? e?.message ?? t('auth.login_google_failed'));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleApple = async () => {
    if (appleBusy) return;
    setAppleBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert(t('common.error'), t('auth.login_apple_failed'));
        return;
      }
      // Apple chỉ trả fullName ở lần đăng nhập ĐẦU TIÊN trên thiết bị - các lần sau là null,
      // backend phải tự lưu lại tên từ lần đầu đó.
      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ') || undefined
        : undefined;
      const { authApi } = await import('../../api/auth');
      const res = await authApi.loginWithApple(credential.identityToken, fullName);
      const { token } = res.data?.data ?? res.data;
      // Rà soát 15/8 (bug thật user báo: đăng nhập bằng Apple xong vào Hồ sơ không
      // thấy trạng thái "đã liên kết Apple", chỉ Google hiện đúng) - `user` nhúng sẵn
      // trong response /auth/apple có thể thiếu/chưa cập nhật has_apple. finishGoogleLogin
      // ở trên ĐÃ xử lý đúng bài toán y hệt (chỉ dùng token, gọi /auth/me lấy user MỚI
      // NHẤT/đầy đủ nhất thay vì tin thẳng payload đăng nhập) - áp dụng lại đúng cách đó
      // cho Apple thay vì dùng `user` nhúng sẵn trong response /auth/apple.
      const me = await authApi.me(token);
      const freshUser = me.data?.data ?? me.data;
      await useAuthStore.getState().setSession(token, freshUser);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user tự huỷ -> im lặng như Google
      Alert.alert(t('common.error'), e?.response?.data?.message ?? e?.message ?? t('auth.login_apple_failed'));
    } finally {
      setAppleBusy(false);
    }
  };

  // Rà soát 22/8 (làm lại lần 3 theo phản hồi user): giữ lại hoạ tiết nền (BgPattern) - bỏ
  // hideBgPattern; logo KHÔNG đóng khung tròn nữa, hiện trực tiếp; thêm slogan + hàng 3 tính
  // năng ngắn ở giữa cho đỡ trống/đơn điệu (trước đó chỉ có logo + wordmark, thiếu nội dung).
  return (
    <AuthContainer center={false}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        {/* Hero: logo trực tiếp (không khung tròn) + wordmark to + slogan + 3 tính năng ngắn. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={require('../../../assets/icon.png')}
            style={{
              width: 80, height: 80, borderRadius: 20, marginBottom: 20,
              shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
            }}
          />
          <Text style={{ fontWeight: '800', fontSize: 30, letterSpacing: -0.5 }}>
            <Text style={{ color: '#ffffff' }}>Note</Text>
            <Text style={{ color: C.primary }}>Dri</Text>
          </Text>
          <Text style={{ color: C.textSecondary, fontSize: 14, marginTop: 6 }}>{t('auth.app_tagline')}</Text>
          <Text style={{ color: C.primary, fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
            {t('auth.slogan')}
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 36, gap: 28 }}>
            {[
              { icon: 'gas-pump', label: t('auth.highlight_fuel') },
              { icon: 'wrench', label: t('auth.highlight_reminder') },
              { icon: 'plug', label: t('auth.highlight_obd') },
            ].map((item) => (
              <View key={item.icon} style={{ alignItems: 'center', width: 78 }}>
                <FontAwesome5 name={item.icon} size={18} color={C.primary} solid />
                <Text style={{ color: C.textSecondary, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Neo dưới: pill ưu đãi + nút đăng nhập + link điều khoản. */}
        <View style={{ width: '100%', paddingBottom: 8 }}>
          {/* Khuyến khích: tài khoản mới (lần đầu đăng nhập Apple/Google) tự nhận 30 ngày dùng
              thử Premium (grantSignupTrial() cấp tự động ở backend) - chữ "Premium" bấm được,
              mở trang giới thiệu Premium trên web cho khách chưa rõ Premium là gì. */}
          <TouchableOpacity
            onPress={() => Linking.openURL('https://notedri.com/premium')}
            style={{
              alignSelf: 'center', backgroundColor: C.primary + '26', borderWidth: 1, borderColor: C.primary + '55',
              borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20,
            }}>
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>
              {t('auth.trial_banner_login')} <Text style={{ textDecorationLine: 'underline' }}>Premium</Text>
            </Text>
          </TouchableOpacity>

          <View style={{ width: '100%', gap: 10 }}>
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ width: '100%', height: 48, opacity: appleBusy ? 0.5 : 1 }}
                onPress={handleApple}
              />
            )}

            <TouchableOpacity
              onPress={handleGoogle}
              disabled={googleBusy}
              style={{ backgroundColor: '#ffffff', height: 48, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: googleBusy ? 0.5 : 1 }}>
              {googleBusy ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <FontAwesome5 name="google" size={16} color="#4285F4" />
              )}
              <Text style={{ color: '#1c1917', fontWeight: '600', fontSize: 15 }}>{t('auth.login_with_google')}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
            <TouchableOpacity onPress={() => Linking.openURL('https://notedri.com/terms')}>
              <Text style={{ color: C.textSecondary, fontSize: 12 }}>{t('about.terms')}</Text>
            </TouchableOpacity>
            <Text style={{ color: C.textSecondary, fontSize: 12, marginHorizontal: 6 }}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://notedri.com/privacy')}>
              <Text style={{ color: C.textSecondary, fontSize: 12 }}>{t('about.privacy_policy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AuthContainer>
  );
}
