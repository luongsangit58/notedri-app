package expo.modules.notedripip

import android.app.Activity
import android.os.Build
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Đăng ký qua expo-module.config.json (reactActivityLifecycleListeners) - KHÔNG
 * đụng MainActivity.kt sinh ra (app này dùng CNG, android/ bị gitignore, sinh
 * lại mỗi lần `expo prebuild`, sửa tay sẽ mất khi build lại).
 *
 * onUserLeaveHint(): fallback cho Android 8-11 (API 26-30) - dải API này CHƯA
 * có PictureInPictureParams.setAutoEnterEnabled() (chỉ từ API 31), nên phải tự
 * gọi enterPictureInPictureMode() ngay khi user bấm Home/chuyển app. Từ API 31
 * trở lên, hệ thống tự vào PiP qua cờ auto-enter - chỉ gọi trong khoảng 26..30
 * để tránh trùng.
 *
 * Rà soát (build thật 23/7): ReactActivityLifecycleListener của bản
 * expo-modules-core đang dùng KHÔNG có hook onPictureInPictureModeChanged
 * ("overrides nothing" lúc biên dịch) - phần báo JS đổi trạng thái PiP chuyển
 * sang chèn thẳng override vào MainActivity.kt sinh ra qua withPictureInPicture.js
 * (kỹ thuật withMainActivity + mergeContents, vẫn an toàn với CNG vì tự chèn
 * lại mỗi lần prebuild, không phải sửa tay 1 lần).
 *
 * Rà soát 6/8 (user báo: rời Trang chủ - CHƯA hề mở/kết nối OBD2 - vẫn bị đẩy
 * vào PiP trên máy Android 8-11): trước đây gọi enterPictureInPictureMode() VÔ
 * ĐIỀU KIỆN mỗi lần onUserLeaveHint(), bất kể đang ở màn nào. Listener này sống
 * ở CẤP ACTIVITY (đăng ký qua expo-module.config.json, không phải component
 * RN) nên không tự có state "đang ở màn Đồng hồ + đã kết nối" - phải đọc cờ
 * tĩnh NotedriPipModule.pipEligible do JS bật/tắt qua setPipParams()/
 * clearPipParams() (xem OBDDashboardScreen.tsx) trước khi được phép vào PiP.
 */
class NotedriPipLifecycleListener : ReactActivityLifecycleListener {
  override fun onUserLeaveHint(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      if (!NotedriPipModule.pipEligible) return
      try {
        activity.enterPictureInPictureMode(NotedriPipModule.buildParams())
      } catch (_: Exception) {}
    }
  }
}
