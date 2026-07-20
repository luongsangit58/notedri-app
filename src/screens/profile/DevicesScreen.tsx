import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { devicesApi, DeviceSession } from '../../api/devices';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

function PlatformIcon({ platform }: { platform: string }) {
  const icon = platform === 'ios' ? 'apple' : platform === 'android' ? 'android' : 'mobile-alt';
  const colors = useColors();
  return <FontAwesome5 name={icon} size={18} color={colors.textSecondary} />;
}

export default function DevicesScreen() {
  const nav = useNavigation<any>();
  const colors = useColors();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['device-sessions'],
    queryFn: () => devicesApi.list().then(r => r.data.data),
  });

  const logoutMut = useMutation({
    mutationFn: (id: number) => devicesApi.logout(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device-sessions'] }),
  });

  const logoutAllMut = useMutation({
    mutationFn: () => devicesApi.logoutAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device-sessions'] }),
  });

  const setPrimaryMut = useMutation({
    mutationFn: (id: number) => devicesApi.setPrimary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device-sessions'] }),
  });

  const t = useT();

  function confirmLogout(session: DeviceSession) {
    Alert.alert(
      t('auth.logout'),
      t('devices.logout_confirm', { name: session.device_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logout'),
          style: 'destructive',
          onPress: () => logoutMut.mutate(session.id),
        },
      ]
    );
  }

  function confirmLogoutAll() {
    Alert.alert(
      t('auth.logout'),
      t('devices.logout_confirm', { name: t('common.all') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.logout'), style: 'destructive', onPress: () => logoutAllMut.mutate() },
      ]
    );
  }

  function formatLastSeen(ts: string | null) {
    if (!ts) return t('devices.last_seen_unknown');
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return t('devices.last_seen_just_now');
    if (diff < 3600) return t('devices.last_seen_minutes', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('devices.last_seen_hours', { n: Math.floor(diff / 3600) });
    return t('devices.last_seen_days', { n: Math.floor(diff / 86400) });
  }

  const sessions: DeviceSession[] = Array.isArray(data) ? data : [];
  const hasOthers = sessions.some(s => !s.is_current);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <AppBgPattern />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 4 }}>
          <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('devices.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

          {/* Thông tin */}
          <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <FontAwesome5 name="info-circle" size={13} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, marginLeft: 8, lineHeight: 18 }}>
              {t('devices.info')}
            </Text>
          </View>

          {/* Danh sách thiết bị */}
          {sessions.map(session => (
            <View
              key={session.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: session.is_current ? colors.primary + '66' : colors.border,
                },
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
                  <PlatformIcon platform={session.platform} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                      {session.device_name}
                    </Text>
                    {session.is_current && (
                      <View style={[styles.chip, { backgroundColor: colors.primary + '22' }]}>
                        <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>{t('devices.this_device')}</Text>
                      </View>
                    )}
                    {session.is_gps_primary && (
                      <FontAwesome5 name="star" size={11} color="#f59e0b" solid />
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <View style={[styles.dot, { backgroundColor: session.is_online ? '#10b981' : colors.border }]} />
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {session.is_online ? t('devices.active_now') : formatLastSeen(session.last_seen_at)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {!session.is_gps_primary && (
                  <TouchableOpacity
                    onPress={() => setPrimaryMut.mutate(session.id)}
                    style={[styles.actionBtn, { borderColor: '#f59e0b' }]}
                    disabled={setPrimaryMut.isPending}>
                    <FontAwesome5 name="star" size={11} color="#f59e0b" />
                    <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>{t('devices.gps_primary')}</Text>
                  </TouchableOpacity>
                )}
                {!session.is_current && (
                  <TouchableOpacity
                    onPress={() => confirmLogout(session)}
                    style={[styles.actionBtn, { borderColor: '#ef4444' }]}
                    disabled={logoutMut.isPending}>
                    <FontAwesome5 name="sign-out-alt" size={11} color="#ef4444" />
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>{t('auth.logout')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}

          {sessions.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
              {t('devices.empty')}
            </Text>
          )}

          {/* Logout all */}
          {hasOthers && (
            <TouchableOpacity
              onPress={confirmLogoutAll}
              style={[styles.logoutAllBtn, { borderColor: '#ef4444' }]}
              disabled={logoutAllMut.isPending}>
              {logoutAllMut.isPending
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <FontAwesome5 name="sign-out-alt" size={13} color="#ef4444" />}
              <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
                {t('devices.logout_all_others')}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10,
    padding: 12, marginBottom: 16, borderWidth: 1,
  },
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  chip: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  logoutAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 8,
  },
});
