import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Alert,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { State as BtState } from 'react-native-ble-plx';
import { useObdConnection } from '../../hooks/useObd';
import { bleService } from '../../services/obd/BleService';
import { getPairingForVehicle, getPairingForDevice } from '../../services/obd/pairedDevices';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import ObdConnectionGuide from '../../components/ObdConnectionGuide';
import { contentWide } from '../../utils/layout';
import { cleanNativeErrorMessage } from '../../utils/nativeError';
import NotedriBtPairing, { ClassicBtDevice } from '../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';

export default function OBDSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';
  const consumptionOfficial: number | null = route.params?.consumptionOfficial ?? null;
  // Đến từ chạm NFC (xem NfcService/App.tsx deep link listener) - biết trước đúng
  // thiết bị BLE cần kết nối nên bỏ qua bước user tự chọn trong danh sách quét.
  const autoConnectDeviceId: string | null = route.params?.autoConnectDeviceId ?? null;
  // Đến từ nút "Ngắt kết nối" - không auto-connect lại thiết bị đã ghép ngay
  const suppressAutoConnect: boolean = route.params?.suppressAutoConnect ?? false;

  const t = useT();
  const colors = useColors();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const userSynced = useAuthStore((s) => s.userSynced);
  const {
    connectionState,
    foundDevices,
    errorMessage,
    scanCooldownUntil,
    startScan,
    stopScan,
    connect,
    connectClassic,
    refreshCapability,
  } = useObdConnection(vehicleId, vehicleName);

  // Đếm ngược giây còn lại của cooldown quét (xem comment scanCooldownUntil ở
  // useObd.ts) - chỉ chạy interval khi thực sự có cooldown đang chờ.
  const [cooldownLeft, setCooldownLeft] = useState(0);
  useEffect(() => {
    if (!scanCooldownUntil) { setCooldownLeft(0); return; }
    const tick = () => setCooldownLeft(Math.max(0, Math.ceil((scanCooldownUntil - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [scanCooldownUntil]);

  // Guard: redirect to PremiumScreen if user is not premium. Đợi userSynced để không đá nhầm
  // user Premium thật ra màn nâng cấp chỉ vì cache lúc cold-start chưa kịp làm mới is_premium.
  useEffect(() => {
    if (userSynced && !isPremium) {
      navigation.replace('Premium');
    }
  }, [userSynced, isPremium]);

  // Toggle "hiện tất cả thiết bị": một số adapter quảng bá tên lạ (không chứa
  // OBD/ELM/VLINK...) sẽ bị bộ lọc mặc định bỏ qua - bật lên để hiện mọi thiết bị BLE có tên.
  const [showAllDevices, setShowAllDevices] = useState(false);

  // Rà soát 22/7: 1 số đầu Android ô tô có chip/ROM không quét/kết nối BLE
  // được (xem BT_UNSUPPORTED) nhưng Bluetooth Classic (SPP) vẫn hoạt động -
  // cho user tự chuyển sang mode này thay vì kẹt cứng ở BLE luôn báo lỗi.
  // Classic chỉ có trên Android (module native không có bản iOS).
  const [connectMode, setConnectMode] = useState<'ble' | 'classic'>('ble');
  const [classicDevices, setClassicDevices] = useState<ClassicBtDevice[]>([]);
  const [loadingClassicDevices, setLoadingClassicDevices] = useState(false);
  const [classicError, setClassicError] = useState<string | null>(null);

  useEffect(() => {
    if (connectMode !== 'classic') return;
    // Dừng hẳn vòng quét+retry BLE khi chuyển sang Classic - 2 mode không cần
    // chạy song song, và tránh chiếm radio khi Classic mở socket RFCOMM.
    stopScan();
  }, [connectMode, stopScan]);

  async function loadClassicDevices() {
    setLoadingClassicDevices(true);
    setClassicError(null);
    try {
      const found = await NotedriBtPairing.discoverDevices();
      setClassicDevices(found);
    } catch (e: any) {
      setClassicError(cleanNativeErrorMessage(e?.message ?? String(e)));
    } finally {
      setLoadingClassicDevices(false);
    }
  }

  // Nạp danh sách ngay khi vào mode Classic - đỡ user phải bấm thêm 1 nhịp.
  useEffect(() => {
    if (connectMode === 'classic') loadClassicDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectMode]);

  // Nhận biết Bluetooth CHỦ ĐỘNG: BT bật lại (từ Cài đặt/Control Center) -> tự
  // quét luôn, user không phải bấm "Quét lại". Dùng ref (không phải state) - chỉ
  // để so sánh prev/next, không có UI nào render theo giá trị này nữa (banner
  // riêng đã gộp vào thông báo lỗi sẵn có bên dưới, phản hồi 15/7: 2 nơi cùng
  // báo Bluetooth tắt trên 1 màn hình là dư thừa, rối mắt).
  const prevBtStateRef = React.useRef<BtState | null>(null);
  useEffect(() => {
    return bleService.onBluetoothStateChange((state) => {
      if (prevBtStateRef.current === BtState.PoweredOff && state === BtState.PoweredOn) {
        startScan(showAllDevices);
      }
      prevBtStateRef.current = state;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllDevices]);

  // Feedback tức thì khi bấm (phản hồi 15/7: nút "trông như không phản hồi" -
  // tryEnableBluetooth() có thể mất tới 2s ở Android 13+/ROM chặn trước khi rơi
  // xuống mở Cài đặt, cả khoảng đó nút phải hiện đang xử lý chứ không đứng im).
  const [enablingBt, setEnablingBt] = useState(false);
  async function handleEnableBluetooth() {
    if (enablingBt) return;
    setEnablingBt(true);
    try {
      // Android <=12: bật thẳng được; Android 13+/iOS: OS chặn -> mở cài đặt hệ thống.
      const enabled = await bleService.tryEnableBluetooth();
      if (!enabled) {
        if (Platform.OS === 'android') {
          Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings());
        } else {
          Linking.openSettings();
        }
      }
    } finally {
      setEnablingBt(false);
    }
  }

  // Rà soát 21/7 (fixture Honda Jazz V 2017: quét fail "internal error code 7"
  // ngay từ lần quét ĐẦU của phiên sạch - khả năng đăng ký quét BLE cũ ở tầng
  // OS chưa được giải phóng, tắt/bật lại Bluetooth thật sẽ xoá trạng thái đó).
  // Cảnh báo TRƯỚC vì đây là hành động PHỤ (tắt cả Bluetooth khác trên xe: cuộc
  // gọi, nhạc...) - không tự động làm khi quét fail, phải là user chủ động bấm.
  const [restartingBt, setRestartingBt] = useState(false);
  function handleRestartBluetooth() {
    Alert.alert(
      t('obd.restart_bt_confirm_title'),
      t('obd.restart_bt_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('obd.restart_bt_confirm_cta'),
          onPress: async () => {
            if (restartingBt) return;
            setRestartingBt(true);
            try {
              const ok = await bleService.restartBluetooth();
              if (ok) {
                startScan(showAllDevices);
              } else if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings());
              }
            } finally {
              setRestartingBt(false);
            }
          },
        },
      ],
    );
  }

  useEffect(() => {
    if (!isPremium) return;
    // Đang kết nối sẵn (user quay lại màn này khi phiên trước còn sống) → vào thẳng
    // Dashboard. Nếu quét lại lúc này sẽ KHÔNG bao giờ thấy adapter: thiết bị BLE
    // đang bị giữ kết nối thì ngừng quảng bá tên - nguồn cơn lỗi "connect được 1 lần".
    if (bleService.isConnected()) {
      navigation.replace('OBDDashboard', {
        vehicleId,
        vehicleName,
        deviceName: bleService.getDeviceName() ?? 'OBD2',
        consumptionOfficial,
      });
      return;
    }
    startScan(showAllDevices);
    return () => stopScan();
  }, [isPremium, showAllDevices]);

  async function doConnect(deviceId: string, deviceName: string) {
    const ok = await connect(deviceId);
    // Chỉ vào Dashboard khi kết nối THÀNH CÔNG - lỗi thì ở lại màn này cho user
    // thấy thông báo và quét lại (trước đây nhảy vào Dashboard kể cả khi lỗi).
    if (ok) {
      navigation.replace('OBDDashboard', { vehicleId, vehicleName, deviceName, consumptionOfficial });
    }
  }

  async function handleRefreshCapability() {
    await refreshCapability();
    Alert.alert(t('obd.refresh_capability'), t('obd.refresh_capability_done'));
  }

  async function handleExportLog() {
    const log = bleService.getSessionLog();
    if (log.length === 0) {
      Alert.alert(t('obd.export_log'), t('obd.export_log_empty'));
      return;
    }
    await Share.share({
      title: 'notedri-obd-session.json',
      message: JSON.stringify(
        { exported_at: new Date().toISOString(), vehicle: vehicleName, entries: log },
        null,
        1,
      ),
    });
  }

  // Chặn double-tap ngay từ đầu: connectionState chỉ chuyển 'connecting' BÊN
  // TRONG connect() (hook), tức là SAU await getPairingForDevice() phía dưới -
  // trong khoảng chờ đó `disabled={isConnecting}` ở danh sách thiết bị vẫn là
  // false, 2 lần chạm liên tiếp (cùng dòng hoặc khác dòng) đều lọt qua được.
  // Ref này chặn NGAY LẬP TỨC (đồng bộ), không đợi state re-render.
  const handlingTapRef = React.useRef(false);

  async function handleConnect(deviceId: string, deviceName: string) {
    if (handlingTapRef.current) return;
    handlingTapRef.current = true;
    const release = () => { handlingTapRef.current = false; };
    stopScan();
    // 1 thiết bị - 1 xe: Vgate đang ghép xe KHÁC thì hỏi trước khi chuyển
    // (savePairing sau khi connect thành công sẽ ghi đè pairing cũ).
    const existing = await getPairingForDevice(deviceId).catch(() => null);
    if (existing && existing.vehicleId !== vehicleId && existing.vehicleName) {
      Alert.alert(
        t('obd.pair_switch_title'),
        t('obd.pair_switch_body', { old: existing.vehicleName, new: vehicleName || t('obd.pair_this_vehicle') }),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => { release(); startScan(showAllDevices); } },
          { text: t('obd.pair_switch_ok'), onPress: () => { void doConnect(deviceId, deviceName).finally(release); } },
        ],
      );
      return;
    }
    await doConnect(deviceId, deviceName).finally(release);
  }

  async function doConnectClassic(address: string, name: string) {
    const ok = await connectClassic(address, name);
    if (ok) {
      navigation.replace('OBDDashboard', { vehicleId, vehicleName, deviceName: name, consumptionOfficial });
    }
  }

  async function handleConnectClassic(device: ClassicBtDevice) {
    if (handlingTapRef.current) return;
    handlingTapRef.current = true;
    const release = () => { handlingTapRef.current = false; };
    // 1 thiết bị - 1 xe (giống handleConnect ở BLE): hỏi trước nếu thiết bị
    // này đang ghép với xe KHÁC.
    const existing = await getPairingForDevice(device.address).catch(() => null);
    if (existing && existing.vehicleId !== vehicleId && existing.vehicleName) {
      Alert.alert(
        t('obd.pair_switch_title'),
        t('obd.pair_switch_body', { old: existing.vehicleName, new: vehicleName || t('obd.pair_this_vehicle') }),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: release },
          {
            text: t('obd.pair_switch_ok'),
            onPress: () => { void doConnectClassic(device.address, device.name).finally(release); },
          },
        ],
      );
      return;
    }
    await doConnectClassic(device.address, device.name).finally(release);
  }

  // Auto-connect foreground (ý #17): thiết bị đã từng ghép với XE NÀY xuất hiện
  // trong kết quả quét là tự kết nối luôn, không bắt user chạm danh sách mỗi lần.
  // User vẫn "thắng" được auto: chạm thiết bị khác trước khi thiết bị ghép lộ diện.
  const [pairedDeviceId, setPairedDeviceId] = useState<string | null>(null);
  // Transport của lần kết nối gần nhất (22/7) - quyết định tự chuyển mode +
  // auto-connect nên dò ở danh sách BLE hay Classic (xem savePairing() ở useObd.ts).
  const [pairedTransport, setPairedTransport] = useState<'ble' | 'classic'>('ble');
  useEffect(() => {
    getPairingForVehicle(vehicleId).then((p) => {
      setPairedDeviceId(p?.bleDeviceId ?? null);
      setPairedTransport(p?.transport ?? 'ble');
    });
  }, [vehicleId]);

  // NFC tag chỉ mang theo deviceId (viết lúc đó có thể là địa chỉ Classic) -
  // tra lại đúng transport đã lưu cho CHÍNH thiết bị này, không dùng chung
  // pairedTransport ở trên (có thể thuộc 1 pairing KHÁC nếu xe đổi thiết bị).
  const [nfcTransport, setNfcTransport] = useState<'ble' | 'classic'>('ble');
  useEffect(() => {
    if (!autoConnectDeviceId) return;
    getPairingForDevice(autoConnectDeviceId).then((p) => setNfcTransport(p?.transport ?? 'ble'));
  }, [autoConnectDeviceId]);

  const autoTargetId = autoConnectDeviceId ?? (suppressAutoConnect ? null : pairedDeviceId);
  const autoTargetTransport = autoConnectDeviceId ? nfcTransport : pairedTransport;

  // Tự chuyển sang mode Classic khi thiết bị nhớ được lại là Classic - tránh
  // mắc kẹt ở màn BLE báo lỗi/không thấy gì trong khi thiết bị thật sự ở mode
  // kia. Chỉ chuyển 1 chiều (BLE -> Classic khi có target) - không tự đẩy user
  // đang xem Classic quay lại BLE.
  useEffect(() => {
    if (autoTargetId && autoTargetTransport === 'classic') setConnectMode('classic');
  }, [autoTargetId, autoTargetTransport]);

  // One Tap Connect: NFC (biết trước deviceId) ưu tiên hơn bộ nhớ ghép thiết bị.
  useEffect(() => {
    if (!autoTargetId || autoTargetTransport !== 'ble' || connectionState !== 'scanning') return;
    const match = foundDevices.find((d) => d.id === autoTargetId);
    if (match) handleConnect(match.id, match.name);
  }, [autoTargetId, autoTargetTransport, foundDevices, connectionState]);

  // Tương đương bản trên nhưng cho Classic (22/7) - danh sách đã ghép nạp gần
  // như tức thì (không phải quét sống ~10s như trước), khớp địa chỉ là tự kết
  // nối ngay, không bắt user tự bấm chọn lại mỗi lần mở màn.
  useEffect(() => {
    if (!autoTargetId || autoTargetTransport !== 'classic') return;
    const match = classicDevices.find((d) => d.address === autoTargetId);
    if (match) handleConnectClassic(match);
  }, [autoTargetId, autoTargetTransport, classicDevices]);

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.setup_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={[{ paddingBottom: 32 }, contentWide]} keyboardShouldPersistTaps="handled">
        {/* Chuyển BLE/Classic (22/7) - Classic chỉ có trên Android (module native
            không có bản iOS), ẩn hẳn toggle trên iOS thay vì hiện disabled. */}
        {Platform.OS === 'android' && (
          <View style={[styles.modeToggle, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, connectMode === 'ble' && styles.modeToggleBtnActive]}
              onPress={() => setConnectMode('ble')}
              disabled={isConnecting}
            >
              <Text style={[styles.modeToggleText, { color: connectMode === 'ble' ? '#fff' : colors.textSecondary }]}>
                {t('obd.connect_mode_ble')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, connectMode === 'classic' && styles.modeToggleBtnActive]}
              onPress={() => setConnectMode('classic')}
              disabled={isConnecting}
            >
              <Text style={[styles.modeToggleText, { color: connectMode === 'classic' ? '#fff' : colors.textSecondary }]}>
                {t('obd.connect_mode_classic')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {connectMode === 'classic' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 12, lineHeight: 18 }}>
              {t('obd.classic_guide')}
            </Text>

            {classicDevices.length > 0 && (
              <View style={{ marginTop: 16 }}>
                {classicDevices.map((item, index) => (
                  <TouchableOpacity
                    key={item.address ?? `classic-${index}`}
                    style={[styles.deviceRow, { backgroundColor: colors.card }]}
                    onPress={() => handleConnectClassic(item)}
                    disabled={isConnecting}
                  >
                    <FontAwesome5 name="car" size={20} color="#3B82F6" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceName, { color: colors.text }]}>{item.name}</Text>
                      {item.bonded && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('obd.classic_bonded_tag')}</Text>
                      )}
                    </View>
                    <FontAwesome5 name="chevron-right" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!loadingClassicDevices && classicDevices.length === 0 && !classicError && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                {t('obd.classic_no_devices')}
              </Text>
            )}

            {classicError && <Text style={[styles.errorText, { marginTop: 16 }]}>{classicError}</Text>}

            <TouchableOpacity
              style={[styles.scanBtn, { borderColor: '#3B82F6', opacity: loadingClassicDevices ? 0.6 : 1 }]}
              onPress={loadClassicDevices}
              disabled={loadingClassicDevices}
            >
              {loadingClassicDevices ? (
                <ActivityIndicator color="#3B82F6" size="small" />
              ) : (
                <FontAwesome5 name="sync" size={14} color="#3B82F6" />
              )}
              <Text style={[styles.scanBtnText, { color: '#3B82F6' }]}>{t('obd.classic_load_devices')}</Text>
            </TouchableOpacity>
          </>
        ) : (
        <>
        {/* Status indicator */}
        <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
          <FontAwesome5
            name="bluetooth-b"
            size={32}
            color={isScanning || isConnecting ? '#3B82F6' : colors.textSecondary}
          />
          <Text style={[styles.statusText, { color: colors.text }]}>
            {isConnecting
              ? t('obd.connecting')
              : isScanning
              ? t('obd.scanning')
              : foundDevices.length === 0
              ? t('obd.no_device_found')
              : t('obd.devices_found', { n: foundDevices.length })}
          </Text>
          {/* Chỉ hiện gợi ý "đang tự kết nối" khi pairing nhớ được ĐÚNG là BLE -
              pairing Classic sẽ không bao giờ xuất hiện trong foundDevices (quét
              BLE), hiện gợi ý này lúc đó là hứa suông. */}
          {isScanning && pairedDeviceId && pairedTransport === 'ble' && !autoConnectDeviceId && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              {t('obd.auto_connect_hint')}
            </Text>
          )}
          {/* Decay/empty state (ý #13): không có thiết bị không có nghĩa là mất app.
              Ẩn khi đã có errorMessage riêng (vd Bluetooth tắt) để khỏi chồng 2 dòng giải thích. */}
          {!isScanning && !isConnecting && foundDevices.length === 0 && !errorMessage && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
              {t('obd.no_device_reassure')}
            </Text>
          )}
          {(isScanning || isConnecting) && (
            <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />
          )}
          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
          {/* Bluetooth tắt/chưa sẵn sàng - CHỈ 1 nơi hiện thông báo + nút xử lý (phản hồi
              15/7: trước đây có thêm 1 banner cam riêng ở đầu trang, trùng lặp với đúng
              khối này khiến trang rối). Bấm thử bật thẳng trước (Android <=12 thành công
              luôn, khỏi rời màn); không được mới rơi xuống mở Cài đặt hệ thống. */}
          {(errorMessage === t('obd.bluetooth_unavailable') || errorMessage === t('obd.bluetooth_off')) && (
            <TouchableOpacity
              style={[styles.btActionBtn, enablingBt && { opacity: 0.6 }]}
              onPress={handleEnableBluetooth}
              disabled={enablingBt}>
              {enablingBt ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btActionBtnText}>{t('obd.bt_enable')}</Text>
              )}
            </TouchableOpacity>
          )}
          {/* Từ chối quyền Bluetooth (Android "don't ask again") → chỉ mở lại được
              từ trang Cài đặt ứng dụng (rà soát 14/7). */}
          {errorMessage === t('obd.permission_denied') && (
            <TouchableOpacity
              style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3B82F6' }}
              onPress={() => Linking.openSettings()}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{t('obd.open_app_settings')}</Text>
            </TouchableOpacity>
          )}
          {/* Công tắc Vị trí toàn hệ thống TẮT - quét BLE luôn rỗng dù quyền đã
              cấp (rà soát 20/7, đầu Android ô tô không GPS). Mở thẳng màn cài đặt
              Vị trí (không phải cài đặt app - đây là công tắc hệ thống). */}
          {errorMessage === t('obd.location_services_off') && (
            <TouchableOpacity
              style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3B82F6' }}
              onPress={() => Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings())}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{t('obd.open_location_settings')}</Text>
            </TouchableOpacity>
          )}
          {/* Quét fail lặp lại/đang cooldown (rà soát 21/7) - khả năng đăng ký
              quét BLE cũ ở tầng OS chưa được giải phóng. Chỉ hiện trên Android:
              iOS/Android 13+ không cho app tự tắt/bật Bluetooth. */}
          {Platform.OS === 'android' && cooldownLeft > 0 && (
            <TouchableOpacity
              style={[{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3B82F6' }, restartingBt && { opacity: 0.6 }]}
              onPress={handleRestartBluetooth}
              disabled={restartingBt}>
              {restartingBt ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{t('obd.restart_bt_cta')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Device list - map thay FlatList (đã nằm trong ScrollView, số thiết bị
            luôn ít nên không cần ảo hoá; lồng FlatList vào ScrollView gây cảnh báo). */}
        {foundDevices.length > 0 && (
          <View style={{ marginTop: 16 }}>
            {foundDevices.map((item, index) => (
              <TouchableOpacity
                key={item.id ?? `device-${index}`}
                style={[styles.deviceRow, { backgroundColor: colors.card }]}
                onPress={() => handleConnect(item.id, item.name)}
                disabled={isConnecting}
              >
                <FontAwesome5 name="car" size={20} color="#3B82F6" />
                <Text style={[styles.deviceName, { color: colors.text }]}>
                  {item.name}
                </Text>
                <FontAwesome5 name="chevron-right" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Retry scan - khoá đúng số giây cooldown còn lại thay vì để user bấm
            lại ngay và tự khoá throttle của Android chặt hơn (xem BleService). */}
        {!isScanning && !isConnecting && (
          <TouchableOpacity
            style={[styles.scanBtn, { borderColor: '#3B82F6', opacity: cooldownLeft > 0 ? 0.5 : 1 }]}
            onPress={() => startScan(showAllDevices)}
            disabled={cooldownLeft > 0}
          >
            <FontAwesome5 name="sync" size={14} color="#3B82F6" />
            <Text style={[styles.scanBtnText, { color: '#3B82F6' }]}>
              {cooldownLeft > 0 ? t('obd.scan_retry_cooldown', { seconds: cooldownLeft }) : t('obd.scan_retry')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Show-all toggle */}
        <View style={[styles.showAllRow, { backgroundColor: colors.card }]}>
          <Text style={[styles.showAllLabel, { color: colors.text }]}>
            {t('obd.show_all_devices')}
          </Text>
          <Switch
            value={showAllDevices}
            onValueChange={setShowAllDevices}
            disabled={isConnecting}
            trackColor={{ true: '#3B82F6' }}
          />
        </View>
        </>
        )}

        {/* Hướng dẫn kết nối (component chỉn chu thay card 3 dòng cũ) */}
        <ObdConnectionGuide mode={connectMode} />

        {/* Quick actions: chuyển xuống cuối trang (phản hồi 15/7) - lịch sử/log gỡ
            lỗi không phải việc chính khi đang kết nối, để chiếm chỗ đầu trang làm
            nhiệm vụ chính (quét/kết nối) mất tập trung. */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border, flex: 1 }]}
            onPress={() => navigation.navigate('OBDTrips', { vehicleId, vehicleName, consumptionOfficial })}
            disabled={!vehicleId}
          >
            <FontAwesome5 name="route" size={13} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>{t('obd.trip_history')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border, flex: 1 }]}
            onPress={handleExportLog}
          >
            <FontAwesome5 name="file-export" size={13} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>{t('obd.export_log')}</Text>
          </TouchableOpacity>
        </View>
        {connectionState === 'connected' && (
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border, marginTop: 12 }]}
            onPress={handleRefreshCapability}
          >
            <FontAwesome5 name="sync" size={13} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>{t('obd.refresh_capability')}</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
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
  title: { fontSize: 18, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 16 },
  statusCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  statusText: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginTop: 4 },
  // Rà soát 24/7 (góp ý user: nút chuyển sang OBD2 Live - tức hàng thiết bị
  // bấm để kết nối - quá bé, khó bấm chính xác trên màn cảm ứng lớn đầu
  // Android ô tô) - tăng padding/minHeight/cỡ chữ để thành mục tiêu bấm rõ
  // ràng, dễ trúng hơn (chuẩn Material touch target tối thiểu 48dp, ở đây
  // rộng rãi hơn hẳn vì màn hình xe nhìn xa hơn điện thoại).
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    minHeight: 64,
    borderRadius: 12,
    marginBottom: 10,
  },
  deviceName: { flex: 1, fontSize: 17, fontWeight: '600' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  scanBtnText: { fontSize: 15, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  showAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  showAllLabel: { fontSize: 14, fontWeight: '500' },
  btActionBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3B82F6' },
  btActionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  modeToggle: { flexDirection: 'row', borderRadius: 10, padding: 4, gap: 4 },
  modeToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modeToggleBtnActive: { backgroundColor: '#3B82F6' },
  modeToggleText: { fontSize: 13, fontWeight: '600' },
});
