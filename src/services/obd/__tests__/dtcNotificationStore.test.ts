import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { syncDtcNotifications } from '../dtcNotificationStore';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
}));

describe('dtcNotificationStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  });

  it('bắn push cho mã lỗi mới, không bắn nếu không có mã', async () => {
    await syncDtcNotifications(1, []);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('không báo lại mã đã biết khi kết nối lại (user chưa/không sửa xe)', async () => {
    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Mô phỏng phiên OBD2 MỚI (reconnect) - vẫn cùng mã cũ, chưa sửa xe.
    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1); // không tăng thêm
  });

  it('mã tự hết (xe đã sửa) rồi tái xuất hiện sau này -> báo lại như mã mới', async () => {
    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Lần đọc sau: mã đã hết (xe sửa xong / mã tự xoá) - không báo gì thêm.
    await syncDtcNotifications(1, []);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Mã quay lại sau này (hỏng lại) -> phải được coi là MỚI, báo lại.
    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('mỗi xe theo dõi mã lỗi độc lập', async () => {
    await syncDtcNotifications(1, [{ code: 'P0300', description: null }]);
    await syncDtcNotifications(2, [{ code: 'P0300', description: null }]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2); // mã mới với CẢ 2 xe
  });

  it('gộp nhiều mã mới cùng lúc thành 1 thông báo duy nhất', async () => {
    await syncDtcNotifications(1, [
      { code: 'P0300', description: null },
      { code: 'P0171', description: null },
    ]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
