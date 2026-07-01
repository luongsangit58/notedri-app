import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal, TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../store/authStore';
import { profileApi } from '../../api/profile';
import { authApi } from '../../api/auth';
import { achievementsApi } from '../../api/achievements';
import { BASE_URL } from '../../utils/api';
import { useColors, useThemeStore } from '../../utils/theme';
import { useI18nStore, useLang, useT } from '../../i18n';

function MenuItem({ icon, label, onPress, danger, right }: { icon: React.ReactNode; label: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
      <View style={{ width: 28, alignItems: 'center', marginRight: 14 }}>
        {icon}
      </View>
      <Text style={{ flex: 1, color: danger ? colors.error : colors.text, fontSize: 15 }}>{label}</Text>
      {right ?? (!danger && <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>)}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout, token, setUser } = useAuthStore();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore();
  const { lang, setLang } = useI18nStore();
  const t = useT();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const hasGoogle: boolean = (user as any)?.has_google ?? false;
  const hasPassword: boolean = (user as any)?.has_password ?? true;

  // Liên kết Google: mở OAuth kèm link_token -> callback gắn Google vào tài khoản này.
  const handleLinkGoogle = async () => {
    try {
      const url = `${BASE_URL}/auth/google/mobile?link_token=${encodeURIComponent(token ?? '')}`;
      const result = await WebBrowser.openAuthSessionAsync(url, 'notedri://auth', { preferEphemeralSession: true });
      if (result.type !== 'success') return;
      const params = new URLSearchParams(result.url.split('?')[1] ?? '');
      if (params.get('error')) { Alert.alert(t('common.error'), decodeURIComponent(params.get('error')!)); return; }
      if (params.get('linked')) {
        const me = await authApi.me();
        setUser({ ...(user ?? {}), ...(me.data?.data ?? me.data) });
        Alert.alert(t('profile.google_linked_title'), t('profile.google_linked_msg'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('common.error_generic'));
    }
  };

  const handleUnlinkGoogle = () => {
    if (!hasPassword) {
      Alert.alert(t('profile.google_unlink_need_pw_title'), t('profile.google_unlink_need_pw_msg'));
      return;
    }
    Alert.alert(t('profile.google_unlink_confirm_title'), t('profile.google_unlink_confirm_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.google_unlink'), style: 'destructive', onPress: async () => {
        try {
          const res = await authApi.unlinkGoogle();
          setUser({ ...(user ?? {}), ...(res.data?.data ?? res.data) });
        } catch (e: any) {
          Alert.alert(t('common.error'), e?.response?.data?.message ?? t('common.error_generic'));
        }
      } },
    ]);
  };

  // Level (huy hiệu) để hiện tinh tế quanh avatar.
  const { data: ach } = useQuery({ queryKey: ['achievements'], queryFn: () => achievementsApi.get().then(r => r.data?.data) });
  const level = ach?.level;
  const lvColor = level?.color && String(level.color).startsWith('#') ? String(level.color) : '#f59e0b';

  const { mutate: deleteAccount, isPending: isDeleting } = useMutation({
    mutationFn: () => profileApi.deleteAccount(deletePassword),
    onSuccess: () => {
      setDeleteModalVisible(false);
      logout();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.errors?.password?.[0]
        ?? err?.response?.data?.message
        ?? t('common.error_occurred');
      setDeleteError(msg);
    },
  });

  const handleLogout = () => {
    Alert.alert(t('auth.logout'), t('profile.logout_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.logout'), style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeletePress = () => {
    Alert.alert(
      t('auth.delete_account'),
      t('profile.delete_account_warning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.continue'), style: 'destructive', onPress: () => { setDeletePassword(''); setDeleteError(''); setDeleteModalVisible(true); } },
      ],
    );
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? 'U';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <ScrollView>
        {/* Avatar + vòng level (chạm để xem Thành tích) */}
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Achievements')} style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ padding: 3, borderRadius: 47, borderWidth: 2.5, borderColor: lvColor }}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
              ) : (
                <View style={{
                  width: 80, height: 80, borderRadius: 40,
                  backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
                }}>
                  <Text style={{ color: colors.primaryText, fontSize: 34, fontWeight: '800' }}>{initial}</Text>
                </View>
              )}
            </View>
            {level && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: lvColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
                marginTop: -12, borderWidth: 2, borderColor: colors.background,
              }}>
                <FontAwesome5 name={level.icon || 'star'} size={10} color="#fff" solid />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>LV.{level.level} · {level.name}</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{user?.name}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 14 }}>{user?.email}</Text>

          {/* Plan pill - dong bo phong cach chip thanh tich (bam de xem/nang cap) */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Premium')} style={{ marginTop: 12 }}>
            {user?.is_premium ? (
              <LinearGradient
                colors={['#fbbf24', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                <FontAwesome5 name="crown" size={11} color="#fff" solid />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{t('profile.premium_plan')}</Text>
              </LinearGradient>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <FontAwesome5 name="leaf" size={11} color={colors.primary} solid />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{t('profile.free_plan')}</Text>
                <FontAwesome5 name="arrow-right" size={9} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
          {user?.vehicle_limit != null && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
              {t('profile.vehicle_limit', { n: user.vehicle_limit })}
            </Text>
          )}
        </View>

        {/* Hồ sơ hoàn chỉnh (khớp web) - 100% thì hiện trạng thái hoàn tất, không cho bấm nữa */}
        {(() => {
          const fields = [user?.name, (user as any)?.phone, (user as any)?.tinh, (user as any)?.dia_chi, user?.avatar];
          const pct = Math.round((fields.filter(Boolean).length / fields.length) * 100);
          const done = pct === 100;
          const barColor = done ? colors.success : colors.primary;
          const cardStyle = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: done ? colors.success + '55' : colors.border };
          const inner = (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('profile.completeness_title')}</Text>
                {done ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <FontAwesome5 name="check-circle" size={13} color={colors.success} solid />
                    <Text style={{ color: colors.success, fontSize: 14, fontWeight: '800' }}>100%</Text>
                  </View>
                ) : (
                  <Text style={{ color: barColor, fontSize: 14, fontWeight: '800' }}>{pct}%</Text>
                )}
              </View>
              <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor }} />
              </View>
              {!done && (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>{t('profile.completeness_hint')}</Text>
              )}
            </>
          );
          return done ? (
            <View style={cardStyle}>{inner}</View>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('EditProfile')} style={cardStyle}>{inner}</TouchableOpacity>
          );
        })()}

        {/* Menu items */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <MenuItem
            icon={<FontAwesome5 name="pen" size={16} color={colors.textSecondary} solid />}
            label={t('profile.edit')}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon={<FontAwesome5 name="lock" size={16} color={colors.textSecondary} solid />}
            label={t('profile.change_password')}
            onPress={() => navigation.navigate('ChangePassword')}
          />
          {/* Liên kết / Gỡ liên kết Google */}
          <MenuItem
            icon={<FontAwesome5 name="google" size={16} color={hasGoogle ? '#EA4335' : colors.textSecondary} solid />}
            label={hasGoogle ? t('profile.google_unlink') : t('profile.google_link')}
            onPress={hasGoogle ? handleUnlinkGoogle : handleLinkGoogle}
            right={hasGoogle ? <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600' }}>{t('profile.google_linked_badge')}</Text> : undefined}
          />
          <MenuItem
            icon={<FontAwesome5 name="mobile-alt" size={16} color={colors.textSecondary} solid />}
            label={t('devices.title')}
            onPress={() => navigation.navigate('Devices')}
          />
          <MenuItem
            icon={<FontAwesome5 name="bell" size={16} color={colors.textSecondary} solid />}
            label={t('profile.notifications')}
            onPress={() => navigation.navigate('Notifications')}
          />
          <MenuItem
            icon={<FontAwesome5 name="cog" size={16} color={colors.textSecondary} solid />}
            label={t('profile.notification_settings')}
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuItem
            icon={<FontAwesome5 name="chart-bar" size={16} color={colors.textSecondary} solid />}
            label={t('profile.reports')}
            onPress={() => navigation.navigate('Reports')}
          />
          <MenuItem
            icon={<FontAwesome5 name="medal" size={16} color="#F59E0B" solid />}
            label={t('profile.achievements')}
            onPress={() => navigation.navigate('Achievements')}
          />
          <MenuItem
            icon={<FontAwesome5 name="crown" size={16} color="#F59E0B" solid />}
            label={t('profile.premium')}
            onPress={() => navigation.navigate('Premium')}
          />
          <MenuItem
            icon={<FontAwesome5 name="comment-alt" size={16} color={colors.textSecondary} solid />}
            label={t('profile.feedback')}
            onPress={() => navigation.navigate('Feedback')}
          />
          <MenuItem
            icon={<FontAwesome5 name="download" size={16} color={colors.textSecondary} solid />}
            label={t('profile.export')}
            onPress={() => navigation.navigate('ExportData')}
          />
          <MenuItem
            icon={<FontAwesome5 name="info-circle" size={16} color={colors.textSecondary} solid />}
            label={t('profile.about')}
            onPress={() => navigation.navigate('About')}
          />
        </View>

        {/* Appearance & Language */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <MenuItem
            icon={<FontAwesome5 name={themeMode === 'dark' ? 'moon' : 'sun'} size={16} color={colors.textSecondary} solid />}
            label={themeMode === 'dark' ? t('profile.dark_mode') : t('profile.light_mode')}
            onPress={() => toggleTheme()}
            right={
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                backgroundColor: themeMode === 'dark' ? '#333' : '#E5E7EB',
              }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                  {themeMode === 'dark' ? t('profile.dark_mode') : t('profile.light_mode')}
                </Text>
              </View>
            }
          />
          <MenuItem
            icon={<FontAwesome5 name="language" size={16} color={colors.textSecondary} solid />}
            label={t('profile.language')}
            onPress={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            right={
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                backgroundColor: colors.primary + '22',
              }}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                  {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
                </Text>
              </View>
            }
          />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <MenuItem
            icon={<FontAwesome5 name="sign-out-alt" size={16} color={colors.error} solid />}
            label={t('auth.logout')}
            danger
            onPress={handleLogout}
          />
        </View>

        <TouchableOpacity
          onPress={handleDeletePress}
          style={{ marginHorizontal: 16, marginBottom: 32, alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textDecorationLine: 'underline' }}>
            {t('auth.delete_account')}
          </Text>
        </TouchableOpacity>

        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
          {t('profile.footer')}
        </Text>
      </ScrollView>

      {/* Delete account confirmation modal */}
      <Modal visible={deleteModalVisible} transparent animationType="slide" onRequestClose={() => setDeleteModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: colors.error, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
              {t('auth.delete_account')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20, lineHeight: 18 }}>
              {t('profile.delete_account_password_prompt')}
            </Text>
            <TextInput
              value={deletePassword}
              onChangeText={v => { setDeletePassword(v); setDeleteError(''); }}
              secureTextEntry
              placeholder={t('profile.your_password')}
              placeholderTextColor={colors.textSecondary}
              style={{
                backgroundColor: colors.background, color: colors.text,
                borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 8,
                borderWidth: 1, borderColor: deleteError ? colors.error : colors.border,
              }}
            />
            {!!deleteError && (
              <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8 }}>{deleteError}</Text>
            )}
            <TouchableOpacity
              onPress={() => deleteAccount()}
              disabled={isDeleting || !deletePassword}
              style={{
                backgroundColor: colors.error, borderRadius: 10,
                paddingVertical: 14, alignItems: 'center', marginTop: 4,
                opacity: isDeleting || !deletePassword ? 0.5 : 1,
              }}>
              {isDeleting
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('profile.delete_account_confirm_button')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
