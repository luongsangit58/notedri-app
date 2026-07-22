import { NativeModule, requireNativeModule } from 'expo';

declare class NotedriBtPairingModule extends NativeModule<Record<string, never>> {
  /**
   * Ghép nối (tự cấp PIN, không qua hộp thoại hệ thống) rồi gửi ATZ qua RFCOMM
   * Classic Bluetooth, trả về response thô. Chỉ dùng cho spike xác nhận thiết
   * bị OBD2 có trả lời được qua Classic hay không - xem NotedriBtPairingModule.kt.
   */
  pairAndTestAtz(address: string, pin: string): Promise<string>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NotedriBtPairingModule>('NotedriBtPairing');
