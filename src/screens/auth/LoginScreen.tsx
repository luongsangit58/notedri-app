import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { BASE_URL } from '../../utils/api';
import { AuthContainer, C } from './_authLayout';
import { markGooglePending, clearGooglePending } from '../../services/googleAuthRecovery';

const GOOGLE_MOBILE_URL = `${BASE_URL}/auth/google/mobile`;

// Rà soát 21/8 (5): bỏ hẳn đăng nhập/đăng ký bằng email+password - CHỈ còn Apple/Google
// (xem comment AuthController.php phía backend). 1 nút vừa là đăng nhập vừa là đăng ký
// (backend tự tạo tài khoản mới nếu apple_id/google_id chưa từng thấy).
export default function LoginScreen(): React.ReactElement {
  const t = useT();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);

  // Bóc token/lỗi từ URL callback do CHÍNH openAuthSessionAsync trả về (app tự khởi tạo phiên,
  // đúng scheme notedri://auth). KHÔNG dùng listener Linking toàn cục -> tránh chèn token deep-link.
  const finishGoogleLogin = async (urlStr: string): Promise<boolean> => {
    const qIndex = urlStr.indexOf('?');
    const hIndex = urlStr.indexOf('#');
    const query = qIndex >= 0 ? urlStr.slice(qIndex + 1) : hIndex >= 0 ? urlStr.slice(hIndex + 1) : '';
    const params = new URLSearchParams(query);

    const googleError = params.get('error');
    if (googleError) {
      Alert.alert(t('common.error'), googleError);
      return true;
    }

    const token = params.get('token');
    if (!token) return false;

    try {
      const { authApi } = await import('../../api/auth');
      const me = await authApi.me(token);
      const userData = me.data?.data ?? me.data;
      await useAuthStore.getState().setSession(token, userData); // đổi token -> RootNavigator tự chuyển màn
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message ?? e?.message ?? t('auth.login_google_failed'));
    }
    return true;
  };

  const handleGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      // Đánh dấu "đang chờ callback" TRƯỚC khi mở phiên - nếu OS kill app giữa chừng, App.tsx
      // đọc cờ này lúc cold-start kế tiếp để khôi phục (xem services/googleAuthRecovery.ts).
      await markGooglePending('login');
      // Web OAuth qua Custom Tab: backend redirect về notedri://auth?token=... và
      // openAuthSessionAsync bắt đúng URL đó rồi trả về cho lời gọi này (không phụ thuộc SHA-1).
      const result = await WebBrowser.openAuthSessionAsync(GOOGLE_MOBILE_URL, 'notedri://auth', {
        preferEphemeralSession: false,
      });
      if (result.type === 'success' && result.url) {
        const handled = await finishGoogleLogin(result.url);
        if (!handled) Alert.alert(t('common.error'), t('auth.login_google_failed'));
      }
      // type 'cancel'/'dismiss' = user tự đóng trình duyệt -> im lặng, không kẹt màn hình.
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('auth.login_google_failed'));
    } finally {
      // Luồng bình thường (app còn sống) đã xử lý xong callback -> không cần cờ nữa.
      await clearGooglePending();
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

  return (
    <AuthContainer>
      {/* Logo */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <Text style={{ fontWeight: '800', fontSize: 52, lineHeight: 60, letterSpacing: -1 }}>
          <Text style={{ color: '#ffffff' }}>Note</Text>
          <Text style={{ color: C.primary }}>Dri</Text>
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 15, fontWeight: '600', marginTop: 6 }}>
          {t('auth.app_tagline')}
        </Text>
        <Text style={{ color: C.primary, fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
          {t('auth.slogan')}
        </Text>
      </View>

      {/* Khuyến khích: tài khoản mới (lần đầu đăng nhập Apple/Google) tự nhận 30 ngày dùng thử
          Premium (grantSignupTrial() cấp tự động ở backend). Không còn nút riêng - Apple/Google
          bên dưới vừa là đăng nhập vừa là đăng ký. */}
      <View
        style={{
          backgroundColor: C.primary + '22', borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: C.primary, marginBottom: 18,
        }}>
        <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
          {t('auth.trial_banner_login')}
        </Text>
      </View>

      {/* Card */}
      <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24 }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 18 }}>
          {t('auth.login')}
        </Text>

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ width: '100%', height: 44, marginBottom: 12, opacity: appleBusy ? 0.5 : 1 }}
            onPress={handleApple}
          />
        )}

        <TouchableOpacity
          onPress={handleGoogle}
          disabled={googleBusy}
          style={{ backgroundColor: '#ffffff', paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: googleBusy ? 0.5 : 1 }}>
          {googleBusy ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <FontAwesome5 name="google" size={16} color="#4285F4" />
          )}
          <Text style={{ color: '#1c1917', fontWeight: '600', fontSize: 14 }}>{t('auth.login_with_google')}</Text>
        </TouchableOpacity>
      </View>
    </AuthContainer>
  );
}
