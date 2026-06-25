import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../utils/api';
import { useT } from '../../i18n';
import { AuthContainer, C, INPUT_STYLE } from './_authLayout';

export default function ForgotPasswordScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim()) { setError(t('auth.email_required')); return; }
    try {
      setIsLoading(true);
      await axios.post(`${API_URL}/auth/forgot-password`, { email: email.trim() });
      setSuccess(true);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        setError((Object.values(data.errors)[0] as string[])[0]);
      } else {
        setError(data?.message ?? t('auth.forgot_password_send_fail'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContainer center={false}>
      {/* Back button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: C.card,
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 32,
        }}>
        <FontAwesome5 name="arrow-left" size={15} color={C.text} />
      </TouchableOpacity>

      {/* Title */}
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 10 }}>
        {t('auth.forgot_password_title')}
      </Text>
      <Text style={{ color: C.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 }}>
        {t('auth.forgot_password_desc')}
      </Text>

      {/* Success */}
      {success ? (
        <View style={{ backgroundColor: C.successBg, borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: C.successBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <FontAwesome5 name="check-circle" size={16} color={C.successText} solid />
            <Text style={{ color: C.successText, fontWeight: '600', fontSize: 15 }}>{t('auth.sent')}</Text>
          </View>
          <Text style={{ color: C.successText, fontSize: 14, lineHeight: 20 }}>
            {t('auth.forgot_password_success')}
          </Text>
        </View>
      ) : null}

      {/* Input */}
      <TextInput
        value={email}
        onChangeText={(v) => { setError(null); setEmail(v); }}
        placeholder={t('auth.email')}
        placeholderTextColor={C.inputBorder}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!success}
        style={[INPUT_STYLE, { marginBottom: error ? 8 : 20, opacity: success ? 0.5 : 1, borderColor: error ? '#b91c1c' : C.inputBorder }]}
      />

      {error ? (
        <Text style={{ color: C.errorText, fontSize: 13, marginBottom: 20, marginLeft: 2 }}>{error}</Text>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={isLoading || success}
        style={{ backgroundColor: C.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center', opacity: isLoading || success ? 0.6 : 1 }}>
        <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
          {isLoading ? t('auth.sending') : success ? t('auth.sent') : t('auth.forgot_password_send')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 24, alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: C.textSecondary, fontSize: 14 }}>
          {t('common.back')}{' '}
          <Text style={{ color: C.primary, fontWeight: '600' }}>{t('auth.login')}</Text>
        </Text>
      </TouchableOpacity>
    </AuthContainer>
  );
}
