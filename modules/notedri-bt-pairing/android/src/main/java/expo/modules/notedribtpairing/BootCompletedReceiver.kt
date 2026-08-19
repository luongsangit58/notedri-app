package expo.modules.notedribtpairing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * PendingIntent scan (BleAutoWakeScanner) không sống sót qua reboot máy - máy
 * khởi động lại thì phải tự đăng ký lại bằng đúng danh sách MAC đã cache từ
 * lần đồng bộ gần nhất (AutoWakeStore), không cần JS chạy lại để biết danh
 * sách này. Cùng lý do RECEIVE_BOOT_COMPLETED/BOOT_COMPLETED nằm trong danh
 * sách broadcast được miễn trừ đăng ký tĩnh (giống ACL_CONNECTED).
 */
class BootCompletedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val macs = AutoWakeStore.getBleMacs(context)
    if (macs.isNotEmpty()) {
      BleAutoWakeScanner.arm(context, macs)
    }
  }
}
