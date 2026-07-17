/**
 * Rà soát 17/7 (user hỏi khoá màn hình sau khi kết nối OBD2 có ảnh hưởng gì
 * không): obdKeepAliveService chỉ giữ được tiến trình sống khi quyền vị trí nền
 * đã có sẵn, nhưng trước đây quyền này chỉ được xin từ luồng GPS trip - user chỉ
 * dùng OBD2 không có quyền này. Module này chủ động xin quyền lúc kết nối OBD2.
 */
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { ensureObdBackgroundPermission, __resetAskedForTest } from '../obdBackgroundPermission';

describe('obdBackgroundPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAskedForTest();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('không làm gì trên iOS', async () => {
    await ensureObdBackgroundPermission('ios');
    expect(Location.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('đã có quyền sẵn -> không hỏi gì thêm', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await ensureObdBackgroundPermission('android');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('chưa có quyền, user đồng ý -> xin quyền thật', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.(); // user bấm "Tiếp tục"
    });

    await ensureObdBackgroundPermission('android');
    expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('chưa có quyền, user từ chối -> không gọi request thật', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.[0]?.onPress?.(); // user bấm "Không, cảm ơn"
    });

    await ensureObdBackgroundPermission('android');
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('bị chặn vĩnh viễn (canAskAgain=false) -> không hiện dialog nữa', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: false });
    await ensureObdBackgroundPermission('android');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('chỉ hỏi 1 lần/phiên app dù kết nối lại nhiều lần', async () => {
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied', canAskAgain: true });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.());

    await ensureObdBackgroundPermission('android');
    await ensureObdBackgroundPermission('android'); // reconnect lần 2 trong cùng phiên app
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});
