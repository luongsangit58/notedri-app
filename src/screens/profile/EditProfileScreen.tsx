import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { profileApi } from '../../api/profile';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import PasswordInput from '../../components/PasswordInput';

type FieldErrors = Record<string, string[]>;

function extractErrors(error: any): FieldErrors {
  return error?.response?.data?.errors ?? {};
}

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const colors = useColors();
  const messages = errors[field];
  if (!messages || messages.length === 0) return null;
  return (
    <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8, marginTop: 2 }}>
      {messages[0]}
    </Text>
  );
}

export default function EditProfileScreen() {
  const colors = useColors();
  const t = useT();

  const inputStyle = {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
    fontSize: 15,
  };

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  };

  const sectionTitleStyle = {
    color: colors.text,
    fontWeight: '700' as const,
    fontSize: 16,
    marginBottom: 12,
  };

  const saveButtonStyle = {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center' as const,
    marginTop: 8,
  };

  const { user, setUser } = useAuthStore();

  // Section 1: Personal info
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoErrors, setInfoErrors] = useState<FieldErrors>({});

  // Section 2: Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});

  const handleSaveInfo = async () => {
    setInfoErrors({});
    setInfoLoading(true);
    try {
      const response = await profileApi.update({ name, email });
      const updatedUser = response.data.data;
      setUser(updatedUser);
      Alert.alert(t('edit_profile.success'), t('edit_profile.info_updated'));
    } catch (error: any) {
      const errors = extractErrors(error);
      if (Object.keys(errors).length > 0) {
        setInfoErrors(errors);
      } else {
        const message = error?.response?.data?.message ?? t('edit_profile.error_generic');
        Alert.alert(t('common.error'), message);
      }
    } finally {
      setInfoLoading(false);
    }
  };

  const handleSavePassword = async () => {
    setPasswordErrors({});
    setPasswordLoading(true);
    try {
      await profileApi.updatePassword({
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      });
      setCurrentPassword('');
      setPassword('');
      setPasswordConfirmation('');
      Alert.alert(t('edit_profile.success'), t('edit_profile.password_changed'));
    } catch (error: any) {
      const errors = extractErrors(error);
      if (Object.keys(errors).length > 0) {
        setPasswordErrors(errors);
      } else {
        const message = error?.response?.data?.message ?? t('edit_profile.error_generic');
        Alert.alert(t('common.error'), message);
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Section 1: Personal info */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>{t('edit_profile.personal_info_title')}</Text>

        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder={t('auth.name')}
          placeholderTextColor={colors.textSecondary}
        />
        <FieldError errors={infoErrors} field="name" />

        <TextInput
          style={inputStyle}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FieldError errors={infoErrors} field="email" />

        <TouchableOpacity
          style={saveButtonStyle}
          onPress={handleSaveInfo}
          disabled={infoLoading}
        >
          {infoLoading ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 15 }}>{t('edit_profile.save_info_button')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section 2: Change password */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>{t('edit_profile.change_password_title')}</Text>

        <PasswordInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder={t('auth.password')}
          style={{ marginBottom: 4 }}
        />
        <FieldError errors={passwordErrors} field="current_password" />

        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.password')}
          style={{ marginBottom: 4 }}
        />
        <FieldError errors={passwordErrors} field="password" />

        <PasswordInput
          value={passwordConfirmation}
          onChangeText={setPasswordConfirmation}
          placeholder={t('auth.password_confirm')}
          style={{ marginBottom: 4 }}
        />
        <FieldError errors={passwordErrors} field="password_confirmation" />

        <TouchableOpacity
          style={saveButtonStyle}
          onPress={handleSavePassword}
          disabled={passwordLoading}
        >
          {passwordLoading ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 15 }}>{t('edit_profile.change_password_button')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
