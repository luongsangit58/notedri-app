import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { TripSession, TripSummary } from './TripSession';
import { ObdSnapshot, DtcCode } from './ObdReader';
import { obdApi } from '../../api/obd';
import { enqueueTripSync } from './TripSyncQueue';
import { bleService } from './BleService';
import { useObdSessionStore } from '../../store/obdSessionStore';
import { useI18nStore } from '../../i18n';

/**
 * Quản lý chuyến OBD TOÀN CỤC (C5 tầng 2): chuyến sống ở singleton như
 * GpsTripTracker, KHÔNG chết khi user rời màn Dashboard (bug UX Sang báo 13/7 -
 * trước đây TripSession sống trong hook của màn hình, unmount là chuyến tự chốt).
 * Chuyến chỉ kết thúc khi: user bấm dừng / máy tắt (idle 30s) / mất kết nối hẳn
 * (sau reconnect grace). Lưu chuyến + notification + telemetry đều chạy ở đây -
 * độc lập hoàn toàn với việc màn hình nào đang mở.
 */

let current: TripSession | null = null;
let currentVehicleId: number | null = null;

const snapshotListeners = new Set<(s: ObdSnapshot) => void>();
const dtcListeners = new Set<(codes: DtcCode[]) => void>();
const endListeners = new Set<(summary: TripSummary) => void>();

// Mất kết nối OBD khi ĐANG có chuyến và app ở NỀN → 1 notification local để user
// biết chuyến đã được lưu (đang mở app thì UI hiện trạng thái đỏ, không làm phiền).
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

export const obdTripManager = {
  isActive(): boolean {
    return current !== null && current.getState() === 'running';
  },

  getVehicleId(): number | null {
    return currentVehicleId;
  },

  getCurrentDistanceKm(): number {
    return current?.getCurrentDistanceKm() ?? 0;
  },

  /** Bắt đầu chuyến cho 1 xe. false nếu chưa kết nối hoặc đang có chuyến chạy. */
  start(vehicleId: number): boolean {
    if (!bleService.isConnected() || this.isActive()) return false;

    const session = new TripSession(vehicleId);

    session.onSnapshot = (snap) => snapshotListeners.forEach((fn) => fn(snap));
    session.onDtcFound = (codes) => dtcListeners.forEach((fn) => fn(codes));

    session.onTripEnd = async (summary) => {
      current = null;
      currentVehicleId = null;
      useObdSessionStore.getState().patch({ tripActive: false });

      const deviceId = bleService.getDeviceId();
      try {
        await obdApi.saveTrip(summary, deviceId);
      } catch {
        // Offline giữa đường - vào hàng đợi, App foreground sẽ flush
        await enqueueTripSync(summary, deviceId);
      }
      endListeners.forEach((fn) => fn(summary));
    };

    session.start();
    current = session;
    currentVehicleId = vehicleId;
    useObdSessionStore.getState().patch({ tripActive: true });
    return true;
  },

  stop(): void {
    current?.stop();
  },

  onSnapshot(fn: (s: ObdSnapshot) => void): () => void {
    snapshotListeners.add(fn);
    return () => snapshotListeners.delete(fn);
  },

  onDtcFound(fn: (codes: DtcCode[]) => void): () => void {
    dtcListeners.add(fn);
    return () => dtcListeners.delete(fn);
  },

  onTripEnd(fn: (summary: TripSummary) => void): () => void {
    endListeners.add(fn);
    return () => endListeners.delete(fn);
  },
};

// ---- Đăng ký 1 lần ở module level: các việc phải chạy dù KHÔNG màn hình nào mở ----

bleService.addDisconnectListener(() => {
  // 1) Telemetry retention (ý #14): report phiên vừa kết thúc. Đọc vehicleId
  //    TRƯỚC khi store bị clear (BleService fire listener trước rồi mới clear).
  //    consumeSessionInfo đọc-rồi-xoá nên không bao giờ report đôi.
  const info = bleService.consumeSessionInfo();
  const vehicleId = useObdSessionStore.getState().vehicleId;
  if (info && vehicleId) {
    obdApi.reportSession({
      vehicle_id: vehicleId,
      device_name: info.deviceName,
      connected_at: new Date(info.startedAt).toISOString(),
      duration_seconds: Math.max(0, Math.round((Date.now() - info.startedAt) / 1000)),
    }).catch(() => {});
  }

  // 2) Chuyến đang chạy → chốt + lưu (không mất dữ liệu) + notification nếu app ở nền
  if (obdTripManager.isActive()) {
    notifyTripInterruptedIfBackground();
    obdTripManager.stop();
  }
});
