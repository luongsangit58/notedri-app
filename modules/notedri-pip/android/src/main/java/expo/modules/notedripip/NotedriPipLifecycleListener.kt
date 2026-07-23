package expo.modules.notedripip

import android.app.Activity
import android.os.Build
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Đăng ký qua expo-module.config.json (reactActivityLifecycleListeners) - KHÔNG
 * đụng MainActivity.kt sinh ra (app này dùng CNG, android/ bị gitignore, sinh
 * lại mỗi lần `expo prebuild`, sửa tay sẽ mất khi build lại).
 *
 * 2 việc:
 * 1. onUserLeaveHint(): fallback cho Android 8-11 (API 26-30) - dải API này
 *    CHƯA có PictureInPictureParams.setAutoEnterEnabled() (chỉ từ API 31), nên
 *    phải tự gọi enterPictureInPictureMode() ngay khi user bấm Home/chuyển app.
 *    Từ API 31 trở lên, hệ thống tự vào PiP qua cờ auto-enter - gọi lại ở đây
 *    vẫn an toàn (no-op) nhưng để tránh trùng, chỉ gọi trong khoảng 26..30.
 * 2. onPictureInPictureModeChanged(): báo JS biết ĐANG/KHÔNG còn ở chế độ PiP
 *    để OBDDashboardScreen.tsx đổi qua PipCompactView.tsx (nội dung khung PiP
 *    chính là UI Activity thu nhỏ - header/nút hiện tại không đọc/bấm được ở
 *    kích thước đó nên phải chủ động đổi layout, không phải Android tự vẽ hộ).
 */
class NotedriPipLifecycleListener : ReactActivityLifecycleListener {
  override fun onUserLeaveHint(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      try {
        activity.enterPictureInPictureMode(NotedriPipModule.buildParams())
      } catch (_: Exception) {}
    }
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
    NotedriPipModule.notifyPipModeChanged(isInPictureInPictureMode)
  }
}
