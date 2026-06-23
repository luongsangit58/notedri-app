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
import { colors } from '../../utils/colors';

type FieldErrors = Record<string, string[]>;

function extractErrors(error: any): FieldErrors {
  return error?.response?.data?.errors ?? {};
}

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const messages = errors[field];
  if (!messages || messages.length === 0) return null;
  return (
    <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8, marginTop: 2 }}>
      {messages[0]}
    </Text>
  );
}

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

export default function EditProfileScreen() {
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
      Alert.alert('Thành công', 'Thông tin cá nhân đã được cập nhật.');
    } catch (error: any) {
      const errors = extractErrors(error);
      if (Object.keys(errors).length > 0) {
        setInfoErrors(errors);
      } else {
        const message = error?.response?.data?.message ?? 'Đã có lỗi xảy ra.';
        Alert.alert('Lỗi', message);
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
      Alert.alert('Thành công', 'Mật khẩu đã được thay đổi.');
    } catch (error: any) {
      const errors = extractErrors(error);
      if (Object.keys(errors).length > 0) {
        setPasswordErrors(errors);
      } else {
        const message = error?.response?.data?.message ?? 'Đã có lỗi xảy ra.';
        Alert.alert('Lỗi', message);
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
      {/* Section 1: Thông tin cá nhân */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Thông tin cá nhân</Text>

        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder="Họ và tên"
          placeholderTextColor={colors.textSecondary}
        />
        <FieldError errors={infoErrors} field="name" />

        <TextInput
          style={inputStyle}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Lưu thông tin</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section 2: Đổi mật khẩu */}
      <View style={cardStyle}>
        <Text style={sectionTitleStyle}>Đổi mật khẩu</Text>

        <TextInput
          style={inputStyle}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Mật khẩu hiện tại"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
        />
        <FieldError errors={passwordErrors} field="current_password" />

        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder="Mật khẩu mới (min. 8 ký tự)"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
        />
        <FieldError errors={passwordErrors} field="password" />

        <TextInput
          style={inputStyle}
          value={passwordConfirmation}
          onChangeText={setPasswordConfirmation}
          placeholder="Xác nhận mật khẩu mới"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
        />
        <FieldError errors={passwordErrors} field="password_confirmation" />

        <TouchableOpacity
          style={saveButtonStyle}
          onPress={handleSavePassword}
          disabled={passwordLoading}
        >
          {passwordLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Đổi mật khẩu</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
