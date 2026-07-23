import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useObdConnection } from '../../hooks/useObd';
import { bleService, LinkQuality } from '../../services/obd/BleService';
import { requestKeepAlivePermissions, startObdKeepAlive } from '../../services/obd/obdKeepAliveService';
import { openBatterySettings } from '../../services/gps/GpsTripTracker';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { contentWide } from '../../utils/layout';
import StatBox from '../../components/obd/StatBox';
import GaugeCluster from '../../components/obd/GaugeCluster';
import SafetyAlerts, { hasSafetyAlerts } from '../../components/obd/SafetyAlerts';

// Rà soát 16/7 (góp ý user: giảm thao tác lúc lên xe - "1 chạm là kết nối"):
// NFC tap-to-connect đã có sẵn (NfcSetupScreen) nhưng chỉ nằm ở 1 link nhỏ, ít
// ai tự tìm ra. Nhắc NGAY sau lần kết nối Bluetooth thành công đầu tiên/xe -
// đúng lúc user vừa trải nghiệm sự bất tiện của việc bấm quét+chọn thiết bị,
// nên dễ thấy giá trị của "lần sau chỉ cần chạm thẻ". Chỉ nhắc 1 LẦN/xe (không
// biết chắc user đã ghép thẻ thật hay chưa - viết thẻ NFC là hành động vật lý
// ở đầu đọc riêng, không có cách nào server/app tự xác nhận - nhắc lặp lại mỗi
// lần kết nối sẽ gây phiền hơn là hữu ích).
function nfcNudgeKey(vehicleId: number): string {
  return `obd_nfc_nudge_shown_${vehicleId}`;
}

// Rà soát 20/7 (khoảng lặng ~13 phút thấy trong fixture khi khoá màn hình lúc
// lái): user chỉ dùng OBD2 không đi qua luồng bật GPS trip nên không bao giờ
// cấp quyền vị trí nền - obdKeepAliveService luôn no-op âm thầm. Nhắc 1
// LẦN/xe, chỉ khi quyền CHƯA có (khỏi làm phiền nếu đã cấp qua GPS trip rồi).
function keepAliveNudgeKey(vehicleId: number): string {
  return `obd_keepalive_nudge_shown_${vehicleId}`;
}

