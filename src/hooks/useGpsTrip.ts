import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTripState,
  isTrackingActive,
  requestPermissionsAndStart,
  stopTracking,
  pauseTracking,
  resumeTracking,
  setActiveVehicle,
  getReadiness,
  getRoutePoints,
  maybeAutoShutdownStale,
  hasRecordableTrip,
  checkInterruptedTrip,
  resumeInterruptedTrip,
  renewTrackingLock,
  isAutoArmDisabled,
  enableAutoArm,
  disableAutoArm,
  GpsTripState,
  GpsTripSummary,
  RoutePoint,
  StartResult,
  InterruptedTripInfo,
} from '../services/gps/GpsTripTracker';
import { flushPendingGpsTrips } from '../services/gps/GpsTripSyncQueue';
import { gpsTripsApi } from '../api/gpsTrips';
import { getDeviceId } from '../utils/deviceId';
import { useT } from '../i18n';

const POLL_INTERVAL_MS = 4_000;

export type PermissionStatus = { foreground: boolean; background: boolean };
export type ReadinessState = { foreground: boolean; background: boolean; locationEnabled: boolean; batteryOptimized: boolean };

export function useGpsTripState() {
  const [tripState, setTripState] = useState<GpsTripState | null>(null);
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<ReadinessState>({ foreground: false, background: false, locationEnabled: true, batteryOptimized: true });
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [interruptedInfo, setInterruptedInfo] = useState<InterruptedTripInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();
  // Sau khi lưu/đồng bộ chuyến -> làm mới danh sách hành trình (nếu không, chuyến đã lưu
  // KHÔNG hiện ra tới khi user tự kéo refresh -> tưởng "không lưu được").
  const invalidateTrips = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['gps_trips'] });
  }, [qc]);

  // Poll NHẸ mỗi 4s: chỉ đọc trạng thái chuyến + route (cho bảng tín hiệu live).
  // KHÔNG kiểm quyền/định vị ở đây (chậm + ít đổi) -> tránh app nặng.
  const refresh = useCallback(async () => {
    const [state, active, route] = await Promise.all([
      getTripState(),
      isTrackingActive(),
      getRoutePoints(),
    ]);
    setTripState(state);
    setTracking(active);
    setRoutePoints(route);
  }, []);

  // Readiness (quyền + định vị) kiểm KHÔNG thường xuyên: mount + khi quay lại app.
  const refreshReadiness = useCallback(async () => {
    setPermission(await getReadiness());
  }, []);

  // Dọn dẹp hành trình mồ côi + kiểm tra resume. Gọi cả lúc cold start lẫn foreground.
  const handleForeground = useCallback(async () => {
    await maybeAutoShutdownStale();
    const flushed = await flushPendingGpsTrips();
    if (flushed.synced > 0) invalidateTrips(); // chuyến ghi nền/hôm trước vừa lên server
    await refresh();
    await refreshReadiness();
    // Gia hạn lock khi user mở lại app (heartbeat thay thế background interval)
    const [s, active] = await Promise.all([getTripState(), isTrackingActive()]);
    if (active && s.vehicleId) {
      getDeviceId().then((deviceId) => renewTrackingLock(s.vehicleId!, deviceId));
    }
    // Sau khi maybeAutoShutdownStale() xử lý, kiểm tra có trip bị gián đoạn cần resume
    const info = await checkInterruptedTrip();
    setInterruptedInfo(info.hasInterrupted ? info : null);
  }, [refresh, refreshReadiness, invalidateTrips]);

  // Cold start: gọi handleForeground ngay lập tức (AppState change không fire khi khởi động mới)
  useEffect(() => {
    handleForeground();
    timerRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [handleForeground, refresh]);

  // Foreground transition: gọi handleForeground mỗi lần app active sau khi bị background
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (next === 'active') {
        // handleForeground() chuỗi nhiều bước AsyncStorage/API - 1 bước lỗi (vd
        // mất mạng đúng lúc quay lại app) không được để rớt thành unhandled
        // rejection (listener native không có ai await/catch promise trả về).
        try {
          await handleForeground();
        } catch {}
      }
    });
    return () => sub.remove();
  }, [handleForeground]);

  const startTracking = useCallback(async (vehicleId: number): Promise<StartResult> => {
    const result = await requestPermissionsAndStart(vehicleId);
    setInterruptedInfo(null); // xoá interrupted khi bắt đầu tracking mới
    await refresh();
    return result;
  }, [refresh]);

  const stop = useCallback(async (save: boolean = true): Promise<GpsTripSummary | null> => {
    const saved = await stopTracking(save);
    if (save) await flushPendingGpsTrips();
    invalidateTrips();
    setInterruptedInfo(null);
    await refresh();
    return saved;
  }, [refresh, invalidateTrips]);

  const pause = useCallback(async () => {
    await pauseTracking();
    await refresh();
  }, [refresh]);

  const resume = useCallback(async () => {
    await resumeTracking();
    await refresh();
  }, [refresh]);

  const checkRecordable = useCallback(() => hasRecordableTrip(), []);

  const updateVehicle = useCallback(async (vehicleId: number) => {
    await setActiveVehicle(vehicleId);
    await refresh();
  }, [refresh]);

  // Tiếp tục hành trình bị gián đoạn
  const resumeInterrupted = useCallback(async (): Promise<StartResult> => {
    const result = await resumeInterruptedTrip();
    if (result.ok) setInterruptedInfo(null);
    await refresh();
    return result;
  }, [refresh]);

  // Lưu hành trình bị gián đoạn (không tiếp tục, chỉ lưu)
  const saveInterrupted = useCallback(async () => {
    await stopTracking(true);
    await flushPendingGpsTrips();
    invalidateTrips();
    setInterruptedInfo(null);
    await refresh();
  }, [refresh, invalidateTrips]);

  // Bỏ hành trình bị gián đoạn (không lưu)
  const discardInterrupted = useCallback(async () => {
    await stopTracking(false);
    setInterruptedInfo(null);
    await refresh();
  }, [refresh]);

  return {
    tripState, tracking, permission, routePoints,
    interruptedInfo,
    startTracking, stop, pause, resume,
    resumeInterrupted, saveInterrupted, discardInterrupted,
    checkRecordable, updateVehicle, refresh, refreshReadiness,
  };
}

