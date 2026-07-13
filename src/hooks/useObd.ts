import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18nStore } from '../i18n';
import { obdApi } from '../api/obd';
import { bleService, ConnectionState, ObdDevice } from '../services/obd/BleService';
import { initializeElm327, readSnapshot, ObdSnapshot } from '../services/obd/ObdReader';
import { TripSession, TripSummary } from '../services/obd/TripSession';
import { enqueueTripSync } from '../services/obd/TripSyncQueue';
import { savePairing } from '../services/obd/pairedDevices';
import { useAuthStore } from '../store/authStore';

export type ObdWarning = { type: 'no_data'; rawResponse?: string } | null;

// Mất kết nối OBD khi ĐANG có chuyến và app ở NỀN → 1 notification local để user biết
// chuyến đã được chốt (đang mở app thì UI hiện trạng thái đỏ rồi, không làm phiền thêm).
function notifyTripInterruptedIfBackground(): void {
  if (AppState.currentState === 'active') return;
  const t = useI18nStore.getState().t;
  Notifications.scheduleNotificationAsync({
    content: {
      title: t('obd.disconnect_notify_title'),
      body: t('obd.disconnect_notify_body'),
    },
    trigger: null,
  }).catch(() => {});
}

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

  // Keep trip session in a ref (not state) so cleanup effects always see the
  // latest instance without stale closure problems.
  const currentTripRef = useRef<TripSession | null>(null);
  const [isTripActive, setIsTripActive] = useState(false);

  // Telemetry retention (ý #14): mốc phiên đọc từ singleton BleService
  // (consumeSessionInfo xoá mốc sau khi đọc → mỗi phiên report đúng 1 lần).
  const reportSessionEnd = useCallback(() => {
    const s = bleService.consumeSessionInfo();
    if (!s || !vehicleId) return;
    // Fire-and-forget: telemetry không được ảnh hưởng UX, lỗi thì bỏ qua.
    obdApi.reportSession({
      vehicle_id: vehicleId,
      device_name: s.deviceName,
      connected_at: new Date(s.startedAt).toISOString(),
      duration_seconds: Math.max(0, Math.round((Date.now() - s.startedAt) / 1000)),
    }).catch(() => {});
  }, [vehicleId]);

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
      setConnectionState('error');
      setErrorMessage(e.message);
      return;
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

    // Register disconnect callback before connecting
    bleService.onDisconnect = () => {
      // Finalize any in-progress trip so data is not lost
      if (currentTripRef.current) {
        currentTripRef.current.stop();
        currentTripRef.current = null;
        setIsTripActive(false);
      }
      reportSessionEnd();
      setConnectionState('disconnected');
      setLiveSnapshot(null);
    };
    // Reconnect grace: rớt BLE thoáng qua thì báo 'reconnecting' thay vì giết phiên -
    // trip đang chạy giữ nguyên (TripSession tự bỏ qua các lần đọc lỗi).
    bleService.onReconnecting = () => setConnectionState('reconnecting');
    bleService.onReconnected = () => setConnectionState('connected');

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

      const snap = await readSnapshot();
      setLiveSnapshot(snap);

      // Ghi nhớ thiết bị này thuộc xe nào - để BLE restore (iOS background) và
      // NFC tag sau này tự nhận diện đúng xe mà không cần user chọn lại.
      savePairing({ bleDeviceId: deviceId, vehicleId, vehicleName: vehicleName ?? '' }).catch(() => {});
      return true;
    } catch (e: any) {
      bleService.onDisconnect = null;
      // NHẢ kết nối BLE dở dang: adapter đang bị app giữ sẽ NGỪNG quảng bá tên,
      // mọi lần quét sau sẽ không bao giờ thấy nó nữa (phải rút cắm lại mới hiện).
      // Đây chính là lỗi "chỉ connect được đúng 1 lần" - fixture #1.
      await bleService.disconnect().catch(() => {});
      setConnectionState('error');
      setErrorMessage(e.message);
      return false;
    }
  }, [stopScan, vehicleId, vehicleName, reportSessionEnd]);

  const disconnect = useCallback(async () => {
    if (currentTripRef.current) {
      currentTripRef.current.stop();
      currentTripRef.current = null;
      setIsTripActive(false);
    }
    bleService.onDisconnect = null;
    bleService.onReconnecting = null;
    bleService.onReconnected = null;
    reportSessionEnd();
    await bleService.disconnect();
    setConnectionState('disconnected');
    setLiveSnapshot(null);
  }, [reportSessionEnd]);

  // --- Trip ---

  const startTrip = useCallback(() => {
    if (!bleService.isConnected() || currentTripRef.current) return;

    const session = new TripSession(vehicleId);

    session.onSnapshot = (snap) => setLiveSnapshot(snap);

    session.onDtcFound = () => {
      qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
    };

    session.onTripEnd = async (summary) => {
      currentTripRef.current = null;
      setIsTripActive(false);
      setLastTripSummary(summary);

      const deviceId = bleService.getDeviceId();
      try {
        await obdApi.saveTrip(summary, deviceId);
        qc.invalidateQueries({ queryKey: ['obd', 'trips', vehicleId] });
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      } catch {
        // Network offline — enqueue for retry on next app foreground
        await enqueueTripSync(summary, deviceId);
      }
    };

    session.start();
    currentTripRef.current = session;
    setIsTripActive(true);
  }, [vehicleId, qc]);

  const stopTrip = useCallback(() => {
    currentTripRef.current?.stop();
  }, []);

  // Seed từ singleton khi mount: OBDSetupScreen connect xong rồi navigation.replace()
  // sang OBDDashboard -> hook MỚI khởi tạo 'disconnected' dù bleService đã kết nối.
  // Nếu không đọc lại trạng thái thật, badge đỏ + nút Start Trip bị disabled vĩnh viễn.
  useEffect(() => {
    if (bleService.isConnected()) {
      setConnectionState('connected');
      // Rehydrate snapshot sống để lưới số liệu không hiện "-"
      readSnapshot().then((snap) => setLiveSnapshot(snap)).catch(() => {});
      // Đăng ký lại callback mất kết nối (Setup unmount đã set bleService.onDisconnect = null)
      bleService.onDisconnect = () => {
        if (currentTripRef.current) {
          currentTripRef.current.stop();
          currentTripRef.current = null;
          setIsTripActive(false);
          notifyTripInterruptedIfBackground();
        }
        reportSessionEnd();
        setConnectionState('disconnected');
        setLiveSnapshot(null);
      };
      bleService.onReconnecting = () => setConnectionState('reconnecting');
      bleService.onReconnected = () => setConnectionState('connected');
    }
    // Chỉ chạy 1 lần khi mount - trạng thái thật nằm ở singleton, không phải deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount: stop scan + finalize any active trip
  useEffect(() => {
    return () => {
      clearAutoStopTimer();
      stopScanRef.current?.();
      // Stop trip (triggers onTripEnd → saves data) rather than discarding
      currentTripRef.current?.stop();
      bleService.onDisconnect = null;
      bleService.onReconnecting = null;
      bleService.onReconnected = null;
    };
  }, [clearAutoStopTimer]);

  return {
    connectionState,
    foundDevices,
    liveSnapshot,
    currentTripRef,
    lastTripSummary,
    errorMessage,
    warning,
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
