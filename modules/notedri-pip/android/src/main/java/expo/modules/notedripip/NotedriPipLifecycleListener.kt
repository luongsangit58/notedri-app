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
 */
class NotedriPipLifecycleListener : ReactActivityLifecycleListener {
  override fun onUserLeaveHint(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      try {
        activity.enterPictureInPictureMode(NotedriPipModule.buildParams())
      } catch (_: Exception) {}
    }
  }
}
