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
import OcrCamera, { ReceiptData } from '../../components/OcrCamera';
import DatePickerField from '../../components/DatePickerField';
import VoiceButton from '../../components/VoiceButton';
import { useColors } from '../../utils/theme';
import { formatVND, formatKm } from '../../utils/format';
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
  const [ocrTarget, setOcrTarget] = useState<'receipt' | 'odo' | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const voiceFeedbackTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set default vehicle when vehicles load
  useEffect(() => {
    if (!vehicleId && defaultVehicle) setVehicleId(defaultVehicle.id);
  }, [vehicles]);

  // Clear voiceFeedback timer on unmount
  useEffect(() => {
    return () => { if (voiceFeedbackTimer.current) clearTimeout(voiceFeedbackTimer.current); };
  }, []);

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
  const currentVehicle = vehicles.find((v: any) => v.id === vehicleId);
  const odoWarning = odometer && currentVehicle?.odo_hien_tai
    && parseInt(odometer) < currentVehicle.odo_hien_tai
    ? `ODO thấp hơn lần trước (${formatKm(currentVehicle.odo_hien_tai)}), kiểm tra lại`
    : null;

  const handleSmartVoice = (value: string, raw: string) => {
    const num = parseFloat(value.replace(',', '.'));
    const rawLower = raw.toLowerCase();
    let field: 'tongTien' | 'soLit';
    // Keyword-based detection first
    if (rawLower.match(/lít|lit|\bl\b/)) field = 'soLit';
    else if (rawLower.match(/đồng|nghìn|triệu|ngàn/)) field = 'tongTien';
    // Magnitude fallback: decimals or 1-200 range → liters, else → amount
    else if (value.includes('.') || (num >= 1 && num <= 200)) field = 'soLit';
    else field = 'tongTien';

    if (field === 'tongTien') {
      handleTongTienChange(value);
      setVoiceFeedback(`Tổng tiền: ${parseInt(value).toLocaleString('vi-VN')}đ`);
    } else {
      handleSoLitChange(value);
      setVoiceFeedback(`Số lít: ${value} L`);
    }
    if (voiceFeedbackTimer.current) clearTimeout(voiceFeedbackTimer.current);
    voiceFeedbackTimer.current = setTimeout(() => setVoiceFeedback(null), 2500);
  };

  const handleReceiptResult = ({ tongTien: t, soLit: s }: ReceiptData) => {
    if (t) setTongTien(t);
    if (s) setSoLit(s);
    const tNum = parseFloat(t), sNum = parseFloat(s);
    if (tNum > 0 && sNum > 0) setGiaLit(Math.round(tNum / sNum).toString());
  };

  const handleOdoOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) setOdometer(num);
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

          {/* Quick action row: camera + voice + nearby */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setOcrTarget('receipt')}
              style={{
                flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}>
              <FontAwesome5 name="camera" size={15} color={colors.primary} solid />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Chụp hoá đơn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('NearbyStations')}
              style={{
                flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}>
              <FontAwesome5 name="location-arrow" size={14} color={colors.primary} solid />
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cây xăng gần đây</Text>
            </TouchableOpacity>
          </View>

          {/* Single voice input button */}
          <View style={{ marginBottom: 16 }}>
            <VoiceButton
              label={t('refuels.voice_label')}
              hint={t('refuels.voice_hint')}
              onResult={handleSmartVoice}
            />
            {voiceFeedback && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 }}>
                <FontAwesome5 name="check-circle" size={12} color="#16A34A" solid />
                <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '600' }}>Đã điền: {voiceFeedback}</Text>
              </View>
            )}
          </View>

          {/* 3 ô tính tiền */}
          <FieldLabel>Tổng tiền (đ) *</FieldLabel>
          <TextInput
            value={tongTien}
            onChangeText={handleTongTienChange}
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={[input, { fontSize: 18, fontWeight: '700', marginBottom: 4 }]}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Số lít</FieldLabel>
              <TextInput
                value={soLit}
                onChangeText={handleSoLitChange}
                placeholder="0.0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                style={input}
              />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <TextInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder="Số km hiện tại"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              style={[input, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => setOcrTarget('odo')}
              style={{
                width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.surface,
              }}>
              <FontAwesome5 name="camera" size={14} color={colors.primary} solid />
            </TouchableOpacity>
          </View>
          {odoWarning && (
            <Text style={{ color: colors.warning, fontSize: 12, marginBottom: 4 }}>{odoWarning}</Text>
          )}

          <DatePickerField label={t('refuels.date_label')} value={ngay} onChange={setNgay} />

          <FieldLabel>Cây xăng</FieldLabel>
          <TextInput value={cayXang} onChangeText={setCayXang} placeholder="Petrolimex, Shell..." placeholderTextColor={colors.textSecondary} style={[input, { marginBottom: 4 }]} />

          {/* Full tank toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 8 }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{t('refuels.full_tank_label')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('refuels.full_tank_hint')}</Text>
            </View>
            <Switch
              value={isFullTank}
              onValueChange={setIsFullTank}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>

          <FieldLabel>{t('refuels.note_label')}</FieldLabel>
          <TextInput value={ghiChu} onChangeText={setGhiChu} placeholder={t('refuels.note_placeholder')} placeholderTextColor={colors.textSecondary} multiline style={[input, { minHeight: 72, textAlignVertical: 'top', marginBottom: 20 }]} />

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

      <OcrCamera
        visible={ocrTarget !== null}
        onClose={() => setOcrTarget(null)}
        mode={ocrTarget === 'odo' ? 'odo' : 'receipt'}
        onResult={handleOdoOcrResult}
        onReceiptResult={handleReceiptResult}
        hint={ocrTarget === 'odo' ? 'Chụp đồng hồ xe để lấy số ODO' : 'Chụp hoá đơn xăng'}
      />
    </SafeAreaView>
  );
}
