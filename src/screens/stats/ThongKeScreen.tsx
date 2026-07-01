import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import TimelineScreen from '../timeline/TimelineScreen';
import ReportsScreen from '../reports/ReportsScreen';
import GpsTripsScreen from '../trips/GpsTripsScreen';

type Tab = 0 | 1 | 2;

const TABS = [
  { labelKey: 'stats.tab_timeline', icon: 'history' },
  { labelKey: 'stats.tab_reports',  icon: 'chart-bar' },
  { labelKey: 'stats.tab_trips',    icon: 'route' },
] as const;

export default function ThongKeScreen() {
  const [activeTab, setActiveTab] = useState<Tab>(0);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const tr = useT();

  // Override top inset to 0 for child screens — this wrapper already
  // consumes the status-bar height via paddingTop on the tab bar container.
  const childInsets = { top: 0, bottom: insets.bottom, left: insets.left, right: insets.right };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tab bar - owns the top safe area */}
      <View style={[styles.tabBar, { paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((t, i) => {
          const active = activeTab === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => setActiveTab(i as Tab)}
              style={styles.tabItem}
              activeOpacity={0.75}>
              <FontAwesome5
                name={t.icon}
                size={13}
                color={active ? colors.primary : colors.textSecondary}
                solid
              />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {tr(t.labelKey as any)}
              </Text>
              {active && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content - children see top inset = 0 */}
      <SafeAreaInsetsContext.Provider value={childInsets}>
        <View style={{ flex: 1 }}>
          {activeTab === 0 && <TimelineScreen />}
          {activeTab === 1 && <ReportsScreen />}
          {activeTab === 2 && <GpsTripsScreen embedded />}
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
