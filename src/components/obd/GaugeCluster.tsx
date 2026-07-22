import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { ObdSnapshot } from '../../services/obd/ObdReader';
import { FastSnapshot } from '../../services/obd/obdLiveMonitor';
import { VehicleCapability } from '../../services/obd/capabilityService';
import { OBD_METRICS, filterSupportedMetrics, readMetricValue } from '../../constants/obdMetrics';
import { pickDashboardStyle, getSelectedDashboardStyleId, setSelectedDashboardStyleId, DASHBOARD_STYLES } from '../../constants/dashboardStyles';
import { useCockpitLayout } from '../../hooks/useCockpitLayout';
import { useAuthStore } from '../../store/authStore';
import DashboardStylePicker from './DashboardStylePicker';

export default function GaugeCluster({
  vehicleId, vehicleName, snapshot, fastSnapshot, capability, isConnected,
}: {
  vehicleId: number;
  vehicleName?: string;
  snapshot: ObdSnapshot | null;
  // Tầng poll nhanh (500ms, RAW không làm mượt) - kim đồng hồ đỡ trễ so với
  // snapshot tầng medium (3s + EWMA). Optional vì màn khác (vd
  // VehicleDetailScreen mở picker style) không có nguồn này.
  fastSnapshot?: FastSnapshot | null;
  capability: VehicleCapability | null;
  isConnected: boolean;
}) {
  const colors = useColors();
  const layout = useCockpitLayout();

  // Style chọn lưu ở AsyncStorage THEO TỪNG XE - đọc lại mỗi khi vehicleId đổi;
  // đổi style trong DashboardStylePicker cập nhật cả state lẫn storage của xe này.
  const [styleId, setStyleId] = useState(DASHBOARD_STYLES[0].id as string);
  useEffect(() => {
    getSelectedDashboardStyleId(vehicleId).then(setStyleId);
  }, [vehicleId]);
  // Kiểm tra lại is_premium NGAY LÚC HIỂN THỊ, không chỉ lúc chọn - Premium hết
  // hạn/bị huỷ sau khi đã chọn style khoá, hoặc storage bị chỉnh tay, đều phải
  // rơi về style mặc định thay vì tiếp tục dùng style trả phí miễn phí.
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const selectedStyle = pickDashboardStyle(styleId);
  const style = selectedStyle.isPremiumOnly && !isPremium ? DASHBOARD_STYLES[0] : selectedStyle;
  const [pickerVisible, setPickerVisible] = useState(false);

  // Ưu tiên fastSnapshot (500ms, raw) cho tốc độ/vòng tua - rơi về snapshot
  // (3s) khi chưa có mẫu fast nào (vừa kết nối, hoặc không truyền prop này).
  const supported = filterSupportedMetrics(OBD_METRICS, capability?.supportedPids ?? null);
  const metrics = supported.map((def) => {
    const fromFast = def.key === 'speedKmh' ? fastSnapshot?.speedKmh : def.key === 'rpm' ? fastSnapshot?.rpm : undefined;
    const value = fromFast ?? readMetricValue(snapshot, def.key);
    return { def, value };
  });

  const Layout = style.Layout;

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => setPickerVisible(true)}
        style={[styles.styleBtn, { backgroundColor: colors.card }]}
      >
        <FontAwesome5 name="palette" size={16} color={style.previewColor} solid />
      </TouchableOpacity>

      {/* ScrollView thay vì View cố định flex:1 - gaugeSize co theo màn hình
          rồi nhưng vẫn cần cuộn dự phòng cho màn landscape rất thấp/nhiều PID
          phụ cùng lúc, tránh cắt mất nội dung mà không có cách nào xem tiếp. */}
      <ScrollView
        contentContainerStyle={[styles.root, !isConnected && snapshot ? { opacity: 0.5 } : null]}
      >
        <Layout
          metrics={metrics}
          size={layout.gaugeSize}
          ringSize={layout.ringSize}
          isPortrait={layout.isPortrait}
          animate
        />
      </ScrollView>

      <DashboardStylePicker
        visible={pickerVisible}
        selectedId={style.id}
        vehicleName={vehicleName}
        onClose={() => setPickerVisible(false)}
        onSelect={(id) => {
          setStyleId(id);
          setSelectedDashboardStyleId(vehicleId, id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  styleBtn: {
    position: 'absolute', top: 8, right: 8, zIndex: 1,
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
});
