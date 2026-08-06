import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getAndroidId } from 'expo-application';

// Rà soát 6/8 (user báo: xoá app cài lại, đăng nhập lại thấy 2 phiên thiết bị
// thay vì đúng 1) - trước đây tự sinh UUID ngẫu nhiên rồi lưu AsyncStorage.
// AsyncStorage là dữ liệu RIÊNG của app, bị hệ điều hành XOÁ SẠCH khi gỡ cài
// đặt - mỗi lần cài lại sinh 1 device_id MỚI, backend UPSERT theo device_id
// (xem devicesApi.heartbeat trong api/devices.ts) nên tạo hẳn 1 row thiết bị
// mới dù là CÙNG 1 máy vật lý. Đổi sang định danh sống ở TẦNG HỆ ĐIỀU HÀNH,
// không thuộc dữ liệu app nên sống sót qua gỡ cài đặt:
// - Android: Settings.Secure.ANDROID_ID (getAndroidId()) - hằng định theo tổ
//   hợp máy + chữ ký ký app + user, chỉ đổi khi factory reset hoặc đổi chữ ký.
// - iOS: KHÔNG dùng identifierForVendor - đúng kịch bản "gỡ app rồi cài lại"
//   là trường hợp Apple tự đổi IDFV nếu vendor không còn app nào khác trên
//   máy (rất hay gặp với app đơn, đúng use-case user vừa báo). Lưu UUID tự
//   sinh vào Keychain (expo-secure-store) thay vì AsyncStorage - Keychain
//   KHÔNG bị xoá theo app lúc gỡ cài đặt trên iOS (khác Keystore Android).
const KEY = 'app_device_id';
let cached: string | null = null;

function generate(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  if (Platform.OS === 'android') {
    try {
      const androidId = getAndroidId();
      if (androidId) { cached = androidId; return androidId; }
    } catch {
      // Rơi xuống nhánh Keychain bên dưới nếu API native lỗi trên ROM nào đó.
    }
  }

  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) { cached = stored; return stored; }
    const id = generate();
    await SecureStore.setItemAsync(KEY, id);
    cached = id;
    return id;
  } catch {
    return 'fallback-device';
  }
}
