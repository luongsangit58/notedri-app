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

    // PUBLIC (không phải internal) - MainActivity.kt gọi hàm này từ module
    // Gradle KHÁC (:app, không phải :notedri-pip) để báo đổi trạng thái PiP
    // (xem withPictureInPicture.js - ReactActivityLifecycleListener của bản
    // expo-modules-core đang dùng KHÔNG có hook onPictureInPictureModeChanged,
    // phải tự chèn override thẳng vào MainActivity sinh ra thay vì qua listener).
    fun notifyPipModeChanged(isInPip: Boolean) {
      activeModule?.sendEvent("onPipModeChanged", mapOf("isInPip" to isInPip))
    }

    // Rà soát 6/8 (user báo: Trang chủ CHƯA kết nối OBD2 mà bấm Home vẫn bị đẩy
    // vào PiP) - cờ TĨNH, JS điều khiển qua setPipParams()/clearPipParams(),
    // dùng CHUNG cho 2 đường vào PiP:
    //  1. Auto-enter API 31+: setAutoEnterEnabled() trên PictureInPictureParams
    //     của chính Activity - nhưng đó là state CẤP ACTIVITY (app 1-Activity
    //     RN), không tự dọn theo unmount màn hình JS, nên setPipParams() ở màn
    //     Đồng hồ mà không có clearPipParams() tương ứng lúc rời màn sẽ để cờ
    //     đó "dính" sang mọi màn khác (Trang chủ...) cho tới khi bị ghi đè.
    //  2. Fallback onUserLeaveHint() API 26-30 (không có setAutoEnterEnabled) -
    //     NotedriPipLifecycleListener không có cách nào tự biết màn hình
    //     JS/React hiện tại có phải Đồng hồ OBD2 đã kết nối hay không, phải tự
    //     đọc cờ tĩnh này trước khi gọi enterPictureInPictureMode().
    // Mặc định false: KHÔNG được tự vào PiP ở bất kỳ đâu cho tới khi JS chủ
    // động báo "đủ điều kiện" (xem OBDDashboardScreen.tsx).
    @Volatile
    var pipEligible: Boolean = false
      private set

    fun setEligible(eligible: Boolean) {
      pipEligible = eligible
    }

    fun buildParams(autoEnter: Boolean = true): PictureInPictureParams {
      val builder = PictureInPictureParams.Builder().setAspectRatio(PIP_ASPECT_RATIO)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setAutoEnterEnabled(autoEnter)
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
    // Rà soát: KHÔNG dùng return@AsyncFunction sớm ở đây - DSL Module Kotlin
    // của Expo suy luận kiểu trả về từ toàn bộ thân lambda, return@Label
    // "trần" (không giá trị) từng gây lỗi biên dịch "expected Any?, actual
    // Unit" (build thật 23/7). Dùng if/let lồng nhau để cả hàm luôn có ĐÚNG 1
    // đường thoát ngầm định kiểu Unit, không early-return.
    // Rà soát: AsyncFunction() của DSL này chạy trên HÀNG ĐỢI NỀN, không phải
    // UI thread. enterPictureInPictureMode()/setPictureInPictureParams() là
    // API thao tác Activity/Window - Android yêu cầu gọi từ UI thread, gọi sai
    // luồng có thể crash lúc thật thi hành dù build vẫn qua (không phải lỗi
    // biên dịch). Bọc runOnUiThread() để chắc chắn đúng luồng bất kể
    // AsyncFunction đang chạy trên hàng đợi nào.
    AsyncFunction("setPipParams") {
      setEligible(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.currentActivity?.let { activity ->
          activity.runOnUiThread {
            try {
              activity.setPictureInPictureParams(buildParams(autoEnter = true))
            } catch (_: Exception) {}
          }
        }
      }
    }

    // Dọn cờ "đủ điều kiện" + tắt auto-enter (API 31+) - gọi khi rời màn Đồng
    // hồ, mất kết nối OBD2, hoặc unmount hẳn màn OBD2 (xem OBDDashboardScreen.tsx).
    // Bắt buộc phải có hàm đối xứng với setPipParams(): PictureInPictureParams
    // là state CẤP ACTIVITY, không tự dọn theo unmount màn hình RN - thiếu bước
    // này, cờ auto-enter true "dính" từ lần ghé Đồng hồ trước sẽ khiến màn khác
    // (vd Trang chủ) bị đẩy nhầm vào PiP lúc user bấm Home (rà soát 6/8).
    AsyncFunction("clearPipParams") {
      setEligible(false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.currentActivity?.let { activity ->
          activity.runOnUiThread {
            try {
              activity.setPictureInPictureParams(buildParams(autoEnter = false))
            } catch (_: Exception) {}
          }
        }
      }
    }

    // Thu nhỏ NGAY BÂY GIỜ - dành cho nút bấm tường minh (nếu có) và fallback
    // API 26-30 gọi từ NotedriPipLifecycleListener.onUserLeaveHint(). An toàn
    // khi gọi trên máy không hỗ trợ hoặc gọi lại nhiều lần - tự bỏ qua, không throw.
    AsyncFunction("enterPipMode") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.currentActivity?.let { activity ->
          activity.runOnUiThread {
            try {
              activity.enterPictureInPictureMode(buildParams(autoEnter = true))
            } catch (_: Exception) {
              // Activity không ở trạng thái cho phép vào PiP (vd đang ở nền sẵn) -
              // bỏ qua lặng lẽ, không có gì để JS xử lý thêm.
            }
          }
        }
      }
    }
  }
}
