import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import DatePickerField from '../../components/DatePickerField';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCreateReminder } from '../../hooks/useReminders';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

type Loai = 'bao_duong' | 'dang_kiem' | 'bao_hiem' | 'giay_to' | 'khac';
type CheDo = 'chu_ky' | 'ngay_co_dinh' | 'mot_lan';

function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 }}>
      {children}
    </Text>
  );
}

export default function AddReminderScreen() {
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
  // Nhận prefill từ đề xuất lời nhắc: hạng mục + loại + chu kỳ khuyến nghị.
  const { vehicleId: paramVehicleId, hang_muc: paramItem, loai: paramLoai, interval_km: paramKm, interval_thang: paramThang } =
    (route.params ?? {}) as { vehicleId?: number; hang_muc?: string; loai?: Loai; interval_km?: number; interval_thang?: number };
  const { mutate, isPending } = useCreateReminder();

  // If no vehicleId param (e.g. from QuickAddFAB), pick the default vehicle
  const { data: vehiclesData } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];
  const defaultVehicle = vehicles.find((v: any) => v.is_default) ?? vehicles[0];
  const vehicleId: number | null = paramVehicleId ?? defaultVehicle?.id ?? null;
  const [selectedVehicleId, setSelectedVehicleId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!paramVehicleId && vehicleId && selectedVehicleId === null) setSelectedVehicleId(vehicleId);
  }, [vehicleId]);
  const effectiveVehicleId = paramVehicleId ?? selectedVehicleId ?? vehicleId;

  const [hang_muc, setHangMuc] = useState(paramItem ?? '');
  const [loai, setLoai] = useState<Loai>(paramLoai ?? 'bao_duong');
  const [che_do, setCheĐo] = useState<CheDo>('chu_ky');
  const [interval_km, setIntervalKm] = useState(paramKm != null ? String(paramKm) : '');
  const [interval_thang, setIntervalThang] = useState(paramThang != null ? String(paramThang) : '');
  const [last_done_odo, setLastDoneOdo] = useState('');
  const [last_done_date, setLastDoneDate] = useState('');
  const [due_date, setDueDate] = useState('');
  const [ghi_chu, setGhiChu] = useState('');
  const [notify_email, setNotifyEmail] = useState(true);

  const LOAI_OPTIONS: { value: Loai; label: string }[] = [
    { value: 'bao_duong', label: t('reminders.type_bao_duong') },
    { value: 'dang_kiem', label: t('reminders.type_dang_kiem') },
    { value: 'bao_hiem', label: t('reminders.type_bao_hiem') },
    { value: 'giay_to', label: t('reminders.type_giay_to') },
    { value: 'khac', label: t('reminders.type_khac') },
  ];

  const CHE_DO_OPTIONS: { value: CheDo; label: string; desc: string }[] = [
    { value: 'chu_ky', label: t('reminders.mode_chu_ky'), desc: t('add_reminder.mode_chu_ky_desc') },
    { value: 'ngay_co_dinh', label: t('reminders.mode_ngay_co_dinh'), desc: t('add_reminder.mode_ngay_co_dinh_desc') },
    { value: 'mot_lan', label: t('reminders.mode_mot_lan'), desc: t('add_reminder.mode_mot_lan_desc') },
  ];

  const handleSubmit = () => {
    if (!hang_muc.trim()) {
      Alert.alert(t('common.error'), t('reminders.error_missing_item'));
      return;
    }

    if (!effectiveVehicleId) {
      Alert.alert(t('common.error'), t('reminders.error_no_vehicle'));
      return;
    }
    mutate(
      {
        vehicleId: effectiveVehicleId,
        data: {
          hang_muc: hang_muc.trim(),
          loai,
          che_do,
          interval_km: Number(interval_km) || undefined,
          interval_thang: Number(interval_thang) || undefined,
          last_done_odo: Number(last_done_odo) || undefined,
          last_done_date: last_done_date || undefined,
          due_date: due_date || undefined,
          ghi_chu: ghi_chu || undefined,
          notify_email,
        },
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e: any) =>
          Alert.alert(t('common.error'), e?.response?.data?.message ?? t('reminders.error_save_failed')),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <AppBgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            {t('reminders.add_title')}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 22, lineHeight: 26 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Vehicle picker — only when no vehicleId from params and multiple vehicles */}
          {!paramVehicleId && vehicles.length > 1 && (
            <View style={{ marginBottom: 16 }}>
              <FieldLabel>{t('reminders.vehicle_label')}</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                {vehicles.map((v: any) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setSelectedVehicleId(v.id)}
                    style={{
                      marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                      backgroundColor: (selectedVehicleId ?? vehicleId) === v.id ? colors.primary : colors.surface,
                      borderWidth: 1,
                      borderColor: (selectedVehicleId ?? vehicleId) === v.id ? colors.primary : colors.border,
                    }}>
                    <Text style={{ color: (selectedVehicleId ?? vehicleId) === v.id ? '#fff' : colors.text, fontSize: 14 }}>
                      {v.ten}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Hạng mục */}
          <FieldLabel>{t('reminders.item_label')}</FieldLabel>
          <TextInput
            value={hang_muc}
            onChangeText={setHangMuc}
            placeholder={t('reminders.item_placeholder')}
            placeholderTextColor={colors.textSecondary}
            style={inputStyle}
          />

          {/* Loại */}
          <FieldLabel>{t('reminders.type_label')}</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {LOAI_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setLoai(opt.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: loai === opt.value ? colors.primary : colors.surface,
                }}>
                <Text style={{
                  color: loai === opt.value ? '#fff' : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Chế độ */}
          <FieldLabel>{t('reminders.mode_label')}</FieldLabel>
          <View style={{ gap: 8, marginBottom: 4 }}>
            {CHE_DO_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setCheĐo(opt.value)}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderRadius: 10, padding: 12,
                  backgroundColor: che_do === opt.value ? colors.primary + '22' : colors.surface,
                  borderWidth: 1.5,
                  borderColor: che_do === opt.value ? colors.primary : colors.border,
                }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  borderWidth: 2,
                  borderColor: che_do === opt.value ? colors.primary : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 10,
                }}>
                  {che_do === opt.value && (
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary }} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: che_do === opt.value ? colors.primary : colors.text,
                    fontSize: 14, fontWeight: '600',
                  }}>
                    {opt.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                    {opt.desc}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chu kỳ fields */}
          {che_do === 'chu_ky' && (
            <>
              <FieldLabel>{t('reminders.km_cycle_label')}</FieldLabel>
              <TextInput
                value={interval_km}
                onChangeText={setIntervalKm}
                placeholder={t('reminders.eg_5000')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>{t('reminders.month_cycle_label')}</FieldLabel>
              <TextInput
                value={interval_thang}
                onChangeText={setIntervalThang}
                placeholder={t('reminders.eg_6')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>{t('reminders.last_done_odo_label')}</FieldLabel>
              <TextInput
                value={last_done_odo}
                onChangeText={setLastDoneOdo}
                placeholder={t('reminders.eg_45000')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />

              <FieldLabel>{t('reminders.last_done_date_label')}</FieldLabel>
              <DatePickerField value={last_done_date} onChange={setLastDoneDate} style={{ marginBottom: 12 }} />
            </>
          )}

          {/* Ngày đến hạn */}
          {(che_do === 'ngay_co_dinh' || che_do === 'mot_lan') && (
            <>
              <FieldLabel>{t('reminders.due_date_label')}</FieldLabel>
              <DatePickerField value={due_date} onChange={setDueDate} style={{ marginBottom: 12 }} />
            </>
          )}

          {/* Ghi chú */}
          <FieldLabel>{t('common.note')}</FieldLabel>
          <TextInput
            value={ghi_chu}
            onChangeText={setGhiChu}
            placeholder={t('refuels.note_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
          />

          {/* Nhận email nhắc */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginTop: 12,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{t('reminders.email_reminder_label')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                {t('reminders.email_reminder_desc')}
              </Text>
            </View>
            <Switch
              value={notify_email}
              onValueChange={setNotifyEmail}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
            {t('reminders.tip_text')}
          </Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isPending}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 16,
              opacity: isPending ? 0.7 : 1,
            }}>
            {isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('reminders.save_button')}</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
