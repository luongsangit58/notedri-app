import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQuery } from '@tanstack/react-query';
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
  GpsTripState,
  RoutePoint,
  StartResult,
  InterruptedTripInfo,
} from '../services/gps/GpsTripTracker';
import { flushPendingGpsTrips } from '../services/gps/GpsTripSyncQueue';
import { gpsTripsApi } from '../api/gpsTrips';
import { getDeviceId } from '../utils/deviceId';

const POLL_INTERVAL_MS = 4_000;

export type PermissionStatus = { foreground: boolean; background: boolean };
export type ReadinessState = { foreground: boolean; background: boolean; locationEnabled: boolean };

export function useGpsTripState() {
  const [tripState, setTripState] = useState<GpsTripState | null>(null);
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<ReadinessState>({ foreground: false, background: false, locationEnabled: true });
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [interruptedInfo, setInterruptedInfo] = useState<InterruptedTripInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    await flushPendingGpsTrips();
    await refresh();
    await refreshReadiness();
    // Gia hạn lock khi user mở lại app (heartbeat thay thế background interval)
    const [s, active] = await Promise.all([getTripState(), isTrackingActive()]);
    if (active && s.vehicleId) {
      getDeviceId().then((deviceId) =>
        gpsTripsApi.trackingLock.renew(s.vehicleId!, deviceId).catch(() => {}),
      );
    }
    // Sau khi maybeAutoShutdownStale() xử lý, kiểm tra có trip bị gián đoạn cần resume
    const info = await checkInterruptedTrip();
    setInterruptedInfo(info.hasInterrupted ? info : null);
  }, [refresh, refreshReadiness]);

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
        await handleForeground();
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

  const stop = useCallback(async (save: boolean = true) => {
    await stopTracking(save);
    if (save) await flushPendingGpsTrips();
    setInterruptedInfo(null);
    await refresh();
  }, [refresh]);

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
    setInterruptedInfo(null);
    await refresh();
  }, [refresh]);

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

export function useGpsTrips(vehicleId: number, page = 1) {
  return useQuery({
    queryKey: ['gps_trips', vehicleId, page],
    queryFn: () => gpsTripsApi.trips(vehicleId, page).then((r) => r.data),
    enabled: !!vehicleId,
  });
}
