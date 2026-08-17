import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { PermissionManager } from '../../services/permissions/PermissionManager';
import { useCockpitThemeStore } from '../../store/cockpitThemeStore';
import { ObdSnapshot } from '../../services/obd/ObdReader';
import { FastSnapshot } from '../../services/obd/obdLiveMonitor';
import { VehicleCapability } from '../../services/obd/capabilityService';
import { OBD_METRICS, filterSupportedMetrics, readMetricValue, quantizeValue } from '../../constants/obdMetrics';
import { pickDashboardStyle, getSelectedDashboardStyleId, setSelectedDashboardStyleId, isStyleUsable, DASHBOARD_STYLES, ASK_EVERY_TIME } from '../../constants/dashboardStyles';
import { useCockpitLayout } from '../../hooks/useCockpitLayout';
import { useAuthStore } from '../../store/authStore';
import { requestKeepAlivePermissions, startObdKeepAlive } from '../../services/obd/obdKeepAliveService';
import NotedriPip from '../../../modules/notedri-pip/src/NotedriPipModule';
import DashboardStylePicker from './DashboardStylePicker';
import CockpitClock from './CockpitClock';
import CockpitWeather from './CockpitWeather';

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
// Toolbar chặn trần inset ở mức vừa đủ né viền/notch thật, KHÔNG dùng cho
// giờ/thời tiết (xem CLOCK_INSET_CAP bên dưới - user muốn giờ/thời tiết luôn
// sát mép trên, không đẩy xuống theo inset báo sai của ROM đầu xe).
const MAX_TOOLBAR_INSET = 64;
// Rà soát 30/7 (góp ý user, ảnh thật màn ngang đầu Android ô tô: đẩy hết
// giờ/thời tiết + nút chức năng xuống thấp là THỪA - chỉ dải status bar RIÊNG
// của ROM (không phải StatusBar app, không ẩn được) mới thật sự che nút, và
// dải đó chỉ nằm ở top. Giờ/thời tiết không cần né - giữ SÁT mép trên (chỉ
// nhích theo notch thật nếu có, chặn trần rất thấp). Toàn bộ nút chức năng
// (back/brand + pip/theme/palette/ngắt) dời hẳn XUỐNG ĐÁY màn hình thay vì
// nằm trên - né dứt điểm dải status bar của ROM mà không cần đoán chiều cao
// của nó hay xếp cột dọc như trước.
const CLOCK_INSET_CAP = 12;

