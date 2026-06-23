import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useNotifications, useMarkAllRead } from '../../hooks/useNotifications';
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
}

function getLabel(data: NotificationData): string {
  return data.message ?? data.title ?? data.body ?? '';
}

function NotificationItem({ item }: { item: Notification }) {
  const unread = item.read_at === null;
  const label = getLabel(item.data);
  const timeAgo = dayjs(item.created_at).fromNow();

  return (
    <View style={[styles.item, unread ? styles.itemUnread : styles.itemRead]}>
      <Text style={styles.bell}>🔔</Text>
      <View style={styles.itemContent}>
        <Text style={[styles.itemLabel, !unread && styles.itemLabelRead]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.itemTime}>{timeAgo}</Text>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>Không có thông báo nào</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const { mutate: markAllRead, isPending: isMarking } = useMarkAllRead();

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
            : <Text style={styles.markAllText}>Đọc tất cả</Text>
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
          renderItem={({ item }) => <NotificationItem item={item} />}
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
    marginLeft: 52,
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
  bell: {
    fontSize: 20,
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
});
