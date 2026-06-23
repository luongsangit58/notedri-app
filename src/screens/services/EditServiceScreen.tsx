import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useUpdateService, useDeleteService } from '../../hooks/useServices';
import { servicesApi } from '../../api/services';
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
  return <Text style={styles.label}>{children}</Text>;
}

export default function EditServiceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { serviceId } = route.params as { serviceId: number };

  const { data: vehiclesData } = useVehicles();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData)
    ? vehiclesData
    : [];

  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState<any>(null);

  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [loai, setLoai] = useState('bao_duong');
  const [hangMuc, setHangMuc] = useState('');
  const [chiPhi, setChiPhi] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [noiLam, setNoiLam] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  useEffect(() => {
    servicesApi.get(serviceId)
      .then((r: any) => {
        const d = r.data?.data ?? r.data;
        setOriginal(d);
        setVehicleId(d.vehicle_id ?? null);
        setLoai(d.loai ?? 'bao_duong');
        setHangMuc(d.hang_muc ?? '');
        setChiPhi(d.chi_phi != null ? String(d.chi_phi) : '');
        setOdometer(d.odometer != null ? String(d.odometer) : '');
        setNgay(d.ngay ?? dayjs().format('YYYY-MM-DD'));
        setNoiLam(d.noi_lam ?? '');
        setGhiChu(d.ghi_chu ?? '');
        setLoading(false);
      })
      .catch(() => navigation.goBack());
  }, [serviceId]);

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
      await updateService.mutateAsync({
        id: serviceId,
        data: {
          vehicle_id: vehicleId,
          hang_muc: hangMuc.trim(),
          loai,
          chi_phi: chiPhi ? parseFloat(chiPhi) : null,
          odometer: odometer ? parseInt(odometer, 10) : null,
          ngay,
          noi_lam: noiLam.trim() || null,
          ghi_chu: ghiChu.trim() || null,
        },
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Không lưu được';
      const errs = err.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert('Lỗi', detail ?? msg);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Xoá bảo dưỡng',
      'Bạn có chắc muốn xoá bản ghi này không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteService.mutateAsync(serviceId);
              navigation.goBack();
            } catch {
              Alert.alert('Lỗi', 'Không xoá được');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const isBusy = updateService.isPending || deleteService.isPending;

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
                    style={[styles.chip, vehicleId === v.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, vehicleId === v.id && styles.chipTextActive]}>
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
                style={[styles.chip, loai === opt.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, loai === opt.value && styles.chipTextActive]}>
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

          {/* Update button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isBusy}
            style={[styles.submitBtn, isBusy && styles.btnDisabled]}
          >
            {updateService.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>Cập nhật</Text>}
          </TouchableOpacity>

          {/* Delete button */}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={isBusy}
            style={[styles.deleteBtn, isBusy && styles.btnDisabled]}
          >
            {deleteService.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.deleteText}>Xoá bản ghi này</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  label: {
    color: '#9E9E9E',
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
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  chipActive: {
    backgroundColor: '#E85D04',
    borderColor: '#E85D04',
  },
  chipText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#E85D04',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  deleteText: {
    color: '#F44336',
    fontWeight: '700',
    fontSize: 15,
  },
});
