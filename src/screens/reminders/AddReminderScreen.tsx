import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCreateReminder } from '../../hooks/useReminders';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';

type Loai = 'bao_duong' | 'dang_kiem' | 'bao_hiem' | 'giay_to' | 'khac';
type CheDo = 'chu_ky' | 'ngay_co_dinh' | 'mot_lan';

const LOAI_OPTIONS: { value: Loai; label: string }[] = [
  { value: 'bao_duong', label: 'Bảo dưỡng' },
  { value: 'dang_kiem', label: 'Đăng kiểm' },
  { value: 'bao_hiem', label: 'Bảo hiểm' },
  { value: 'giay_to', label: 'Giấy tờ' },
  { value: 'khac', label: 'Khác' },
];

const CHE_DO_OPTIONS: { value: CheDo; label: string }[] = [
  { value: 'chu_ky', label: 'Định kỳ' },
  { value: 'ngay_co_dinh', label: 'Ngày cố định' },
  { value: 'mot_lan', label: 'Một lần' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 }}>
      {children}
    </Text>
  );
}

export default function AddReminderScreen() {
  const colors = useColors();
  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  };
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { vehicleId: paramVehicleId } = (route.params ?? {}) as { vehicleId?: number };
  const { mutate, isPending } = useCreateReminder();

  // If no vehicleId param (e.g. from QuickAddFAB), pick the default vehicle
  const { data: vehiclesData } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];
  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];
  const vehicleId: number | null = paramVehicleId ?? defaultVehicle?.id ?? null;
  const [selectedVehicleId, setSelectedVehicleId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!paramVehicleId && vehicleId && selectedVehicleId === null) setSelectedVehicleId(vehicleId);
  }, [vehicleId]);
  const effectiveVehicleId = paramVehicleId ?? selectedVehicleId ?? vehicleId;

  const [hang_muc, setHangMuc] = useState('');
  const [loai, setLoai] = useState<Loai>('bao_duong');
  const [che_do, setCheĐo] = useState<CheDo>('chu_ky');
  const [interval_km, setIntervalKm] = useState('');
  const [interval_thang, setIntervalThang] = useState('');
  const [last_done_odo, setLastDoneOdo] = useState('');
  const [last_done_date, setLastDoneDate] = useState('');
  const [due_date, setDueDate] = useState('');
  const [ghi_chu, setGhiChu] = useState('');

  const handleSubmit = () => {
    if (!hang_muc.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập hạng mục');
      return;
    }

    if (!effectiveVehicleId) {
      Alert.alert('Lỗi', 'Không xác định được xe. Vui lòng vào màn hình xe và thêm lời nhắc từ đó.');
      return;
    }
    mutate(
      {
        vehicleId: effectiveVehicleId,
        data: {
          hang_muc: hang_muc.trim(),
          loai,
          che_do,
          interval_km: Number(interval_km) || undefined,
          interval_thang: Number(interval_thang) || undefined,
          last_done_odo: Number(last_done_odo) || undefined,
          last_done_date: last_done_date || undefined,
          due_date: due_date || undefined,
          ghi_chu: ghi_chu || undefined,
        },
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e: any) =>
          Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không thêm được'),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            Thêm lời nhắc
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 22, lineHeight: 26 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Vehicle picker — only when no vehicleId from params and multiple vehicles */}
          {!paramVehicleId && vehicles.length > 1 && (
            <View style={{ marginBottom: 16 }}>
              <FieldLabel>Xe *</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setSelectedVehicleId(v.id)}
                    style={{
                      marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                      backgroundColor: (selectedVehicleId ?? vehicleId) === v.id ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: (selectedVehicleId ?? vehicleId) === v.id ? colors.primary : colors.border,
                    }}>
                    <Text style={{ color: (selectedVehicleId ?? vehicleId) === v.id ? '#fff' : colors.text, fontSize: 14 }}>
                      {v.ten}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Hạng mục */}
          <FieldLabel>Hạng mục *</FieldLabel>
          <TextInput
            value={hang_muc}
            onChangeText={setHangMuc}
            placeholder="VD: Thay nhớt, Đăng kiểm..."
            placeholderTextColor={colors.textSecondary}
            style={inputStyle}
          />

          {/* Loại */}
          <FieldLabel>Loại *</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {LOAI_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setLoai(opt.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: loai === opt.value ? colors.primary : colors.surface,
                }}>
                <Text style={{
                  color: loai === opt.value ? '#fff' : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Chế độ */}
          <FieldLabel>Chế độ *</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {CHE_DO_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setCheĐo(opt.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: che_do === opt.value ? colors.primary : colors.surface,
                }}>
                <Text style={{
                  color: che_do === opt.value ? '#fff' : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Chu kỳ fields */}
          {che_do === 'chu_ky' && (
            <>
              <FieldLabel>Chu kỳ km</FieldLabel>
              <TextInput
                value={interval_km}
                onChangeText={setIntervalKm}
                placeholder="VD: 5000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>Chu kỳ tháng</FieldLabel>
              <TextInput
                value={interval_thang}
                onChangeText={setIntervalThang}
                placeholder="VD: 6"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>ODO lần làm gần nhất</FieldLabel>
              <TextInput
                value={last_done_odo}
                onChangeText={setLastDoneOdo}
                placeholder="VD: 45000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>Ngày làm gần nhất (YYYY-MM-DD)</FieldLabel>
              <TextInput
                value={last_done_date}
                onChangeText={setLastDoneDate}
                placeholder="2025-01-15"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </>
          )}

          {/* Ngày đến hạn */}
          {(che_do === 'ngay_co_dinh' || che_do === 'mot_lan') && (
            <>
              <FieldLabel>Ngày đến hạn (YYYY-MM-DD)</FieldLabel>
              <TextInput
                value={due_date}
                onChangeText={setDueDate}
                placeholder="2025-12-31"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </>
          )}

          {/* Ghi chú */}
          <FieldLabel>Ghi chú</FieldLabel>
          <TextInput
            value={ghi_chu}
            onChangeText={setGhiChu}
            placeholder="Ghi chú thêm..."
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isPending}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 24,
              opacity: isPending ? 0.7 : 1,
            }}>
            {isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Lưu lời nhắc</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
