import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateService } from '../../hooks/useServices';
import { colors } from '../../utils/colors';

const LOAI_OPTIONS = [
  { value: 'bao_duong', label: 'Bảo dưỡng' },
  { value: 'sua_chua', label: 'Sửa chữa' },
  { value: 'lop', label: 'Lốp' },
  { value: 'bao_hiem', label: 'Bảo hiểm' },
  { value: 'dang_kiem', label: 'Đăng kiểm' },
  { value: 'phat_nguoi', label: 'Phạt nguội' },
  { value: 'phi_gui_xe', label: 'Phí gửi xe' },
  { value: 'phi_cau_duong', label: 'Phí cầu đường' },
  { value: 'rua_xe', label: 'Rửa xe' },
  { value: 'khac', label: 'Khác' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.label}>{children}</Text>
  );
}

export default function AddServiceScreen() {
  const navigation = useNavigation<any>();
  const { data: vehiclesData } = useVehicles();
  const createService = useCreateService();

  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData)
    ? vehiclesData
    : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(defaultVehicle?.id ?? null);
  const [loai, setLoai] = useState('bao_duong');
  const [hangMuc, setHangMuc] = useState('');
  const [chiPhi, setChiPhi] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [noiLam, setNoiLam] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  useEffect(() => {
    if (!vehicleId && defaultVehicle) {
      setVehicleId(defaultVehicle.id);
    }
  }, [vehicles]);

  const handleSubmit = async () => {
    if (!vehicleId) {
      Alert.alert('Lỗi', 'Vui lòng chọn xe');
      return;
    }
    if (!hangMuc.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên hạng mục');
      return;
    }
    try {
      await createService.mutateAsync({
        vehicle_id: vehicleId,
        hang_muc: hangMuc.trim(),
        loai,
        chi_phi: chiPhi ? parseFloat(chiPhi) : null,
        odometer: odometer ? parseInt(odometer, 10) : null,
        ngay,
        noi_lam: noiLam.trim() || null,
        ghi_chu: ghiChu.trim() || null,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Không lưu được';
      const errs = err.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert('Lỗi', detail ?? msg);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Vehicle selector */}
          {vehicles.length > 0 && (
            <>
              <FieldLabel>Chọn xe</FieldLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRow}
              >
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVehicleId(v.id)}
                    style={[
                      styles.chip,
                      vehicleId === v.id && styles.chipActive,
                    ]}
                  >
                    <Text style={[
                      styles.chipText,
                      vehicleId === v.id && styles.chipTextActive,
                    ]}>
                      {v.ten}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Loai selector */}
          <FieldLabel>Loại</FieldLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {LOAI_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setLoai(opt.value)}
                style={[
                  styles.chip,
                  loai === opt.value && styles.chipActive,
                ]}
              >
                <Text style={[
                  styles.chipText,
                  loai === opt.value && styles.chipTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Hang muc */}
          <FieldLabel>Hạng mục *</FieldLabel>
          <TextInput
            value={hangMuc}
            onChangeText={setHangMuc}
            placeholder="Tên hạng mục, VD: Thay dầu động cơ"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Chi phi */}
          <FieldLabel>Chi phí (đ)</FieldLabel>
          <TextInput
            value={chiPhi}
            onChangeText={setChiPhi}
            placeholder="Chi phí (đ)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={styles.input}
          />

          {/* Odometer */}
          <FieldLabel>ODO (km)</FieldLabel>
          <TextInput
            value={odometer}
            onChangeText={setOdometer}
            placeholder="ODO (km)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={styles.input}
          />

          {/* Ngay */}
          <FieldLabel>Ngày</FieldLabel>
          <TextInput
            value={ngay}
            onChangeText={setNgay}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Noi lam */}
          <FieldLabel>Nơi làm</FieldLabel>
          <TextInput
            value={noiLam}
            onChangeText={setNoiLam}
            placeholder="Gara, địa điểm..."
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Ghi chu */}
          <FieldLabel>Ghi chú</FieldLabel>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder="Ghi chú thêm..."
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createService.isPending}
            style={[styles.submitBtn, createService.isPending && styles.submitBtnDisabled]}
          >
            {createService.isPending
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="wrench" size={16} color="#fff" solid />
                  <Text style={styles.submitText}>Lưu bảo dưỡng</Text>
                </View>
              )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 6,
    marginTop: 4,
  },
  chipRow: {
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
