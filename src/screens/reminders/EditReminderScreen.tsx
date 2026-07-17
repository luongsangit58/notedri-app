import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import DatePickerField from '../../components/DatePickerField';
import { useNavigation, useRoute } from '@react-navigation/native';
import { remindersApi } from '../../api/reminders';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { flattenReminders } from '../../utils/reminders';

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

export default function EditReminderScreen() {
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
  const { reminderId, vehicleId } = route.params as { reminderId: number; vehicleId: number };
  const qc = useQueryClient();

  const LOAI_OPTIONS: { value: Loai; label: string }[] = [
    { value: 'bao_duong', label: t('reminders.type_bao_duong') },
    { value: 'dang_kiem', label: t('reminders.type_dang_kiem') },
    { value: 'bao_hiem', label: t('reminders.type_bao_hiem') },
    { value: 'giay_to', label: t('reminders.type_giay_to') },
    { value: 'khac', label: t('reminders.type_khac') },
  ];

  const CHE_DO_OPTIONS: { value: CheDo; label: string }[] = [
    { value: 'chu_ky', label: t('reminders.mode_chu_ky') },
    { value: 'ngay_co_dinh', label: t('reminders.mode_ngay_co_dinh') },
    { value: 'mot_lan', label: t('reminders.mode_mot_lan') },
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [hang_muc, setHangMuc] = useState('');
  const [loai, setLoai] = useState<Loai>('bao_duong');
  const [che_do, setCheĐo] = useState<CheDo>('chu_ky');
  const [interval_km, setIntervalKm] = useState('');
  const [interval_thang, setIntervalThang] = useState('');
  const [last_done_odo, setLastDoneOdo] = useState('');
  const [last_done_date, setLastDoneDate] = useState('');
  const [due_date, setDueDate] = useState('');
  const [ghi_chu, setGhiChu] = useState('');
  const [notify_email, setNotifyEmail] = useState(true);

  useEffect(() => {
    remindersApi.list(vehicleId)
      .then(r => {
        const list = flattenReminders(r.data);
        const found = list.find((item: any) => item.id === reminderId);
        if (!found) {
          Alert.alert(t('common.error'), t('reminders.error_not_found'));
          navigation.goBack();
          return;
        }
        setHangMuc(found.hang_muc ?? '');
        setLoai(found.loai ?? 'bao_duong');
        setCheĐo(found.che_do ?? 'chu_ky');
        setIntervalKm(found.interval_km != null ? String(found.interval_km) : '');
        setIntervalThang(found.interval_thang != null ? String(found.interval_thang) : '');
        setLastDoneOdo(found.last_done_odo != null ? String(found.last_done_odo) : '');
        // Cắt phần giờ của ISO datetime backend trả (cast `date`) về "YYYY-MM-DD"
        // để DatePickerField hiện đúng + payload lưu lại sạch (như EditVehicle).
        setLastDoneDate(found.last_done_date ? String(found.last_done_date).slice(0, 10) : '');
        setDueDate(found.due_date ? String(found.due_date).slice(0, 10) : '');
        setGhiChu(found.ghi_chu ?? '');
        setNotifyEmail(found.notify_email ?? true);
      })
      .catch((e: any) => {
        Alert.alert(t('common.error'), e?.response?.data?.message ?? t('reminders.error_load_failed'));
        navigation.goBack();
      })
      .finally(() => setLoading(false));
  }, [reminderId, vehicleId]);

  const handleUpdate = () => {
    if (!hang_muc.trim()) {
      Alert.alert(t('common.error'), t('reminders.error_missing_item'));
      return;
    }

    setSaving(true);
    remindersApi.update(reminderId, {
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
    })
      .then(() => {
        qc.invalidateQueries({ queryKey: ['reminders', vehicleId] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        navigation.goBack();
      })
      .catch((e: any) => {
        Alert.alert(t('common.error'), e?.response?.data?.message ?? t('common.error_generic'));
      })
      .finally(() => setSaving(false));
  };

  const handleDelete = () => {
    Alert.alert(
      t('reminders.delete_confirm_title'),
      t('reminders.delete_confirm_message', { name: hang_muc }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            remindersApi.delete(reminderId)
              .then(() => {
                qc.invalidateQueries({ queryKey: ['reminders', vehicleId] });
                qc.invalidateQueries({ queryKey: ['dashboard'] });
                navigation.goBack();
              })
              .catch((e: any) => {
                Alert.alert(t('common.error'), e?.response?.data?.message ?? t('common.error_generic'));
              })
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <AppBgPattern />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

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
            {t('reminders.edit_title')}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 22, lineHeight: 26 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {CHE_DO_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setCheĐo(opt.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: che_do === opt.value ? colors.primary : colors.surface,
                }}>
                <Text style={{
                  color: che_do === opt.value ? '#fff' : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
            placeholder={t('reminders.note_placeholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
          />

          {/* Email nhắc */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{t('reminders.email_reminder_label')}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('reminders.email_reminder_desc')}</Text>
            </View>
            <Switch
              value={notify_email}
              onValueChange={setNotifyEmail}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>

          {/* Cập nhật button */}
          <TouchableOpacity
            onPress={handleUpdate}
            disabled={saving || deleting}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 24,
              opacity: (saving || deleting) ? 0.7 : 1,
            }}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>{t('common.update')}</Text>}
          </TouchableOpacity>

          {/* Xoá button */}
          <TouchableOpacity
            onPress={handleDelete}
            disabled={saving || deleting}
            style={{
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: colors.error,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 12,
              opacity: (saving || deleting) ? 0.7 : 1,
            }}>
            {deleting
              ? <ActivityIndicator color={colors.error} />
              : <Text style={{ color: colors.error, fontWeight: '700', fontSize: 16 }}>{t('reminders.delete_confirm_title')}</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
