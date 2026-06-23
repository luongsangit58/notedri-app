import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateOdometer } from '../../hooks/useOdometer';
import OcrCamera from '../../components/OcrCamera';
import { colors } from '../../utils/colors';

const input = {
  backgroundColor: colors.surface,
  color: colors.text,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 16,
};

export default function AddOdometerScreen() {
  const navigation = useNavigation();
  const { data: vehiclesData } = useVehicles();
  const createOdometer = useCreateOdometer();

  const vehicles: any[] = Array.isArray(vehiclesData?.data) ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(defaultVehicle?.id ?? null);
  const [odo, setOdo] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [ocrOpen, setOcrOpen] = useState(false);

  useEffect(() => {
    if (!vehicleId && defaultVehicle) setVehicleId(defaultVehicle.id);
  }, [vehicles]);

  const handleOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) setOdo(num);
    setOcrOpen(false);
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert('Lỗi', 'Vui lòng chọn xe'); return; }
    if (!odo) { Alert.alert('Lỗi', 'Vui lòng nhập số ODO'); return; }
    try {
      await createOdometer.mutateAsync({ vehicleId, data: { odometer: parseInt(odo), ngay } });
      navigation.goBack();
    } catch (err: any) {
      const errs = err.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert('Lỗi', detail ?? err.response?.data?.message ?? 'Không lưu được');
    }
  };

  const currentVehicle = vehicles.find((v: any) => v.id === vehicleId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>

          {/* Vehicle chips */}
          {vehicles.length > 1 && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Chọn xe</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVehicleId(v.id)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8,
                      backgroundColor: vehicleId === v.id ? colors.primary : colors.surface,
                    }}>
                    <Text style={{ color: vehicleId === v.id ? '#fff' : colors.text, fontWeight: '600' }}>{v.ten}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Current ODO hint */}
          {currentVehicle?.odo_hien_tai != null && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>ODO hiện tại</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>
                {Number(currentVehicle.odo_hien_tai).toLocaleString('vi-VN')} km
              </Text>
            </View>
          )}

          {/* OCR */}
          <TouchableOpacity
            onPress={() => setOcrOpen(true)}
            style={{
              backgroundColor: colors.surface, padding: 12, borderRadius: 10,
              alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}>
            <FontAwesome5 name="camera" size={18} color={colors.primary} solid />
            <Text style={{ color: colors.primary, fontWeight: '600' }}>OCR từ đồng hồ xe</Text>
          </TouchableOpacity>

          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Số ODO (km) *</Text>
          <TextInput
            value={odo}
            onChangeText={setOdo}
            placeholder="98443"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={[input, { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 16, letterSpacing: 2 }]}
          />

          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Ngày</Text>
          <TextInput
            value={ngay}
            onChangeText={setNgay}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={[input, { marginBottom: 24 }]}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createOdometer.isPending}
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: createOdometer.isPending ? 0.7 : 1 }}>
            {createOdometer.isPending
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="tachometer-alt" size={16} color="#fff" solid />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Lưu ODO</Text>
                </View>
              )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera visible={ocrOpen} onClose={() => setOcrOpen(false)} onResult={handleOcrResult} hint="Đọc số ODO từ đồng hồ xe" />
    </SafeAreaView>
  );
}
