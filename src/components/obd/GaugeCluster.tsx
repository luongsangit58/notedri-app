import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Pressable, Animated } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCockpitThemeStore } from '../../store/cockpitThemeStore';
import { ObdSnapshot } from '../../services/obd/ObdReader';
import { FastSnapshot } from '../../services/obd/obdLiveMonitor';
import { VehicleCapability } from '../../services/obd/capabilityService';
import { OBD_METRICS, filterSupportedMetrics, readMetricValue, quantizeValue } from '../../constants/obdMetrics';
import { pickDashboardStyle, getSelectedDashboardStyleId, setSelectedDashboardStyleId, isStyleUsable, DASHBOARD_STYLES } from '../../constants/dashboardStyles';
import { useCockpitLayout } from '../../hooks/useCockpitLayout';
import { useAuthStore } from '../../store/authStore';
import { requestKeepAlivePermissions, startObdKeepAlive } from '../../services/obd/obdKeepAliveService';
import NotedriPip from '../../../modules/notedri-pip/src/NotedriPipModule';
import DashboardStylePicker from './DashboardStylePicker';
import CockpitClock from './CockpitClock';
import CockpitWeather from './CockpitWeather';
import CockpitRadio from './CockpitRadio';

// Rà soát 24/7 (góp ý user, ảnh thật trên đầu Android ô tô): toolbar cũ ăn
// nguyên 1 dải cao CỐ ĐỊNH phía trên (chưa full màn thật), nút bấm quá bé, và
// dùng màu app chung (colors.card/colors.text) - LỆCH tone với màu riêng của
// theme đang chọn (mỗi Premium có bảng màu riêng, xem cockpitPalettes.ts).
// Đổi hẳn sang toolbar NỔI (position:absolute, không chiếm chỗ của khung đồng
// hồ bên dưới - đồng hồ giờ LUÔN full màn thật), nền kính mờ đen trung tính
// (đủ tương phản trên MỌI theme kể cả Minimal nền sáng) + icon/viền tô theo
// `style.previewColor` của theme đang chọn cho cảm giác "ăn nhập". Giờ/thời
// tiết ở giữa LUÔN hiện (mục đích ban đầu: liếc giờ không cần chạm màn) -
// riêng back/brand/nút chức năng bên trái-phải ẩn mặc định, chạm màn hình để
// hiện lại (tự ẩn sau 4s không thao tác) - đúng tinh thần "full hoàn toàn".
const AUTO_HIDE_MS = 4000;

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

  // Rà soát 24/7 (user báo: bấm PiP thu nhỏ được nhưng bị đơ, số đứng yên 1
  // mức) - PiP KHÔNG tự nó gây đơ, nguyên nhân là thiếu foreground service
  // (obdKeepAliveService.ts): thiếu quyền vị trí nền -> Android đóng băng
  // setInterval của vòng poll BLE ngay khi Activity không còn ở tiền cảnh
  // (đúng cơ chế đã vá cho trường hợp khoá màn hình, PiP cũng là 1 dạng "rời
  // tiền cảnh" y hệt). Trước khi thu nhỏ, đảm bảo keep-alive đang chạy - nếu
  // chưa có quyền, xin ngay lúc này (đúng thời điểm user cần, thay vì đợi lần
  // nhắc chung 1-lần/xe mà có thể họ đã bỏ qua trước đó).
  async function handlePressPip() {
    const perm = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (perm?.status !== 'granted') {
      const granted = await requestKeepAlivePermissions();
      if (granted) await startObdKeepAlive().catch(() => {});
    }
    NotedriPip.enterPipMode().catch(() => {});
  }

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

  // Ẩn/hiện toolbar chạm-màn-hình + tự ẩn sau AUTO_HIDE_MS - xem comment đầu file.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const scheduleAutoHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
  };

  useEffect(() => {
    scheduleAutoHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(controlsOpacity, { toValue: controlsVisible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsVisible]);

  function handleTapScreen() {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      setControlsVisible(true);
      scheduleAutoHide();
    }
  }

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
  const accent = style.previewColor;
  // Rà soát 24/7 (góp ý user: giờ/thời tiết vẫn nhỏ trên màn đầu xe to, chưa
  // "ăn nhập" màu theme đang chọn) - cỡ chữ tỉ lệ theo heroGaugeSize (đã tính
  // theo cạnh ngắn hơn màn hình thật), và tô theo accent của theme thay vì
  // trắng trung tính cố định - đồng bộ với các nút chức năng đã tô accent.
  const clockFontSize = Math.max(16, Math.min(30, layout.heroGaugeSize * 0.09));

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={{ flex: 1 }} onPress={handleTapScreen}>
        {/* ScrollView thay vì View cố định flex:1 - gaugeSize co theo màn hình
            rồi nhưng vẫn cần cuộn dự phòng cho màn landscape rất thấp/nhiều PID
            phụ cùng lúc, tránh cắt mất nội dung mà không có cách nào xem tiếp.
            Rà soát: toolbar giờ NỔI (absolute) chứ không chiếm chỗ riêng -
            ScrollView này chiếm ĐÚNG flex:1 toàn bộ container, full màn thật. */}
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
      </Pressable>

      {/* Giờ + thời tiết (góp ý user: màn Đồng hồ ẩn StatusBar hệ thống nên mất
          luôn đồng hồ giờ của máy) - LUÔN hiện, không theo chạm-màn-hình như
          nút chức năng (đúng mục đích ban đầu: liếc giờ không cần thao tác). */}
      <View pointerEvents="none" style={[styles.clockPill, { backgroundColor: accent + '33', borderColor: accent + '77' }]}>
        <CockpitClock color={accent} fontSize={clockFontSize} />
        <CockpitWeather color={accent} fontSize={clockFontSize} />
      </View>

      {/* Nút chức năng - ẩn mặc định (full màn thật), chạm màn hình để hiện,
          tự ẩn lại sau 4s không thao tác. */}
      <Animated.View
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
        style={[styles.toolbar, { opacity: controlsOpacity }]}
      >
        <View style={[styles.chip, { backgroundColor: accent + '33', borderColor: accent + '77' }]}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <FontAwesome5 name="arrow-left" size={19} color="#FFFFFF" />
          </TouchableOpacity>
          <FontAwesome5 name="tachometer-alt" size={17} color={accent} solid />
          <Text style={styles.brandText}>NoteDri</Text>
        </View>

        <View style={styles.toolbarBtns}>
          <CockpitRadio accent={accent} />
          {pipSupported && (
            <TouchableOpacity
              onPress={handlePressPip}
              style={[styles.styleBtn, { backgroundColor: accent + '33', borderColor: accent + '77' }]}
            >
              <FontAwesome5 name="compress" size={18} color={accent} solid />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleCockpitMode}
            style={[styles.styleBtn, { backgroundColor: accent + '33', borderColor: accent + '77' }]}
          >
            <FontAwesome5 name={cockpitMode === 'dark' ? 'sun' : 'moon'} size={18} color={accent} solid />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            style={[styles.styleBtn, { backgroundColor: accent + '33', borderColor: accent + '77' }]}
          >
            <FontAwesome5 name="palette" size={18} color={accent} solid />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDisconnect}
            style={[styles.styleBtn, { backgroundColor: '#EF444433', borderColor: '#EF444477' }]}
          >
            <FontAwesome5 name="times" size={18} color="#EF4444" solid />
          </TouchableOpacity>
        </View>
      </Animated.View>

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
  clockPill: {
    position: 'absolute', top: 8, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
  },
  toolbar: {
    position: 'absolute', top: 8, left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  iconBtn: { padding: 2 },
  brandText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3, color: '#FFFFFF' },
  toolbarBtns: { flexDirection: 'row', gap: 10 },
  styleBtn: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
