import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../utils/colors';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

// Expo Go dùng auth proxy: https://auth.expo.io/@luongsangit58/notedri-app
// Redirect URI này phải được thêm vào Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REDIRECT_URI = (makeRedirectUri as any)({ useProxy: true });

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loginWithGoogle, isLoading, error, clearError } = useAuthStore();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      // Khi dùng proxy: idToken trong authentication; khi dùng implicit: params.id_token
      const idToken = (response as any).authentication?.idToken ?? response.params?.id_token;
      if (idToken) {
        loginWithGoogle(idToken).catch(() => {});
      } else {
        Alert.alert('Lỗi', 'Không lấy được id_token từ Google. Kiểm tra redirect URI trong Google Console.');
      }
    }
  }, [response]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập email và mật khẩu');
      return;
    }
    try {
      await login(email, password);
    } catch {}
  };

  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Chưa cấu hình', 'Google Client ID chưa được cài đặt');
      return;
    }
    await promptAsync();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary }}>NoteDri</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Quản lý xe thông minh</Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: '#4A1010', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          value={email}
          onChangeText={(v) => { clearError(); setEmail(v); }}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 }}
        />
        <TextInput
          value={password}
          onChangeText={(v) => { clearError(); setPassword(v); }}
          placeholder="Mật khẩu"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 16 }}
        />

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading}
          style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 10, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.textSecondary, marginHorizontal: 12 }}>hoặc</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <TouchableOpacity
          onPress={handleGoogle}
          disabled={isLoading || !request}
          style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: (!request || isLoading) ? 0.5 : 1 }}
        >
          <Text style={{ fontSize: 20, marginRight: 8 }}>G</Text>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>Đăng nhập với Google</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
