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
import AppBgPattern from '../../components/AppBgPattern';

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

  // Thông tin cá nhân (email không cho sửa)
  const [name, setName] = useState(user?.name ?? '');
  const [email] = useState(user?.email ?? '');
  const [phone, setPhone] = useState((user as any)?.phone ?? '');
  const [tinh, setTinh] = useState((user as any)?.tinh ?? '');
  const [phuong_xa, setPhuongXa] = useState((user as any)?.phuong_xa ?? '');
  const [dia_chi, setDiaChi] = useState((user as any)?.dia_chi ?? '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoErrors, setInfoErrors] = useState<FieldErrors>({});

  const handleSaveInfo = async () => {
    setInfoErrors({});
    setInfoLoading(true);
    try {
      const response = await profileApi.update({
        name,
        phone: phone || undefined,
        tinh: tinh || undefined,
        phuong_xa: phuong_xa || undefined,
        dia_chi: dia_chi || undefined,
      }); // email KHÔNG cho sửa (khớp web)
      const updatedUser = response.data.data;
      // ProfileController trả raw model (thiếu is_premium/vehicle_limit/can_add_vehicle).
      // Merge vào user hiện tại để không mất các field gói/quyền.
      setUser({ ...(user ?? {}), ...updatedUser });
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppBgPattern />
      <ScrollView
        style={{ flex: 1 }}
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

        {/* Email không cho sửa (khớp web) */}
        <TextInput
          style={[inputStyle, { opacity: 0.55 }]}
          value={email}
          editable={false}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
        />

        {/* SĐT + địa chỉ (khớp web) */}
        <TextInput
          style={inputStyle}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('edit_profile.phone_placeholder')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
        />
        <TextInput
          style={inputStyle}
          value={tinh}
          onChangeText={setTinh}
          placeholder={t('edit_profile.province_placeholder')}
          placeholderTextColor={colors.textSecondary}
        />
        <TextInput
          style={inputStyle}
          value={phuong_xa}
          onChangeText={setPhuongXa}
          placeholder={t('edit_profile.ward_placeholder')}
          placeholderTextColor={colors.textSecondary}
        />
        <TextInput
          style={inputStyle}
          value={dia_chi}
          onChangeText={setDiaChi}
          placeholder={t('edit_profile.address_placeholder')}
          placeholderTextColor={colors.textSecondary}
        />

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
      </ScrollView>
    </View>
  );
}
