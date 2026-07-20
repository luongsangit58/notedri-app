import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

// Tab bar kiểu vRace: 4 tab + 1 nút FAB tròn nổi ở giữa (hành động thêm nhanh).
export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (screen: string, params?: any) => {
    setMenuOpen(false);
    (navigation as any).navigate(screen, params);
  };

  // Chèn FAB vào giữa: 2 tab trái | FAB | 2 tab phải
  const mid = Math.ceil(state.routes.length / 2);
  const left = state.routes.slice(0, mid);
  const right = state.routes.slice(mid);

  const renderTab = (route: typeof state.routes[number]) => {
    const idx = state.routes.findIndex((r) => r.key === route.key);
    const { options } = descriptors[route.key];
    const focused = state.index === idx;
    const color = focused ? colors.primary : colors.textSecondary;
    const label = (options.title ?? route.name) as string;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
    };

    const iconEl = options.tabBarIcon
      ? options.tabBarIcon({ focused, color, size: 22 })
      : null;

    return (
      <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.7}>
        <View style={{ opacity: focused ? 1 : 0.85 }}>{iconEl}</View>
        <Text style={{ color, fontSize: 10, fontWeight: focused ? '700' : '500', marginTop: 3 }} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.bar, {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }]}>
      {left.map(renderTab)}
      {/* khe giữa cho FAB */}
      <View style={styles.tab} />
      {right.map(renderTab)}

      {/* FAB căn giữa, nổi lên trên thanh */}
      <View pointerEvents="box-none" style={styles.fabWrap}>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          activeOpacity={0.85}
          style={[styles.fab, { backgroundColor: colors.primary, borderColor: colors.surface, shadowColor: colors.primary }]}>
          <FontAwesome5 name="plus" size={24} color={colors.primaryText} solid />
        </TouchableOpacity>
      </View>

      {/* Quick-add sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setMenuOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 24 + insets.bottom }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{t('tab_bar.quick_add')}</Text>
            <MenuItem icon="gas-pump" label={t('tab_bar.add_refuel')} onPress={() => go('AddRefuel')} />
            <MenuItem icon="road" label={t('tab_bar.update_odo')} onPress={() => go('AddOdometer')} />
            <MenuItem icon="route" label={t('tab_bar.gps_trip')} onPress={() => go('GpsTrips')} />
            <MenuItem icon="wrench" label={t('tab_bar.add_service')} onPress={() => go('AddService')} />
            <MenuItem icon="bell" label={t('tab_bar.add_reminder')} onPress={() => go('AddReminder')} last />
            <TouchableOpacity onPress={() => setMenuOpen(false)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, label, onPress, last }: { icon: string; label: string; onPress: () => void; last?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: last ? 0 : 10 }}>
      <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
        <FontAwesome5 name={icon} size={20} color={colors.primary} solid />
      </View>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
  },
  tab: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fabWrap: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    elevation: 8,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
