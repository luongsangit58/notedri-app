import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateRefuel } from '../../hooks/useRefuels';
import { useFuelTypes } from '../../hooks/useFuelTypes';
import OcrCamera, { ReceiptData } from '../../components/OcrCamera';
import DatePickerField from '../../components/DatePickerField';
import MoneyInput from '../../components/MoneyInput';
import VoiceButton from '../../components/VoiceButton';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { formatVND, formatKm } from '../../utils/format';
import { useT } from '../../i18n';
import { refuelsApi } from '../../api/refuels';

// Chuẩn hoá số lít: bàn phím VN cho "12,5" -> parseFloat("12,5")=12 (mất 0.5L).
// Đổi dấu phẩy thành chấm trước khi parse.
const parseLiters = (s: string): number => parseFloat(String(s).replace(',', '.'));

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
  const route = useRoute<any>();
  const { data: vehiclesData } = useVehicles();
  const createRefuel = useCreateRefuel();
  const { data: fuelTypesRaw, isLoading: fuelTypesLoading } = useFuelTypes();

  const allVehicles: any[] = Array.isArray(vehiclesData?.data) ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];
  // Xe điện không đổ xăng -> loại khỏi danh sách chọn. Nếu chỉ có xe điện thì vẫn giữ đủ để không kẹt form.
  const isEvV = (v: any) => v?.is_ev ?? /điện|electric|\bev\b/i.test(String(v?.fuel_type ?? ''));
  const fuelVehicles = allVehicles.filter((v: any) => !isEvV(v));
  const vehicles: any[] = fuelVehicles.length > 0 ? fuelVehicles : allVehicles;

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
  const [showDetails, setShowDetails] = useState(false);
  const [odoPrefilled, setOdoPrefilled] = useState(false);
  const [ocrTarget, setOcrTarget] = useState<'receipt' | 'odo' | null>(null);
  const [priceInfo, setPriceInfo] = useState<{
    gia: number | null; uoc_luong: boolean; ngung_ban: boolean; hieu_luc?: string;
  } | null>(null);
  const [stationsDropdown, setStationsDropdown] = useState<any[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // Tracks the last price we auto-filled so we don't override user's manual edits
  const autoFilledPriceRef = useRef<string>('');

  // Nhận trạm xăng được chọn từ màn "Trạm xăng gần đây"
  useEffect(() => {
    const picked = route.params?.pickedStation;
    if (picked) {
      setCayXang(picked);
      navigation.setParams({ pickedStation: undefined } as any);
    }
  }, [route.params?.pickedStation]);
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

  // Set default fuel type when fuel types load; instant price fill from gia_hien_tai
  useEffect(() => {
    if (fuelTypes.length > 0 && fuelTypeId === null) {
      const first = fuelTypes[0];
      setFuelTypeId(first.id);
      if (giaLit === '' && first.gia_hien_tai != null) {
        const p = String(Math.round(Number(first.gia_hien_tai)));
        autoFilledPriceRef.current = p;
        setGiaLit(p);
      }
    }
  }, [fuelTypes]);

  // Instant fill when fuel type changes (gia_hien_tai from cached data)
  useEffect(() => {
    if (fuelTypeId === null) return;
    const selected = fuelTypes.find((ft: any) => ft.id === fuelTypeId);
    if (selected?.gia_hien_tai != null) {
      const p = String(Math.round(Number(selected.gia_hien_tai)));
      setGiaLit(prev => {
        if (prev === '' || prev === autoFilledPriceRef.current) {
          autoFilledPriceRef.current = p;
          return p;
        }
        return prev;
      });
    }
    setPriceInfo(null);
  }, [fuelTypeId]);

  // Carry-forward price from server (more accurate, especially for past dates)
  useEffect(() => {
    if (fuelTypeId === null) return;
    let cancelled = false;
    refuelsApi.fuelPrice(fuelTypeId, ngay).then(res => {
      if (cancelled) return;
      const p = res.data;
      setPriceInfo(p);
      if (p.gia != null) {
        const fetched = String(p.gia);
        setGiaLit(prev => {
          if (prev === '' || prev === autoFilledPriceRef.current) {
            autoFilledPriceRef.current = fetched;
            return fetched;
          }
          return prev;
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fuelTypeId, ngay]);

  const selectedFuelType = fuelTypes.find((ft: any) => ft.id === fuelTypeId) ?? null;
  const marketPrice = selectedFuelType?.gia_hien_tai ?? null;
  const currentVehicle = vehicles.find((v: any) => v.id === vehicleId);
  const odoWarning = odometer && currentVehicle?.odo_hien_tai
    && parseInt(odometer) < currentVehicle.odo_hien_tai
    ? t('add_refuel.odo_lower_warning', { last: formatKm(currentVehicle.odo_hien_tai) })
    : null;
  const priceHint = priceInfo?.ngung_ban
    ? { icon: 'ban', color: colors.warning, text: t('add_refuel.fuel_discontinued') }
    : priceInfo?.uoc_luong && priceInfo.gia != null
    ? {
        icon: 'info-circle',
        color: colors.textSecondary,
        text: priceInfo.hieu_luc
          ? t('add_refuel.reference_price_date', { date: priceInfo.hieu_luc })
          : t('add_refuel.reference_price'),
      }
    : !priceInfo && marketPrice != null
    ? {
        icon: 'chart-line',
        color: colors.textSecondary,
        text: t('add_refuel.market_price', { price: formatVND(marketPrice) }),
      }
    : null;

  useEffect(() => {
    if (odometer === '' && currentVehicle?.odo_hien_tai != null) {
      setOdometer(String(currentVehicle.odo_hien_tai));
      setOdoPrefilled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVehicle?.id, currentVehicle?.odo_hien_tai]);

  const handleSmartVoice = (value: string, raw: string) => {
    if (voiceFeedbackTimer.current) clearTimeout(voiceFeedbackTimer.current);

    // Không nhận ra số → thông báo lỗi rõ ràng
    if (!value) {
      setVoiceFeedback(t('add_refuel.voice_not_recognized'));
      voiceFeedbackTimer.current = setTimeout(() => setVoiceFeedback(null), 3000);
      return;
    }

    const num = parseFloat(value);
    const rawLower = raw.toLowerCase();

    let field: 'tongTien' | 'soLit';
    // Từ khoá lít phải ưu tiên đầu tiên (không dùng \bl\b vì quá rộng)
    if (rawLower.match(/\blít\b|\blit\b/)) {
      field = 'soLit';
    }
    // Từ khoá tiền: bổ sung "tiền", "tổng", "trả", "chi phí"
    else if (rawLower.match(/đồng|tiền|tổng|trả|chi phí|nghìn|ngàn|triệu|tỷ/)) {
      field = 'tongTien';
    }
    // Fallback magnitude: số thực (thường là lít) hoặc 1-200 → soLit
    else if (value.includes('.') || (num >= 1 && num <= 200)) {
      field = 'soLit';
    } else {
      field = 'tongTien';
    }

    if (field === 'tongTien') {
      handleTongTienChange(value);
      const disp = isNaN(parseInt(value)) ? value : parseInt(value).toLocaleString('vi-VN') + 'đ';
      setVoiceFeedback(t('add_refuel.voice_total_amount', { value: disp }));
    } else {
      handleSoLitChange(value);
      const liters = parseLiters(value);
      setVoiceFeedback(t('add_refuel.voice_liters', { value: isNaN(liters) ? value : liters }));
    }
    voiceFeedbackTimer.current = setTimeout(() => setVoiceFeedback(null), 2500);
  };

  const handleReceiptResult = ({ tongTien: t, soLit: s }: ReceiptData) => {
    if (t) setTongTien(t);
    if (s) setSoLit(s);
    const tNum = parseFloat(t), sNum = parseLiters(s);
    if (tNum > 0 && sNum > 0) setGiaLit(Math.round(tNum / sNum).toString());
  };

  const handleOdoOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) {
      setOdometer(num);
      setOdoPrefilled(false);
    }
  };

  // Rà soát 16/7 (user báo "tự tính tiền chưa được" - nói tổng tiền qua giọng
  // nói lẽ ra phải tự tính ra số lít dựa vào giá/lít đã biết sẵn, hoặc ngược
  // lại): trước đây MỖI handler chỉ tính lại giaLit (trừ handleGiaLitChange tính
  // lại tongTien) - không nhánh nào tự tính SỐ LÍT cả, dù giaLit hầu như luôn có
  // sẵn từ trước (auto-fill giá thị trường ngay khi chọn loại xăng/ngày, xem 2
  // useEffect phía trên). Kết quả: user chỉ nói 1 giá trị (rất phổ biến - voice
  // chỉ set được 1 trong 2 field tongTien/soLit mỗi lần) thì trường còn lại luôn
  // trống trơn dù giá/lít đã đủ để suy ra. Giờ: field vừa đổi + giaLit đã biết +
  // field CÒN LẠI đang trống -> tự tính field còn lại đó TRƯỚC, chỉ tính lại
  // giaLit như cũ khi cả 2 field kia đã có giá trị sẵn (user đang tự nhập đủ).
  const handleTongTienChange = (v: string) => {
    setTongTien(v);
    const t = parseFloat(v), g = parseFloat(giaLit);
    if (!soLit && t > 0 && g > 0) { setSoLit((t / g).toFixed(2)); return; }
    const s = parseLiters(soLit);
    if (t > 0 && s > 0) setGiaLit(Math.round(t / s).toString());
  };

  const handleSoLitChange = (v: string) => {
    setSoLit(v);
    const s = parseLiters(v), g = parseFloat(giaLit);
    if (!tongTien && s > 0 && g > 0) { setTongTien(Math.round(s * g).toString()); return; }
    const t = parseFloat(tongTien);
    if (t > 0 && s > 0) setGiaLit(Math.round(t / s).toString());
  };

  const handleGiaLitChange = (v: string) => {
    autoFilledPriceRef.current = ''; // user manually edited - stop auto-updating
    setGiaLit(v);
    const g = parseFloat(v);
    if (!soLit && tongTien && g > 0) {
      const t = parseFloat(tongTien);
      if (t > 0) { setSoLit((t / g).toFixed(2)); return; }
    }
    const s = parseLiters(soLit);
    if (g > 0 && s > 0) setTongTien(Math.round(g * s).toString());
  };

  const handleFindNearbyInline = async () => {
    try {
      setNearbyLoading(true);
      setStationsDropdown([]);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('nearby_stations.permission_title'), t('add_refuel.location_permission_desc'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await refuelsApi.nearbyStations(loc.coords.latitude, loc.coords.longitude);
      const stations: any[] = res.data?.stations ?? [];
      if (stations.length === 0) {
        Alert.alert(t('add_refuel.not_found_title'), t('add_refuel.no_stations_nearby'));
      } else {
        setStationsDropdown(stations.slice(0, 6));
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        Alert.alert(t('add_refuel.premium_feature_title'), err?.response?.data?.message ?? t('add_refuel.nearby_premium_required'));
      } else {
        Alert.alert(t('common.error'), t('add_refuel.location_failed'));
      }
    } finally {
      setNearbyLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert(t('common.error'), t('common.select_vehicle_required')); return; }
    if (!tongTien && !soLit) { Alert.alert(t('common.error'), t('refuels.error_amount_or_liters')); return; }
    try {
      await createRefuel.mutateAsync({
        vehicle_id: vehicleId,
        fuel_type_id: fuelTypeId,
        fuel_type: selectedFuelType?.ten ?? null,
        tong_tien: tongTien ? parseFloat(tongTien) : null,
        so_lit: soLit && parseLiters(soLit) > 0 ? parseLiters(soLit) : null,
        gia_lit: giaLit ? parseFloat(giaLit) : null,
        odometer: odometer ? parseInt(odometer) : null,
        ngay,
        cay_xang: cayXang || null,
        ghi_chu: ghiChu || null,
        is_full_tank: isFullTank,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? t('common.save_failed');
      const errs = err.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert(t('common.error'), detail ?? msg);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[{ padding: 16 }, contentWide]}>

          {/* Vehicle chips */}
          {vehicles.length > 1 && (
            <>
              <FieldLabel>{t('common.select_vehicle')}</FieldLabel>
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
          <FieldLabel>{t('vehicles.fuel_type_label')}</FieldLabel>
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

          {/* Quick action row: receipt OCR only; nearby stations live inside details. */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setOcrTarget('receipt')}
              style={{
                flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}>
              <FontAwesome5 name="camera" size={15} color={colors.primary} solid />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>{t('add_refuel.scan_receipt')}</Text>
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
                <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '600' }}>{t('add_refuel.filled_prefix', { value: voiceFeedback })}</Text>
              </View>
            )}
          </View>

          {/* 3 ô tính tiền */}
          <FieldLabel>{t('refuels.total_amount_label')}</FieldLabel>
          <MoneyInput
            value={tongTien}
            onChangeText={handleTongTienChange}
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={[input, { fontSize: 18, fontWeight: '700', marginBottom: 4 }]}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>{t('refuels.liters_label')}</FieldLabel>
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
              <FieldLabel>{t('refuels.price_per_liter_label')}</FieldLabel>
              <MoneyInput value={giaLit} onChangeText={handleGiaLitChange} placeholder="0" placeholderTextColor={colors.textSecondary} style={input} />
              {priceHint && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <FontAwesome5 name={priceHint.icon as any} size={10} color={priceHint.color} solid />
                  <Text style={{ color: priceHint.color, fontSize: 11 }}>{priceHint.text}</Text>
                </View>
              )}
            </View>
          </View>

          <FieldLabel>{t('refuels.odo_label')}</FieldLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <TextInput
              value={odometer}
              onChangeText={(v) => { setOdometer(v); setOdoPrefilled(false); }}
              placeholder={t('refuels.odo_placeholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              style={[input, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => setOcrTarget('odo')}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                paddingHorizontal: 10, height: 40, borderRadius: 10,
                backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
              }}>
              <FontAwesome5 name="tachometer-alt" size={12} color={colors.primary} solid />
              <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>ODO</Text>
            </TouchableOpacity>
          </View>
          {odoPrefilled && (
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginBottom: 4 }}>
              {t('odometer.prefilled_hint')}
            </Text>
          )}
          {odoWarning && (
            <Text style={{ color: colors.warning, fontSize: 12, marginBottom: 4 }}>{odoWarning}</Text>
          )}

          <DatePickerField label={t('refuels.date_label')} value={ngay} onChange={setNgay} />

          <TouchableOpacity
            onPress={() => setShowDetails((v) => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: colors.surface, borderRadius: 10, padding: 13, marginTop: 4, marginBottom: showDetails ? 10 : 20,
              borderWidth: 1, borderColor: colors.border,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FontAwesome5 name="sliders-h" size={13} color={colors.textSecondary} solid />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{showDetails ? t('add_refuel.hide_details') : t('add_refuel.more_details')}</Text>
            </View>
            <FontAwesome5 name={showDetails ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} solid />
          </TouchableOpacity>

          {showDetails && (
            <View style={{ marginBottom: 20 }}>
              <FieldLabel>{t('refuels.station_label')}</FieldLabel>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                <TextInput
                  value={cayXang}
                  onChangeText={v => { setCayXang(v); if (!v) setStationsDropdown([]); }}
                  placeholder={t('refuels.station_placeholder')}
                  placeholderTextColor={colors.textSecondary}
                  style={[input, { flex: 1 }]}
                />
                <TouchableOpacity
                  onPress={handleFindNearbyInline}
                  disabled={nearbyLoading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border,
                  }}>
                  {nearbyLoading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <FontAwesome5 name="location-arrow" size={12} color={colors.primary} solid />}
                  <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>{t('add_refuel.nearby_short')}</Text>
                </TouchableOpacity>
              </View>
              {stationsDropdown.length > 0 && (
                <View style={{
                  backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8,
                  borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
                }}>
                  {stationsDropdown.map((s, i) => {
                    const dist = s.dist != null
                      ? (s.dist >= 1000 ? `${(s.dist / 1000).toFixed(1)}km` : `${s.dist}m`)
                      : null;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => { setCayXang(s.name ?? ''); setStationsDropdown([]); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderBottomWidth: i < stationsDropdown.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <FontAwesome5 name="gas-pump" size={11} color={colors.textSecondary} solid />
                          <Text style={{ color: colors.text, fontWeight: '600', flex: 1, fontSize: 13 }} numberOfLines={1}>
                            {s.name}
                          </Text>
                          {dist && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dist}</Text>}
                        </View>
                        {s.addr ? (
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, marginLeft: 17 }} numberOfLines={1}>
                            {s.addr}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

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
              <TextInput value={ghiChu} onChangeText={setGhiChu} placeholder={t('refuels.note_placeholder')} placeholderTextColor={colors.textSecondary} multiline style={[input, { minHeight: 72, textAlignVertical: 'top' }]} />
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createRefuel.isPending}
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: createRefuel.isPending ? 0.7 : 1 }}>
            {createRefuel.isPending
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="gas-pump" size={16} color="#fff" solid />
                  <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('refuels.save_button')}</Text>
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
        hint={ocrTarget === 'odo' ? t('ocr.hint_odo_dashboard') : t('ocr.title_receipt')}
      />
    </SafeAreaView>
  );
}
