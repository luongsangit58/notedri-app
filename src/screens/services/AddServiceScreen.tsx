import DatePickerField from '../../components/DatePickerField';
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useVehicles } from '../../hooks/useVehicles';
import { useCreateService } from '../../hooks/useServices';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import MoneyInput from '../../components/MoneyInput';

const LOAI_OPTIONS = [
  { value: 'bao_duong', labelKey: 'services.type_bao_duong' },
  { value: 'sua_chua', labelKey: 'services.type_sua_chua' },
  { value: 'lop', labelKey: 'services.type_lop' },
  { value: 'bao_hiem', labelKey: 'reminders.type_bao_hiem' },
  { value: 'dang_kiem', labelKey: 'reminders.type_dang_kiem' },
  { value: 'phat_nguoi', labelKey: 'services.type_phat_nguoi' },
  { value: 'phi_gui_xe', labelKey: 'services.type_phi_gui_xe' },
  { value: 'phi_cau_duong', labelKey: 'services.type_phi_cau_duong' },
  { value: 'rua_xe', labelKey: 'services.type_rua_xe' },
  { value: 'khac', labelKey: 'reminders.type_khac' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>{children}</Text>
  );
}

export default function AddServiceScreen() {
  const colors = useColors();
  const t = useT();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    chipRow: {
      marginBottom: 14,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      marginRight: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 13,
    },
    chipTextActive: {
      color: colors.primaryText,
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    submitBtn: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 20,
    },
    submitBtnDisabled: {
      opacity: 0.7,
    },
    submitText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 16,
    },
  });

  const navigation = useNavigation<any>();
  const { data: vehiclesData } = useVehicles();
  const createService = useCreateService();

  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData)
    ? vehiclesData
    : [];

  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];

  const [vehicleId, setVehicleId] = useState<number | null>(defaultVehicle?.id ?? null);
  const [loai, setLoai] = useState('bao_duong');
  const [hangMuc, setHangMuc] = useState('');
  const [chiPhi, setChiPhi] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState(dayjs().format('YYYY-MM-DD'));
  const [noiLam, setNoiLam] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  useEffect(() => {
    if (!vehicleId && defaultVehicle) {
      setVehicleId(defaultVehicle.id);
    }
  }, [vehicles]);

  const handleSubmit = async () => {
    if (!vehicleId) {
      Alert.alert(t('common.error'), t('common.select_vehicle_required'));
      return;
    }
    if (!hangMuc.trim()) {
      Alert.alert(t('common.error'), t('services.error_missing_item'));
      return;
    }
    try {
      await createService.mutateAsync({
        vehicle_id: vehicleId,
        hang_muc: hangMuc.trim(),
        loai,
        chi_phi: chiPhi ? parseFloat(chiPhi) : null,
        odometer: odometer ? parseInt(odometer, 10) : null,
        ngay,
        noi_lam: noiLam.trim() || null,
        ghi_chu: ghiChu.trim() || null,
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AppBgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Vehicle selector */}
          {vehicles.length > 0 && (
            <>
              <FieldLabel>{t('common.select_vehicle')}</FieldLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRow}
              >
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVehicleId(v.id)}
                    style={[
                      styles.chip,
                      vehicleId === v.id && styles.chipActive,
                    ]}
                  >
                    <Text style={[
                      styles.chipText,
                      vehicleId === v.id && styles.chipTextActive,
                    ]}>
                      {v.ten}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Loai selector */}
          <FieldLabel>{t('services.type_label')}</FieldLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {LOAI_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setLoai(opt.value)}
                style={[
                  styles.chip,
                  loai === opt.value && styles.chipActive,
                ]}
              >
                <Text style={[
                  styles.chipText,
                  loai === opt.value && styles.chipTextActive,
                ]}>
                  {t(opt.labelKey as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Hang muc */}
          <FieldLabel>{t('services.item_label')}</FieldLabel>
          <TextInput
            value={hangMuc}
            onChangeText={setHangMuc}
            placeholder={t('services.item_placeholder')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Chi phi */}
          <FieldLabel>{t('services.cost_label')}</FieldLabel>
          <MoneyInput
            value={chiPhi}
            onChangeText={setChiPhi}
            placeholder={t('services.cost_label')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Odometer */}
          <FieldLabel>{t('refuels.odo_label')}</FieldLabel>
          <TextInput
            value={odometer}
            onChangeText={setOdometer}
            placeholder={t('refuels.odo_label')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={styles.input}
          />

          {/* Ngay */}
          <FieldLabel>{t('common.date')}</FieldLabel>
          <DatePickerField value={ngay} onChange={setNgay} style={{ marginBottom: 12 }} />

          {/* Noi lam */}
          <FieldLabel>{t('services.location_label')}</FieldLabel>
          <TextInput
            value={noiLam}
            onChangeText={setNoiLam}
            placeholder={t('services.location_placeholder')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {/* Ghi chu */}
          <FieldLabel>{t('common.note')}</FieldLabel>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder={t('refuels.note_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={createService.isPending}
            style={[styles.submitBtn, createService.isPending && styles.submitBtnDisabled]}
          >
            {createService.isPending
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="wrench" size={16} color="#fff" solid />
                  <Text style={styles.submitText}>{t('services.save_button')}</Text>
                </View>
              )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
