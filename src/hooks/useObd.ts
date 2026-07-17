import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obdApi } from '../api/obd';
import { bleService, ConnectionState, ObdDevice } from '../services/obd/BleService';
import { initializeElm327, readSnapshot, setActivePidWhitelist, ObdSnapshot } from '../services/obd/ObdReader';
import { getCachedCapability, discoverCapability, clearCapability, readCurrentVin, VehicleCapability } from '../services/obd/capabilityService';
import { obdLiveMonitor } from '../services/obd/obdLiveMonitor';
import { flushPendingObdSessions } from '../services/obd/ObdSessionSyncQueue';
import { Finding } from '../services/obd/diagnosticEngine';
import { savePairing } from '../services/obd/pairedDevices';
import { useAuthStore } from '../store/authStore';
import { useObdSessionStore } from '../store/obdSessionStore';
import { useI18nStore } from '../i18n';

export type ObdWarning = { type: 'no_data'; rawResponse?: string } | null;

// ---- Data queries ----

export const useObdTrips = (vehicleId: number) => {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  return useQuery({
    queryKey: ['obd', 'trips', vehicleId],
    queryFn: () => obdApi.trips(vehicleId).then((r) => r.data),
    enabled: !!vehicleId && isPremium,
  });
};

export const useObdDtcEvents = (vehicleId: number) => {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  return useQuery({
    queryKey: ['obd', 'dtc', vehicleId],
    queryFn: () => obdApi.dtcEvents(vehicleId).then((r) => r.data),
    enabled: !!vehicleId && isPremium,
  });
};

// ---- BLE connection + trip management ----

