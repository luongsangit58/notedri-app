import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, SafeAreaView,
} from 'react-native';
import axios from 'axios';
import { API_URL } from '../../utils/api';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

interface Props {
  navigation: any;
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const t = useT();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!email.trim()) {
      setError(t('auth.email_required'));
      return;
    }

    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/forgot-password`, { email: email.trim() });
      setSuccess(true);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        const firstField = Object.values(data.errors)[0] as string[];
        setError(firstField[0]);
      } else {
        setError(data?.message ?? t('auth.forgot_password_send_fail'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              marginBottom: 32,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18 }}>{'‹'}</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 12 }}>
            {t('auth.forgot_password_title')}
          </Text>

          {/* Description */}
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 }}>
            {t('auth.forgot_password_desc')}
          </Text>

          {/* Success message */}
          {success ? (
            <View style={{
              backgroundColor: '#0A3320',
              borderRadius: 10,
              padding: 16,
              borderWidth: 1,
              borderColor: '#4CAF50',
              marginBottom: 24,
            }}>
              <Text style={{ color: '#4CAF50', fontSize: 15, lineHeight: 22 }}>
                {t('auth.forgot_password_success')}
              </Text>
            </View>
          ) : null}

          {/* Email input */}
          <TextInput
            value={email}
            onChangeText={(v) => { setError(null); setEmail(v); }}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            editable={!success}
            style={{
              backgroundColor: colors.surface,
              color: colors.text,
              borderRadius: 10,
              padding: 14,
              fontSize: 16,
              borderWidth: 1,
              borderColor: error ? colors.error : colors.border,
              marginBottom: error ? 8 : 20,
              opacity: success ? 0.5 : 1,
            }}
          />

          {/* Inline error */}
          {error ? (
            <Text style={{ color: colors.error, fontSize: 13, marginBottom: 20, marginLeft: 2 }}>
              {error}
            </Text>
          ) : null}

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading || success}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 10,
              alignItems: 'center',
              opacity: isLoading || success ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>
              {isLoading ? t('auth.sending') : success ? t('auth.sent') : t('auth.forgot_password_send')}
            </Text>
          </TouchableOpacity>

          {/* Back to login */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginTop: 24, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              {t('common.back')}{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('auth.login')}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
