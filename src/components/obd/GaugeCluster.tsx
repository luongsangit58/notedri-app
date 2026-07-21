import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { ObdSnapshot } from '../../services/obd/ObdReader';
import { VehicleCapability } from '../../services/obd/capabilityService';
import { pickGaugeTheme, getSelectedGaugeThemeId, setSelectedGaugeThemeId, GAUGE_THEMES } from '../../utils/gaugeThemes';
import { useAuthStore } from '../../store/authStore';
import StatBox from './StatBox';
import GaugeThemePicker from './GaugeThemePicker';
import Dial from './Dial';

export default function GaugeCluster({
  snapshot, capability, isConnected,
}: {
  snapshot: ObdSnapshot | null;
  capability: VehicleCapability | null;
  isConnected: boolean;
}) {
  const t = useT();
  const colors = useColors();
  const dialSize = 190;

  // Theme chọn lưu ở AsyncStorage (chung toàn app, không theo xe) - đọc 1 lần
  // lúc mount; đổi theme trong GaugeThemePicker cập nhật cả state lẫn storage.
  const [themeId, setThemeId] = useState('default');
  useEffect(() => {
    getSelectedGaugeThemeId().then(setThemeId);
  }, []);
  // Kiểm tra lại is_premium NGAY LÚC HIỂN THỊ, không chỉ lúc chọn (GaugeThemePicker
  // chỉ chặn lúc CHỌN) - Premium hết hạn/bị huỷ sau khi đã chọn theme khoá, hoặc
  // storage bị chỉnh tay, đều phải rơi về theme mặc định thay vì tiếp tục dùng
  // theme trả phí miễn phí.
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const selectedTheme = pickGaugeTheme(themeId);
  const theme = selectedTheme.isPremiumOnly && !isPremium ? GAUGE_THEMES[0] : selectedTheme;
  const [pickerVisible, setPickerVisible] = useState(false);

  const secondaryTiles = [
    { pid: '05', el: <StatBox key="05" label={t('obd.stat_coolant')} value={snapshot?.coolantTempC ?? null} unit="°C" icon="thermometer-half" color="#EF4444" /> },
    { pid: '2F', el: <StatBox key="2F" label={t('obd.stat_fuel')} value={snapshot?.fuelLevelPct ?? null} unit="%" icon="gas-pump" color="#10B981" /> },
    { pid: '42', el: <StatBox key="42" label={t('obd.stat_voltage')} value={snapshot?.controlModuleVoltage ?? null} unit="V" icon="battery-full" color="#6366F1" /> },
    { pid: '11', el: <StatBox key="11" label={t('obd.stat_throttle')} value={snapshot?.throttlePct ?? null} unit="%" icon="sliders-h" color="#14B8A6" /> },
    { pid: '04', el: <StatBox key="04" label={t('obd.stat_engine_load')} value={snapshot?.engineLoadPct ?? null} unit="%" icon="fire" color="#F59E0B" /> },
    { pid: '5C', el: <StatBox key="5C" label={t('obd.stat_oil_temp')} value={snapshot?.oilTempC ?? null} unit="°C" icon="oil-can" color="#F97316" /> },
  ];
  const secondary = capability
    ? secondaryTiles.filter((tile) => capability.supportedPids.includes(tile.pid))
    : secondaryTiles;

  return (
    <View style={[styles.root, !isConnected && snapshot ? { opacity: 0.5 } : null]}>
      <TouchableOpacity
        onPress={() => setPickerVisible(true)}
        style={[styles.themeBtn, { backgroundColor: colors.card }]}
      >
        <FontAwesome5 name="palette" size={16} color={theme.accent} solid />
      </TouchableOpacity>

      <View style={styles.dialsRow}>
        <Dial value={snapshot?.speedKmh ?? null} min={0} max={220} label={t('obd.stat_speed')} unit="km/h" accent={theme.accent} size={dialSize} />
        <Dial value={snapshot?.rpm ?? null} min={0} max={8000} label="RPM" unit="rpm" accent="#8B5CF6" size={dialSize} />
      </View>
      {secondary.length > 0 && (
        <View style={styles.secondaryRow}>
          {secondary.map((tile) => tile.el)}
        </View>
      )}

      <GaugeThemePicker
        visible={pickerVisible}
        selectedId={theme.id}
        onClose={() => setPickerVisible(false)}
        onSelect={(id) => {
          setThemeId(id);
          setSelectedGaugeThemeId(id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  themeBtn: {
    position: 'absolute', top: 8, right: 8, zIndex: 1,
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  dialsRow: { flexDirection: 'row', gap: 24, justifyContent: 'center', flexWrap: 'wrap' },
  secondaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 640 },
});
