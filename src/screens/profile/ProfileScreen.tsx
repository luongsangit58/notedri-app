import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../utils/colors';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <View style={{ padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
          }}>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{user?.name}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{user?.email}</Text>
        </View>

        {/* TODO: Add profile edit, notification settings, app version */}

        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: '#4A1010', padding: 16, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.error, fontWeight: '700', fontSize: 16 }}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
