import React, { useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useNotifications, useMarkAllRead, useMarkRead } from '../../hooks/useNotifications';
import { useColors } from '../../utils/theme';
import { navigateFromUrl } from '../../utils/navigation';
import { contentWide } from '../../utils/layout';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';

dayjs.extend(relativeTime);
// locale dayjs do store i18n quản lý (theo ngôn ngữ app) - không ép 'vi' ở đây.

interface NotificationItem {
  key: string;
  type: string;
  icon?: string;
  title: string;
  detail?: string;
  note?: string;
  severity?: 'urgent' | 'warn' | 'info';
  url?: string;
  action?: string;
  read: boolean;
  created_at?: string;
}

function getBellColors(severity: NotificationItem['severity'] | undefined, colors: any): { bg: string; icon: string } {
  switch (severity) {
    case 'urgent': return { bg: '#EF444422', icon: '#EF4444' };
    case 'warn':   return { bg: '#F59E0B22', icon: '#F59E0B' };
    case 'info':   return { bg: '#0EA5E922', icon: '#0EA5E9' };
    default:       return { bg: colors.surface, icon: colors.textSecondary };
  }
}

function NotifRow({
  item, onMarkRead, onNavigate, styles,
}: {
  item: NotificationItem;
  onMarkRead: (key: string) => void;
  onNavigate: (url?: string) => void;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  const colors = useColors();
  const bellColors = getBellColors(item.severity, colors);
  const timeStr = item.created_at ? dayjs(item.created_at).fromNow() : '';
  const hasLink = !!item.url;

  const handlePress = () => {
    if (!item.read) onMarkRead(item.key);
    if (hasLink) onNavigate(item.url);
  };

  return (
    <TouchableOpacity
      style={[styles.item, item.read ? styles.itemRead : styles.itemUnread]}
      onPress={handlePress}
      activeOpacity={hasLink ? 0.7 : 1}
    >
      <View style={[styles.bellContainer, { backgroundColor: bellColors.bg }]}>
        <FontAwesome5 name="bell" size={16} color={bellColors.icon} solid />
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, item.read && styles.itemReadText]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.detail ? (
          <Text style={styles.itemDetail} numberOfLines={1}>{item.detail}</Text>
        ) : null}
        {item.note ? (
          <Text style={styles.itemNote} numberOfLines={2}>{item.note}</Text>
        ) : null}
        {timeStr ? <Text style={styles.itemTime}>{timeStr}</Text> : null}
      </View>
      {!item.read ? (
        <TouchableOpacity
          onPress={() => onMarkRead(item.key)}
          style={styles.markReadBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <FontAwesome5 name="check" size={14} color={colors.primary} solid />
        </TouchableOpacity>
      ) : hasLink ? (
        <View style={styles.markReadBtn}>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyState({ styles }: { styles: ReturnType<typeof StyleSheet.create> }) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.emptyContainer}>
      <FontAwesome5 name="check-circle" size={48} color={colors.success} solid />
      <Text style={[styles.emptyText, { marginTop: 12 }]}>{t('notifications.empty')}</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const t = useT();
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    markAllBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    markAllText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingVertical: 8 },
    emptyList: { flex: 1 },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 64 },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 },
    itemUnread: { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.primary },
    itemRead: { opacity: 0.6 },
    bellContainer: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      marginRight: 12, marginTop: 1,
    },
    itemContent: { flex: 1 },
    itemTitle: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 2 },
    itemReadText: { color: colors.textSecondary, fontWeight: '400' },
    itemDetail: { color: colors.textSecondary, fontSize: 13, marginBottom: 2 },
    itemNote: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
    itemTime: { color: colors.textSecondary, fontSize: 12 },
    markReadBtn: { padding: 4, marginLeft: 8, alignSelf: 'center' },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyText: { color: colors.textSecondary, fontSize: 15 },
  });
  const navigation = useNavigation<any>();
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const { mutate: markAllRead, isPending: isMarking } = useMarkAllRead();
  const { mutate: markRead } = useMarkRead();

  const notifications: NotificationItem[] = data?.data ?? [];

  useFocusEffect(useCallback(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, []));

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <TouchableOpacity
          onPress={() => { markAllRead(); Notifications.setBadgeCountAsync(0).catch(() => {}); }}
          disabled={isMarking}
          style={styles.markAllBtn}
        >
          {isMarking
            ? <ActivityIndicator size="small" color={colors.primary} />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="check" size={13} color={colors.primary} solid />
                <Text style={styles.markAllText}>{t('notifications.mark_all_read')}</Text>
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
        <FlatList<NotificationItem>
          data={notifications}
          keyExtractor={(item, index) => item.key ?? `notif-${index}`}
          renderItem={({ item }) => (
            <NotifRow
              item={item}
              onMarkRead={markRead}
              onNavigate={(url) => navigateFromUrl(navigation, url ?? '')}
              styles={styles}
            />
          )}
          ListEmptyComponent={<EmptyState styles={styles} />}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={[notifications.length === 0 ? styles.emptyList : styles.list, contentWide]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}
