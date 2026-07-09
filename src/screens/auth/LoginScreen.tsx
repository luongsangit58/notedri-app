import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { BASE_URL } from '../../utils/api';
import { AuthContainer, C, INPUT_STYLE } from './_authLayout';
import { markGooglePending, clearGooglePending } from '../../services/googleAuthRecovery';

const GOOGLE_MOBILE_URL = `${BASE_URL}/auth/google/mobile`;

export default function LoginScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const [googleBusy, setGoogleBusy] = useState(false);

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

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.enter_email_password'));
      return;
    }
    try { await login(email, password); } catch {}
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

      {/* Card */}
      <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24 }}>
        <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 18 }}>
          {t('auth.login')}
        </Text>

        {error ? (
          <View style={{ backgroundColor: C.errorBg, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.errorBorder }}>
            <Text style={{ color: C.errorText, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6 }}>{t('auth.email')}</Text>
        <TextInput
          value={email}
          onChangeText={(v) => { clearError(); setEmail(v); }}
          placeholder={t('auth.email')}
          placeholderTextColor={C.inputBorder}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
          style={[INPUT_STYLE, { marginBottom: 14 }]}
        />

        <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6 }}>{t('auth.password')}</Text>
        <View style={[INPUT_STYLE, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, marginBottom: 6 }]}>
          <TextInput
            value={password}
            onChangeText={(v) => { clearError(); setPassword(v); }}
            placeholder="••••••••"
            placeholderTextColor={C.inputBorder}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 14 }}
          />
          <TouchableOpacity onPress={() => setShowPw(s => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <FontAwesome5 name={showPw ? 'eye-slash' : 'eye'} size={16} color={C.textSecondary} solid />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'flex-end', marginBottom: 20, paddingVertical: 4 }}>
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: '500' }}>{t('auth.forgot_password')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading}
          style={{ backgroundColor: C.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', opacity: isLoading ? 0.7 : 1, marginBottom: 18 }}>
          <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
            {isLoading ? t('auth.logging_in') : t('auth.login')}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.divider }} />
          <Text style={{ color: C.textSecondary, marginHorizontal: 12, fontSize: 13 }}>{t('auth.or')}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: C.divider }} />
        </View>

        <TouchableOpacity
          onPress={handleGoogle}
          disabled={isLoading || googleBusy}
          style={{ backgroundColor: '#ffffff', paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: (isLoading || googleBusy) ? 0.5 : 1 }}>
          {googleBusy ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <FontAwesome5 name="google" size={16} color="#4285F4" />
          )}
          <Text style={{ color: '#1c1917', fontWeight: '600', fontSize: 14 }}>{t('auth.login_with_google')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 22, alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: C.textSecondary, fontSize: 14 }}>
          {t('auth.no_account')}{' '}
          <Text style={{ color: C.primary, fontWeight: '700' }}>{t('auth.register')}</Text>
        </Text>
      </TouchableOpacity>
    </AuthContainer>
  );
}
