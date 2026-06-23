import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../../utils/colors';
import Constants from 'expo-constants';

const version = Constants.expoConfig?.version ?? '1.0.0';

function LinkRow({ icon, label, url }: { icon: string; label: string; url: string }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url)}
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
      <FontAwesome5 name={icon} size={15} color={colors.textSecondary} solid style={{ width: 24, marginRight: 14 }} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{label}</Text>
      <FontAwesome5 name="external-link-alt" size={12} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Logo / Brand */}
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 20,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <FontAwesome5 name="car-side" size={36} color="#fff" solid />
          </View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 26, letterSpacing: -0.5 }}>
            Note<Text style={{ color: colors.primary }}>Dri</Text>
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            Phiên bản {version}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            Quản lý xe thông minh, dành cho người Việt
          </Text>
        </View>

        {/* Links */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <LinkRow icon="globe" label="Website" url="https://notedri.com" />
          <LinkRow icon="shield-alt" label="Chính sách bảo mật" url="https://notedri.com/privacy" />
          <LinkRow icon="file-contract" label="Điều khoản sử dụng" url="https://notedri.com/terms" />
        </View>

        {/* Features summary */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 12 }}>
            Tính năng chính
          </Text>
          {[
            { icon: 'gas-pump',   text: 'Theo dõi đổ xăng & tiêu hao nhiên liệu' },
            { icon: 'tools',      text: 'Nhật ký bảo dưỡng & lịch nhắc nhở' },
            { icon: 'heartbeat',  text: 'Chẩn đoán sức khoẻ xe tự động' },
            { icon: 'chart-bar',  text: 'Báo cáo chi phí theo năm' },
            { icon: 'road',       text: 'Theo dõi ODO & lịch sử hành trình' },
            { icon: 'folder-open', text: 'Hồ sơ xe kỹ thuật số' },
          ].map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FontAwesome5 name={f.icon} size={13} color={colors.primary} solid style={{ width: 18 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginHorizontal: 24 }}>
          NoteDri được phát triển bởi Miichisoft.{'\n'}
          Mọi dữ liệu xe được lưu trữ bảo mật trên máy chủ của bạn.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
