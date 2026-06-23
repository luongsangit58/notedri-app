import React from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useReminders, useDeleteReminder, useDoneReminder } from '../../hooks/useReminders';
import { useVehicles } from '../../hooks/useVehicles';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { colors } from '../../utils/colors';

type LoaiKey = 'bao_duong' | 'dang_kiem' | 'bao_hiem' | 'giay_to' | 'khac';
type StatusKey = 'ok' | 'warning' | 'danger' | 'overdue';

const LOAI_LABELS: Record<LoaiKey, string> = {
  bao_duong: 'Bảo dưỡng',
  dang_kiem: 'Đăng kiểm',
  bao_hiem: 'Bảo hiểm',
  giay_to: 'Giấy tờ',
  khac: 'Khác',
};

const STATUS_COLORS: Record<StatusKey, string> = {
  ok: colors.success,
  warning: colors.warning,
  danger: colors.error,
  overdue: colors.error,
};

interface Reminder {
  id: number;
  hang_muc: string;
  loai: LoaiKey;
  che_do: 'chu_ky' | 'ngay_co_dinh' | 'mot_lan';
  interval_km?: number | null;
  interval_thang?: number | null;
  last_done_date?: string | null;
  last_done_odo?: number | null;
  due_date?: string | null;
  ghi_chu?: string | null;
  is_active: boolean;
  remaining_days?: number | null;
  remaining_km?: number | null;
  status: StatusKey;
}

function ReminderCard({
  item,
  onDone,
  onDelete,
  onEdit,
}: {
  item: Reminder;
  onDone: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}) {
  const statusColor = STATUS_COLORS[item.status] ?? colors.textSecondary;
  const loaiLabel = LOAI_LABELS[item.loai] ?? item.loai;

  const handleDelete = () => {
    Alert.alert(
      'Xác nhận xoá',
      `Bạn có chắc muốn xoá lời nhắc "${item.hang_muc}" không?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá', style: 'destructive', onPress: () => onDelete(item.id) },
      ],
    );
  };

  const remainingText = () => {
    const parts: string[] = [];
    if (item.remaining_days != null) {
      if (item.remaining_days < 0) {
        parts.push(`Quá hạn ${Math.abs(item.remaining_days)} ngày`);
      } else if (item.remaining_days === 0) {
        parts.push('Hôm nay');
      } else {
        parts.push(`Còn ${item.remaining_days} ngày`);
      }
    }
    if (item.remaining_km != null) {
      if (item.remaining_km < 0) {
        parts.push(`Quá ${Math.abs(item.remaining_km).toLocaleString()} km`);
      } else {
        parts.push(`Còn ${item.remaining_km.toLocaleString()} km`);
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
            {item.hang_muc}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onEdit(item.id)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.deleteBtnText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardMeta}>
        <View style={[styles.loaiBadge, { borderColor: statusColor }]}>
          <Text style={[styles.loaiText, { color: statusColor }]}>{loaiLabel}</Text>
        </View>
        {!item.is_active && (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveText}>Tắt</Text>
          </View>
        )}
      </View>

      {remaining && (
        <Text style={[styles.remaining, { color: statusColor }]}>{remaining}</Text>
      )}

      {item.due_date && (
        <Text style={styles.dueDate}>
          Hạn: {new Date(item.due_date).toLocaleDateString('vi-VN')}
        </Text>
      )}

      {item.ghi_chu ? (
        <Text style={styles.note} numberOfLines={2}>
          {item.ghi_chu}
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => onDone(item.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.doneBtnText}>✅ Đã làm</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RemindersScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params as { vehicleId: number };

  const { data: remindersData, isLoading, isError, refetch, isFetching } = useReminders(vehicleId);
  const { data: vehiclesData } = useVehicles();
  const deleteReminder = useDeleteReminder();
  const doneReminder = useDoneReminder();

  const vehicles: any[] = vehiclesData?.data ?? vehiclesData ?? [];
  const vehicle = vehicles.find((v: any) => v.id === vehicleId);
  const vehicleName = vehicle?.ten_xe ?? vehicle?.name ?? `Xe #${vehicleId}`;

  const reminders: Reminder[] = remindersData?.data ?? remindersData ?? [];

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: `Lời nhắc — ${vehicleName}` });
  }, [navigation, vehicleName]);

  const handleDone = (id: number) => {
    doneReminder.mutate({ id });
  };

  const handleDelete = (id: number) => {
    deleteReminder.mutate(id);
  };

  const handleEdit = (reminderId: number) => {
    navigation.navigate('EditReminder', { reminderId, vehicleId });
  };

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được lời nhắc" onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={reminders}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ReminderCard item={item} onDone={handleDone} onDelete={handleDelete} onEdit={handleEdit} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Chưa có lời nhắc nào</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddReminder', { vehicleId })}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 96,
  },
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
  deleteBtnText: {
    fontSize: 18,
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
  remaining: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  dueDate: {
    color: colors.textSecondary,
    fontSize: 13,
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
});
