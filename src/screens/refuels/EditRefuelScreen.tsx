import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDeleteRefuel } from '../../hooks/useRefuels';
import { refuelsApi } from '../../api/refuels';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import DatePickerField from '../../components/DatePickerField';
import MoneyInput, { toMoneyRaw } from '../../components/MoneyInput';

const FUEL_TYPES = ['E5 RON 95-V', 'RON 95-III', 'E5 RON 92', 'Dầu DO 0,05S-V', 'Dầu DO 0,001S'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>
      {children}
    </Text>
  );
}

export default function EditRefuelScreen() {
  const t = useT();
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
  const { refuelId } = route.params as { refuelId: number };

  const deleteRefuel = useDeleteRefuel();

  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  // Form state
  const [fuelType, setFuelType] = useState(FUEL_TYPES[0]);
  const [tongTien, setTongTien] = useState('');
  const [soLit, setSoLit] = useState('');
  const [giaLit, setGiaLit] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState('');
  const [cayXang, setCayXang] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);

  useEffect(() => {
    client
      .get(`/refuels/${refuelId}`)
      .then((r) => {
        const data = r.data?.data ?? r.data;
        setOriginal(data);
        setFuelType(data?.fuel_type ?? FUEL_TYPES[0]);
        setTongTien(toMoneyRaw(data?.tong_tien));
        setSoLit(data?.so_lit != null ? String(Number(data.so_lit)) : '');
        setGiaLit(toMoneyRaw(data?.gia_lit));
        setOdometer(data?.odometer != null ? String(data.odometer) : '');
        setNgay(data?.ngay ? String(data.ngay).slice(0, 10) : '');
        setCayXang(data?.cay_xang ?? '');
        setGhiChu(data?.ghi_chu ?? '');
        setIsFullTank(data?.is_full_tank ?? true);
        setLoading(false);
      })
      .catch(() => navigation.goBack());
  }, []);

  const handleUpdate = async () => {
    if (!tongTien && !soLit) {
      Alert.alert(t('common.error'), t('refuels.error_amount_or_liters'));
      return;
    }
    setUpdating(true);
    try {
      await refuelsApi.update(refuelId, {
        fuel_type: fuelType,
        tong_tien: tongTien ? parseFloat(tongTien) : null,
        so_lit: soLit ? parseFloat(soLit) : null,
        gia_lit: giaLit ? parseFloat(giaLit) : null,
        odometer: odometer ? parseInt(odometer, 10) : null,
        ngay,
        cay_xang: cayXang || null,
        ghi_chu: ghiChu || null,
        is_full_tank: isFullTank,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('refuels.update_failed');
      const errs = err?.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert(t('common.error'), detail ?? msg);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('refuels.delete_confirm_title'),
      t('refuels.delete_confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteRefuel.mutate(refuelId, {
              onSuccess: () => navigation.goBack(),
              onError: (e: any) =>
                Alert.alert(t('common.error'), e?.response?.data?.message ?? t('refuels.delete_failed')),
            });
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <AppBgPattern />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isBusy = updating || deleteRefuel.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Loại xăng */}
          <FieldLabel>{t('vehicles.fuel_type_label')}</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {FUEL_TYPES.map((ft) => (
              <TouchableOpacity
                key={ft}
                onPress={() => setFuelType(ft)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: fuelType === ft ? colors.primary : colors.surface,
                }}>
                <Text style={{ color: fuelType === ft ? '#fff' : colors.text, fontSize: 13 }}>
                  {ft}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tổng tiền */}
          <View style={{ marginBottom: 4 }}>
            <FieldLabel>{t('refuels.total_amount_label')}</FieldLabel>
            <MoneyInput
              value={tongTien}
              onChangeText={setTongTien}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={[inputStyle, { fontSize: 18, fontWeight: '700' }]}
            />
          </View>

          {/* Số lít + Giá/lít */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>{t('refuels.liters_label')}</FieldLabel>
              <TextInput
                value={soLit}
                onChangeText={setSoLit}
                placeholder="0.0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>{t('refuels.price_per_liter_label')}</FieldLabel>
              <MoneyInput
                value={giaLit}
                onChangeText={setGiaLit}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>
          </View>

          <FieldLabel>{t('refuels.odo_label')}</FieldLabel>
          <TextInput
            value={odometer}
            onChangeText={setOdometer}
            placeholder={t('refuels.odo_placeholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={[inputStyle, { marginBottom: 4 }]}
          />

          <DatePickerField label={t('refuels.date_label')} value={ngay} onChange={setNgay} />

          <FieldLabel>{t('refuels.station_label')}</FieldLabel>
          <TextInput
            value={cayXang}
            onChangeText={setCayXang}
            placeholder={t('refuels.station_placeholder')}
            placeholderTextColor={colors.textSecondary}
            style={[inputStyle, { marginBottom: 4 }]}
          />

          {/* Full tank toggle */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 8,
          }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{t('refuels.full_tank_label')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {t('refuels.full_tank_hint')}
              </Text>
            </View>
            <Switch
              value={isFullTank}
              onValueChange={setIsFullTank}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>

          <FieldLabel>{t('refuels.note_label')}</FieldLabel>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder={t('refuels.note_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[inputStyle, { minHeight: 72, textAlignVertical: 'top', marginBottom: 20 }]}
          />

          {/* Cập nhật button */}
          <TouchableOpacity
            onPress={handleUpdate}
            disabled={isBusy}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginBottom: 12,
              opacity: isBusy ? 0.7 : 1,
            }}>
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('common.update')}</Text>}
          </TouchableOpacity>

          {/* Xoá button */}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={isBusy}
            style={{
              backgroundColor: 'transparent',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.error,
              opacity: isBusy ? 0.5 : 1,
            }}>
            {deleteRefuel.isPending
              ? <ActivityIndicator color={colors.error} />
              : <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700' }}>{t('refuels.delete_confirm_title')}</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
