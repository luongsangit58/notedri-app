import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { profileApi } from '../../api/profile';
import { colors } from '../../utils/colors';

function MenuItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress?: () => void; danger?: boolean }) {
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
      {!danger && <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
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
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Xoá tài khoản',
      'Toàn bộ dữ liệu xe, lịch sử và lời nhắc sẽ bị xoá vĩnh viễn. Không thể khôi phục.',
      [
        { text: 'Huỷ', style: 'cancel' },
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
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
            marginBottom: 14,
          }}>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>{initial}</Text>
          </View>
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
                  Premium
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>Không giới hạn lịch sử</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                Gói Miễn phí
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>2 xe • Lịch sử 12 tháng</Text>
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
            label="Chỉnh sửa hồ sơ"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon={<FontAwesome5 name="lock" size={16} color={colors.textSecondary} solid />}
            label="Đổi mật khẩu"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <MenuItem
            icon={<FontAwesome5 name="bell" size={16} color={colors.textSecondary} solid />}
            label="Thông báo"
            onPress={() => navigation.navigate('Notifications')}
          />
          <MenuItem
            icon={<FontAwesome5 name="chart-bar" size={16} color={colors.textSecondary} solid />}
            label="Báo cáo"
            onPress={() => navigation.navigate('Reports')}
          />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <MenuItem
            icon={<FontAwesome5 name="sign-out-alt" size={16} color={colors.error} solid />}
            label="Đăng xuất"
            danger
            onPress={handleLogout}
          />
        </View>

        <TouchableOpacity
          onPress={handleDeletePress}
          style={{ marginHorizontal: 16, marginBottom: 32, alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textDecorationLine: 'underline' }}>
            Xoá tài khoản
          </Text>
        </TouchableOpacity>

        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
          NoteDri · Quản lý xe thông minh
        </Text>
      </ScrollView>

      {/* Delete account confirmation modal */}
      <Modal visible={deleteModalVisible} transparent animationType="slide" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: colors.error, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>
              Xác nhận xoá tài khoản
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
