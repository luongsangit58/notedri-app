import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { obdApi } from '../api/obd';
import { bleService, ConnectionState, ObdDevice } from '../services/obd/BleService';
import { initializeElm327, readSnapshot, setActivePidWhitelist, ObdSnapshot } from '../services/obd/ObdReader';
import { getCachedCapability, discoverCapability, VehicleCapability } from '../services/obd/capabilityService';
import { TripSummary } from '../services/obd/TripSession';
import { obdTripManager } from '../services/obd/obdTripManager';
import { savePairing } from '../services/obd/pairedDevices';
import { useAuthStore } from '../store/authStore';
import { useObdSessionStore } from '../store/obdSessionStore';

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

export const useResolveDtc = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dtcEventId: number) => obdApi.resolveDtc(dtcEventId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['obd', 'dtc'] }),
  });
};

// ---- BLE connection + trip management ----

export function useObdConnection(vehicleId: number, vehicleName?: string) {
  const qc = useQueryClient();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [foundDevices, setFoundDevices] = useState<ObdDevice[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<ObdSnapshot | null>(null);
  const [lastTripSummary, setLastTripSummary] = useState<TripSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<ObdWarning>(null);
  const [capability, setCapability] = useState<VehicleCapability | null>(null);

  // Capability (R8): cache có sẵn thì dùng ngay, chưa có thì dò 1 lần sau kết nối.
  // Nạp whitelist cho ObdReader để poll bỏ qua PID xe không hỗ trợ (ý #18).
  const loadCapability = useCallback(async (allowDiscover: boolean) => {
    let cap = await getCachedCapability(vehicleId).catch(() => null);
    if (!cap && allowDiscover) {
      cap = await discoverCapability(vehicleId).catch(() => null);
    }
    setActivePidWhitelist(cap?.supportedPids ?? null);
    setCapability(cap);
  }, [vehicleId]);

  // Chuyến sống ở obdTripManager (C5 tầng 2) - hook chỉ là VIEW: subscribe sự
  // kiện để cập nhật state, rời màn hình KHÔNG còn giết chuyến. Telemetry +
  // notification + lưu chuyến đều đã chuyển sang manager (chạy không cần UI).
  const [isTripActive, setIsTripActive] = useState(obdTripManager.isActive());

  useEffect(() => {
    const unsubs = [
      obdTripManager.onSnapshot((snap) => setLiveSnapshot(snap)),
      obdTripManager.onDtcFound(() => {
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
      }),
      obdTripManager.onTripEnd((summary) => {
        setIsTripActive(false);
        setLastTripSummary(summary);
        qc.invalidateQueries({ queryKey: ['obd', 'trips', vehicleId] });
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      }),
      bleService.addDisconnectListener(() => {
        setIsTripActive(obdTripManager.isActive());
        setConnectionState('disconnected');
        setLiveSnapshot(null);
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
      setErrorMessage('Can khong co quyen Bluetooth');
      return;
    }

    setConnectionState('scanning');

    try {
      await bleService.waitForBleReady();
    } catch (e: any) {
      // Bluetooth đang tắt: thử bật hộ (Android ≤12) rồi chờ lại một lần -
      // user không phải tự mò vào cài đặt (bug Sang báo 13/7).
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

      const snap = await readSnapshot();
      setLiveSnapshot(snap);

      // Ghi nhớ thiết bị này thuộc xe nào - để BLE restore (iOS background) và
      // NFC tag sau này tự nhận diện đúng xe mà không cần user chọn lại.
      savePairing({ bleDeviceId: deviceId, vehicleId, vehicleName: vehicleName ?? '' }).catch(() => {});
      return true;
    } catch (e: any) {
      // NHẢ kết nối BLE dở dang: adapter đang bị app giữ sẽ NGỪNG quảng bá tên,
      // mọi lần quét sau sẽ không bao giờ thấy nó nữa (phải rút cắm lại mới hiện).
      // Đây chính là lỗi "chỉ connect được đúng 1 lần" - fixture #1.
      await bleService.disconnect().catch(() => {});
      setConnectionState('error');
      setErrorMessage(e.message);
      return false;
    }
  }, [stopScan, vehicleId, vehicleName, loadCapability]);

  const disconnect = useCallback(async () => {
    // Chốt chuyến trước khi ngắt (manager lưu chuyến, kể cả offline)
    obdTripManager.stop();
    await bleService.disconnect();
    setConnectionState('disconnected');
    setLiveSnapshot(null);
  }, []);

  // --- Trip ---

  const startTrip = useCallback(() => {
    if (obdTripManager.start(vehicleId)) setIsTripActive(true);
  }, [vehicleId]);

  const stopTrip = useCallback(() => {
    obdTripManager.stop();
  }, []);

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
      // Chuyến đang chạy toàn cục (bắt đầu từ lần vào Dashboard trước) → đồng bộ lại
      setIsTripActive(obdTripManager.isActive());
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
    getTripDistanceKm: () => obdTripManager.getCurrentDistanceKm(),
    lastTripSummary,
    errorMessage,
    warning,
    capability,
    isConnected: connectionState === 'connected',
    isTripActive,
    startScan,
    stopScan,
    connect,
    disconnect,
    startTrip,
    stopTrip,
  };
}
