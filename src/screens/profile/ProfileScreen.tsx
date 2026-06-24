import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { profileApi } from '../../api/profile';
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
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore();
  const { lang, setLang } = useI18nStore();
  const t = useT();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const { mutate: deleteAccount, isPending: isDeleting } = useMutation({
    mutationFn: () => profileApi.deleteAccount(deletePassword),
    onSuccess: () => {
      setDeleteModalVisible(false);
      logout();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.errors?.password?.[0]
        ?? err?.response?.data?.message
        ?? 'Có lỗi xảy ra.';
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
      'Toàn bộ dữ liệu xe, lịch sử và lời nhắc sẽ bị xoá vĩnh viễn. Không thể khôi phục.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Tiếp tục', style: 'destructive', onPress: () => { setDeletePassword(''); setDeleteError(''); setDeleteModalVisible(true); } },
      ],
    );
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? 'U';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView>
        {/* Avatar */}
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          {user?.avatar ? (
            <Image
              source={{ uri: user.avatar }}
              style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 14 }}
            />
          ) : (
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
              marginBottom: 14,
            }}>
              <Text style={{ color: colors.primaryText, fontSize: 34, fontWeight: '800' }}>{initial}</Text>
            </View>
          )}
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{user?.name}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 14 }}>{user?.email}</Text>
        </View>

        {/* Plan badge */}
        <View style={{
          backgroundColor: colors.surface, borderRadius: 12, padding: 12,
          marginHorizontal: 16, marginBottom: 12,
        }}>
          {user?.is_premium ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <FontAwesome5 name="crown" size={10} color="#F59E0B" solid />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#F59E0B', marginLeft: 6 }}>
                  {t('profile.premium_plan')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t('profile.premium_plan_desc')}</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                {t('profile.free_plan')}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t('profile.free_plan_desc')}</Text>
            </>
          )}
          {user?.vehicle_limit != null && (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
              Giới hạn xe: {user.vehicle_limit} xe
            </Text>
          )}
        </View>

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
            label="Ngôn ngữ / Language"
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
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: colors.error, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
              {t('auth.delete_account')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20, lineHeight: 18 }}>
              Nhập mật khẩu để xác nhận. Hành động này không thể hoàn tác.
            </Text>
            <TextInput
              value={deletePassword}
              onChangeText={v => { setDeletePassword(v); setDeleteError(''); }}
              secureTextEntry
              placeholder="Mật khẩu của bạn"
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
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Xoá tài khoản vĩnh viễn</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
