import { NativeModule, requireNativeModule } from 'expo';

type NotedriPipEvents = {
  // isInPip=true khi Android vừa thu nhỏ Activity vào khung PiP (user bấm
  // Home/chuyển app) - false khi user chạm khung để mở lại app đầy đủ. Bắn cả
  // 2 chiều, JS chỉ cần lắng nghe 1 sự kiện để biết đổi qua/về UI nào.
  onPipModeChanged: (event: { isInPip: boolean }) => void;
};

declare class NotedriPipModule extends NativeModule<NotedriPipEvents> {
  /** true nếu máy chạy Android 8.0+ (API 26) - PiP không tồn tại ở bản thấp hơn. */
  isPipSupported(): Promise<boolean>;

  /**
   * "Đăng ký" tỉ lệ khung PiP + bật cờ tự vào PiP - KHÔNG thu nhỏ ngay, hệ
   * thống tự quyết định lúc nào chuyển (đúng lúc user bấm Home, Android 12+).
   * Gọi khi vào màn Đồng hồ + đã kết nối OBD, không phải lúc user rời màn.
   */
  setPipParams(): Promise<void>;

  /**
   * Chủ động thu nhỏ Activity vào khung PiP NGAY BÂY GIỜ. An toàn khi gọi
   * trên máy không hỗ trợ hoặc gọi nhiều lần - tự bỏ qua, không throw. Dùng
   * cho cả nút bấm tường minh lẫn fallback tự gọi lúc rời màn (API 26-30, xem
   * NotedriPipLifecycleListener.kt).
   */
  enterPipMode(): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NotedriPipModule>('NotedriPip');
