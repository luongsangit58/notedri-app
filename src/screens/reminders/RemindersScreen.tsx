import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import DatePickerField from '../../components/DatePickerField';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useReminders, useDeleteReminder, useDoneReminder, useSeedReminders, useConfirmAllReminders } from '../../hooks/useReminders';
import { useVehicles } from '../../hooks/useVehicles';
import ErrorView from '../../components/ErrorView';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { flattenReminders } from '../../utils/reminders';
import { useT } from '../../i18n';

type LoaiKey = 'bao_duong' | 'dang_kiem' | 'bao_hiem' | 'giay_to' | 'khac';
// Backend ReminderService trả các status này
type StatusKey = 'ok' | 'sap_toi' | 'toi_han' | 'qua_han' | 'chua_du_lieu';

function formatShortDate(s: string): string {
  if (!s) return '';
  // Parse "YYYY-MM-DD" trực tiếp (tránh new Date() lỗi với ISO 6 chữ số micro -> "00000Z").
  const [y, m, d] = s.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

interface Reminder {
  id: number;
  hang_muc: string;
  hang_muc_label?: string | null;
  loai: LoaiKey;
  che_do: 'chu_ky' | 'ngay_co_dinh' | 'mot_lan';
  interval_km?: number | null;
  interval_thang?: number | null;
  last_done_date?: string | null;
  last_done_odo?: number | null;
  due_date?: string | null;
  ghi_chu?: string | null;
  why?: string | null;
  is_active: boolean;
  remaining_days?: number | null;
  remaining_km?: number | null;
  cho_xac_nhan?: boolean | number | null;
  status: StatusKey;
}

function ReminderCard({
  item,
  onDone,
  onDelete,
  onEdit,
}: {
  item: Reminder;
  onDone: (id: number, che_do: Reminder['che_do']) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 8,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
      flex: 1,
    },
    deleteBtn: {
      padding: 4,
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    loaiBadge: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    loaiText: {
      fontSize: 12,
      fontWeight: '500',
    },
    inactiveBadge: {
      backgroundColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    inactiveText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    detailSection: {
      marginBottom: 6,
      gap: 2,
    },
    detailText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    remaining: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    note: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 8,
      fontStyle: 'italic',
    },
    doneBtn: {
      marginTop: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.success,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center',
    },
    doneBtnText: {
      color: colors.success,
      fontSize: 14,
      fontWeight: '600',
    },
  });
  // Backend trả status: ok|sap_toi|toi_han|qua_han|chua_du_lieu
  const statusColor =
    item.status === 'qua_han' ? colors.error
    : item.status === 'toi_han' ? colors.error
    : item.status === 'sap_toi' ? colors.warning
    : item.status === 'ok' ? colors.success
    : colors.textSecondary;

  const loaiLabel = (() => {
    switch (item.loai) {
      case 'bao_duong': return t('reminders.type_bao_duong');
      case 'dang_kiem': return t('reminders.type_dang_kiem');
      case 'bao_hiem': return t('reminders.type_bao_hiem');
      case 'giay_to': return t('reminders.type_giay_to');
      case 'khac': return t('reminders.type_khac');
      default: return item.loai;
    }
  })();

  const cheDo = item.che_do;
  const cheDolabel = cheDo === 'chu_ky'
    ? t('reminders.mode_chu_ky')
    : cheDo === 'ngay_co_dinh'
      ? t('reminders.mode_ngay_co_dinh')
      : t('reminders.mode_mot_lan');

  const handleDelete = () => {
    Alert.alert(
      t('reminders.delete_confirm_title'),
      t('reminders.delete_confirm_message', { name: item.hang_muc_label ?? item.hang_muc ?? loaiLabel }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
      ],
    );
  };

  const remainingText = () => {
    const parts: string[] = [];
    if (item.remaining_days != null) {
      if (item.remaining_days < 0) {
        parts.push(t('reminders.overdue_days', { n: Math.abs(item.remaining_days) }));
      } else if (item.remaining_days === 0) {
        parts.push(t('reminders.today'));
      } else {
        parts.push(t('reminders.remaining_days', { n: item.remaining_days }));
      }
    }
    if (item.remaining_km != null) {
      if (item.remaining_km < 0) {
        parts.push(t('reminders.over_km', { n: Math.abs(item.remaining_km).toLocaleString() }));
      } else {
        parts.push(t('reminders.remaining_km', { n: item.remaining_km.toLocaleString() }));
      }
    }
    return parts.join(' · ') || null;
  };

  const remaining = remainingText();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.hang_muc_label ?? item.hang_muc}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onEdit(item.id)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="pen" size={14} color={colors.textSecondary} solid />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="trash" size={14} color={colors.error} solid />
        </TouchableOpacity>
      </View>

      <View style={styles.cardMeta}>
        <View style={[styles.loaiBadge, { borderColor: statusColor }]}>
          <Text style={[styles.loaiText, { color: statusColor }]}>{loaiLabel}</Text>
        </View>
        {item.che_do && (
          <View style={[styles.loaiBadge, {
            borderColor: item.che_do === 'chu_ky' ? colors.primary : colors.textSecondary,
          }]}>
            <Text style={[styles.loaiText, {
              color: item.che_do === 'chu_ky' ? colors.primary : colors.textSecondary,
            }]}>
              {cheDolabel}
            </Text>
          </View>
        )}
        {!item.is_active && (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveText}>{t('reminders.status_off')}</Text>
          </View>
        )}
      </View>

      {/* Cycle / date detail section */}
      {item.che_do === 'chu_ky' && (
        <View style={styles.detailSection}>
          {item.interval_km != null && (
            <Text style={styles.detailText}>
              {item.interval_thang != null
                ? t('reminders.every_km_month', { km: item.interval_km.toLocaleString(), m: item.interval_thang })
                : t('reminders.every_km', { km: item.interval_km.toLocaleString() })}
            </Text>
          )}
          {item.last_done_date != null && (
            <Text style={styles.detailText}>
              {item.last_done_odo != null
                ? t('reminders.last_done_odo', { date: formatShortDate(item.last_done_date), odo: item.last_done_odo.toLocaleString() })
                : t('reminders.last_done', { date: formatShortDate(item.last_done_date) })}
            </Text>
          )}
        </View>
      )}
      {item.che_do === 'ngay_co_dinh' && item.due_date != null && (
        <View style={styles.detailSection}>
          <Text style={styles.detailText}>{t('reminders.due_prefix', { date: formatShortDate(item.due_date) })}</Text>
        </View>
      )}
      {item.che_do === 'mot_lan' && item.due_date != null && (
        <View style={styles.detailSection}>
          <Text style={styles.detailText}>{t('reminders.date_prefix', { date: formatShortDate(item.due_date) })}</Text>
        </View>
      )}

      {remaining && (
        <Text style={[styles.remaining, { color: statusColor }]}>{remaining}</Text>
      )}

      {item.ghi_chu ? (
        <Text style={styles.note} numberOfLines={2}>
          {item.ghi_chu}
        </Text>
      ) : null}

      {/* Why explanation for urgent/warning reminders */}
      {item.why && (item.status === 'qua_han' || item.status === 'toi_han' || item.status === 'sap_toi') ? (
        <View style={{
          backgroundColor: statusColor + '11', borderRadius: 6,
          padding: 8, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: statusColor,
        }}>
          <Text style={{ color: statusColor, fontSize: 11 }}>{item.why}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => onDone(item.id, item.che_do)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FontAwesome5 name="check" size={14} color={colors.success} solid />
          <Text style={styles.doneBtnText}>
            {item.che_do === 'ngay_co_dinh' ? t('reminders.renew') : item.che_do === 'mot_lan' ? t('reminders.done_button') : t('reminders.done_button')}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function RemindersScreen() {
  const t = useT();
  const colors = useColors();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: 16,
      paddingBottom: 96,
    },
    emptyContainer: {
      alignItems: 'center',
      marginTop: 64,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      backgroundColor: colors.primary,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    fabText: {
      color: '#fff',
      fontSize: 28,
      lineHeight: 32,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalBox: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 4,
    },
    modalSub: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 16,
    },
    modalLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 8,
    },
    modalInput: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 20,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
    },
    modalCancel: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalConfirm: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
  });
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = (route.params ?? {}) as { vehicleId?: number };
  const { data: vehiclesData0 } = useVehicles();
  const vehicles0: any[] = Array.isArray(vehiclesData0?.data) ? vehiclesData0.data : Array.isArray(vehiclesData0) ? vehiclesData0 : [];
  const resolvedVehicleId: number = vehicleId ?? vehicles0.find((v: any) => v.is_default)?.id ?? vehicles0[0]?.id;

  const { data: remindersData, isLoading, isError, refetch, isFetching } = useReminders(resolvedVehicleId);
  const deleteReminder = useDeleteReminder();
  const doneReminder = useDoneReminder();
  const seedReminders = useSeedReminders();
  const confirmAllReminders = useConfirmAllReminders();

  const vehicles: any[] = vehicles0;
  const vehicle = vehicles.find((v: any) => v.id === resolvedVehicleId);
  const vehicleName = vehicle?.ten_xe ?? vehicle?.ten ?? vehicle?.name ?? t('home.vehicle_fallback', { id: resolvedVehicleId });

  // Backend trả mỗi item dạng { reminder: {...}, eval: {...} } (lồng nhau) -> gộp phẳng.
  // flattenReminders đã guard Array.isArray (chống crash khi API trả non-array).
  const reminders: Reminder[] = flattenReminders(remindersData);
  const reminderMeta = remindersData?.meta ?? null;
  const suggestions: any[] = reminderMeta?.suggestions ?? [];
  const canAdd: boolean = reminderMeta?.can_add_reminder ?? true;
  // Mốc "tạm tính" (seed tự tạo) đang chờ user xác nhận trước khi app nhắc.
  const pendingConfirmCount = reminders.filter(
    (r) => r.cho_xac_nhan === true || r.cho_xac_nhan === 1,
  ).length;

  const handleSeed = () => {
    if (!resolvedVehicleId || seedReminders.isPending) return;
    seedReminders.mutate(resolvedVehicleId, {
      onSuccess: (res: any) => {
        const n = res?.data?.created ?? 0;
        Alert.alert(t('reminders.seed_done_title'), t('reminders.seed_done_msg', { n }));
      },
      onError: () => Alert.alert(t('common.error'), t('reminders.error_load_failed')),
    });
  };

  const handleConfirmAll = () => {
    if (!resolvedVehicleId || confirmAllReminders.isPending) return;
    confirmAllReminders.mutate(resolvedVehicleId, {
      onError: () => Alert.alert(t('common.error'), t('reminders.error_load_failed')),
    });
  };

  const [doneModalId, setDoneModalId] = useState<number | null>(null);
  const [doneCheDo, setDoneCheDo] = useState<Reminder['che_do']>('chu_ky');
  const [doneOdo, setDoneOdo] = useState('');
  const [doneDate, setDoneDate] = useState('');

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: `${t('reminders.title')} - ${vehicleName}` });
  }, [navigation, vehicleName]);

  const openDoneModal = (id: number, che_do: Reminder['che_do']) => {
    setDoneOdo('');
    setDoneDate(new Date().toISOString().slice(0, 10));
    setDoneCheDo(che_do);
    setDoneModalId(id);
  };

  const confirmDone = () => {
    if (doneModalId == null) return;
    const odo = doneOdo.trim() !== '' ? parseInt(doneOdo, 10) : undefined;
    const date = doneDate.trim() || undefined;
    doneReminder.mutate({ id: doneModalId, odo, date });
    setDoneModalId(null);
  };

  const handleDelete = (id: number) => {
    deleteReminder.mutate(id);
  };

  const handleEdit = (reminderId: number) => {
    navigation.navigate('EditReminder', { reminderId, vehicleId: resolvedVehicleId });
  };

  if (isError) return <ErrorView message={t('reminders.error_load_failed')} onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AppBgPattern />
      <FlatList
        data={reminders}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ReminderCard item={item} onDone={(id, che_do) => openDoneModal(id, che_do)} onDelete={handleDelete} onEdit={handleEdit} />
        )}
        contentContainerStyle={[styles.listContent, contentWide]}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          pendingConfirmCount > 0 ? (
            <View style={{
              backgroundColor: colors.warning + '18', borderRadius: 12, padding: 14, marginBottom: 12,
              borderWidth: 1, borderColor: colors.warning + '55',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <FontAwesome5 name="info-circle" size={14} color={colors.warning} solid />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>
                  {t('reminders.confirm_all_title', { n: pendingConfirmCount })}
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
                {t('reminders.confirm_all_desc')}
              </Text>
              <TouchableOpacity
                onPress={handleConfirmAll}
                disabled={confirmAllReminders.isPending}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9,
                  opacity: confirmAllReminders.isPending ? 0.6 : 1,
                }}>
                <FontAwesome5 name="check-double" size={13} color={colors.primaryText} solid />
                <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>
                  {t('reminders.confirm_all_button')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
            : <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('reminders.empty')}</Text>
                {resolvedVehicleId ? (
                  <TouchableOpacity
                    onPress={handleSeed}
                    disabled={seedReminders.isPending}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
                      backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11,
                      opacity: seedReminders.isPending ? 0.6 : 1,
                    }}>
                    {seedReminders.isPending
                      ? <ActivityIndicator size="small" color={colors.primaryText} />
                      : <FontAwesome5 name="magic" size={14} color={colors.primaryText} solid />}
                    <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '700' }}>
                      {t('reminders.seed_default_button')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 10, textAlign: 'center', paddingHorizontal: 32 }}>
                  {t('reminders.seed_default_hint')}
                </Text>
              </View>
        }
        ListFooterComponent={
          suggestions.length > 0 ? (
            <View style={{ paddingTop: 8, paddingBottom: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                {t('reminders.suggest_more')}
              </Text>
              {suggestions.map((s: any, i: number) => (
                <TouchableOpacity
                  key={i}
                  disabled={!canAdd}
                  onPress={() => navigation.navigate('AddReminder', { vehicleId: resolvedVehicleId, hang_muc: s.hang_muc, loai: s.loai, interval_km: s.interval_km ?? undefined, interval_thang: s.interval_thang ?? undefined })}
                  style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                    backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: colors.border, opacity: canAdd ? 1 : 0.5,
                  }}>
                  <FontAwesome5 name="plus-circle" size={16} color={colors.primary} solid style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    {/* hang_muc_label = bản dịch theo ngôn ngữ tài khoản (web e3700dc); fallback raw VN */}
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{s.hang_muc_label ?? s.hang_muc}</Text>
                    {/* Chu kỳ khuyến nghị - tham khảo "nên làm mỗi bao lâu" */}
                    {(s.interval_km || s.interval_thang) ? (
                      <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '600', marginTop: 2 }}>
                        {s.interval_km && s.interval_thang
                          ? t('reminders.every_km_month', { km: Number(s.interval_km).toLocaleString('vi-VN'), m: s.interval_thang })
                          : s.interval_km
                          ? t('reminders.every_km', { km: Number(s.interval_km).toLocaleString('vi-VN') })
                          : t('reminders.every_month', { m: s.interval_thang })}
                      </Text>
                    ) : null}
                    {s.anchor && (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{s.anchor}</Text>
                    )}
                    {/* Mô tả kỹ thuật (từ API desc) - giúp user hiểu "cái này là gì" ngay tại chỗ */}
                    {s.desc ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>{s.desc}</Text>
                    ) : null}
                  </View>
                  {!canAdd && (
                    <View style={{ backgroundColor: '#F59E0B22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: '#F59E0B', fontSize: 11 }}>Premium</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddReminder', { vehicleId: resolvedVehicleId })}
        activeOpacity={0.85}
      >
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>

      {/* Done modal */}
      <Modal visible={doneModalId !== null} transparent animationType="fade" onRequestClose={() => setDoneModalId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDoneModalId(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {doneCheDo === 'ngay_co_dinh' ? t('reminders.renew') : doneCheDo === 'mot_lan' ? t('reminders.complete_title') : t('reminders.complete_title')}
              </Text>
              <Text style={styles.modalSub}>
                {doneCheDo === 'ngay_co_dinh'
                  ? t('reminders.renew_sub')
                  : t('reminders.complete_sub')}
              </Text>
              {doneCheDo !== 'ngay_co_dinh' && (
                <>
                  <Text style={styles.modalLabel}>{t('reminders.done_date_label')}</Text>
                  <DatePickerField value={doneDate} onChange={setDoneDate} style={{ marginBottom: 12 }} />
                  <Text style={styles.modalLabel}>{t('reminders.complete_odo_label')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder={t('reminders.odo_skip_placeholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={doneOdo}
                    onChangeText={setDoneOdo}
                    returnKeyType="done"
                  />
                </>
              )}
              {doneCheDo === 'ngay_co_dinh' && (
                <>
                  <Text style={styles.modalLabel}>{t('reminders.new_due_date_label')}</Text>
                  <DatePickerField value={doneDate} onChange={setDoneDate} />
                </>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setDoneModalId(null)} style={styles.modalCancel}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmDone} style={styles.modalConfirm}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
