import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import PasswordInput from '../../components/PasswordInput';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

// Expo Go dùng auth proxy: https://auth.expo.io/@luongsangit58/notedri-app
// Redirect URI này phải được thêm vào Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REDIRECT_URI = (makeRedirectUri as any)({ useProxy: true });

export default function LoginScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const colors = useColors();
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
        Alert.alert(t('common.error'), t('auth.google_no_id_token'));
      }
    }
  }, [response]);

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
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(t('auth.google_not_configured'), t('auth.google_client_id_missing'));
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
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{t('auth.app_tagline')}</Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: '#4A1010', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          value={email}
          onChangeText={(v) => { clearError(); setEmail(v); }}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 }}
        />
        <PasswordInput
          value={password}
          onChangeText={(v) => { clearError(); setPassword(v); }}
          placeholder={t('auth.password')}
          style={{ marginBottom: 20 }}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading}
          style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 10, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
        >
          <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>
            {isLoading ? t('auth.logging_in') : t('auth.login')}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ color: colors.textSecondary, marginHorizontal: 12 }}>{t('auth.or')}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <TouchableOpacity
          onPress={handleGoogle}
          disabled={isLoading || !request}
          style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: (!request || isLoading) ? 0.5 : 1 }}
        >
          <Text style={{ fontSize: 20, marginRight: 8 }}>G</Text>
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{t('auth.login_with_google')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={{ marginTop: 20, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {t('auth.forgot_password')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('auth.reset')}</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Register')}
          style={{ marginTop: 12, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {t('auth.no_account')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('auth.register')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
