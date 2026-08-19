package expo.modules.notedribtpairing

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Khai báo TĨNH trong manifest (xem withBtAutoWakeReceivers.js). Khác hầu hết
 * broadcast khác (phải đăng ký động từ Android 8.0), ACTION_ACL_CONNECTED nằm
 * trong danh sách miễn trừ chính thức của Android ("implicit broadcast
 * exceptions") - broadcast bảo vệ (protected), chỉ hệ thống gửi được, nên
 * receiver khai báo tĩnh vẫn nhận được sự kiện này dù app đã bị kill hẳn hoặc
 * chưa từng chạy từ lúc khởi động máy.
 *
 * Chỉ lọc theo MAC đã biết (AutoWakeStore) rồi mở app - KHÔNG tự kết nối OBD2
 * ở đây, tránh trùng code/logic với luồng JS đã có (ObdAutoConnect.tsx).
 */
class AclConnectedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != BluetoothDevice.ACTION_ACL_CONNECTED) return
    val device = getDeviceExtra(intent) ?: return
    val mac = device.address ?: return
    if (!AutoWakeStore.getClassicMacs(context).contains(mac)) return
    AutoWakeLauncher.launchApp(context)
  }

  private fun getDeviceExtra(intent: Intent): BluetoothDevice? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }
  }
}
