import { NativeModule, requireNativeModule } from 'expo';

export type ClassicBtDevice = {
  address: string;
  name: string;
  bonded: boolean;
};

type NotedriBtPairingEvents = {
  // Đoạn dữ liệu thô đọc được từ socket RFCOMM, mã hoá base64 - CÙNG bảng mã
  // btoa/atob JS đã dùng cho BLE (characteristic.value cũng là base64), để
  // BleService.ts gộp vào chung 1 buffer/tìm dấu '>' mà không cần phân biệt
  // transport. Xem connectClassic() trong NotedriBtPairingModule.kt.
  onClassicData: (event: { data: string }) => void;
  // Bắn ra khi mất kết nối Classic - CẢ chủ động (disconnectClassic()) lẫn bất
  // ngờ (remote đóng socket, lỗi đọc/ghi) - giống hệt model device.onDisconnected()
  // của react-native-ble-plx bên BLE: luôn bắn, JS tự quyết định có reconnect
  // hay không qua cờ intentionalDisconnect (không phải native tự quyết).
  onClassicDisconnected: (event: { reason: string }) => void;
};

declare class NotedriBtPairingModule extends NativeModule<NotedriBtPairingEvents> {
  /**
   * Liệt kê thiết bị Classic Bluetooth ĐÃ GHÉP NỐI (adapter.bondedDevices).
   * Rà soát 22/7: từng có thêm bước tự quét sống (adapter.startDiscovery())
   * cho thiết bị chưa ghép nối, nhưng log thật cho thấy bước này không đáng
   * tin cậy trên 1 số ROM (found 0 dù thiết bị đang ở gần, kể cả khi không
   * còn tranh chấp radio với BLE) - đã bỏ. User cần tự ghép nối qua Cài đặt
   * Bluetooth hệ thống (PIN 1234 cho "Android-Vlink") trước khi dùng hàm này.
   */
  discoverDevices(): Promise<ClassicBtDevice[]>;

  /**
   * Ghép nối (tự cấp PIN, không qua hộp thoại hệ thống) rồi gửi ATZ qua RFCOMM
   * Classic Bluetooth, trả về response thô. Chỉ dùng cho spike xác nhận thiết
   * bị OBD2 có trả lời được qua Classic hay không - xem NotedriBtPairingModule.kt.
   */
  pairAndTestAtz(address: string, pin: string): Promise<string>;

  /**
   * Kết nối THẬT dùng cho phiên OBD chính (22/7) - ghép nối rồi mở socket
   * RFCOMM GIỮ SỐNG, đọc liên tục và đẩy dữ liệu qua sự kiện onClassicData tới
   * khi disconnectClassic() được gọi hoặc mất kết nối bất ngờ (onClassicDisconnected).
   * Chỉ 1 kết nối Classic sống tại 1 thời điểm - gọi lại khi đã có 1 kết nối
   * sẽ tự đóng kết nối cũ trước (lặng lẽ, không bắn onClassicDisconnected cho
   * kết nối cũ đó).
   */
  connectClassic(address: string, pin: string): Promise<void>;

  /**
   * Ghi 1 lệnh (đã btoa như BLE) vào socket Classic đang mở. Throw nếu chưa
   * có kết nối nào (chưa gọi connectClassic() hoặc đã disconnect).
   */
  writeClassic(base64: string): Promise<void>;

  /** Đóng kết nối Classic đang mở (nếu có) - an toàn khi gọi dù không có kết nối. */
  disconnectClassic(): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NotedriBtPairingModule>('NotedriBtPairing');
