import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateOdometer } from '../../hooks/useOdometer';
import { isTrackingActive } from '../../services/gps/GpsTripTracker';
import OcrCamera from '../../components/OcrCamera';
import VoiceButton from '../../components/VoiceButton';
import DatePickerField from '../../components/DatePickerField';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { formatKm } from '../../utils/format';
import { useT } from '../../i18n';

export default function AddOdometerScreen() {
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
  // Xe đang chọn ở màn gọi tới (vd Home/Danh sách ODO) - ưu tiên xe này thay vì
  // luôn nhảy về xe mặc định (tester báo: cập nhật ODO xe khác vẫn bị đẩy về xe mặc định).
  const routeVehicleId: number | undefined = route.params?.vehicleId;
  const { data: vehiclesData } = useVehicles();
  const createOdometer = useCreateOdometer();

  const vehicles: any[] = Array.isArray(vehiclesData?.data) ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(routeVehicleId ?? defaultVehicle?.id ?? null);
  const [odo, setOdo] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [ghiChu, setGhiChu] = useState('');
  const [ocrOpen, setOcrOpen] = useState(false);
  const [tracking, setTracking] = useState(false); // đang ghi hành trình GPS?

  useEffect(() => {
    if (!vehicleId) setVehicleId(routeVehicleId ?? defaultVehicle?.id ?? null);
  }, [vehicles, routeVehicleId]);

  const currentVehicle = vehicles.find((v: any) => v.id === vehicleId);

  useEffect(() => {
    isTrackingActive().then(setTracking).catch(() => {});
  }, []);

  const handleOcrResult = (text: string) => {
    const num = text.replace(/[^0-9]/g, '');
    if (num) setOdo(num);
    setOcrOpen(false);
  };

  const handleSubmit = async () => {
    if (!vehicleId) { Alert.alert(t('common.error'), t('common.select_vehicle_required')); return; }
    if (!odo) { Alert.alert(t('common.error'), t('odometer.value_required')); return; }
    // Đang ghi hành trình -> cảnh báo cộng trùng, cho chọn tiếp tục.
    if (tracking) {
      Alert.alert(
        t('odometer.tracking_warn_title'),
        t('odometer.tracking_warn_body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('odometer.tracking_warn_continue'), style: 'destructive', onPress: () => doSave() },
        ],
      );
      return;
    }
    doSave();
  };

  const doSave = async () => {
    if (!vehicleId) return;
    try {
      const res = await createOdometer.mutateAsync({
        vehicleId,
        data: { odometer: parseInt(odo), ngay, ghi_chu: ghiChu.trim() || undefined },
      });
      const warning = (res as any)?.meta?.warning;
      if (warning) {
        Alert.alert(t('common.warning'), warning, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        navigation.goBack();
      }
    } catch (err: any) {
      const errs = err.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert(t('common.error'), detail ?? err.response?.data?.message ?? t('common.save_failed'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[{ padding: 16 }, contentWide]}>

          {/* Cảnh báo đang ghi hành trình -> nhập ODO có thể cộng trùng */}
          {tracking && (
            <View style={{
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              backgroundColor: colors.warning + '18', borderRadius: 10, padding: 12, marginBottom: 14,
              borderWidth: 1, borderColor: colors.warning + '55',
            }}>
              <FontAwesome5 name="exclamation-triangle" size={15} color={colors.warning} solid style={{ marginTop: 1 }} />
              <Text style={{ color: colors.text, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
                {t('odometer.tracking_warn_body')}
              </Text>
            </View>
          )}

          {/* Vehicle chips */}
          {vehicles.length > 1 && (
            <>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('common.select_vehicle')}</Text>
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
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('odometer.current')}</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>
                {formatKm(currentVehicle.odo_hien_tai)}
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
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('odometer.ocr_label')}</Text>
          </TouchableOpacity>

          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('odometer.value_label')}</Text>
          <TextInput
            value={odo}
            onChangeText={setOdo}
            placeholder=""
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            selectTextOnFocus
            style={[input, { fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 2, marginBottom: 10 }]}
          />
          <VoiceButton
            label={t('odometer.voice_label')}
            hint={t('odometer.voice_hint')}
            onResult={(value) => { if (value) setOdo(value); }}
            compact={false}
          />

          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('common.date')}</Text>
          <View style={{ marginBottom: 16 }}>
            <DatePickerField value={ngay} onChange={setNgay} />
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('common.note')}</Text>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder={t('odometer.note_placeholder')}
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
                  <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('odometer.save_button')}</Text>
                </View>
              )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <OcrCamera visible={ocrOpen} onClose={() => setOcrOpen(false)} onResult={handleOcrResult} hint={t('odometer.ocr_hint')} />
    </SafeAreaView>
  );
}
