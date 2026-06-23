import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateRefuel } from '../../hooks/useRefuels';
import OcrCamera from '../../components/OcrCamera';
import { colors } from '../../utils/colors';

const FUEL_TYPES = ['E5 RON 95', 'RON 95-III', 'E5 RON 92', 'RON 92', 'Dầu diesel'];

export default function AddRefuelScreen() {
  const navigation = useNavigation();
  const { data: vehiclesData } = useVehicles();
  const createRefuel = useCreateRefuel();

  const vehicles = vehiclesData?.data ?? vehiclesData ?? [];
  const [vehicleId, setVehicleId] = useState<number | null>(vehicles[0]?.id ?? null);
  const [fuelType, setFuelType] = useState(FUEL_TYPES[0]);
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [notes, setNotes] = useState('');
  const [station, setStation] = useState('');
  const [ocrOpen, setOcrOpen] = useState(false);

  const handleOcrResult = (text: string) => {
    // Try to parse amount from OCR text
    const num = text.replace(/[^0-9]/g, '');
    if (num) setAmount(num);
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert('Lỗi', 'Vui lòng chọn xe'); return; }
    if (!amount) { Alert.alert('Lỗi', 'Vui lòng nhập số tiền'); return; }
    try {
      await createRefuel.mutateAsync({
        vehicle_id: vehicleId,
        fuel_type: fuelType,
        amount: parseFloat(amount),
        liters: liters ? parseFloat(liters) : undefined,
        date,
        notes,
        station,
      });
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

          {/* Vehicle selector */}
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

          {/* Fuel type */}
          <Text style={{ color: colors.textSecondary, marginBottom: 6 }}>Loại xăng</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {FUEL_TYPES.map((ft) => (
              <TouchableOpacity
                key={ft}
                onPress={() => setFuelType(ft)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8,
                  backgroundColor: fuelType === ft ? colors.primary : colors.surface,
                }}>
                <Text style={{ color: fuelType === ft ? '#fff' : colors.text }}>{ft}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={() => setOcrOpen(true)}
            style={{ backgroundColor: colors.card, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>📷 OCR từ hóa đơn</Text>
          </TouchableOpacity>

          <TextInput value={amount} onChangeText={setAmount} placeholder="Số tiền (đ)" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={inputStyle} />
          <TextInput value={liters} onChangeText={setLiters} placeholder="Số lít (tuỳ chọn)" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={inputStyle} />
          <TextInput value={date} onChangeText={setDate} placeholder="Ngày (YYYY-MM-DD)" placeholderTextColor={colors.textSecondary} style={inputStyle} />
          <TextInput value={station} onChangeText={setStation} placeholder="Trạm xăng (tuỳ chọn)" placeholderTextColor={colors.textSecondary} style={inputStyle} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Ghi chú (tuỳ chọn)" placeholderTextColor={colors.textSecondary} multiline style={{ ...inputStyle, minHeight: 80, textAlignVertical: 'top' }} />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createRefuel.isPending}
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 10, alignItems: 'center', opacity: createRefuel.isPending ? 0.7 : 1 }}>
            {createRefuel.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Lưu</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera
        visible={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onResult={handleOcrResult}
        hint="Đọc số tiền từ hóa đơn xăng"
      />
    </SafeAreaView>
  );
}
