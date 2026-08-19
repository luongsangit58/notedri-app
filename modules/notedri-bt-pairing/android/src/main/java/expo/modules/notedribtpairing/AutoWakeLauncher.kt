package expo.modules.notedribtpairing

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Báo cho user biết thiết bị OBD2 đã ghép trước đó vừa kết nối lại, qua 1
 * THÔNG BÁO (không gọi startActivity() thẳng từ receiver) - chạm vào mới mở
 * app. Rà soát 19/8: bản đầu gọi context.startActivity() trực tiếp từ
 * BroadcastReceiver, nhưng từ Android 10+ (càng siết hơn ở 14/15) hệ thống có
 * thể tự CHẶN ngầm việc mở Activity từ context nền như vậy ("Background
 * Activity Launch restrictions") - không crash, chỉ lặng lẽ không mở được,
 * tuỳ ROM/bản Android. Thông báo + chạm-để-mở là cách DUY NHẤT Android đảm
 * bảo hoạt động ở MỌI phiên bản/hãng máy cho tình huống "mở app từ 1 sự kiện
 * nền, không phải user đang chạm màn hình" - và không cần thêm quyền gì (khác
 * full-screen intent, bị Android 14+ giới hạn cho đúng nhóm gọi điện/báo
 * thức). Không cần biết vehicleId/deviceId cụ thể ở đây - lúc app mở lên,
 * ObdAutoConnect.tsx tự chọn đúng pairing qua getAutoConnectPairing().
 */
internal object AutoWakeLauncher {
  private const val TAG = "NotedriAutoWake"
  private const val CHANNEL_ID = "notedri_auto_wake"
  private const val NOTIFICATION_ID = 4271

  // Bluetooth Classic chập chờn (kết nối/mất/kết nối lại liên tục trong vài
  // giây) có thể bắn ACL_CONNECTED nhiều lần dồn dập - không debounce thì user
  // sẽ nhận thông báo lặp lại gây khó chịu. 20s đủ ngắn để 1 lần vào xe thật
  // vẫn báo kịp, đủ dài để lọc hết các đợt chập chờn ngắn đã quan sát với KW906.
  private const val MIN_LAUNCH_INTERVAL_MS = 20_000L

  fun launchApp(context: Context) {
    if (!AutoWakeStore.tryMarkLaunch(context, MIN_LAUNCH_INTERVAL_MS)) return
    try {
      postNotification(context.applicationContext)
    } catch (e: Exception) {
      // Không throw ra ngoài BroadcastReceiver.onReceive()/PendingIntent
      // callback - 1 lỗi ở đây không được crash tiến trình hệ thống gọi vào,
      // và không có gì để retry (lần kết nối Bluetooth tiếp theo sẽ tự kích
      // hoạt lại). Thiếu quyền POST_NOTIFICATIONS (Android 13+, nếu user chưa
      // cấp) cũng rơi vào đây - NotificationManager.notify() không throw cho
      // trường hợp đó, chỉ lặng lẽ không hiện, nên catch này chủ yếu bắt các
      // lỗi khác (channel/PendingIntent).
      Log.w(TAG, "postNotification failed", e)
    }
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "OBD2 tự kết nối", NotificationManager.IMPORTANCE_DEFAULT)
    )
  }

  private fun postNotification(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      ?: return
    ensureChannel(manager)

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: return
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val contentIntent = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    // applicationInfo.icon (icon launcher của CHÍNH app tại runtime) - module
    // native này không biết trước resource id của app host (com.notedri.R
    // không tồn tại ở tầng compile của 1 Expo module riêng), đây là cách an
    // toàn chuẩn để không phải đoán tên resource/không có rủi ro thiếu resource.
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("NoteDri")
      .setContentText("Đã kết nối OBD2 - chạm để mở")
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .build()

    manager.notify(NOTIFICATION_ID, notification)
  }
}