export function useObdConnection(vehicleId: number, vehicleName?: string) {
  const qc = useQueryClient();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [foundDevices, setFoundDevices] = useState<ObdDevice[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<ObdSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<ObdWarning>(null);
  const [capability, setCapability] = useState<VehicleCapability | null>(null);
  // Toàn vẹn dữ liệu (Sang duyệt 14/7): VIN xe đang cắm KHÁC VIN bản ghi này đã
  // thấy trước đó = có thể đang cắm Vgate sang XE KHÁC -> chỉ CẢNH BÁO (không
  // chặn), để user tự quyết định có ghi dữ liệu vào xe này hay không.
  const [vinMismatch, setVinMismatch] = useState<{ expected: string; actual: string } | null>(null);

  // Capability (R8): cache có sẵn thì dùng ngay, chưa có thì dò 1 lần sau kết nối.
  // Nạp whitelist cho ObdReader để poll bỏ qua PID xe không hỗ trợ (ý #18).
  const loadCapability = useCallback(async (allowDiscover: boolean) => {
    const cached = await getCachedCapability(vehicleId).catch(() => null);

    // Bản ghi đã có VIN từ lần dò trước -> đọc VIN xe đang cắm để so. Khác nhau
    // = đang cắm xe KHÁC vào bản ghi này: cảnh báo + DÒ LẠI capability (whitelist
    // PID của xe cũ sẽ sai cho xe mới). Xe không hỗ trợ VIN -> readCurrentVin
    // null -> bỏ qua, không cảnh báo oan.
    if (cached?.vin && allowDiscover) {
      const currentVin = await readCurrentVin();
      if (currentVin && currentVin !== cached.vin) {
        setVinMismatch({ expected: cached.vin, actual: currentVin });
        await clearCapability(vehicleId).catch(() => {});
        const fresh = await discoverCapability(vehicleId).catch(() => null);
        setActivePidWhitelist(fresh?.supportedPids ?? null);
        setCapability(fresh);
        return;
      }
    }

    let cap = cached;
    if (!cap && allowDiscover) {
      cap = await discoverCapability(vehicleId).catch(() => null);
    }
    setActivePidWhitelist(cap?.supportedPids ?? null);
    setCapability(cap);
  }, [vehicleId]);

  // Quyết định 14/7: GPS là nguồn CHUYẾN ĐI duy nhất. OBD chỉ còn live monitor
  // (poll số liệu + canh DTC + rule engine) sống theo phiên BLE - hook là VIEW.
  const [findings, setFindings] = useState<Finding[]>([]);

  useEffect(() => {
    const unsubs = [
      obdLiveMonitor.onSnapshot((snap) => setLiveSnapshot(snap)),
      obdLiveMonitor.onFindings((f) => setFindings(f)),
      obdLiveMonitor.onDtcFound(() => {
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
      }),
      bleService.addDisconnectListener(() => {
        setConnectionState('disconnected');
        setLiveSnapshot(null);
        setFindings([]);
        setVinMismatch(null);
      }),
      bleService.addReconnectingListener(() => setConnectionState('reconnecting')),
      bleService.addReconnectedListener(() => setConnectionState('connected')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [vehicleId, qc]);

  const stopScanRef = useRef<(() => void) | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Helpers ---

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  // --- Scan ---

  const startScan = useCallback(async (showAll = false) => {
    // Stop any previous scan before starting a new one to avoid listener leaks
    stopScanRef.current?.();
    bleService.stopScan();
    clearAutoStopTimer();

    setFoundDevices([]);
    setErrorMessage(null);

    const granted = await bleService.requestPermissions();
    if (!granted) {
      // Rà soát 14/7: trước đây message tiếng Việt không dấu hardcode + không có
      // đường khắc phục. Giờ dịch + set state 'error' để OBDSetupScreen hiện nút
      // "Mở cài đặt" (Android "don't ask again" chỉ mở được từ Cài đặt hệ thống).
      setConnectionState('error');
      setErrorMessage(useI18nStore.getState().t('obd.permission_denied'));
      return;
    }

    setConnectionState('scanning');

    try {
      await bleService.waitForBleReady();
    } catch (e: any) {
      // CHỈ thử bật hộ khi Bluetooth TẮT (BT_OFF) - máy không hỗ trợ BLE
      // (BT_UNSUPPORTED) thì bật cũng vô ích, hiện thẳng thông báo. Android ≤12
      // manager.enable() hiện hộp thoại hệ thống; Android 13+ chặn -> false ->
      // hiện nút "Mở cài đặt Bluetooth" (OBDSetupScreen).
      if (e?.code === 'BT_OFF') {
        const enabled = await bleService.tryEnableBluetooth();
        if (enabled) {
          try {
            await bleService.waitForBleReady();
          } catch (e2: any) {
            setConnectionState('error');
            setErrorMessage(e2.message);
            return;
          }
        } else {
          setConnectionState('error');
          setErrorMessage(e.message);
          return;
        }
      } else {
        setConnectionState('error');
        setErrorMessage(e.message);
        return;
      }
    }

    stopScanRef.current = bleService.scanForDevices(
      (device) => setFoundDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [...prev, device];
      }),
      (error) => {
        setConnectionState('error');
        setErrorMessage(error.message);
      },
      showAll
    );

    autoStopTimerRef.current = setTimeout(() => {
      stopScanRef.current?.();
      stopScanRef.current = null;
      setConnectionState((s) => (s === 'scanning' ? 'disconnected' : s));
    }, 15000);
  }, [clearAutoStopTimer]);

  const stopScan = useCallback(() => {
    clearAutoStopTimer();
    stopScanRef.current?.();
    stopScanRef.current = null;
    bleService.stopScan();
    setConnectionState('disconnected');
  }, [clearAutoStopTimer]);

  // --- Connect ---

  // Trả về true/false để caller CHỈ điều hướng khi kết nối thật sự thành công -
  // trước đây Setup nhảy vào Dashboard kể cả khi init lỗi (fixture #1).
  const connect = useCallback(async (deviceId: string): Promise<boolean> => {
    stopScan();
    setVinMismatch(null); // xoá cảnh báo VIN của phiên trước
    setConnectionState('connecting');
    setErrorMessage(null);

    // Sự kiện disconnect/reconnect đã được subscribe bằng listener trong effect
    // ở trên (đa-listener C5 tầng 2) - không còn gán callback đơn ở đây.
    try {
      await bleService.connect(deviceId);
      const result = await initializeElm327();
      if (!result.ok) throw new Error('Khong the khoi tao ELM327');

      setConnectionState('connected');
      setWarning(
        result.dataAvailable
          ? null
          : { type: 'no_data', rawResponse: result.rawRpmResponse },
      );

      // Dò capability TRƯỚC snapshot đầu tiên để whitelist kịp áp dụng
      // (chỉ dò khi xe đang trả dữ liệu - xe tắt máy thì bitmap cũng NO DATA)
      await loadCapability(result.dataAvailable);

      // Trạng thái toàn cục (C5): thẻ Home/chi tiết xe + banner biết đang nối xe nào
      useObdSessionStore.getState().patch({ vehicleId, vehicleName: vehicleName ?? null });

      // Live monitor sống theo phiên kết nối (thay trip manager)
      obdLiveMonitor.start(vehicleId);

      // E2: đẩy nốt phiên còn tồn trong hàng đợi (rút cáp lúc offline lần trước).
      // Điểm nghiệp vụ chắc chắn có mạng-hoạt-động-lại gần nhất, mirror cách GPS
      // flush trong GpsTripTracker sau khi chốt chuyến.
      flushPendingObdSessions().catch(() => {});

      const snap = await readSnapshot();
      setLiveSnapshot(snap);

      // Ghi nhớ thiết bị này thuộc xe nào - để BLE restore (iOS background) và
      // NFC tag sau này tự nhận diện đúng xe mà không cần user chọn lại.
      savePairing({ bleDeviceId: deviceId, vehicleId, vehicleName: vehicleName ?? '' }).catch(() => {});
      return true;
    } catch (e: any) {
      // "Thua" trong 1 cặp double-tap (BleService.connect() phát hiện đã có
      // luồng khác đang connecting/connected): KHÔNG được disconnect() - phiên
      // đó không thuộc về lời gọi này, dọn dẹp nhầm sẽ ngắt kết nối vừa thành
      // công của luồng kia + set nhầm intentionalDisconnect khiến rớt sóng thật
      // sau đó không còn tự reconnect được nữa.
      if (e?.code !== 'CONNECT_IN_PROGRESS') {
        // NHẢ kết nối BLE dở dang: adapter đang bị app giữ sẽ NGỪNG quảng bá tên,
        // mọi lần quét sau sẽ không bao giờ thấy nó nữa (phải rút cắm lại mới hiện).
        // Đây chính là lỗi "chỉ connect được đúng 1 lần" - fixture #1.
        await bleService.disconnect().catch(() => {});
      }
      setConnectionState('error');
      setErrorMessage(e.message);
      return false;
    }
  }, [stopScan, vehicleId, vehicleName, loadCapability]);

  const disconnect = useCallback(async () => {
    await bleService.disconnect();
    setConnectionState('disconnected');
    setLiveSnapshot(null);
  }, []);

  // --- Trip ---

  // Seed từ singleton khi mount: OBDSetupScreen connect xong rồi navigation.replace()
  // sang OBDDashboard -> hook MỚI khởi tạo 'disconnected' dù bleService đã kết nối.
  // Nếu không đọc lại trạng thái thật, badge đỏ + nút Start Trip bị disabled vĩnh viễn.
  useEffect(() => {
    if (bleService.isConnected()) {
      setConnectionState('connected');
      // Nạp capability từ cache; CHO PHÉP dò lại nếu cache trống (fixture #5:
      // gỡ app cài lại là mất cache → cả phiên poll thừa 2 PID NO DATA mỗi vòng)
      loadCapability(true).catch(() => {});
      useObdSessionStore.getState().patch({ vehicleId, vehicleName: vehicleName ?? null });
      // Đảm bảo live monitor chạy (app relaunch khi phiên BLE còn sống)
      obdLiveMonitor.start(vehicleId);
      // Rehydrate snapshot sống để lưới số liệu không hiện "-"
      readSnapshot().then((snap) => setLiveSnapshot(snap)).catch(() => {});
    }
    // Chỉ chạy 1 lần khi mount - trạng thái thật nằm ở singleton, không phải deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount: CHỈ dừng quét. Chuyến đi KHÔNG bị đụng tới - nó sống ở
  // obdTripManager, đây chính là fix "rời Dashboard là chuyến tự chốt" (C5 tầng 2).
  useEffect(() => {
    return () => {
      clearAutoStopTimer();
      stopScanRef.current?.();
    };
  }, [clearAutoStopTimer]);

  return {
    connectionState,
    foundDevices,
    liveSnapshot,
    findings,
    errorMessage,
    warning,
    capability,
    vinMismatch,
    isConnected: connectionState === 'connected',
    startScan,
    stopScan,
    connect,
    disconnect,
  };
}
