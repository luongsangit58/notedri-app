/**
 * obdKeepAliveService (16/7, fixture #5 thật): phiên OBD2 mở màn hình rồi khoá
 * máy không có foreground service nào giữ tiến trình JS -> setInterval poll bị
 * Android đóng băng gần như ngay (phiên 54 phút chỉ có ~15s dữ liệu sống). Tái
 * dùng cơ chế Location.startLocationUpdatesAsync + foregroundService đã chạy ổn
 * định cho GPS trip tracking thay vì viết Foreground Service native mới.
 */
import * as Location from 'expo-location';
import { startObdKeepAlive, stopObdKeepAlive, OBD_KEEPALIVE_TASK_NAME } from '../obdKeepAliveService';

describe('obdKeepAliveService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  });

  it('không làm gì trên iOS', async () => {
    await startObdKeepAlive('ios');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    await stopObdKeepAlive();
  });

  it('bỏ qua nếu 1 chuyến GPS đã đang chạy song song - tiến trình đã được bảo vệ sẵn', async () => {
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockImplementation(
      async (name: string) => name === 'GPS_TRIP_TRACKING'
    );
    await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    await stopObdKeepAlive();
  });

  it('bỏ qua nếu chưa có quyền vị trí nền - không tự xin permission mới', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    await stopObdKeepAlive();
  });

  it('khởi task keep-alive khi Android + có quyền + không có chuyến GPS nào chạy', async () => {
    await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      OBD_KEEPALIVE_TASK_NAME,
      expect.objectContaining({ distanceInterval: 0 })
    );
    await stopObdKeepAlive();
  });

  it('gọi start 2 lần liên tiếp chỉ khởi task 1 lần', async () => {
    await startObdKeepAlive('android');
    await startObdKeepAlive('android');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
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
