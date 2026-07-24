import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useCockpitThemeStore } from '../../store/cockpitThemeStore';
import { ObdSnapshot } from '../../services/obd/ObdReader';
import { FastSnapshot } from '../../services/obd/obdLiveMonitor';
import { VehicleCapability } from '../../services/obd/capabilityService';
import { OBD_METRICS, filterSupportedMetrics, readMetricValue, quantizeValue } from '../../constants/obdMetrics';
import { pickDashboardStyle, getSelectedDashboardStyleId, setSelectedDashboardStyleId, isStyleUsable, DASHBOARD_STYLES } from '../../constants/dashboardStyles';
import { useCockpitLayout } from '../../hooks/useCockpitLayout';
import { useAuthStore } from '../../store/authStore';
import NotedriPip from '../../../modules/notedri-pip/src/NotedriPipModule';
import DashboardStylePicker from './DashboardStylePicker';
import CockpitClock from './CockpitClock';
import CockpitWeather from './CockpitWeather';

export default function GaugeCluster({
  vehicleId, vehicleName, snapshot, fastSnapshot, capability, isConnected, onBack, onDisconnect,
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
  // Rà soát (góp ý user: chưa full màn hình trên đầu Android ô tô, header
  // riêng của OBDDashboardScreen vẫn đứng TRÊN toolbar này thành 2 hàng chrome
  // chồng nhau) - back/ngắt kết nối chuyển thành props, gộp vào ĐÚNG 1 hàng
  // toolbar sẵn có thay vì OBDDashboardScreen tự vẽ thêm 1 header riêng.
  onBack: () => void;
  onDisconnect: () => void;
}) {
  const colors = useColors();
  const layout = useCockpitLayout();
  const cockpitMode = useCockpitThemeStore((s) => s.mode);
  const toggleCockpitMode = useCockpitThemeStore((s) => s.toggle);

  // Nút PiP thủ công (rà soát 24/7: user báo PiP tự động vẫn chưa thấy hoạt
  // động trên đầu Android ô tô cụ thể của họ) - không thể chẩn đoán từ xa liệu
  // là lỗi code hay ROM/kiosk của đầu xe khoá multi-window ở tầng hệ điều
  // hành. Thêm lối bấm thẳng để tự kiểm chứng ngay trên máy đó: bấm mà vẫn
  // không thu nhỏ được thì kết luận được đây là giới hạn phần cứng/ROM, thu
  // nhỏ được thì xác nhận lỗi nằm ở đường tự động (onUserLeaveHint/auto-enter).
  const [pipSupported, setPipSupported] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NotedriPip.isPipSupported().then(setPipSupported).catch(() => {});
  }, []);

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
  const style = isStyleUsable(selectedStyle, isPremium) ? selectedStyle : DASHBOARD_STYLES[0];
  const [pickerVisible, setPickerVisible] = useState(false);

  // Ưu tiên fastSnapshot (500ms, raw) cho tốc độ/vòng tua - rơi về snapshot
  // (3s) khi chưa có mẫu fast nào (vừa kết nối, hoặc không truyền prop này).
  const supported = filterSupportedMetrics(OBD_METRICS, capability?.supportedPids ?? null);
  const metrics = supported.map((def) => {
    const fromFast = def.key === 'speedKmh' ? fastSnapshot?.speedKmh : def.key === 'rpm' ? fastSnapshot?.rpm : undefined;
    const rawValue = fromFast ?? readMetricValue(snapshot, def.key);
    // Làm tròn về bậc `quantizeStep` (vd RPM -> bội số 50) NGAY TẠI NGUỒN -
    // 1 chỗ duy nhất, áp dụng cho mọi style thay vì sửa riêng từng Layout.
    const value = quantizeValue(rawValue, def.quantizeStep);
    return { def, value };
  });

  const Layout = style.Layout;

  return (
    <View style={{ flex: 1 }}>
      {/* Rà soát (góp ý user: nút đổi style nổi đè lên góc trên-phải, có style
          (Racing) đặt số liệu ngay góc đó nên bị nút che mất) - đưa nút ra 1
          HÀNG TOOLBAR riêng phía trên thay vì đè (absolute) lên khung đồng hồ.
          Không còn overlap với BẤT KỲ style nào (kể cả Lưới thẻ số lấp đủ 4
          góc), đổi lại tốn 1 dải cao cố định nhỏ phía trên. */}
      <View style={styles.toolbar}>
        {/* Back + thương hiệu NoteDri bên trái - back trước đây nằm ở header
            riêng của OBDDashboardScreen (nay đã ẩn ở chế độ Đồng hồ), gộp vào
            đây để chỉ còn ĐÚNG 1 hàng chrome full màn hình. */}
        <View style={styles.brandRow}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <FontAwesome5 name="tachometer-alt" size={15} color={style.previewColor} solid />
          <Text style={[styles.brandText, { color: colors.text }]}>NoteDri</Text>
        </View>

        {/* Giờ + thời tiết (góp ý user: màn Đồng hồ ẩn StatusBar hệ thống nên
            mất luôn đồng hồ giờ của máy) - đặt 1 LẦN ở toolbar dùng chung,
            tự động có mặt ở cả 8 style vì toolbar nằm ngoài <Layout/>. */}
        <View style={styles.toolbarCenter}>
          <CockpitClock color={colors.text} />
          <CockpitWeather color={colors.text} />
        </View>

        {/* Rà soát 24/7 (góp ý user: theme OBD2 Live nên tối mặc định + tự bấm
            chuyển sáng, KHÔNG phụ thuộc theme sáng/tối chung của app) - toggle
            riêng, đổi useCockpitThemeStore (xem cockpitPalettes.ts), không đụng
            useThemeStore của phần còn lại app. */}
        <View style={styles.toolbarBtns}>
          {pipSupported && (
            <TouchableOpacity
              onPress={() => NotedriPip.enterPipMode().catch(() => {})}
              style={[styles.styleBtn, { backgroundColor: colors.card }]}
            >
              <FontAwesome5 name="compress" size={16} color={style.previewColor} solid />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleCockpitMode}
            style={[styles.styleBtn, { backgroundColor: colors.card }]}
          >
            <FontAwesome5 name={cockpitMode === 'dark' ? 'sun' : 'moon'} size={16} color={style.previewColor} solid />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            style={[styles.styleBtn, { backgroundColor: colors.card }]}
          >
            <FontAwesome5 name="palette" size={16} color={style.previewColor} solid />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDisconnect} style={[styles.styleBtn, { backgroundColor: colors.card }]}>
            <FontAwesome5 name="times" size={16} color="#EF4444" solid />
          </TouchableOpacity>
        </View>
      </View>

      {/* ScrollView thay vì View cố định flex:1 - gaugeSize co theo màn hình
          rồi nhưng vẫn cần cuộn dự phòng cho màn landscape rất thấp/nhiều PID
          phụ cùng lúc, tránh cắt mất nội dung mà không có cách nào xem tiếp.
          Rà soát (góp ý user: đầu Android ô tô nằm ngang không full màn hình) -
          trước đây contentContainerStyle CĂN GIỮA 1 "thẻ" nhỏ hơn màn hình,
          để lộ nền app trống phía trên/dưới trên màn ngang rộng-thấp. Bỏ
          alignItems/justifyContent center ở đây, để chính Layout (flex:1)
          tự kéo giãn lấp ĐẦY vùng cuộn rồi mới tự căn giữa nội dung BÊN
          TRONG nó - card giờ luôn phủ kín khung hình, không còn khoảng trống. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.root, !isConnected && snapshot ? { opacity: 0.5 } : null]}
      >
        <Layout
          metrics={metrics}
          size={layout.gaugeSize}
          heroSize={layout.heroGaugeSize}
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
  root: { flexGrow: 1, padding: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4, gap: 8 },
  iconBtn: { padding: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  toolbarCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolbarBtns: { flexDirection: 'row', gap: 8 },
  styleBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
});
