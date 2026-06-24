import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { profileApi } from '../../api/profile';
import { useColors } from '../../utils/theme';

type FieldErrors = Record<string, string[]>;

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const colors = useColors();
  const msgs = errors[field];
  if (!msgs?.length) return null;
  return <Text style={{ color: colors.error, fontSize: 12, marginTop: 2, marginBottom: 6 }}>{msgs[0]}</Text>;
}

function PasswordInput({
  label, value, onChange, errors, field,
}: {
  label: string; value: string; onChange: (v: string) => void;
  errors: FieldErrors; field: string;
}) {
  const colors = useColors();
  const [show, setShow] = useState(false);
  const hasError = !!(errors[field]?.length);
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 10, borderWidth: 1,
        borderColor: hasError ? colors.error : colors.border,
        paddingHorizontal: 14,
      }}>
        <TextInput
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 12 }}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.textSecondary}
          placeholder="••••••••"
        />
        <TouchableOpacity onPress={() => setShow(s => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name={show ? 'eye-slash' : 'eye'} size={16} color={colors.textSecondary} solid />
        </TouchableOpacity>
      </View>
      <FieldError errors={errors} field={field} />
    </View>
  );
}

export default function ChangePasswordScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { mutate, isPending } = useMutation({
    mutationFn: () => profileApi.updatePassword({
      current_password: current,
      password: next,
      password_confirmation: confirm,
    }),
    onSuccess: () => {
      Alert.alert('Thành công', 'Mật khẩu đã được cập nhật.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err: any) => {
      const errors = err?.response?.data?.errors ?? {};
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
      } else {
        Alert.alert('Lỗi', err?.response?.data?.message ?? 'Không thể đổi mật khẩu.');
      }
    },
  });

  const handleSave = () => {
    setFieldErrors({});
    if (!current || !next || !confirm) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ cả 3 trường.');
      return;
    }
    if (next !== confirm) {
      setFieldErrors({ password_confirmation: ['Mật khẩu xác nhận không khớp.'] });
      return;
    }
    mutate();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 18 }}>
          Nhập mật khẩu hiện tại và mật khẩu mới. Mật khẩu mới phải có ít nhất 8 ký tự.
        </Text>

        <PasswordInput
          label="Mật khẩu hiện tại"
          value={current}
          onChange={setCurrent}
          errors={fieldErrors}
          field="current_password"
        />
        <PasswordInput
          label="Mật khẩu mới"
          value={next}
          onChange={setNext}
          errors={fieldErrors}
          field="password"
        />
        <PasswordInput
          label="Xác nhận mật khẩu mới"
          value={confirm}
          onChange={setConfirm}
          errors={fieldErrors}
          field="password_confirmation"
        />

        <TouchableOpacity
          onPress={handleSave}
          disabled={isPending}
          style={{
            backgroundColor: colors.primary, borderRadius: 12,
            paddingVertical: 14, alignItems: 'center', marginTop: 8,
          }}>
          {isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Lưu mật khẩu</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
