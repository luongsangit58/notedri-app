import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18nStore } from '../../i18n';
import { PermissionManager } from '../permissions/PermissionManager';

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

    const perm = await PermissionManager.getLocationBackgroundStatus();
    if (!perm.granted) return 'skipped_no_permission';

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
 * của GpsTripTracker).
 *
 * Rà soát 29/7 (user báo 4 popup liên tiếp ngay sau lần kết nối OBD2 đầu
 * tiên - nudge, disclosure, popup hệ thống vị trí, rồi popup hệ thống miễn
 * trừ pin - cảm thấy quá phiền): bỏ hẳn màn "disclosure" custom riêng
 * (trước gọi PermissionManager.requestLocationBackground với title/body
 * keepalive_disclosure_*) - nội dung nhắc obd.keepalive_nudge_* mà
 * OBDDashboardScreen đã hiện TRƯỚC khi gọi hàm này đã đủ chuẩn "công bố nổi
 * bật" theo yêu cầu Google Play, không cần lặp lại lần 2 cho cùng 1 quyền.
 * Gọi thẳng requestLocationBackgroundAlreadyDisclosed() -> chỉ còn 1 popup
 * hệ thống (xin quyền vị trí "Luôn cho phép") sau nudge, thay vì 2 dialog
 * custom liên tiếp trước popup hệ thống đó.
 */
export async function requestKeepAlivePermissions(platformOS: string = Platform.OS): Promise<boolean> {
  if (platformOS !== 'android') return true;

  const bg = await PermissionManager.requestLocationBackgroundAlreadyDisclosed()
    .catch(() => ({ granted: false, canAskAgain: true }));
  return bg.granted;
}

const GAP_DETECTED_KEY = 'obd_keepalive_gap_detected';

/**
 * Rà soát 29/7: thay vì nhắc bật chạy nền NGAY sau lần kết nối OBD2 đầu tiên
 * (user chưa từng gặp vấn đề gì, thấy như bị xin quyền vô cớ), chỉ đặt cờ ở
 * đây khi phiên VỪA kết thúc thực sự có khoảng trống dữ liệu do khoá màn
 * hình/app bị đưa xuống nền (background_gap_count > 0, xem obdLiveMonitor.ts)
 * MÀ quyền vị trí nền vẫn chưa có. Cờ này được OBDDashboardScreen đọc ở lần
 * kết nối KẾ TIẾP để quyết định có hiện nudge hay không - nhắc đúng lúc user
 * đã thực sự "đau" (mất dữ liệu) thay vì đoán trước, tỷ lệ đồng ý cao hơn và
 * bớt cảm giác bị làm phiền vô cớ ngay lần đầu dùng.
 */
export async function recordSessionGap(backgroundGapCount: number, platformOS: string = Platform.OS): Promise<void> {
  if (platformOS !== 'android' || backgroundGapCount <= 0) return;
  try {
    const perm = await PermissionManager.getLocationBackgroundStatus();
    if (perm.granted) return;
    await AsyncStorage.setItem(GAP_DETECTED_KEY, '1');
  } catch {
    // Best-effort - không được để lỗi ở đây làm gãy luồng ngắt kết nối chính.
  }
}

/** Đọc-rồi-xoá cờ ở trên - gọi từ OBDDashboardScreen khi quyết định có hiện nudge hay không. */
export async function consumeSessionGapFlag(): Promise<boolean> {
  try {
    const had = (await AsyncStorage.getItem(GAP_DETECTED_KEY)) === '1';
    if (had) await AsyncStorage.removeItem(GAP_DETECTED_KEY);
    return had;
  } catch {
    return false;
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