// Dùng chung cho ProfileScreen (Cài đặt > Tự ghi hành trình GPS khi kết nối
// OBD2) VÀ ActiveTripCard (GpsTripsScreen) - 1 chỗ duy nhất để tránh 2 màn có
// logic xác nhận save/discard lệch nhau theo thời gian. Tự đọc lại cờ
// GPS_AUTO_ARM_DISABLED_KEY (GpsTripTracker.ts) mỗi lần màn hình chứa nó được
// focus (useFocusEffect) - phản ánh đúng nếu user đổi từ MÀN KIA.
export function useGpsAutoRecordToggle() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);

  useFocusEffect(useCallback(() => {
    isAutoArmDisabled().then((disabled) => setEnabled(!disabled));
  }, []));

  const toggle = useCallback(async (next: boolean) => {
    if (next) {
      await enableAutoArm();
      setEnabled(true);
      return;
    }
    // Tắt: có chuyến đang ghi được thì hỏi lưu/bỏ trước (đúng luồng "Tắt theo
    // dõi" cũ ở GpsTripsScreen) - không tự ý xoá dữ liệu hành trình đang dở.
    const recordable = await hasRecordableTrip().catch(() => false);
    if (!recordable) {
      await disableAutoArm();
      await stopTracking(true).catch(() => {});
      setEnabled(false);
      return;
    }
    Alert.alert(t('gps_trips.end_trip_title'), t('gps_trips.end_trip_body'), [
      { text: t('gps_trips.keep_recording'), style: 'cancel' },
      { text: t('gps_trips.discard_no_save'), style: 'destructive', onPress: async () => {
        await disableAutoArm();
        await stopTracking(false).catch(() => {});
        setEnabled(false);
      } },
      { text: t('common.save'), onPress: async () => {
        await disableAutoArm();
        const saved = await stopTracking(true).catch(() => null);
        setEnabled(false);
        if (saved) Alert.alert(t('gps_trips.saved_title'), t('gps_trips.saved_body', { km: Number(saved.distanceKm).toFixed(1) }));
      } },
    ]);
  }, [t]);

  return { enabled, toggle };
}

export function useGpsTrips(vehicleId: number, page = 1) {
  return useQuery({
    queryKey: ['gps_trips', vehicleId, page],
    queryFn: () => gpsTripsApi.trips(vehicleId, page).then((r) => r.data),
    enabled: !!vehicleId,
  });
}
