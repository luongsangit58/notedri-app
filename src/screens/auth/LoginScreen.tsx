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

  // Rà soát 22/8: bố cục đồng bộ với web (garage/auth/login.blade.php) - 1 thẻ DUY NHẤT gồm
  // logo nhỏ + tên/tagline + pill ưu đãi + nút + link điều khoản, thay cho logo chữ to tách
  // riêng + banner ưu đãi dạng khối lớn trước đây.
  return (
    <AuthContainer hideBgPattern>
      <View
        style={{
          backgroundColor: C.card, borderRadius: 20, padding: 24, alignItems: 'center',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          // Thẻ trước đây phẳng hoàn toàn (không shadow/viền) - dễ nhìn "rẻ" giữa nền hoạ tiết
          // phía sau (BgPattern). Thêm shadow (iOS) + elevation (Android) cho có độ nổi thật.
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16,
          elevation: 10,
        }}>
        <Image
          source={require('../../../assets/icon.png')}
          style={{ width: 56, height: 56, borderRadius: 16, marginBottom: 14 }}
        />
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>{t('auth.login')}</Text>
        <Text style={{ color: C.textSecondary, fontSize: 13, marginTop: 4 }}>
          <Text style={{ fontWeight: '700' }}>
            <Text style={{ color: '#ffffff' }}>Note</Text>
            <Text style={{ color: C.primary }}>Dri</Text>
          </Text>
          {' · '}{t('auth.app_tagline')}
        </Text>

        {/* Khuyến khích: tài khoản mới (lần đầu đăng nhập Apple/Google) tự nhận 30 ngày dùng
            thử Premium (grantSignupTrial() cấp tự động ở backend) - chữ "Premium" bấm được,
            mở trang giới thiệu Premium trên web cho khách chưa rõ Premium là gì. */}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://notedri.com/premium')}
          style={{
            backgroundColor: C.primary + '26', borderWidth: 1, borderColor: C.primary + '55', borderRadius: 999,
            paddingHorizontal: 12, paddingVertical: 6, marginTop: 16, marginBottom: 20,
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
              style={{ width: '100%', height: 44, opacity: appleBusy ? 0.5 : 1 }}
              onPress={handleApple}
            />
          )}

          <TouchableOpacity
            onPress={handleGoogle}
            disabled={googleBusy}
            style={{ backgroundColor: '#ffffff', height: 44, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: googleBusy ? 0.5 : 1 }}>
            {googleBusy ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <FontAwesome5 name="google" size={16} color="#4285F4" />
            )}
            <Text style={{ color: '#1c1917', fontWeight: '600', fontSize: 14 }}>{t('auth.login_with_google')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <TouchableOpacity onPress={() => Linking.openURL('https://notedri.com/terms')}>
            <Text style={{ color: C.textSecondary, fontSize: 12 }}>{t('about.terms')}</Text>
          </TouchableOpacity>
          <Text style={{ color: C.textSecondary, fontSize: 12, marginHorizontal: 6 }}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://notedri.com/privacy')}>
            <Text style={{ color: C.textSecondary, fontSize: 12 }}>{t('about.privacy_policy')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AuthContainer>
  );
}