// Rà soát 29/7 (góp ý user: toolbar/giờ-thời tiết của theme "Tối giản EV" gần
// như biến mất - previewColor của theme này là #111111, gần đen, dùng làm
// viền/nền trong suốt trên nền tối thì không còn tương phản) - đẩy màu quá
// tối lên đủ sáng CHỈ cho viền/icon/chữ của toolbar nổi (không đụng
// previewColor gốc dùng làm swatch nhận diện style trong picker).
function ensureVisibleAccent(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma >= 90) return hex;
  const lift = (c: number) => Math.round(c + (255 - c) * 0.6);
  return `#${lift(r).toString(16).padStart(2, '0')}${lift(g).toString(16).padStart(2, '0')}${lift(b).toString(16).padStart(2, '0')}`;
}

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
  // Rà soát 29/7 (ảnh thật đầu Android ô tô: nút chọn theme/sáng-tối/quay lại
  // bị thanh điều hướng hệ thống che mất) - toolbar nổi trước đây "top: 8" cố
  // định, không cộng safe-area top (OBDDashboardScreen cố tình bỏ top/bottom
  // inset ở chế độ Đồng hồ để nền full màn, nhưng toolbar/giờ NỔI phía trên
  // nền đó vẫn cần né vùng hệ thống). Đọc riêng insets ở đây, chỉ áp cho vị
  // trí toolbar/giờ - nền ScrollView bên dưới vẫn full-bleed như cũ.
  const rawInsets = useSafeAreaInsets();
  const toolbarInsetBottom = Math.min(rawInsets.bottom, MAX_TOOLBAR_INSET);
  const toolbarInsetSide = Math.min(Math.max(rawInsets.left, rawInsets.right), MAX_TOOLBAR_INSET);
  // Rà soát 19/8 (góp ý user: tai thỏ/Dynamic Island trên iPhone che mất giờ/
  // thời tiết) - CLOCK_INSET_CAP (12px) được tinh chỉnh riêng cho dải status
  // bar GIẢ của ROM đầu Android ô tô (báo inset nhưng không có vật cản thật -
  // xem comment 30/7 phía trên), KHÔNG áp dụng được cho iOS: rawInsets.top
  // trên iOS luôn là số đo PHẦN CỨNG chính xác của tai thỏ/Dynamic Island
  // (44-59px thật), ép xuống 12px chắc chắn bị che. Chỉ giới hạn trên Android.
  const clockInsetTop = Platform.OS === 'ios' ? rawInsets.top : Math.min(rawInsets.top, CLOCK_INSET_CAP);

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
  // Rà soát 6/8 (user báo trên đầu Android ô tô: bấm nút vuông vào PiP được
  // nhưng "treo", không thấy số chạy) - nút này trước đây không hề kiểm tra
  // isConnected, nên bấm được cả lúc CHƯA/KHÔNG CÒN kết nối OBD2: khung PiP mở
  // ra nhưng speedKmh/rpm mãi mãi null (không có phiên BLE nào đang chạy để
  // cấp dữ liệu) - đúng cảm giác "đơ", không phải do thiếu keep-alive. Chỉ hiện
  // nút khi đang thực sự kết nối, chặn thêm 1 lớp phòng thủ ngay trong hàm.
  // Rà soát 13/8 (user vẫn báo PiP đơ dù đã có bản vá 24/7): bản cũ chỉ gọi
  // startObdKeepAlive() khi permission MỚI được cấp ở đây, coi như phiên đã
  // đủ điều kiện chạy nền từ lúc connect - sai giả định, vì startObdKeepAlive()
  // lúc connect có thể đã 'skipped_gps_active' (nhường cho foreground service
  // của 1 chuyến GPS song song) rồi chuyến đó tự dừng giữa chừng, hoặc lỗi
  // thoáng qua ('error') không có lượt thử lại nào trước đó. Gọi lại hàm này
  // KHÔNG ĐIỀU KIỆN mỗi lần bấm PiP - an toàn gọi lặp lại (tự re-check trạng
  // thái GPS/quyền/service, xem obdKeepAliveService.ts), đảm bảo chắc chắn
  // đang chạy đúng lúc user chuẩn bị rời tiền cảnh, không chỉ dựa vào lần
  // chạy tự động lúc connect.
  async function handlePressPip() {
    if (!isConnected) return;
    const perm = await PermissionManager.getLocationBackgroundStatus().catch(() => ({ granted: false, canAskAgain: true }));
    if (!perm.granted) await requestKeepAlivePermissions();
    await startObdKeepAlive().catch(() => {});
    NotedriPip.enterPipMode().catch(() => {});
  }

  // Style chọn lưu ở AsyncStorage THEO TỪNG XE - đọc lại mỗi khi vehicleId đổi;
  // đổi style trong DashboardStylePicker cập nhật cả state lẫn storage của xe này.
  const [styleId, setStyleId] = useState(DASHBOARD_STYLES[0].id as string);
  const [pickerVisible, setPickerVisible] = useState(false);
  useEffect(() => {
    getSelectedDashboardStyleId(vehicleId).then((id) => {
      setStyleId(id);
      // User bấm "Luôn hỏi lại" trong DashboardStylePicker (sentinel ASK_EVERY_TIME)
      // - lần vào Dashboard này tự mở lại picker thay vì âm thầm áp style cũ. Nếu
      // user đóng picker mà không chọn gì, styleId vẫn giữ ASK_EVERY_TIME nên lần
      // sau lại tự mở lại - đúng nghĩa "hỏi MỖI LẦN" cho tới khi chọn 1 style cụ thể.
      if (id === ASK_EVERY_TIME) setPickerVisible(true);
    });
  }, [vehicleId]);
  // Kiểm tra lại is_premium NGAY LÚC HIỂN THỊ, không chỉ lúc chọn - Premium hết
  // hạn/bị huỷ sau khi đã chọn style khoá, hoặc storage bị chỉnh tay, đều phải
  // rơi về style mặc định thay vì tiếp tục dùng style trả phí miễn phí.
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const selectedStyle = pickDashboardStyle(styleId);
  const style = isStyleUsable(selectedStyle, isPremium) ? selectedStyle : DASHBOARD_STYLES[0];

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
  // Toolbar/giờ-thời tiết dùng bản màu đã đảm bảo tương phản (xem
  // ensureVisibleAccent) - previewColor gốc (accent) vẫn giữ nguyên cho nơi
  // khác (vd swatch trong DashboardStylePicker).
  const toolbarAccent = ensureVisibleAccent(accent);
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
          nút chức năng (đúng mục đích ban đầu: liếc giờ không cần thao tác).
          Rà soát 30/7 (ảnh thật: thời tiết đứng sát ngay cạnh giờ trong CHUNG
          1 pill, icon thời tiết đè/lấn lên chữ giờ) - tách thành 2 pill RIÊNG
          BIỆT, có khoảng cách thật giữa 2 khối (gap ở container ngoài) thay vì
          2 nhóm nội dung khác nhau chen trong cùng 1 khung - giờ luôn đọc được
          trọn vẹn dù thời tiết có/không có dữ liệu (CockpitWeather tự ẩn khi
          chưa có data, khi đó pill giờ đứng 1 mình, không lệch vị trí). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 8 + clockInsetTop, alignSelf: 'center',
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}
      >
        <View style={[styles.clockPill, { backgroundColor: toolbarAccent + '33', borderColor: toolbarAccent + '77' }]}>
          <CockpitClock color={toolbarAccent} fontSize={clockFontSize} />
        </View>
        <CockpitWeather color={toolbarAccent} fontSize={clockFontSize} />
      </View>

      {/* Chip trái (mũi tên quay lại Lưới) tách khỏi animation ẩn/hiện của phần
          còn lại (rà soát 16/8, góp ý user: toolbar tự ẩn sau 4s khiến đường
          quay lại "biến mất", phải chạm màn hình trước mới thấy lại được) -
          LUÔN hiển thị, không phụ thuộc controlsOpacity/controlsVisible. */}
      <View
        style={[
          styles.chip,
          styles.chipAbsolute,
          {
            bottom: 8 + toolbarInsetBottom,
            left: 12 + toolbarInsetSide,
            backgroundColor: toolbarAccent + '33',
            borderColor: toolbarAccent + '77',
          },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <FontAwesome5 name="arrow-left" size={19} color="#FFFFFF" />
        </TouchableOpacity>
        <FontAwesome5 name="tachometer-alt" size={17} color={toolbarAccent} solid />
        <Text style={styles.brandText}>NoteDri</Text>
      </View>

      {/* Nút ngắt kết nối (X) - LUÔN hiển thị, KHÔNG theo animation ẩn/hiện của
          nhóm nút phụ bên dưới (rà soát 17/8, góp ý user: nút quay lại đã luôn
          hiện sẵn - rà soát 16/8 - nhưng nút ngắt kết nối vẫn tự ẩn sau
          AUTO_HIDE_MS, khiến user khó ngắt kết nối ngay khi cần). Tách riêng
          khỏi toolbarBtnsWrap, cùng lý do "luôn hiện" đã áp dụng cho chip quay
          lại ở trên - đây là 2 hành động thoát màn hình quan trọng ngang nhau. */}
      <TouchableOpacity
        onPress={onDisconnect}
        style={[
          styles.styleBtn,
          styles.chipAbsolute,
          {
            bottom: 8 + toolbarInsetBottom,
            right: 12 + toolbarInsetSide,
            backgroundColor: '#EF444433', borderColor: '#EF444477',
          },
        ]}
      >
        <FontAwesome5 name="times" size={18} color="#EF4444" solid />
      </TouchableOpacity>

      {/* Nút chức năng còn lại (theme/bảng màu) dời hẳn xuống ĐÁY màn hình (xem
          comment CLOCK_INSET_CAP đầu file) - né dứt điểm dải status bar riêng
          của ROM đầu Android ô tô (chỉ nằm ở top), không cần đoán chiều cao hay
          xếp cột dọc như trước. Vẫn tự ẩn sau 4s như cũ - chỉ 2 nút phụ này,
          không phải hành động thoát/an toàn nên chấp nhận ẩn tạm được. Dịch
          sang trái đúng bề rộng nút ngắt kết nối (luôn hiện, tách riêng ở trên)
          để không đè lên nhau. */}
      <Animated.View
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
        style={[
          styles.toolbarBtnsWrap,
          {
            bottom: 8 + toolbarInsetBottom,
            right: 12 + toolbarInsetSide + 46 + 10,
            opacity: controlsOpacity,
          },
        ]}
      >
        <View style={styles.toolbarBtns}>
          {pipSupported && isConnected && (
            <TouchableOpacity
              onPress={handlePressPip}
              style={[styles.styleBtn, { backgroundColor: toolbarAccent + '33', borderColor: toolbarAccent + '77' }]}
            >
              <FontAwesome5 name="compress" size={18} color={toolbarAccent} solid />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleCockpitMode}
            style={[styles.styleBtn, { backgroundColor: toolbarAccent + '33', borderColor: toolbarAccent + '77' }]}
          >
            <FontAwesome5 name={cockpitMode === 'dark' ? 'sun' : 'moon'} size={18} color={toolbarAccent} solid />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            style={[styles.styleBtn, { backgroundColor: toolbarAccent + '33', borderColor: toolbarAccent + '77' }]}
          >
            <FontAwesome5 name="palette" size={18} color={toolbarAccent} solid />
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
  // Rà soát 6/8 (góp ý user: viền bo góc của từng theme nằm sát mép màn hình
  // thay vì tràn hết 1 màu) - padding 8 ở đây tạo khoảng hở lộ màu nền chung
  // của app (colors.background) khác với màu nền riêng của theme (p.bg/PALETTE.bg)
  // đang chọn, cộng viền bo góc của chính Layout tạo cảm giác "đóng khung". Bỏ
  // hẳn padding ngoài này - nền của theme (đã bỏ luôn border, xem các Layout.tsx)
  // giờ tràn tới đúng mép ScrollView, đúng tinh thần "full màn thật" của chế độ
  // Đồng hồ (xem OBDDashboardScreen.tsx). Khoảng cách cho nội dung bên trong (kim
  // đồng hồ, mini-stat...) vẫn do padding riêng của từng Layout đảm nhiệm.
  root: { flexGrow: 1 },
  clockPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
  },
  // Chip trái (mũi tên quay lại) và nhóm nút phải giờ là 2 khối định vị TUYỆT
  // ĐỐI riêng biệt (trước đây chung 1 `toolbar` bao cả 2, xem rà soát 16/8 -
  // tách để chip không bị cuốn theo animation ẩn/hiện của nhóm nút phải).
  chipAbsolute: { position: 'absolute' },
  toolbarBtnsWrap: { position: 'absolute' },
  // Rà soát 13/8 (góp ý user: toolbar nhìn "thụt thò", không cân bằng) - chip
  // bên trái trước đây cao theo nội dung (~39px, paddingVertical:8) trong khi
  // 4 nút chức năng bên phải cao CỐ ĐỊNH 46px - 2 khối cùng 1 hàng nhưng lệch
  // nhau ~7px, mép trên/dưới không thẳng hàng dù đã canh giữa. Khoá `height`
  // của chip bằng ĐÚNG chiều cao nút tròn (46) - cả hàng giờ cao đều tuyệt
  // đối, borderRadius cũng đổi thành 23 (= height/2) để chip là 1 viên thuốc
  // "tròn trọn" đúng chuẩn thay vì bo góc ước lượng theo nội dung.
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 46, borderRadius: 23, borderWidth: 1, paddingHorizontal: 12,
  },
  iconBtn: { padding: 2 },
  brandText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.3, color: '#FFFFFF' },
  toolbarBtns: { flexDirection: 'row', gap: 10 },
  styleBtn: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
