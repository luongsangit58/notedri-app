import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import RemindersScreen from '../reminders/RemindersScreen';
import HealthScreen from '../health/HealthScreen';
import { resolveDefaultVehicle } from '../../services/vehicles/resolveDefaultVehicle';

type Tab = 0 | 1;

export default function QuanLyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<Tab>(0);
  // Cho phep dieu huong tu Trang chu (vd bam Loi nhac) mo dung tab.
  // _ts thay doi moi lan navigate de effect chay lai ke ca khi tab lap lai gia tri.
  useEffect(() => {
    const tab = route.params?.tab;
    if (tab === 0 || tab === 1) setActiveTab(tab as Tab);
  }, [route.params?.tab, route.params?._ts]);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const t = useT();

  const TABS = [
    { label: t('management.tab_reminders'), icon: 'calendar-alt' },
    { label: t('management.tab_health'),    icon: 'heartbeat' },
  ];

  const childInsets = { top: 0, bottom: insets.bottom, left: insets.left, right: insets.right };

  // Rà soát 27/7 (đối chiếu web: nhóm "Quản lý" trên web gồm Sức khỏe + OBD2 +
  // Lời nhắc, còn mobile thiếu OBD2) - thêm mục OBD2 cho khớp nhóm với web.
  // KHÔNG làm 1 tab nội dung như 2 tab trên (OBDSetup là luồng nhiều bước gắn
  // với 1 xe cụ thể, không hợp để nhồi làm nội dung con tĩnh) - bấm vào là
  // điều hướng thẳng sang OBDSetup với xe mặc định (đúng quy ước is_default
  // mọi màn khác đã dùng), không đổi activeTab.
  async function goToObd() {
    const vehicle = await resolveDefaultVehicle();
    if (!vehicle) {
      navigation.navigate('AddVehicle');
      return;
    }
    navigation.navigate('OBDSetup', { vehicleId: vehicle.id, vehicleName: vehicle.ten });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((tab, i) => {
          const active = activeTab === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => setActiveTab(i as Tab)}
              style={styles.tabItem}
              activeOpacity={0.75}>
              <FontAwesome5
                name={tab.icon}
                size={13}
                color={active ? colors.primary : colors.textSecondary}
                solid
              />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {tab.label}
              </Text>
              {active && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
        {/* Mục OBD2 (shortcut, không phải tab nội dung - xem goToObd() ở trên) */}
        <TouchableOpacity onPress={goToObd} style={styles.tabItem} activeOpacity={0.75}>
          <FontAwesome5 name="microchip" size={13} color={colors.textSecondary} solid />
          <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>
            {t('management.tab_obd')}
          </Text>
          <FontAwesome5 name="external-link-alt" size={8} color={colors.textSecondary} style={{ position: 'absolute', top: 10, right: '28%' }} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <SafeAreaInsetsContext.Provider value={childInsets}>
        <View style={{ flex: 1 }}>
          {activeTab === 0 && <RemindersScreen />}
          {activeTab === 1 && <HealthScreen />}
        </View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    gap: 3,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
  },
});
