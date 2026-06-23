import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateRefuel } from '../../hooks/useRefuels';
import OcrCamera from '../../components/OcrCamera';
import { colors } from '../../utils/colors';
import { refuelsApi } from '../../api/refuels';

const FUEL_TYPES = ['E5 RON 95-V', 'RON 95-III', 'E5 RON 92', 'Dầu DO 0,05S-V', 'Dầu DO 0,001S'];

function FieldLabel({ children }: any) {
  return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{children}</Text>;
}

const input = {
  backgroundColor: colors.surface,
  color: colors.text,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 16,
};

export default function AddRefuelScreen() {
  const navigation = useNavigation();
  const { data: vehiclesData } = useVehicles();
  const createRefuel = useCreateRefuel();

  const vehicles: any[] = Array.isArray(vehiclesData?.data) ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(defaultVehicle?.id ?? null);
  const [fuelType, setFuelType] = useState(FUEL_TYPES[0]);
  const [tongTien, setTongTien] = useState('');
  const [soLit, setSoLit] = useState('');
  const [giaLit, setGiaLit] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [cayXang, setCayXang] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!vehicleId && defaultVehicle) setVehicleId(defaultVehicle.id);
  }, [vehicles]);

  useEffect(() => {
    let cancelled = false;
    setMarketPrice(null);
    refuelsApi.fuelPrice(fuelType).then((res: any) => {
      if (cancelled) return;
      const d = res?.data?.data ?? res?.data ?? {};
      const price = d.price ?? d.gia ?? null;
      if (price != null) {
        setMarketPrice(Number(price));
        setGiaLit(prev => (prev === '' ? String(Math.round(Number(price))) : prev));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fuelType]);

  const handleOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) setTongTien(num);
    setOcrOpen(false);
  };

  const handleTongTienChange = (v: string) => {
    setTongTien(v);
    const t = parseFloat(v), s = parseFloat(soLit);
    if (t > 0 && s > 0) setGiaLit(Math.round(t / s).toString());
  };

  const handleSoLitChange = (v: string) => {
    setSoLit(v);
    const t = parseFloat(tongTien), s = parseFloat(v);
    if (t > 0 && s > 0) setGiaLit(Math.round(t / s).toString());
  };

  const handleGiaLitChange = (v: string) => {
    setGiaLit(v);
    const g = parseFloat(v), s = parseFloat(soLit);
    if (g > 0 && s > 0) setTongTien(Math.round(g * s).toString());
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert('Lỗi', 'Vui lòng chọn xe'); return; }
    if (!tongTien && !soLit) { Alert.alert('Lỗi', 'Nhập ít nhất tổng tiền hoặc số lít'); return; }
    try {
      await createRefuel.mutateAsync({
        vehicle_id: vehicleId,
        fuel_type: fuelType,
        tong_tien: tongTien ? parseFloat(tongTien) : null,
        so_lit: soLit ? parseFloat(soLit) : null,
        gia_lit: giaLit ? parseFloat(giaLit) : null,
        odometer: odometer ? parseInt(odometer) : null,
        ngay,
        cay_xang: cayXang || null,
        ghi_chu: ghiChu || null,
        is_full_tank: isFullTank,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>

          {/* Vehicle chips */}
          {vehicles.length > 1 && (
            <>
              <FieldLabel>Chọn xe</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVehicleId(v.id)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8,
                      backgroundColor: vehicleId === v.id ? colors.primary : colors.surface,
                    }}>
                    <Text style={{ color: vehicleId === v.id ? '#fff' : colors.text, fontWeight: '600' }}>
                      {v.ten}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Loại xăng */}
          <FieldLabel>Loại nhiên liệu</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {FUEL_TYPES.map((ft) => (
              <TouchableOpacity
                key={ft}
                onPress={() => setFuelType(ft)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8,
                  backgroundColor: fuelType === ft ? colors.primary : colors.surface,
                }}>
                <Text style={{ color: fuelType === ft ? '#fff' : colors.text, fontSize: 13 }}>{ft}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* OCR */}
          <TouchableOpacity
            onPress={() => setOcrOpen(true)}
            style={{
              backgroundColor: colors.surface, padding: 12, borderRadius: 10,
              alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}>
            <Text style={{ fontSize: 18 }}>📷</Text>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>OCR từ hóa đơn xăng</Text>
          </TouchableOpacity>

          {/* 3 ô tính tiền */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Tổng tiền (đ) *</FieldLabel>
              <TextInput
                value={tongTien}
                onChangeText={handleTongTienChange}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={[input, { fontSize: 18, fontWeight: '700' }]}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Số lít</FieldLabel>
              <TextInput value={soLit} onChangeText={handleSoLitChange} placeholder="0.0" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={input} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Giá/lít</FieldLabel>
              <TextInput value={giaLit} onChangeText={handleGiaLitChange} placeholder="0" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={input} />
              {marketPrice != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                  Giá thị trường: {Number(marketPrice).toLocaleString('vi-VN')}đ/lít
                </Text>
              )}
            </View>
          </View>

          <FieldLabel>ODO (km)</FieldLabel>
          <TextInput value={odometer} onChangeText={setOdometer} placeholder="Số km hiện tại" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={[input, { marginBottom: 4 }]} />

          <FieldLabel>Ngày</FieldLabel>
          <TextInput value={ngay} onChangeText={setNgay} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} style={[input, { marginBottom: 4 }]} />

          <FieldLabel>Cây xăng</FieldLabel>
          <TextInput value={cayXang} onChangeText={setCayXang} placeholder="Petrolimex, Shell..." placeholderTextColor={colors.textSecondary} style={[input, { marginBottom: 4 }]} />

          <FieldLabel>Ghi chú</FieldLabel>
          <TextInput value={ghiChu} onChangeText={setGhiChu} placeholder="Ghi chú thêm..." placeholderTextColor={colors.textSecondary} multiline style={[input, { minHeight: 72, textAlignVertical: 'top', marginBottom: 4 }]} />

          {/* Full tank toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Đổ đầy bình</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Tính L/100km chính xác hơn</Text>
            </View>
            <Switch
              value={isFullTank}
              onValueChange={setIsFullTank}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createRefuel.isPending}
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: createRefuel.isPending ? 0.7 : 1 }}>
            {createRefuel.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>⛽ Lưu lần đổ xăng</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera visible={ocrOpen} onClose={() => setOcrOpen(false)} onResult={handleOcrResult} hint="Đọc số tiền từ hóa đơn xăng" />
    </SafeAreaView>
  );
}
