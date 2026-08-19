package expo.modules.notedribtpairing

import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Đích của PendingIntent trong BleAutoWakeScanner.arm(). Android tự gọi
 * onReceive() này khi tìm thấy thiết bị khớp ScanFilter, KỂ CẢ khi app đã bị
 * kill hẳn - khác ScanCallback thường (chỉ sống cùng process). Không cần
 * <intent-filter> khai báo action trong manifest vì PendingIntent nhắm THẲNG
 * vào component này (explicit intent), nhưng vẫn phải khai báo <receiver>
 * (không intent-filter) để hệ thống biết class này tồn tại khi app chưa chạy.
 */
class BleScanResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val errorCode = intent.getIntExtra(BluetoothLeScanner.EXTRA_ERROR_CODE, -1)
    if (errorCode != -1) return

    val results = getScanResultsExtra(intent)
    if (results.isNullOrEmpty()) return

    // ScanFilter khi arm() đã lọc theo đúng MAC rồi - so lại ở đây chỉ là
    // phòng thủ thêm (một số ROM/chip lọc không triệt để), không tốn gì đáng
    // kể vì danh sách luôn rất nhỏ.
    val known = AutoWakeStore.getBleMacs(context)
    val matched = results.any { r -> r.device?.address?.let(known::contains) == true }
    if (!matched) return

    AutoWakeLauncher.launchApp(context)
  }

  private fun getScanResultsExtra(intent: Intent): List<ScanResult>? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT, ScanResult::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT)
    }
  }
}
