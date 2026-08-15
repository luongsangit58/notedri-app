import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

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
   * Dọn cờ "đủ điều kiện PiP" + tắt auto-enter - gọi khi rời màn Đồng hồ, mất
   * kết nối OBD2, hoặc unmount hẳn màn OBD2. PictureInPictureParams thuộc CẤP
   * ACTIVITY (app 1-Activity), không tự dọn theo unmount màn hình RN - thiếu
   * bước này, màn khác (vd Trang chủ) sẽ bị đẩy nhầm vào PiP lúc bấm Home.
   */
  clearPipParams(): Promise<void>;

  /**
   * Chủ động thu nhỏ Activity vào khung PiP NGAY BÂY GIỜ. An toàn khi gọi
   * trên máy không hỗ trợ hoặc gọi nhiều lần - tự bỏ qua, không throw. Dùng
   * cho cả nút bấm tường minh lẫn fallback tự gọi lúc rời màn (API 26-30, xem
   * NotedriPipLifecycleListener.kt).
   */
  enterPipMode(): Promise<void>;

  /**
   * true nếu app đã được miễn trừ tối ưu pin (PowerManager.isIgnoringBatteryOptimizations) -
   * false nghĩa là hệ thống/ROM có thể giết service nền (GPS hành trình) bất cứ lúc nào,
   * đặc biệt trên đầu Android ô tô RAM thấp. Dùng để hiển thị đúng trạng thái ở
   * GpsTripsScreen thay vì luôn cảnh báo "chưa tắt" dù user đã cấp quyền.
   */
  isIgnoringBatteryOptimizations(): Promise<boolean>;
}

// Module Android-only (Picture-in-Picture không tồn tại trên iOS - xem
// expo-module.config.json "platforms": ["android"]). Tránh requireNativeModule()
// nổ ngay lúc import trên iOS; call site cần tự check isPipSupported()/Platform.OS
// trước khi gọi các hàm khác.
export default Platform.OS === 'android'
  ? requireNativeModule<NotedriPipModule>('NotedriPip')
  : (new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'isPipSupported') return async () => false;
          if (prop === 'isIgnoringBatteryOptimizations') return async () => true;
          throw new Error('NotedriPip is only available on Android');
        },
      }
    ) as NotedriPipModule);
