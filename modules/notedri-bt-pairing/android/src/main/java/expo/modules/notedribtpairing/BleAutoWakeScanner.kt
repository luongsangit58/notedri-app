package expo.modules.notedribtpairing

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Quét BLE nền qua PendingIntent (API 26+) - khác ScanCallback thường (chỉ
 * sống cùng process JS), kết quả khớp ScanFilter được hệ thống tự đẩy tới
 * BleScanResultReceiver KỂ CẢ khi app đã bị kill. Không cần Foreground
 * Service/notification riêng - bản chất cơ chế này do chip Bluetooth tự lọc,
 * không cần app hay 1 service nào đứng chờ liên tục.
 *
 * Lưu ý: đăng ký PendingIntent scan KHÔNG sống sót qua reboot máy - phải tự
 * gọi lại arm() sau khi máy khởi động lại (xem BootCompletedReceiver).
 */
object BleAutoWakeScanner {
  private const val TAG = "NotedriAutoWake"
  private const val REQUEST_CODE = 4271

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context.applicationContext, BleScanResultReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    return PendingIntent.getBroadcast(context.applicationContext, REQUEST_CODE, intent, flags)
  }

  // Quyền BLUETOOTH_SCAN được kiểm ở tầng gọi (JS chỉ gọi syncAutoWakeDevices
  // sau khi đã pair BLE ít nhất 1 lần - tức đã cấp quyền trước đó); nếu quyền
  // bị rút lại sau đó, startScan() ném SecurityException, được bắt gọn ở
  // catch(Exception) bên dưới - không crash, chỉ âm thầm không quét được nữa.
  @SuppressLint("MissingPermission")
  fun arm(context: Context, macs: Set<String>) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (macs.isEmpty()) {
      disarm(context)
      return
    }
    try {
      val adapter = (context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        ?: return
      if (!adapter.isEnabled) return
      val scanner = adapter.bluetoothLeScanner ?: return
      val filters = macs.map { ScanFilter.Builder().setDeviceAddress(it).build() }
      val settings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
        .build()
      // Dừng phiên cũ trước khi mở phiên mới (danh sách MAC vừa đổi) - tránh
      // đăng ký PendingIntent trùng REQUEST_CODE chồng lên nhau vô nghĩa.
      scanner.stopScan(pendingIntent(context))
      scanner.startScan(filters, settings, pendingIntent(context))
    } catch (e: Exception) {
      Log.w(TAG, "arm() failed", e)
    }
  }

  @SuppressLint("MissingPermission")
  fun disarm(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val adapter = (context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        ?: return
      val scanner = adapter.bluetoothLeScanner ?: return
      scanner.stopScan(pendingIntent(context))
    } catch (e: Exception) {
      Log.w(TAG, "disarm() failed", e)
    }
  }
}
