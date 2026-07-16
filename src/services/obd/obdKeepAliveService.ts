import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useI18nStore } from '../../i18n';

// Trùng GPS_TASK_NAME (GpsTripTracker.ts) - KHÔNG import trực tiếp từ đó: module
// này kéo theo expo-notifications/gpsTripsApi, chuỗi phụ thuộc nặng không cần
// thiết ở đây (và làm vỡ cô lập test). Chỉ là 1 chuỗi định danh task, không phải
// logic dùng chung.
const GPS_TASK_NAME = 'GPS_TRIP_TRACKING';

/**
 * Rà soát 16/7 (fixture #5 thật: phiên 54 phút chỉ có ~15s dữ liệu sống): khi
 * user mở màn OBD2 rồi khoá màn hình MÀ KHÔNG có chuyến GPS nào đang chạy song
 * song, app không giữ bất kỳ foreground service nào -> Android đóng băng JS
 * timer (setInterval trong obdLiveMonitor) gần như ngay lập tức. GpsTripTracker
 * ĐÃ CÓ foreground service thật hoạt động ổn định (Location.startLocationUpdatesAsync
 * + option foregroundService) cho tính năng tự ghi hành trình - tái dùng CHÍNH
 * cơ chế đó thay vì viết Foreground Service native mới từ đầu (rủi ro cao hơn,
 * không tự kiểm chứng được bằng lái xe thật).
 *
 * CHỈ Android: iOS xử lý app-suspend khác (không có khái niệm foreground service
 * kiểu Android) và Apple review rất khắt khe việc dùng background location sai
 * mục đích khai báo - dùng "mẹo" này trên iOS có thể vi phạm App Store Guidelines.
 *
 * CHỈ chạy khi permission vị trí nền ĐÃ được cấp sẵn (từ luồng onboarding GPS
 * trip) - không tự xin permission mới ở đây, tránh prompt lạ lúc user chỉ đang
 * kết nối OBD2 (không liên quan tới GPS trong nhận thức của họ).
 */
export const OBD_KEEPALIVE_TASK_NAME = 'OBD_KEEPALIVE_TRACKING';

// Không cần toạ độ thật - task rỗng, mục đích DUY NHẤT là giữ
// Location.startLocationUpdatesAsync() chạy để Android cấp foreground service.
TaskManager.defineTask(OBD_KEEPALIVE_TASK_NAME, async () => {});

let startedByUs = false;

/**
 * Gọi khi obdLiveMonitor bắt đầu 1 phiên (BLE connect). An toàn để gọi nhiều lần.
 * platformOS tách riêng làm tham số (mặc định Platform.OS thật) để test không
 * phải mock lại toàn bộ module 'react-native' - Platform.OS không gán trực
 * tiếp được trong môi trường Jest, mock module lại vỡ chuỗi expo-modules-core.
 */
export async function startObdKeepAlive(platformOS: string = Platform.OS): Promise<void> {
  if (platformOS !== 'android') return;
  if (startedByUs) return;

  try {
    // Đã có foreground service thật từ 1 chuyến GPS đang chạy song song -> khỏi
    // cần khởi thêm task nữa, tiến trình JS đã được bảo vệ rồi.
    const gpsRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
    if (gpsRunning) return;

    const perm = await Location.getBackgroundPermissionsAsync();
    if (perm.status !== 'granted') return;

    const already = await Location.hasStartedLocationUpdatesAsync(OBD_KEEPALIVE_TASK_NAME).catch(() => false);
    if (already) { startedByUs = true; return; }

    await Location.startLocationUpdatesAsync(OBD_KEEPALIVE_TASK_NAME, {
      accuracy: Location.Accuracy.Lowest,
      timeInterval: 60_000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: useI18nStore.getState().t('obd.fg_notif_title'),
        notificationBody: useI18nStore.getState().t('obd.fg_notif_body'),
        notificationColor: '#2563EB',
      },
      pausesUpdatesAutomatically: false,
    });
    startedByUs = true;
  } catch {
    // Thiếu permission/API không sẵn sàng - bỏ qua, quay lại hành vi cũ (không
    // giữ được nền), không được để lỗi ở đây làm gãy luồng kết nối OBD2 chính.
  }
}

/** Gọi khi obdLiveMonitor dừng (BLE disconnect). Chỉ dừng task DO CHÍNH nó khởi. */
export async function stopObdKeepAlive(): Promise<void> {
  if (!startedByUs) return;
  startedByUs = false;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(OBD_KEEPALIVE_TASK_NAME).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(OBD_KEEPALIVE_TASK_NAME);
  } catch {
    // Best-effort - service tự dọn khi process bị Android hồi sinh lần sau.
  }
}
