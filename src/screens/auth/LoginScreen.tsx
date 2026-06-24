import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import PasswordInput from '../../components/PasswordInput';
import { BASE_URL } from '../../utils/api';

// Mobile Google auth flow:
// App mở browser → notedri.com/auth/google/mobile → Google xác thực
// → web tạo Sanctum token → redirect notedri://auth?token=xxx → app bắt URL
const GOOGLE_MOBILE_URL = `${BASE_URL}/auth/google/mobile`;

export default function LoginScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.enter_email_password'));
      return;
    }
    try {
      await login(email, password);
    } catch {}
  };

  const handleGoogle = async () => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        GOOGLE_MOBILE_URL,
        'notedri://auth',
      );
      if (result.type !== 'success') return;
      const url = result.url;
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const token = params.get('token');
      const googleError = params.get('error');
      if (googleError) {
        Alert.alert(t('common.error'), decodeURIComponent(googleError));
        return;
      }
      if (!token) {
        Alert.alert(t('common.error'), t('auth.google_no_id_token'));
        return;
      }
      // Fetch full user info với token vừa nhận
      const { authApi } = await import('../../api/auth');
      const me = await authApi.me(token);
      const userData = me.data?.data ?? me.data;
      await useAuthStore.getState().setSession(token, userData);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? 'Đăng nhập Google thất bại');
    }
  };

  const inputStyle = {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand wordmark */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontWeight: '800', fontSize: 52, lineHeight: 60, letterSpacing: -1 }}>
            <Text style={{ color: colors.text }}>Note</Text>
            <Text style={{ color: colors.primary }}>Dri</Text>
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '600', marginTop: 4 }}>
            {t('auth.app_tagline')}
          </Text>
          <Text style={{ color: colors.primary, fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
            "Quản lý chi phí, tối ưu vận hành"
          </Text>
        </View>

        {/* Card */}
        <View style={{
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
            {t('auth.login')}
          </Text>

          {error ? (
            <View style={{ backgroundColor: colors.error + '22', borderRadius: 8, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: colors.error + '55' }}>
              <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            value={email}
            onChangeText={(v) => { clearError(); setEmail(v); }}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            style={[inputStyle, { marginBottom: 12 }]}
          />
          <PasswordInput
            value={password}
            onChangeText={(v) => { clearError(); setPassword(v); }}
            placeholder={t('auth.password')}
            style={{ marginBottom: 6, borderColor: colors.border }}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={{ alignSelf: 'flex-end', marginBottom: 18, paddingVertical: 4 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
              {t('auth.forgot_password')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>
              {isLoading ? t('auth.logging_in') : t('auth.login')}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ color: colors.textSecondary, marginHorizontal: 12, fontSize: 13 }}>{t('auth.or')}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          <TouchableOpacity
            onPress={handleGoogle}
            disabled={isLoading}
            style={{
              backgroundColor: colors.background,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 18, lineHeight: 20 }}>🇬</Text>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{t('auth.login_with_google')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Register')}
          style={{ marginTop: 20, alignItems: 'center', paddingVertical: 8 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {t('auth.no_account')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.register')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
