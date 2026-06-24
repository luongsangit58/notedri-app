import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, TextInput as RNTextInput,
} from 'react-native';
import axios from 'axios';
import { API_URL } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import PasswordInput from '../../components/PasswordInput';

interface Props {
  navigation: any;
}

export default function RegisterScreen({ navigation }: Props) {
  const t = useT();
  const colors = useColors();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const confirmRef = useRef<RNTextInput>(null);

  const { login } = useAuthStore();

  const handleRegister = async () => {
    setError(null);

    if (!name.trim()) {
      setError(t('auth.name_required'));
      return;
    }
    if (!email.trim()) {
      setError(t('auth.email_required_field'));
      return;
    }
    if (!password) {
      setError(t('auth.password_required'));
      return;
    }
    if (password !== passwordConfirmation) {
      setError(t('auth.password_mismatch'));
      return;
    }

    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register`, {
        name: name.trim(),
        email: email.trim(),
        password,
        password_confirmation: passwordConfirmation,
      });
      // Auto-login after successful registration
      await login(email.trim(), password);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        // Laravel validation errors: { errors: { field: ['msg'] } }
        const firstField = Object.values(data.errors)[0] as string[];
        setError(firstField[0]);
      } else {
        setError(data?.message ?? 'Đăng ký thất bại. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary }}>NoteDri</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 16 }}>
            {t('auth.register_title')}
          </Text>
        </View>

        {/* Error banner */}
        {error ? (
          <View style={{
            backgroundColor: '#4A1010',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.error,
          }}>
            <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <TextInput
          value={name}
          onChangeText={(v) => { setError(null); setName(v); }}
          placeholder={t('auth.name')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          style={inputStyle}
        />

        {/* Email */}
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={(v) => { setError(null); setEmail(v); }}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={inputStyle}
        />

        {/* Password */}
        <PasswordInput
          inputRef={passwordRef}
          value={password}
          onChangeText={(v) => { setError(null); setPassword(v); }}
          placeholder={t('auth.password')}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          style={{ marginBottom: 12 }}
        />

        {/* Password confirmation */}
        <PasswordInput
          inputRef={confirmRef}
          value={passwordConfirmation}
          onChangeText={(v) => { setError(null); setPasswordConfirmation(v); }}
          placeholder={t('auth.password_confirm')}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
          style={{ marginBottom: 20 }}
        />

        {/* Submit button */}
        <TouchableOpacity
          onPress={handleRegister}
          disabled={isLoading}
          style={{
            backgroundColor: colors.primary,
            padding: 16,
            borderRadius: 10,
            alignItems: 'center',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>
            {isLoading ? t('auth.registering') : t('auth.register')}
          </Text>
        </TouchableOpacity>

        {/* Link to login */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 24, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {t('auth.already_account')}{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('auth.login')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
