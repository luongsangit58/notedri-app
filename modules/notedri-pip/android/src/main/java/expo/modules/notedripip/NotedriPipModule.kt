package expo.modules.notedripip

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Tỉ lệ khung PiP xấp xỉ khung 2 đồng hồ (Tốc độ + Vòng tua) nằm ngang cạnh
// nhau ở màn Đồng hồ - không dùng tỉ lệ vuông/dọc vì nội dung thật (2 số to)
// nằm ngang.
private val PIP_ASPECT_RATIO = Rational(3, 2)

/**
 * PiP (Picture-in-Picture) chính thức của Android cho màn "Đồng hồ" OBD2 - khi
 * user bấm Home/chuyển app trong lúc đang xem, thu nhỏ thành khung nổi vẫn
 * chạy sống Tốc độ/Vòng tua (JS tự đổi sang PipCompactView.tsx khi nhận sự
 * kiện onPipModeChanged, xem OBDDashboardScreen.tsx).
 *
 * Android 12+ (API 31) tự động vào PiP qua setAutoEnterEnabled(true), không
 * cần gọi tay. Android 8-11 (API 26-30) chưa có cờ này - NotedriPipLifecycleListener
 * tự gọi enterPipMode() trong onUserLeaveHint(). Máy API < 26 không hỗ trợ PiP -
 * mọi hàm ở đây tự no-op, JS dựa vào isPipSupported() để ẩn nút thay vì crash
 * (đúng tinh thần withOptionalHardwareFeatures.js: ROM/máy yếu vẫn phải chạy được).
 */
class NotedriPipModule : Module() {
  companion object {
    // Tham chiếu module Kotlin đang sống - NotedriPipLifecycleListener không tự
    // có instance Module (Android tạo nó tách biệt khỏi vòng đời JS/AppContext)
    // nên cần cầu nối này để gọi được sendEvent(). Chỉ 1 Activity/module sống
    // tại 1 thời điểm trong app này nên dùng biến tĩnh đơn giản là đủ an toàn.
    private var activeModule: NotedriPipModule? = null

    internal fun notifyPipModeChanged(isInPip: Boolean) {
      activeModule?.sendEvent("onPipModeChanged", mapOf("isInPip" to isInPip))
    }

    internal fun buildParams(): PictureInPictureParams {
      val builder = PictureInPictureParams.Builder().setAspectRatio(PIP_ASPECT_RATIO)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setAutoEnterEnabled(true)
      }
      return builder.build()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NotedriPip")
    Events("onPipModeChanged")

    OnCreate {
      activeModule = this@NotedriPipModule
    }
    OnDestroy {
      if (activeModule === this@NotedriPipModule) activeModule = null
    }

    AsyncFunction("isPipSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }

    // Rà soát: KHÔNG được gọi enterPictureInPictureMode() ngay lúc vào màn
    // Đồng hồ - hàm đó thu nhỏ app NGAY LẬP TỨC dù user còn đang nhìn màn
    // hình, sai hẳn ý "chỉ thu nhỏ khi user RỜI app". setPictureInPictureParams()
    // chỉ "đăng ký" tỉ lệ khung + bật cờ auto-enter, hệ thống tự quyết định LÚC
    // NÀO chuyển (đúng lúc user bấm Home, API 31+). Gọi từ JS ngay khi vào màn
    // Đồng hồ + đã kết nối OBD (xem OBDDashboardScreen.tsx).
    AsyncFunction("setPipParams") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction
      val activity = appContext.currentActivity ?: return@AsyncFunction
      try {
        activity.setPictureInPictureParams(buildParams())
      } catch (_: Exception) {}
    }

    // Thu nhỏ NGAY BÂY GIỜ - dành cho nút bấm tường minh (nếu có) và fallback
    // API 26-30 gọi từ NotedriPipLifecycleListener.onUserLeaveHint(). An toàn
    // khi gọi trên máy không hỗ trợ hoặc gọi lại nhiều lần - tự bỏ qua, không throw.
    AsyncFunction("enterPipMode") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction
      val activity = appContext.currentActivity ?: return@AsyncFunction
      try {
        activity.enterPictureInPictureMode(buildParams())
      } catch (_: Exception) {
        // Activity không ở trạng thái cho phép vào PiP (vd đang ở nền sẵn) -
        // bỏ qua lặng lẽ, không có gì để JS xử lý thêm.
      }
    }
  }
}