export default function OBDDashboardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const deviceName: string = route.params?.deviceName ?? 'OBD';
  const vehicleName: string = route.params?.vehicleName ?? '';
  const consumptionOfficial: number | null = route.params?.consumptionOfficial ?? null;

  const t = useT();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // Rà soát (góp ý user: chưa full màn hình trên đầu Android ô tô) - SafeAreaView
  // mặc định cộng NGUYÊN inset hệ thống báo về, nhưng nhiều ROM đầu xe custom
  // (không phải điện thoại thật) báo inset top/bottom sai lệch rất lớn (thanh
  // trạng thái/điều hướng riêng của hãng bị tính nhầm vào "safe area"), khiến
  // nội dung bị co lại giữa màn hình, để trống mảng lớn trên/dưới. Chặn trần
  // ở mức đủ cho MỌI thiết bị thật hợp lệ (tự soát lại 24/7: 32dp ban đầu quá
  // thấp - thanh điều hướng 3 nút Android thật ~48dp, notch/Dynamic Island
  // iPhone ~59dp - sẽ bị cắt oan, che mất nút cuối màn hình). 64dp đủ rộng cho
  // mọi trường hợp thật, chỉ chặn giá trị bất thường (vd ROM lỗi báo hàng trăm dp).
  const rawInsets = useSafeAreaInsets();
  const MAX_SAFE_INSET = 64;
  const safeInsets = {
    paddingTop: Math.min(rawInsets.top, MAX_SAFE_INSET),
    paddingBottom: Math.min(rawInsets.bottom, MAX_SAFE_INSET),
    paddingLeft: Math.min(rawInsets.left, MAX_SAFE_INSET),
    paddingRight: Math.min(rawInsets.right, MAX_SAFE_INSET),
  };
  const {
    connectionState,
    smoothedSnapshot,
    fastSnapshot,
    findings,
    warning,
    capability,
    vinMismatch,
    disconnect,
  } = useObdConnection(vehicleId, vehicleName);

  async function handleDisconnect() {
    Alert.alert(t('obd.disconnect_title'), t('obd.disconnect_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.disconnect_title'),
        style: 'destructive',
        onPress: async () => {
          await disconnect().catch(() => {});
          // suppressAutoConnect: user vừa CHỦ ĐỘNG ngắt - không để màn Setup
          // quét thấy thiết bị đã ghép rồi tự nối lại ngay (vòng lặp ngắt-nối)
          navigation.replace('OBDSetup', {
            vehicleId,
            vehicleName,
            consumptionOfficial,
            suppressAutoConnect: true,
          });
        },
      },
    ]);
  }

  // Xuất log thô lệnh/response của phiên (JSON) qua Share sheet - user gửi cho chính mình
  // (Zalo/email/Drive) rồi thả vào repo notedri-app/obd-fixtures/ làm fixture test parser.
  async function handleExportLog() {
    const log = bleService.getSessionLog();
    if (log.length === 0) {
      Alert.alert(t('obd.export_log'), t('obd.export_log_empty'));
      return;
    }
    await Share.share({
      title: 'notedri-obd-session.json',
      message: JSON.stringify(
        { exported_at: new Date().toISOString(), device: deviceName, entries: log },
        null,
        1,
      ),
    });
  }

  // Gauge hiển thị dùng bản MƯỢT (EWMA, mục 12 kiểm toán 16/07) đỡ giật do nhiễu
  // BLE - findings/DTC ở trên vẫn tính từ snapshot RAW qua onFindings(), không đổi.
  const snap = smoothedSnapshot;
  const isConnected = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  // Chế độ "Đồng hồ" (kim tốc độ/vòng tua kiểu scanner chuyên nghiệp, dành cho
  // gắn cố định trên xe) - toggle tại chỗ, KHÔNG điều hướng sang màn hình khác,
  // vì useObdConnection chỉ đồng bộ trạng thái qua listener sự kiện lúc mount
  // (không có bước đọc trạng thái hiện tại) - mount lại hook ở 1 route riêng có
  // thể hiện sai "đã ngắt kết nối" cho tới khi có sự kiện tiếp theo.
  const [viewMode, setViewMode] = useState<'grid' | 'gauge'>('grid');
  useEffect(() => {
    if (viewMode !== 'gauge') return;
    const tag = 'obd-gauge-dashboard';
    activateKeepAwakeAsync(tag).catch(() => {});
    return () => { deactivateKeepAwake(tag).catch(() => {}); };
  }, [viewMode]);

  // Badge chất lượng kết nối (ý #16): chỉ hiện khi có vấn đề, sóng tốt thì im lặng
  const [linkQuality, setLinkQuality] = useState<LinkQuality>('unknown');
  useEffect(() => {
    if (!isConnected) { setLinkQuality('unknown'); return; }
    const timer = setInterval(() => setLinkQuality(bleService.getLinkQuality()), 5000);
    return () => clearInterval(timer);
  }, [isConnected]);

  // Nhắc bật chạy nền (rà soát 20/7) - xem comment keepAliveNudgeKey() ở đầu
  // file. Chạy TRƯỚC nhắc NFC (settle xong mới cho nhắc NFC hiện) để 2 Alert
  // không chồng lên nhau ngay lúc vừa kết nối xong.
  const [keepAliveNudgeSettled, setKeepAliveNudgeSettled] = useState(false);
  useEffect(() => {
    if (!isConnected || !vehicleId) return;
    if (Platform.OS !== 'android') { setKeepAliveNudgeSettled(true); return; }
    let cancelled = false;
    // Chỉ setState nếu effect chưa bị dọn (màn hình chưa unmount) - Alert vẫn
    // có thể còn mở sau khi user đã rời màn hình (vd bấm back trong lúc đang
    // hiện dialog), bấm nút lúc đó không được setState trên component đã unmount.
    const settle = () => { if (!cancelled) setKeepAliveNudgeSettled(true); };
    (async () => {
      const key = keepAliveNudgeKey(vehicleId);
      const shown = await AsyncStorage.getItem(key);
      const alreadyGranted = (await Location.getBackgroundPermissionsAsync().catch(() => null))?.status === 'granted';
      if (shown || alreadyGranted || cancelled) { settle(); return; }
      await AsyncStorage.setItem(key, '1');
      Alert.alert(
        t('obd.keepalive_nudge_title'),
        t('obd.keepalive_nudge_body'),
        [
          { text: t('gps_trips.later'), style: 'cancel', onPress: settle },
          {
            text: t('obd.keepalive_nudge_cta'),
            onPress: async () => {
              const granted = await requestKeepAlivePermissions();
              // Phiên OBD hiện tại đã start() TRƯỚC khi user cấp quyền ở đây -
              // keep-alive lúc đó đã bỏ qua (skipped_no_permission) và sẽ KHÔNG
              // tự thử lại. Gọi lại ngay để có tác dụng cho phiên đang chạy,
              // không phải đợi tới lần kết nối sau.
              if (granted) await startObdKeepAlive().then((s) => bleService.logDiagnostic('#keepalive', s));
              await openBatterySettings();
              settle();
            },
          },
        ],
        { onDismiss: settle },
      );
    })();
    return () => { cancelled = true; };
  }, [isConnected, vehicleId]);

  // Nhắc ghép thẻ NFC (rà soát 16/7) - xem comment nfcNudgeKey() ở đầu file.
  useEffect(() => {
    if (!isConnected || !vehicleId || !keepAliveNudgeSettled) return;
    let cancelled = false;
    (async () => {
      const key = nfcNudgeKey(vehicleId);
      const shown = await AsyncStorage.getItem(key);
      if (shown || cancelled) return;
      await AsyncStorage.setItem(key, '1');
      Alert.alert(
        t('nfc.connect_nudge_title'),
        t('nfc.connect_nudge_body'),
        [
          { text: t('gps_trips.later'), style: 'cancel' },
          {
            text: t('nfc.connect_nudge_cta'),
            onPress: () => {
              const bleDeviceId = bleService.getDeviceId();
              if (bleDeviceId) navigation.navigate('NfcSetup', { vehicleId, vehicleName, bleDeviceId });
            },
          },
        ],
      );
    })();
    return () => { cancelled = true; };
  }, [isConnected, vehicleId, keepAliveNudgeSettled]);

  // Rà soát (đảm bảo không mất cảnh báo an toàn ở chế độ Đồng hồ): findings
  // Diagnostic Engine (kể cả severity critical/can_drive:'stop'), VIN lệch và
  // dấu "mất sóng" trước đây CHỈ nằm trong ScrollView của lưới số liệu - tài xế
  // đang ở chế độ Đồng hồ (đúng lúc lái xe) sẽ không thấy cảnh báo nguy hiểm.
  // Trích thành 1 component dùng chung (SafetyAlerts.tsx) - trước đây khối
  // JSX này bị copy-paste y hệt ở đây và ở nhánh lưới bên dưới.
  const safetyAlertsProps = { vinMismatch, vehicleName, warning, findings, isConnected, hasSnapshot: !!snap };
  const showSafetyAlerts = hasSafetyAlerts(safetyAlertsProps);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, safeInsets]}>
      <AppBgPattern />
      <View style={styles.header}>
        {/* Đi thẳng về Trang chủ (phản hồi 20/7): trước đây goBack() lần theo
            đúng stack lúc vào (Home → chi tiết xe → Setup → Dashboard qua
            replace()), user phải bấm back nhiều lần mới ra được trang chủ.
            Dashboard là điểm cuối luồng kết nối - "back" ở đây nên có nghĩa
            "xong việc, về nhà" chứ không phải lần lại lịch sử điều hướng. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Tabs', { screen: 'Dashboard' })}
          style={styles.backBtn}
        >
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>{t('obd.dashboard_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{deviceName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={() => setViewMode((m) => (m === 'grid' ? 'gauge' : 'grid'))}
            style={styles.disconnectBtn}
          >
            <FontAwesome5 name={viewMode === 'grid' ? 'tachometer-alt' : 'th-large'} size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
            <FontAwesome5 name="times" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chế độ Đồng hồ: giữ màn hình sáng + ẩn status bar hệ thống, đúng tinh
          thần "gắn cố định trên xe" - không ẩn header của app (vẫn cần lối
          thoát/ngắt kết nối), chỉ ẩn thanh trạng thái Android/iOS. */}
      <StatusBar hidden={viewMode === 'gauge'} />

      {viewMode === 'gauge' && showSafetyAlerts && (
        <ScrollView style={styles.gaugeAlerts} contentContainerStyle={styles.gaugeAlertsContent}>
          <SafetyAlerts {...safetyAlertsProps} />
        </ScrollView>
      )}

      {viewMode === 'gauge' ? (
        <GaugeCluster vehicleId={vehicleId} vehicleName={vehicleName} snapshot={snap} fastSnapshot={fastSnapshot} capability={capability} isConnected={isConnected} />
      ) : (
      <ScrollView contentContainerStyle={[styles.body, contentWide]}>
        {/* Connection status */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isConnected ? '#22C55E22' : isReconnecting ? '#F59E0B22' : '#EF444422' },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? '#22C55E' : isReconnecting ? '#F59E0B' : '#EF4444' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: isConnected ? '#22C55E' : isReconnecting ? '#F59E0B' : '#EF4444' },
            ]}
          >
            {isConnected
              ? t('obd.connected')
              : isReconnecting
              ? t('obd.reconnecting')
              : t('obd.disconnected')}
          </Text>
          {isConnected && (linkQuality === 'fair' || linkQuality === 'poor') && (
            <Text
              style={[
                styles.statusText,
                { color: linkQuality === 'poor' ? '#EF4444' : '#F59E0B', marginLeft: 8 },
              ]}
            >
              {t(linkQuality === 'poor' ? 'obd.link_poor' : 'obd.link_fair')}
            </Text>
          )}
        </View>

        {/* Giải thích back ≠ ngắt (C5): user không còn phải đoán 2 nút thoát khác nhau */}
        {isConnected && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: -8 }}>
            {t('obd.leave_hint')}
          </Text>
        )}

        {/* Rà soát 16/7 (góp ý user: quá nhiều text trước khi thấy số liệu) - số
            liệu sống lên NGAY sau trạng thái kết nối, mọi banner cảnh báo/chẩn
            đoán (VIN lệch, no-data, mọi thứ ổn, findings, tạm dừng) đẩy XUỐNG
            dưới lưới số - đúng kỳ vọng "dashboard" là thấy đồng hồ trước, đọc
            chẩn đoán chi tiết sau nếu cần, không phải ngược lại. */}

        {/* Live stats grid - ẩn ô của PID xe không hỗ trợ (capability R8).
            Chưa dò được capability (null) thì hiện đủ như cũ. Mờ đi khi số liệu
            không còn cập nhật (mất sóng) để phân biệt với dữ liệu sống. */}
        <View style={[styles.statsGrid, !isConnected && snap ? { opacity: 0.5 } : null]}>
          {(() => {
            const tiles = [
              { pid: '0D', el: <StatBox key="0D" label={t('obd.stat_speed')} value={snap?.speedKmh !== null ? Math.round(snap?.speedKmh ?? 0) : null} unit=" km/h" icon="tachometer-alt" color="#3B82F6" /> },
              { pid: '0C', el: <StatBox key="0C" label="RPM" value={snap?.rpm !== null ? Math.round(snap?.rpm ?? 0) : null} icon="cogs" color="#8B5CF6" /> },
              { pid: '04', el: <StatBox key="04" label={t('obd.stat_engine_load')} value={snap?.engineLoadPct ?? null} unit="%" icon="fire" color="#F59E0B" /> },
              { pid: '05', el: <StatBox key="05" label={t('obd.stat_coolant')} value={snap?.coolantTempC ?? null} unit="°C" icon="thermometer-half" color="#EF4444" /> },
              { pid: '2F', el: <StatBox key="2F" label={t('obd.stat_fuel')} value={snap?.fuelLevelPct ?? null} unit="%" icon="gas-pump" color="#10B981" /> },
              { pid: '5C', el: <StatBox key="5C" label={t('obd.stat_oil_temp')} value={snap?.oilTempC ?? null} unit="°C" icon="oil-can" color="#F97316" /> },
              { pid: '11', el: <StatBox key="11" label={t('obd.stat_throttle')} value={snap?.throttlePct ?? null} unit="%" icon="sliders-h" color="#14B8A6" /> },
              { pid: '42', el: <StatBox key="42" label={t('obd.stat_voltage')} value={snap?.controlModuleVoltage ?? null} unit="V" icon="battery-full" color="#6366F1" /> },
            ];
            const supported = capability
              ? tiles.filter((tile) => capability.supportedPids.includes(tile.pid))
              : tiles;
            // Rà soát 20/7 (car head-unit landscape): 2 cột/hàng lãng phí bề
            // ngang trên màn hình xe rộng - tài xế phải cuộn/dò mắt dọc để
            // liếc nhanh. minWidth 80 của statStyles.box vẫn thoải mái với 4
            // cột (4*80 + 3*8 gap = 344px, thấp hơn nhiều bề rộng thực tế của
            // mọi head-unit landscape).
            const cols = isLandscape ? 4 : 2;
            const rows = [];
            for (let i = 0; i < supported.length; i += cols) {
              rows.push(
                <View key={i} style={styles.statsRow}>
                  {supported.slice(i, i + cols).map((tile) => tile.el)}
                </View>,
              );
            }
            return rows;
          })()}
        </View>

        {/* Trạng thái "mọi chỉ số bình thường" khi ĐANG kết nối + không có
            cảnh báo nào (rà soát 14/7: trước đây 0 finding hiển thị y như "chưa
            tải xong" - user không phân biệt được xe khoẻ với app treo). Chỉ
            thuộc nhánh Lưới - nhánh Đồng hồ ưu tiên không gian cho đồng hồ. */}
        {isConnected && findings.length === 0 && warning?.type !== 'no_data' && snap && (
          <View style={[styles.warningBanner, { backgroundColor: '#16653422' }]}>
            <FontAwesome5 name="check-circle" size={14} color="#22C55E" solid />
            <Text style={[styles.warningText, { color: '#22C55E', fontWeight: '600' }]}>
              {t('obd.live_all_good')}
            </Text>
          </View>
        )}

        <SafetyAlerts {...safetyAlertsProps} />

        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>{t('obd.live_data_title')}</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('obd.live_data_subtitle')}
          </Text>
          <View style={{ gap: 6, marginTop: 10 }}>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_speed')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_rpm')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_temp')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_voltage')}
            </Text>
          </View>
        </View>

        {/* Sức khoẻ theo hệ thống (C4): gom findings + số liệu sống theo hệ
            (Động cơ/Làm mát/Điện/Nhiên liệu) - xem nhanh, không chấm điểm. */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('ObdSystemHealth', { vehicleId, vehicleName })}>
          <FontAwesome5 name="heartbeat" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.sys_health_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Trang kỹ thuật: xem hết 13 PID (kể cả 5 PID chưa hiện ở grid trên) -
            dành cho user muốn xem số liệu thô, không giới hạn Premium (đã ở
            trong khu vực Premium-gated OBD rồi). */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('OBDTechnical', { vehicleId })}>
          <FontAwesome5 name="table" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.tech_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Trip history link */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('OBDTrips', { vehicleId, vehicleName, consumptionOfficial })}>
          <FontAwesome5 name="route" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.trip_history')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* NFC pairing link - chỉ hiện khi đang thực sự kết nối, tránh bấm vào im
            lặng không phản hồi nếu xe vừa mất kết nối giữa chừng */}
        {isConnected && (
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => {
            const bleDeviceId = bleService.getDeviceId();
            if (!bleDeviceId) return;
            navigation.navigate('NfcSetup', { vehicleId, vehicleName, bleDeviceId });
          }}>
          <FontAwesome5 name="wifi" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('nfc.pair_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
        )}

        {/* Session log export - nguồn fixture cho việc phát triển parser/capability profile */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={handleExportLog}>
          <FontAwesome5 name="file-export" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.export_log')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Quyết định 14/7: GPS là nguồn chuyến duy nhất (fixture #5: JS timer bị
            đóng băng ở nền → quãng đường OBD sai). OBD chỉ còn live view + DTC. */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('GpsTrips', { vehicleId, vehicleName })}>
          <FontAwesome5 name="satellite-dish" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.trips_via_gps')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  disconnectBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  body: { padding: 16, gap: 16 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  statsGrid: { gap: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  tripCard: { borderRadius: 12, padding: 16, gap: 10 },
  tripTitle: { fontSize: 16, fontWeight: '600' },
  tripKm: { fontSize: 32, fontWeight: '700' },
  tripSummary: {},
  tripSummaryText: { fontSize: 13 },
  tripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  // Giới hạn chiều cao khối cảnh báo hiện phía trên GaugeCluster ở chế độ Đồng
  // hồ - nhiều findings cùng lúc vẫn cuộn được trong khối này, không đẩy 2
  // đồng hồ kim xuống khỏi màn hình.
  gaugeAlerts: { maxHeight: '38%', flexGrow: 0 },
  gaugeAlertsContent: { padding: 12, gap: 8 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#78350F',
    borderRadius: 10,
    padding: 12,
  },
  warningText: { color: '#FEF3C7', fontSize: 13, flex: 1, lineHeight: 18 },
  tripBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyBtnText: { flex: 1, fontWeight: '600', fontSize: 14 },
  infoCard: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  infoText: { fontSize: 12.5, lineHeight: 18 },
  infoBullet: { fontSize: 12, lineHeight: 18 },
});
