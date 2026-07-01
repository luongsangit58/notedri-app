import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, TextInput as RNTextInput, Linking } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import axios from 'axios';
import { authApi } from '../../api/auth';
import { API_URL } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { AuthContainer, C, INPUT_STYLE } from './_authLayout';

type Step = 'form' | 'otp';

export default function RegisterScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(t('auth.email_invalid')); return; }
    if (!password) { setError(t('auth.password_required')); return; }
    if (password.length < 8) { setError(t('auth.password_min_length')); return; }
    if (password !== passwordConfirmation) { setError(t('auth.password_mismatch')); return; }
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register`, {
        name: name.trim(), email: email.trim(),
        password, password_confirmation: passwordConfirmation,
      });
      setStep('otp');
      setCountdown(60);
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        setError((Object.values(data.errors)[0] as string[])[0]);
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
      const res = await authApi.verifyOtp(email.trim(), otp);
      const { token, data: userData } = res.data;
      if (token && userData) {
        await useAuthStore.getState().setSession(token, userData);
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? t('auth.otp_verify_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError(null);
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/register/resend-otp`, { email: email.trim() });
      setCountdown(60);
      setOtp('');
    } catch (err: any) {
      setError(err.response?.data?.message ?? t('auth.otp_resend_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const pwFieldStyle = [INPUT_STYLE, { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 0 }];

  return (
    <AuthContainer>
      {/* Logo */}
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <Text style={{ fontWeight: '800', fontSize: 44, lineHeight: 52, letterSpacing: -1 }}>
          <Text style={{ color: '#ffffff' }}>Note</Text>
          <Text style={{ color: C.primary }}>Dri</Text>
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 14, fontWeight: '600', marginTop: 4 }}>
          {step === 'form' ? t('auth.register_title') : t('auth.verify_email_title')}
        </Text>
      </View>

      {error ? (
        <View style={{ backgroundColor: C.errorBg, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.errorBorder }}>
          <Text style={{ color: C.errorText, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {step === 'form' ? (
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24 }}>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 18 }}>
            {t('auth.create_account')}
          </Text>

          {/* Họ tên */}
          <TextInput
            value={name}
            onChangeText={(v) => { setError(null); setName(v); }}
            placeholder={t('auth.name')}
            placeholderTextColor={C.inputBorder}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            style={[INPUT_STYLE, { marginBottom: 12 }]}
          />

          {/* Email */}
          <TextInput
            ref={emailRef}
            value={email}
            onChangeText={(v) => { setError(null); setEmail(v); }}
            placeholder={t('auth.email')}
            placeholderTextColor={C.inputBorder}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={[INPUT_STYLE, { marginBottom: 12 }]}
          />

          {/* Mật khẩu */}
          <View style={[pwFieldStyle, { marginBottom: 12 }]}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => { setError(null); setPassword(v); }}
              placeholder={t('auth.password')}
              placeholderTextColor={C.inputBorder}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 14 }}
            />
            <TouchableOpacity onPress={() => setShowPw(s => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome5 name={showPw ? 'eye-slash' : 'eye'} size={16} color={C.textSecondary} solid />
            </TouchableOpacity>
          </View>

          {/* Xác nhận mật khẩu */}
          <View style={[pwFieldStyle, { marginBottom: 22 }]}>
            <TextInput
              ref={confirmRef}
              value={passwordConfirmation}
              onChangeText={(v) => { setError(null); setPasswordConfirmation(v); }}
              placeholder={t('auth.password_confirm')}
              placeholderTextColor={C.inputBorder}
              secureTextEntry={!showPwConfirm}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSubmitForm}
              style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 14 }}
            />
            <TouchableOpacity onPress={() => setShowPwConfirm(s => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome5 name={showPwConfirm ? 'eye-slash' : 'eye'} size={16} color={C.textSecondary} solid />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleSubmitForm}
            disabled={isLoading}
            style={{ backgroundColor: C.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}>
            <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
              {isLoading ? t('auth.sending_otp') : t('auth.register_send_otp')}
            </Text>
          </TouchableOpacity>

          <Text style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
            {t('auth.otp_will_be_sent')}
          </Text>

          {/* Đồng ý điều khoản (chuẩn App Store/Play) */}
          <Text style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
            {t('auth.agree_prefix')}{' '}
            <Text style={{ color: C.primary }} onPress={() => Linking.openURL('https://notedri.com/terms')}>
              {t('auth.terms_link')}
            </Text>
            {' '}{t('auth.and_word')}{' '}
            <Text style={{ color: C.primary }} onPress={() => Linking.openURL('https://notedri.com/privacy')}>
              {t('auth.privacy_link')}
            </Text>
          </Text>
        </View>
      ) : (
        /* Bước OTP */
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <FontAwesome5 name="envelope-open-text" size={22} color={C.primary} solid />
            </View>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>
              {t('auth.enter_otp_title')}
            </Text>
            <Text style={{ color: C.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              {t('auth.otp_sent_to')}{' '}
              <Text style={{ color: C.text, fontWeight: '600' }}>{email}</Text>
            </Text>
          </View>

          <TextInput
            ref={otpRef}
            value={otp}
            onChangeText={(v) => { setError(null); setOtp(v.replace(/[^0-9]/g, '')); }}
            placeholder="- - - - - -"
            placeholderTextColor={C.inputBorder}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleVerifyOtp}
            style={[INPUT_STYLE, { textAlign: 'center', fontSize: 28, letterSpacing: 8, fontWeight: '700', marginBottom: 20 }]}
          />

          <TouchableOpacity
            onPress={handleVerifyOtp}
            disabled={isLoading}
            style={{ backgroundColor: C.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', opacity: isLoading ? 0.7 : 1, marginBottom: 14 }}>
            <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
              {isLoading ? t('auth.verifying') : t('auth.verify_otp')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResendOtp}
            disabled={countdown > 0 || isLoading}
            style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: countdown > 0 ? C.textSecondary : C.primary, fontSize: 14 }}>
              {countdown > 0 ? `${t('auth.resend_otp_in')} ${countdown}s` : t('auth.resend_otp')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep('form'); setOtp(''); setError(null); }} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ color: C.textSecondary, fontSize: 13 }}>{t('auth.back_to_form')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'form' && (
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 22, alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ color: C.textSecondary, fontSize: 14 }}>
            {t('auth.already_account')}{' '}
            <Text style={{ color: C.primary, fontWeight: '700' }}>{t('auth.login')}</Text>
          </Text>
        </TouchableOpacity>
      )}
    </AuthContainer>
  );
}
