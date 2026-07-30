/**
 * obdKeepAliveService (16/7, fixture #5 thật): phiên OBD2 mở màn hình rồi khoá
 * máy không có foreground service nào giữ tiến trình JS -> setInterval poll bị
 * Android đóng băng gần như ngay (phiên 54 phút chỉ có ~15s dữ liệu sống). Tái
 * dùng cơ chế Location.startLocationUpdatesAsync + foregroundService đã chạy ổn
 * định cho GPS trip tracking thay vì viết Foreground Service native mới.
 */
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import {
  startObdKeepAlive,
  stopObdKeepAlive,
  requestKeepAlivePermissions,
  OBD_KEEPALIVE_TASK_NAME,
} from '../obdKeepAliveService';

describe('obdKeepAliveService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  });

  it('không làm gì trên iOS', async () => {
    const status = await startObdKeepAlive('ios');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(status).toBe('skipped_ios');
    await stopObdKeepAlive();
  });

  it('bỏ qua nếu 1 chuyến GPS đã đang chạy song song - tiến trình đã được bảo vệ sẵn', async () => {
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(
      async (name: string) => name === 'GPS_TRIP_TRACKING'
    );
    const status = await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(status).toBe('skipped_gps_active');
    await stopObdKeepAlive();
  });

  it('bỏ qua nếu chưa có quyền vị trí nền - không tự xin permission mới', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const status = await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(status).toBe('skipped_no_permission');
    await stopObdKeepAlive();
  });

  it('khởi task keep-alive khi Android + có quyền + không có chuyến GPS nào chạy', async () => {
    const status = await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      OBD_KEEPALIVE_TASK_NAME,
      expect.objectContaining({ distanceInterval: 0 })
    );
    expect(status).toBe('started');
    await stopObdKeepAlive();
  });

  it('gọi start 2 lần liên tiếp chỉ khởi task 1 lần', async () => {
    await startObdKeepAlive('android');
    const status = await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(status).toBe('already_running');
    await stopObdKeepAlive();
  });

  it('stop() chỉ dừng task nếu CHÍNH nó đã khởi - gọi stop không cần start trước không làm gì', async () => {
    await stopObdKeepAlive();
    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('start rồi stop: dừng đúng task đã khởi', async () => {
    // Mô phỏng trạng thái thật: task chỉ "đang chạy" SAU khi startLocationUpdatesAsync
    // được gọi - không phải luôn true, để đúng nhánh already-running trong source.
    let taskRunning = false;
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(async () => taskRunning);
    (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(async () => { taskRunning = true; });
    (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(async () => { taskRunning = false; });

    await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

    await stopObdKeepAlive();
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(OBD_KEEPALIVE_TASK_NAME);
  });
});

// Rà soát 29/7: requestKeepAlivePermissions() không còn tự hiện dialog
// "disclosure" custom nữa (caller - OBDDashboardScreen - đã hiện nudge Alert
// TRƯỚC đó, đủ vai trò công bố nổi bật) - hàm này giờ gọi thẳng luồng xin
// quyền hệ thống foreground -> background, không còn Alert.alert() nào ở đây.
describe('requestKeepAlivePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('không làm gì trên iOS - trả về true ngay, không xin quyền gì', async () => {
    const granted = await requestKeepAlivePermissions('ios');
    expect(granted).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('đã có quyền nền sẵn (vd cấp qua GPS trip) - trả về true ngay, không xin lại', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const granted = await requestKeepAlivePermissions('android');
    expect(granted).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền nền, từ chối quyền foreground - trả về false, không xin quyền nền', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const granted = await requestKeepAlivePermissions('android');
    expect(granted).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền nền, cấp cả foreground lẫn nền - trả về true, không hiện Alert nào', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    const granted = await requestKeepAlivePermissions('android');
    expect(granted).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
