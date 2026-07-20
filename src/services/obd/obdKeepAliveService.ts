import { Platform, Alert } from 'react-native';
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

// Lý do dừng/bỏ qua - trước đây hàm trả void nên khi có khoảng lặng dài bất
// thường trong log (rà soát 20/7) không cách nào xác nhận keep-alive có chạy
// hay đã âm thầm bỏ qua vì thiếu quyền. Giờ caller (obdLiveMonitor) ghi lý do
// này vào session log xuất ra cùng fixture.
export type KeepAliveStatus =
  | 'started'
  | 'already_running'
  | 'skipped_ios'
  | 'skipped_gps_active'
  | 'skipped_no_permission'
  | 'error';

/**
 * Gọi khi obdLiveMonitor bắt đầu 1 phiên (BLE connect). An toàn để gọi nhiều lần.
 * platformOS tách riêng làm tham số (mặc định Platform.OS thật) để test không
 * phải mock lại toàn bộ module 'react-native' - Platform.OS không gán trực
 * tiếp được trong môi trường Jest, mock module lại vỡ chuỗi expo-modules-core.
 */
export async function startObdKeepAlive(platformOS: string = Platform.OS): Promise<KeepAliveStatus> {
  if (platformOS !== 'android') return 'skipped_ios';
  if (startedByUs) return 'already_running';

  try {
    // Đã có foreground service thật từ 1 chuyến GPS đang chạy song song -> khỏi
    // cần khởi thêm task nữa, tiến trình JS đã được bảo vệ rồi.
    const gpsRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false);
    if (gpsRunning) return 'skipped_gps_active';

    const perm = await Location.getBackgroundPermissionsAsync();
    if (perm.status !== 'granted') return 'skipped_no_permission';

    const already = await Location.hasStartedLocationUpdatesAsync(OBD_KEEPALIVE_TASK_NAME).catch(() => false);
    if (already) { startedByUs = true; return 'already_running'; }

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
    return 'started';
  } catch {
    // Thiếu permission/API không sẵn sàng - bỏ qua, quay lại hành vi cũ (không
    // giữ được nền), không được để lỗi ở đây làm gãy luồng kết nối OBD2 chính.
    return 'error';
  }
}

/**
 * Rà soát 20/7: user chỉ dùng OBD2 (không bật GPS trip) không bao giờ đi qua
 * luồng xin quyền vị trí nền -> startObdKeepAlive() ở trên luôn 'skipped_no_
 * permission' âm thầm, khoá màn hình lúc lái là mất dữ liệu nhiều phút. Hàm
 * này xin quyền RIÊNG cho luồng OBD (không đụng tới GPS_TASK_NAME/trip state
 * của GpsTripTracker) - có màn hình "disclosure" giải thích trước khi xin
 * quyền nền, đúng yêu cầu Google Play cho background location.
 */
export async function requestKeepAlivePermissions(platformOS: string = Platform.OS): Promise<boolean> {
  if (platformOS !== 'android') return true;

  const existing = await Location.getBackgroundPermissionsAsync().catch(() => null);
  if (existing?.status === 'granted') return true;

  const t = useI18nStore.getState().t;
  const proceed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      t('obd.keepalive_disclosure_title'),
      t('obd.keepalive_disclosure_body'),
      [
        { text: t('gps_trips.disclosure_cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('gps_trips.disclosure_continue'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
  if (!proceed) return false;

  // Android bắt buộc phải có quyền foreground TRƯỚC khi xin được quyền nền.
  const fg = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  return bg.status === 'granted';
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
