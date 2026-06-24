import React, { useState, useEffect } from 'react';
import {
  View, Text, Switch, ScrollView, Alert, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

type ReminderLevel = 'all' | 'urgent' | 'off';

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();

  const LEVEL_OPTIONS: { key: ReminderLevel; label: string; desc: string }[] = [
    { key: 'all',    label: t('notification_settings.level_all'),    desc: t('notification_settings.level_all_desc') },
    { key: 'urgent', label: t('notification_settings.level_urgent'), desc: t('notification_settings.level_urgent_desc') },
    { key: 'off',    label: t('notification_settings.level_off'),    desc: t('notification_settings.level_off_desc') },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () =>
      client.get('/profile/notification-settings').then(r => r.data?.data ?? r.data),
  });

  const [notifyReminders, setNotifyReminders] = useState<boolean>(true);
  const [reminderLevel, setReminderLevel] = useState<ReminderLevel>('all');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setNotifyReminders(data.notify_reminders ?? true);
      setReminderLevel(data.reminder_level ?? 'all');
      setDirty(false);
    }
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      client.put('/profile/notification-settings', {
        notify_reminders: notifyReminders,
        reminder_level: reminderLevel,
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['notification-settings'] });
      Alert.alert(t('notification_settings.saved_title'), t('notification_settings.save_success'));
    },
    onError: () => Alert.alert(t('common.error'), t('notification_settings.error_save')),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Toggle nhắc nhở */}
        <View style={{
          backgroundColor: colors.surface, borderRadius: 14, padding: 16,
          flexDirection: 'row', alignItems: 'center', marginBottom: 20,
        }}>
          <View style={{ marginRight: 14 }}>
            <FontAwesome5 name="bell" size={20} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              {t('notification_settings.reminders_toggle_label')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {t('notification_settings.reminders_toggle_desc')}
            </Text>
          </View>
          <Switch
            value={notifyReminders}
            onValueChange={v => { setNotifyReminders(v); setDirty(true); }}
            trackColor={{ false: '#3A3A3A', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Reminder level — only visible when enabled */}
        {notifyReminders && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              {t('notification_settings.level_title')}
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }}>
              {LEVEL_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => { setReminderLevel(opt.key); setDirty(true); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: 14,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border,
                  }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{opt.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                  </View>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    borderWidth: 2, borderColor: reminderLevel === opt.key ? colors.primary : colors.border,
                    backgroundColor: reminderLevel === opt.key ? colors.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {reminderLevel === opt.key && (
                      <FontAwesome5 name="check" size={10} color="#fff" solid />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Save button */}
        <TouchableOpacity
          onPress={() => save()}
          disabled={!dirty || isPending}
          style={{
            backgroundColor: colors.primary, borderRadius: 12,
            paddingVertical: 15, alignItems: 'center',
            opacity: !dirty || isPending ? 0.4 : 1,
          }}>
          {isPending
            ? <ActivityIndicator color={colors.primaryText} />
            : <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>{t('notification_settings.save_button')}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
