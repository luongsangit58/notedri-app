import { NativeModule, requireNativeModule } from 'expo';

export type ClassicBtDevice = {
  address: string;
  name: string;
  bonded: boolean;
};

declare class NotedriBtPairingModule extends NativeModule<Record<string, never>> {
  /**
   * Liệt kê thiết bị Classic Bluetooth có thể chọn: thiết bị đã ghép nối
   * trước (hiện ngay) + quét mới quanh đó (~10s, đến khi Android tự báo
   * ACTION_DISCOVERY_FINISHED).
   */
  discoverDevices(): Promise<ClassicBtDevice[]>;

  /**
   * Ghép nối (tự cấp PIN, không qua hộp thoại hệ thống) rồi gửi ATZ qua RFCOMM
   * Classic Bluetooth, trả về response thô. Chỉ dùng cho spike xác nhận thiết
   * bị OBD2 có trả lời được qua Classic hay không - xem NotedriBtPairingModule.kt.
   */
  pairAndTestAtz(address: string, pin: string): Promise<string>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NotedriBtPairingModule>('NotedriBtPairing');
