import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useNotifications, useMarkAllRead, useMarkRead } from '../../hooks/useNotifications';
import { colors } from '../../utils/colors';

dayjs.extend(relativeTime);
dayjs.locale('vi');

interface NotificationData {
  message?: string;
  title?: string;
  body?: string;
}

interface Notification {
  id: number;
  type: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
  severity?: 'urgent' | 'warn' | 'info';
}

function getLabel(data: NotificationData): string {
  return data.message ?? data.title ?? data.body ?? '';
}

function getBellColors(severity?: Notification['severity']): { bg: string; icon: string } {
  switch (severity) {
    case 'urgent':
      return { bg: '#FEE2E2', icon: '#DC2626' };
    case 'warn':
      return { bg: '#FEF3C7', icon: '#D97706' };
    case 'info':
      return { bg: '#E0F2FE', icon: '#0284C7' };
    default:
      return { bg: colors.surface, icon: colors.textSecondary };
  }
}

function NotificationItem({ item, onMarkRead }: { item: Notification; onMarkRead: (id: number) => void }) {
  const unread = item.read_at === null;
  const label = getLabel(item.data);
  const timeAgo = dayjs(item.created_at).fromNow();
  const bellColors = getBellColors(item.severity);

  return (
    <View style={[styles.item, unread ? styles.itemUnread : styles.itemRead]}>
      <View style={[styles.bellContainer, { backgroundColor: bellColors.bg }]}>
        <FontAwesome5 name="bell" size={16} color={bellColors.icon} solid />
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemLabel, !unread && styles.itemLabelRead]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.itemTime}>{timeAgo}</Text>
      </View>
      {unread && (
        <TouchableOpacity
          onPress={() => onMarkRead(item.id)}
          style={styles.markReadBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <FontAwesome5 name="check" size={14} color={colors.primary} solid />
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <FontAwesome5 name="check-circle" size={48} color={colors.success} solid />
      <Text style={[styles.emptyText, { marginTop: 12 }]}>Không có thông báo nào</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const { mutate: markAllRead, isPending: isMarking } = useMarkAllRead();
  const { mutate: markRead } = useMarkRead();

  const notifications: Notification[] = data?.data ?? data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
        <TouchableOpacity
          onPress={() => markAllRead()}
          disabled={isMarking}
          style={styles.markAllBtn}
        >
          {isMarking
            ? <ActivityIndicator size="small" color={colors.primary} />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="check" size={14} color={colors.primary} solid />
                <Text style={styles.markAllText}>Đọc tất cả</Text>
              </View>
            )
          }
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList<Notification>
          data={notifications}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <NotificationItem item={item} onMarkRead={markRead} />}
          ListEmptyComponent={<EmptyState />}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  markAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markAllText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 64,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemUnread: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  itemRead: {
    opacity: 0.6,
  },
  bellContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  itemLabelRead: {
    color: colors.textSecondary,
  },
  itemTime: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  markReadBtn: {
    padding: 4,
    marginLeft: 8,
    alignSelf: 'center',
  },
  markReadBtnText: {
    color: '#E85D04',
    fontSize: 18,
    fontWeight: '700',
  },
});
