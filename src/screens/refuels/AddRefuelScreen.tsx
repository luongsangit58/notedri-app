import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateRefuel } from '../../hooks/useRefuels';
import { useFuelTypes } from '../../hooks/useFuelTypes';
import OcrCamera from '../../components/OcrCamera';
import { useColors } from '../../utils/theme';
import { formatVND } from '../../utils/format';
import { useT } from '../../i18n';

function FieldLabel({ children }: any) {
  const colors = useColors();
  return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{children}</Text>;
}

export default function AddRefuelScreen() {
  const t = useT();
  const colors = useColors();
  const input = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  };
  const navigation = useNavigation();
  const { data: vehiclesData } = useVehicles();
  const createRefuel = useCreateRefuel();
  const { data: fuelTypesRaw, isLoading: fuelTypesLoading } = useFuelTypes();

  const vehicles: any[] = Array.isArray(vehiclesData?.data) ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];

  const fuelTypes: any[] = Array.isArray(fuelTypesRaw)
    ? fuelTypesRaw.filter((ft: any) => ft.kich_hoat)
    : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(defaultVehicle?.id ?? null);
  const [fuelTypeId, setFuelTypeId] = useState<number | null>(null);
  const [tongTien, setTongTien] = useState('');
  const [soLit, setSoLit] = useState('');
  const [giaLit, setGiaLit] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [cayXang, setCayXang] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [ocrOpen, setOcrOpen] = useState(false);

  // Set default vehicle when vehicles load
  useEffect(() => {
    if (!vehicleId && defaultVehicle) setVehicleId(defaultVehicle.id);
  }, [vehicles]);

  // Set default fuel type when fuel types load
  useEffect(() => {
    if (fuelTypes.length > 0 && fuelTypeId === null) {
      const first = fuelTypes[0];
      setFuelTypeId(first.id);
      if (giaLit === '' && first.gia_hien_tai != null) {
        setGiaLit(String(Math.round(Number(first.gia_hien_tai))));
      }
    }
  }, [fuelTypes]);

  // Auto-fill gia_lit from selected fuel type's gia_hien_tai
  useEffect(() => {
    if (fuelTypeId === null) return;
    const selected = fuelTypes.find((ft: any) => ft.id === fuelTypeId);
    if (selected?.gia_hien_tai != null) {
      setGiaLit(prev => (prev === '' ? String(Math.round(Number(selected.gia_hien_tai))) : prev));
    }
  }, [fuelTypeId]);

  const selectedFuelType = fuelTypes.find((ft: any) => ft.id === fuelTypeId) ?? null;
  const marketPrice = selectedFuelType?.gia_hien_tai ?? null;

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
        fuel_type_id: fuelTypeId,
        fuel_type: selectedFuelType?.ten ?? null,
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
          {fuelTypesLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginBottom: 14, alignSelf: 'flex-start' }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {fuelTypes.map((ft: any) => (
                <TouchableOpacity
                  key={ft.id}
                  onPress={() => setFuelTypeId(ft.id)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8,
                    backgroundColor: fuelTypeId === ft.id ? colors.primary : colors.surface,
                  }}>
                  <Text style={{ color: fuelTypeId === ft.id ? '#fff' : colors.text, fontSize: 13 }}>{ft.ten}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* OCR */}
          <TouchableOpacity
            onPress={() => setOcrOpen(true)}
            style={{
              backgroundColor: colors.surface, padding: 12, borderRadius: 10,
              alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}>
            <FontAwesome5 name="camera" size={18} color={colors.primary} solid />
            <Text style={{ color: colors.primary, fontWeight: '600' }}>OCR từ hóa đơn xăng</Text>
          </TouchableOpacity>

          {/* Nearby stations */}
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('NearbyStations')}
            style={{
              backgroundColor: colors.surface, padding: 12, borderRadius: 10,
              alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}>
            <FontAwesome5 name="location-arrow" size={16} color={colors.primary} solid />
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Tìm trạm xăng gần đây</Text>
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
                  Giá thị trường: {formatVND(marketPrice)}/lít
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
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="gas-pump" size={16} color="#fff" solid />
                  <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>Lưu lần đổ xăng</Text>
                </View>
              )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera visible={ocrOpen} onClose={() => setOcrOpen(false)} onResult={handleOcrResult} hint="Đọc số tiền từ hóa đơn xăng" />
    </SafeAreaView>
  );
}
