import React from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../utils/colors';

function MenuItem({ icon, label, onPress, danger }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
      <Text style={{ fontSize: 18, marginRight: 14 }}>{icon}</Text>
      <Text style={{ flex: 1, color: danger ? colors.error : colors.text, fontSize: 15 }}>{label}</Text>
      {!danger && <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
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

        {/* Menu items */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <MenuItem icon="✏️" label="Chỉnh sửa hồ sơ" onPress={() => navigation.navigate('EditProfile')} />
          <MenuItem icon="🔔" label="Thông báo" onPress={() => navigation.navigate('Notifications')} />
          <MenuItem icon="📊" label="Báo cáo" onPress={() => navigation.navigate('Reports')} />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 32 }}>
          <MenuItem icon="🚪" label="Đăng xuất" danger onPress={handleLogout} />
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
          NoteDri · Quản lý xe thông minh
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
