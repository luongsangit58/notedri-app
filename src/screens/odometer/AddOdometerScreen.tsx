import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateOdometer } from '../../hooks/useOdometer';
import OcrCamera from '../../components/OcrCamera';
import { colors } from '../../utils/colors';

export default function AddOdometerScreen() {
  const navigation = useNavigation();
  const { data: vehiclesData } = useVehicles();
  const createOdometer = useCreateOdometer();

  const vehicles = vehiclesData?.data ?? vehiclesData ?? [];
  const [vehicleId, setVehicleId] = useState<number | null>(vehicles[0]?.id ?? null);
  const [odo, setOdo] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [ocrOpen, setOcrOpen] = useState(false);

  const handleOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) setOdo(num);
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert('Lỗi', 'Vui lòng chọn xe'); return; }
    if (!odo) { Alert.alert('Lỗi', 'Vui lòng nhập số ODO'); return; }
    try {
      await createOdometer.mutateAsync({ vehicleId, data: { odometer: parseInt(odo), date } });
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không lưu được');
    }
  };

  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>

          <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>Chọn xe</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {vehicles.map((v: any) => (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVehicleId(v.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: vehicleId === v.id ? colors.primary : colors.surface,
                }}>
                <Text style={{ color: vehicleId === v.id ? '#fff' : colors.text }}>{v.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setOcrOpen(true)}
            style={{ backgroundColor: colors.card, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📷 OCR từ đồng hồ xe</Text>
          </TouchableOpacity>

          <TextInput
            value={odo}
            onChangeText={setOdo}
            placeholder="Số ODO (km)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={{ ...inputStyle, fontSize: 24, fontWeight: '600' }}
          />
          <TextInput value={date} onChangeText={setDate} placeholder="Ngày (YYYY-MM-DD)" placeholderTextColor={colors.textSecondary} style={inputStyle} />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createOdometer.isPending}
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 10, alignItems: 'center', opacity: createOdometer.isPending ? 0.7 : 1 }}>
            {createOdometer.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Lưu</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera
        visible={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onResult={handleOcrResult}
        hint="Đọc số ODO từ đồng hồ xe"
      />
    </SafeAreaView>
  );
}
