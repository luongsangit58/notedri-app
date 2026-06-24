import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, TextInput as RNTextInput,
} from 'react-native';
import axios from 'axios';
import { API_URL } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import PasswordInput from '../../components/PasswordInput';

type Step = 'form' | 'otp';

interface Props {
  navigation: any;
}

export default function RegisterScreen({ navigation }: Props) {
  const t = useT();
  const colors = useColors();

  const [step, setStep] = useState<Step>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const confirmRef = useRef<RNTextInput>(null);
  const otpRef = useRef<RNTextInput>(null);

  const { login } = useAuthStore();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSubmitForm = async () => {
    setError(null);
    if (!name.trim()) { setError(t('auth.name_required')); return; }
    if (!email.trim()) { setError(t('auth.email_required_field')); return; }
    if (!password) { setError(t('auth.password_required')); return; }
    if (password !== passwordConfirmation) { setError(t('auth.password_mismatch')); return; }

    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register`, {
        name: name.trim(),
        email: email.trim(),
        password,
        password_confirmation: passwordConfirmation,
      });
      setStep('otp');
      setCountdown(60);
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        const firstField = Object.values(data.errors)[0] as string[];
        setError(firstField[0]);
      } else {
        setError(data?.message ?? t('auth.register_failed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (otp.length !== 6) { setError(t('auth.otp_6_digits')); return; }

    try {
      setIsLoading(true);
      const res = await axios.post(`${API_URL}/auth/register/verify-otp`, {
        email: email.trim(),
        code: otp,
      });
      const { token, data: userData } = res.data;
      if (token && userData) {
        await useAuthStore.getState().setSession(token, userData);
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      const data = err.response?.data;
      setError(data?.message ?? t('auth.otp_verify_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError(null);
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register/resend-otp`, {
        email: email.trim(),
      });
      setCountdown(60);
      setOtp('');
    } catch (err: any) {
      const data = err.response?.data;
      setError(data?.message ?? t('auth.otp_resend_failed'));
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
        {/* Brand */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontWeight: '800', fontSize: 42, lineHeight: 50, letterSpacing: -1 }}>
            <Text style={{ color: colors.text }}>Note</Text>
            <Text style={{ color: colors.primary }}>Dri</Text>
          </Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 14 }}>
            {step === 'form' ? t('auth.register_title') : t('auth.verify_email_title')}
          </Text>
        </View>

        {/* Error banner */}
        {error ? (
          <View style={{
            backgroundColor: colors.error + '22',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.error + '55',
          }}>
            <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {step === 'form' ? (
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
              {t('auth.create_account')}
            </Text>

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
            <PasswordInput
              inputRef={passwordRef}
              value={password}
              onChangeText={(v) => { setError(null); setPassword(v); }}
              placeholder={t('auth.password')}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              style={{ marginBottom: 12 }}
            />
            <PasswordInput
              inputRef={confirmRef}
              value={passwordConfirmation}
              onChangeText={(v) => { setError(null); setPasswordConfirmation(v); }}
              placeholder={t('auth.password_confirm')}
              returnKeyType="done"
              onSubmitEditing={handleSubmitForm}
              style={{ marginBottom: 20 }}
            />

            <TouchableOpacity
              onPress={handleSubmitForm}
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
                {isLoading ? t('auth.sending_otp') : t('auth.register_send_otp')}
              </Text>
            </TouchableOpacity>

            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
              {t('auth.otp_will_be_sent')}
            </Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
              {t('auth.enter_otp_title')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              {t('auth.otp_sent_to')}{' '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{email}</Text>
            </Text>

            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={(v) => { setError(null); setOtp(v.replace(/[^0-9]/g, '')); }}
              placeholder="- - - - - -"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerifyOtp}
              style={{
                ...inputStyle,
                textAlign: 'center',
                fontSize: 28,
                letterSpacing: 8,
                fontWeight: '700',
              }}
            />

            <TouchableOpacity
              onPress={handleVerifyOtp}
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
                {isLoading ? t('auth.verifying') : t('auth.verify_otp')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendOtp}
              disabled={countdown > 0 || isLoading}
              style={{ marginTop: 16, alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{
                color: countdown > 0 ? colors.textSecondary : colors.primary,
                fontSize: 14,
              }}>
                {countdown > 0
                  ? `${t('auth.resend_otp_in')} ${countdown}s`
                  : t('auth.resend_otp')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setStep('form'); setOtp(''); setError(null); }}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {t('auth.back_to_form')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'form' && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginTop: 20, alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              {t('auth.already_account')}{' '}
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.login')}</Text>
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
