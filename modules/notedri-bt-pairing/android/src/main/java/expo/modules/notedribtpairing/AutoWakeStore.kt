package expo.modules.notedribtpairing

import android.content.Context

/**
 * Cache MAC (Classic)/địa chỉ BLE của các thiết bị OBD2 đủ điều kiện "tự thức
 * app khi Bluetooth kết nối lại" (xem AclConnectedReceiver, BleScanResultReceiver,
 * BleAutoWakeScanner, BootCompletedReceiver). Đồng bộ từ JS (autoWakeSync.ts)
 * mỗi khi pairing hoặc switch auto-connect thay đổi.
 *
 * Dùng SharedPreferences (không phải AsyncStorage/DB của JS) vì 2 receiver
 * trên có thể được hệ thống gọi TRƯỚC KHI React Native kịp khởi tạo (khởi
 * động máy, hoặc app đã bị kill hẳn) - lúc đó không có JS runtime nào để hỏi.
 */
object AutoWakeStore {
  private const val PREFS_NAME = "notedri_bt_auto_wake"
  private const val KEY_CLASSIC_MACS = "classic_macs"
  private const val KEY_BLE_MACS = "ble_macs"
  private const val KEY_LAST_LAUNCH_AT = "last_launch_at"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun save(context: Context, classicMacs: List<String>, bleMacs: List<String>) {
    prefs(context).edit()
      .putStringSet(KEY_CLASSIC_MACS, classicMacs.toSet())
      .putStringSet(KEY_BLE_MACS, bleMacs.toSet())
      .apply()
  }

  // Trả bản copy riêng (toSet() lại) - SharedPreferences.getStringSet() cấm sửa
  // trực tiếp set trả về, nhưng caller ở đây chỉ đọc (.contains()) nên không
  // bắt buộc, giữ để tránh lỗi ngầm nếu sau này có ai lỡ .add()/.remove() vào
  // kết quả trả về.
  fun getClassicMacs(context: Context): Set<String> =
    (prefs(context).getStringSet(KEY_CLASSIC_MACS, emptySet()) ?: emptySet()).toSet()

  fun getBleMacs(context: Context): Set<String> =
    (prefs(context).getStringSet(KEY_BLE_MACS, emptySet()) ?: emptySet()).toSet()

  // Chống spam mở app khi Bluetooth Classic chập chờn (kết nối/mất/kết nối
  // lại liên tục trong vài giây - đã từng thấy với KW906, xem comment trong
  // NotedriBtPairingModule.kt). true = ĐÃ QUA đủ lâu từ lần mở gần nhất, được
  // phép mở lại; tự cập nhật mốc thời gian ngay khi trả true (không cần gọi
  // thêm 1 hàm "markLaunched" riêng - tránh quên gọi ở 1 trong 2 receiver).
  @Synchronized
  fun tryMarkLaunch(context: Context, minIntervalMs: Long): Boolean {
    val p = prefs(context)
    val now = System.currentTimeMillis()
    val last = p.getLong(KEY_LAST_LAUNCH_AT, 0L)
    if (now - last < minIntervalMs) return false
    p.edit().putLong(KEY_LAST_LAUNCH_AT, now).apply()
    return true
  }
}
