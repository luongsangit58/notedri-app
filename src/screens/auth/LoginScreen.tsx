import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Dimensions,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { BASE_URL } from '../../utils/api';

const GOOGLE_MOBILE_URL = `${BASE_URL}/auth/google/mobile`;

// Fixed dark auth palette (không phụ thuộc theme user)
const C = {
  bg: '#0d1527',
  card: '#1a2744',
  inputBg: '#0d1527',
  inputBorder: '#2d3f63',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  primary: '#f59e0b',
  divider: '#2d3f63',
} as const;

const BG_ICONS = ['gas-pump', 'tint', 'bicycle', 'car', 'motorcycle', 'oil-can', 'wrench', 'gas-pump', 'tint', 'car'] as const;
const BG_ROTATIONS = [0, 15, -10, 20];

function BgPattern() {
  const { width, height } = Dimensions.get('window');
  const cols = Math.ceil(width / 90) + 1;
  const rows = Math.ceil(height / 90) + 2;
  const items = useMemo(
    () => Array.from({ length: cols * rows }, (_, i) => ({
      icon: BG_ICONS[i % BG_ICONS.length],
      rotate: BG_ROTATIONS[i % 4],
      x: (i % cols) * 90,
      y: Math.floor(i / cols) * 90,
    })),
    [cols, rows],
  );
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.07 }} pointerEvents="none">
      {items.map((item, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: item.x,
            top: item.y,
            width: 90,
            height: 90,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: `${item.rotate}deg` }],
          }}>
          <FontAwesome5 name={item.icon} size={28} color="#ffffff" solid />
        </View>
      ))}
    </View>
  );
}

export default function LoginScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.enter_email_password'));
      return;
    }
    try { await login(email, password); } catch {}
  };

  const handleGoogle = async () => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(GOOGLE_MOBILE_URL, 'notedri://auth');
      if (result.type !== 'success') return;
      const params = new URLSearchParams(result.url.split('?')[1] ?? '');
      const token = params.get('token');
      const googleError = params.get('error');
      if (googleError) { Alert.alert(t('common.error'), decodeURIComponent(googleError)); return; }
      if (!token) { Alert.alert(t('common.error'), t('auth.google_no_id_token')); return; }
      const { authApi } = await import('../../api/auth');
      const me = await authApi.me(token);
      const userData = me.data?.data ?? me.data;
      await useAuthStore.getState().setSession(token, userData);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? 'Đăng nhập Google thất bại');
    }
  };

  const inputStyle = {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 15,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <BgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled">

          {/* Logo + tagline */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <Text style={{ fontWeight: '800', fontSize: 52, lineHeight: 60, letterSpacing: -1 }}>
              <Text style={{ color: '#ffffff' }}>Note</Text>
              <Text style={{ color: C.primary }}>Dri</Text>
            </Text>
            <Text style={{ color: '#cbd5e1', fontSize: 15, fontWeight: '600', marginTop: 6 }}>
              {t('auth.app_tagline')}
            </Text>
            <Text style={{ color: C.primary, fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>
              "Quản lý chi phí, tối ưu vận hành"
            </Text>
          </View>

          {/* Card */}
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24 }}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 18 }}>
              {t('auth.login')}
            </Text>

            {error ? (
              <View style={{ backgroundColor: '#7f1d1d55', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#b91c1c88' }}>
                <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6 }}>
              {t('auth.email')}
            </Text>
            <TextInput
              value={email}
              onChangeText={(v) => { clearError(); setEmail(v); }}
              placeholder={t('auth.email')}
              placeholderTextColor={C.inputBorder}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              style={[inputStyle, { marginBottom: 14 }]}
            />

            {/* Mật khẩu */}
            <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 6 }}>
              {t('auth.password')}
            </Text>
            <View style={[inputStyle, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, marginBottom: 6 }]}>
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

            {/* Quên mật khẩu */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={{ alignSelf: 'flex-end', marginBottom: 20, paddingVertical: 4 }}>
              <Text style={{ color: C.primary, fontSize: 13, fontWeight: '500' }}>
                {t('auth.forgot_password')}
              </Text>
            </TouchableOpacity>

            {/* Đăng nhập */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading}
              style={{
                backgroundColor: C.primary,
                paddingVertical: 15,
                borderRadius: 12,
                alignItems: 'center',
                opacity: isLoading ? 0.7 : 1,
                marginBottom: 18,
              }}>
              <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
                {isLoading ? t('auth.logging_in') : t('auth.login')}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: C.divider }} />
              <Text style={{ color: C.textSecondary, marginHorizontal: 12, fontSize: 13 }}>{t('auth.or')}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.divider }} />
            </View>

            {/* Google */}
            <TouchableOpacity
              onPress={handleGoogle}
              disabled={isLoading}
              style={{
                backgroundColor: '#ffffff',
                paddingVertical: 13,
                borderRadius: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
                opacity: isLoading ? 0.5 : 1,
              }}>
              <FontAwesome5 name="google" size={16} color="#4285F4" />
              <Text style={{ color: '#1c1917', fontWeight: '600', fontSize: 14 }}>{t('auth.login_with_google')}</Text>
            </TouchableOpacity>
          </View>

          {/* Đăng ký */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            style={{ marginTop: 22, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: C.textSecondary, fontSize: 14 }}>
              {t('auth.no_account')}{' '}
              <Text style={{ color: C.primary, fontWeight: '700' }}>{t('auth.register')}</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
