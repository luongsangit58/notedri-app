import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import RemindersScreen from '../reminders/RemindersScreen';
import HealthScreen from '../health/HealthScreen';

type Tab = 0 | 1;

export default function QuanLyScreen() {
  const route = useRoute<any>();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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
