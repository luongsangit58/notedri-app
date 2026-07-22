package expo.modules.notedribtpairing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// UUID chuẩn Serial Port Profile - MỌI adapter ELM327 Bluetooth Classic (kể cả
// Vgate) đều đăng ký service này, không cần dò như BLE (GATT service UUID tuỳ
// hãng, xem PREFERRED_SERIAL_SERVICE_PREFIXES trong BleService.ts).
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

// Rà soát 22/7 (log thật: "discoverDevices: start" rồi im lặng mãi, app "cứ
// quay") - chờ ACTION_DISCOVERY_FINISHED không giới hạn thời gian là SAI, ROM
// này đã biết có vấn đề với BLE nên không thể giả định tầng Classic discovery
// luôn phát đúng broadcast kết thúc. 12s ~ thời lượng 1 chu kỳ discovery cổ
// điển của Android (thường 10-13s) - quá giờ vẫn phải trả về những gì đã có
// (tối thiểu là danh sách ĐÃ ghép nối, thu thập trước khi chờ) thay vì treo.
private const val DISCOVERY_TIMEOUT_MS = 12_000L

// Rà soát 22/7: đã có lúc hiểu nhầm 2 ảnh chụp Car Scanner (1 ảnh lỗi ngay
// sau khi user CHỦ ĐỘNG ngắt kết nối, 1 ảnh kết nối lại bình thường sau đó)
// là bằng chứng "kết nối Classic vốn chập chờn cho mọi app" - KHÔNG đúng, đó
// chỉ là chu trình ngắt/nối lại bình thường. Không dùng ảnh đó làm lý do ở
// đây nữa. Vẫn giữ retry vì bản thân đây là biện pháp an toàn rẻ tiền cho
// thao tác Bluetooth (cùng tinh thần RECONNECT_DELAYS_MS bên BLE), không
// phải vì đã có bằng chứng xác nhận kết nối chập chờn.
private val CONNECT_RETRY_DELAYS_MS = longArrayOf(1500, 2500)

// Cùng loại lỗi đã sửa ở discoverDevices() (chờ vô hạn 1 broadcast có thể
// không bao giờ tới trên ROM này) - ensureBonded() chờ ACTION_BOND_STATE_
// CHANGED cũng phải có giới hạn, không thì 1 lần ghép nối kẹt là treo cả
// pairAndTestAtz() mãi mãi, không bao giờ tới được vòng retry connect.
private const val BOND_TIMEOUT_MS = 15_000L

class BtPairingException(message: String) : CodedException(message)

/**
 * Spike (22/7, xem feedback-obd-android-headunit-fixes memory): đầu Android ô
 * tô test được xác nhận (nRF Connect) KHÔNG hỗ trợ BLE thật, nhưng Vgate quảng
 * bá cả tên "Vlink" qua Bluetooth Classic (ghép nối qua Cài đặt hệ thống thấy
 * được, dù không hiện hộp thoại nhập PIN - lỗi khá quen thuộc với module SPP
 * giá rẻ). react-native-bluetooth-classic (đã cân nhắc dùng) chỉ gọi
 * device.createBond() - CÙNG cơ chế hệ thống đang lỗi, không tự cấp PIN được.
 * Module riêng này tự lắng nghe ACTION_PAIRING_REQUEST và cấp PIN NGAY (kỹ
 * thuật chuẩn nhiều app OBD/ELM327 khác dùng), bỏ qua hộp thoại hệ thống hoàn
 * toàn - CHỈ để xác nhận: ghép nối + gửi ATZ + nhận phản hồi được qua Classic
 * trên đúng phần cứng này hay không. Chưa tích hợp vào luồng kết nối chính -
 * xem kết quả trước khi quyết định làm tiếp UI chọn 2 mode.
 */
class NotedriBtPairingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotedriBtPairing")

    // AsyncFunction() của DSL này nhận lambda THƯỜNG (không phải suspend) -
    // đã chạy trên thread nền riêng (không phải JS thread) nên runBlocking ở
    // đây an toàn, chỉ là cầu nối gọi hàm suspend bên trong, không chặn UI.
    AsyncFunction("pairAndTestAtz") { address: String, pin: String ->
      runBlocking { pairAndTestAtz(address, pin) }
    }

    // Rà soát 22/7 (user không chấp nhận phải tự gõ tay địa chỉ MAC): liệt kê
    // thiết bị Classic Bluetooth để bấm chọn, giống trải nghiệm màn quét BLE.
    // Gồm cả thiết bị ĐÃ ghép nối (hiện ngay) lẫn quét mới quanh đó (~10s) -
    // Vgate có thể chưa từng ghép nối thành công lần nào nên không đủ nếu chỉ
    // lấy danh sách đã ghép.
    AsyncFunction("discoverDevices") {
      runBlocking { discoverDevices() }
    }
  }

  // Trả về địa chỉ ĐÃ ghép nối trước, rồi bổ sung thiết bị mới quét được -
  // dùng LinkedHashMap để giữ thứ tự và tự khử trùng theo địa chỉ MAC (1 thiết
  // bị có thể xuất hiện lại nhiều lần trong lúc quét).
  private suspend fun discoverDevices(): List<Map<String, Any>> {
    val context = appContext.reactContext
      ?: throw BtPairingException("React context không sẵn sàng")
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw BtPairingException("Máy không có Bluetooth Adapter")
    // startDiscovery() trả về false (không throw, không lộ nguyên nhân) khi
    // Bluetooth đang TẮT - phải tự kiểm tra trước để báo đúng lý do, thay vì
    // để lộ message kỹ thuật "startDiscovery trả về false" khó hiểu (rà soát
    // 22/7, user chụp màn hình gặp đúng trường hợp này).
    if (!adapter.isEnabled) {
      throw BtPairingException("Bluetooth đang tắt - bật Bluetooth rồi thử lại")
    }

    val found = LinkedHashMap<String, Map<String, Any>>()
    adapter.bondedDevices?.forEach { d ->
      found[d.address] = mapOf("address" to d.address, "name" to (d.name ?: d.address), "bonded" to true)
    }

    // withTimeoutOrNull thay vì chờ vô hạn: quá DISCOVERY_TIMEOUT_MS thì HUỶ
    // coroutine (kích hoạt invokeOnCancellation bên dưới, tự gỡ receiver) và
    // tiếp tục chạy xuống dòng cuối - trả về những gì đã gom được (tối thiểu
    // là danh sách đã ghép nối) thay vì không bao giờ resolve.
    withTimeoutOrNull(DISCOVERY_TIMEOUT_MS) {
      suspendCancellableCoroutine<Unit> { cont ->
        val receiver = object : BroadcastReceiver() {
          override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
              BluetoothDevice.ACTION_FOUND -> {
                @Suppress("DEPRECATION")
                val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) ?: return
                // Không ghi đè entry "bonded=true" đã có sẵn từ getBondedDevices()
                // bằng entry "bonded=false" của cùng địa chỉ quét được lại.
                if (!found.containsKey(device.address)) {
                  found[device.address] = mapOf(
                    "address" to device.address,
                    "name" to (device.name ?: device.address),
                    "bonded" to false
                  )
                }
              }
              BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                try { context.unregisterReceiver(this) } catch (_: Exception) {}
                if (cont.isActive) cont.resume(Unit)
              }
            }
          }
        }
        val filter = IntentFilter().apply {
          addAction(BluetoothDevice.ACTION_FOUND)
          addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        cont.invokeOnCancellation { try { context.unregisterReceiver(receiver) } catch (_: Exception) {} }

        adapter.cancelDiscovery()
        val started = adapter.startDiscovery()
        if (!started) {
          try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
          cont.resumeWithException(BtPairingException("Không bắt đầu quét được (startDiscovery trả về false)"))
        }
      }
    }
    adapter.cancelDiscovery()

    return found.values.toList()
  }

  private suspend fun pairAndTestAtz(address: String, pin: String): String {
    val context = appContext.reactContext
      ?: throw BtPairingException("React context không sẵn sàng")
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw BtPairingException("Máy không có Bluetooth Adapter")
    if (!adapter.isEnabled) {
      throw BtPairingException("Bluetooth đang tắt - bật Bluetooth rồi thử lại")
    }
    val device = adapter.getRemoteDevice(address)

    ensureBonded(context, device, pin)
    adapter.cancelDiscovery()

    // Rà soát 22/7 (log thật: ghép nối OK, connect() OK, nhưng đọc phản hồi bị
    // "read failed, socket might closed... read ret: -1" - remote đóng kết nối
    // ngay sau khi bắt tay xong). Module Serial Bluetooth giá rẻ (HC-05/06,
    // nhiều clone ELM327) thường KHÔNG cài đặt đúng chuẩn Secure Simple
    // Pairing - socket "secure" (mặc định của createRfcommSocketToServiceRecord)
    // có thể bắt tay mã hoá xong rồi bị chính firmware phía adapter chủ động
    // ngắt. "Insecure" bỏ qua bước mã hoá/xác thực đó - thử trước, nếu vẫn lỗi
    // mới rơi về "secure" (đối xứng với cách xử lý fallback MTU/legacyScan bên
    // BLE - thử phương án rẻ nhất trước, không cần biết chắc cái nào đúng).
    //
    // Bọc thêm vòng thử lại (xem comment CONNECT_RETRY_DELAYS_MS) - biện pháp
    // an toàn rẻ tiền, không dựa trên bằng chứng cụ thể nào về việc kết nối
    // hay bị chập chờn.
    var lastError: Exception = BtPairingException("Không kết nối được")
    for (attempt in 0..CONNECT_RETRY_DELAYS_MS.size) {
      if (attempt > 0) delay(CONNECT_RETRY_DELAYS_MS[attempt - 1])
      try {
        return withContext(Dispatchers.IO) {
          try {
            connectAndSendAtz(device, insecure = true)
          } catch (_: Exception) {
            connectAndSendAtz(device, insecure = false)
          }
        }
      } catch (e: Exception) {
        lastError = e
      }
    }
    throw lastError
  }

  private fun connectAndSendAtz(device: BluetoothDevice, insecure: Boolean): String {
    val socket = if (insecure) {
      device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
    } else {
      device.createRfcommSocketToServiceRecord(SPP_UUID)
    }
    try {
      socket.connect()
      // Vài module Serial giá rẻ cần 1 khoảng lặng ngắn sau connect() trước
      // khi nhận byte đầu tiên - ghi ngay có thể rơi vào lúc firmware chưa kịp
      // chuyển sang chế độ nhận lệnh (thực hành phổ biến với HC-05/06 clone).
      Thread.sleep(150)
      socket.outputStream.write("ATZ\r".toByteArray())
      socket.outputStream.flush()
      return readUntilPrompt(socket.inputStream)
    } finally {
      try { socket.close() } catch (_: Exception) {}
    }
  }

  // Đã ghép nối (từ lần thử trước, kể cả qua Cài đặt hệ thống nếu may mắn
  // thành công) thì bỏ qua toàn bộ bước xin PIN - createBond() lại trên thiết
  // bị đã BOND_BONDED sẽ không làm gì cả, không cần né riêng nhưng check sớm
  // cho rõ luồng và khỏi treo chờ broadcast không bao giờ tới.
  private suspend fun ensureBonded(context: Context, device: BluetoothDevice, pin: String) {
    if (device.bondState == BluetoothDevice.BOND_BONDED) return

    val completed = withTimeoutOrNull(BOND_TIMEOUT_MS) {
      awaitBondStateChange(context, device, pin)
    }
    // Quá giờ nhưng vẫn có thể đã BONDED đúng lúc timeout kích hoạt (race) -
    // kiểm tra lại state thật thay vì báo lỗi oan.
    if (completed == null && device.bondState != BluetoothDevice.BOND_BONDED) {
      throw BtPairingException("Ghép nối quá lâu không phản hồi (quá ${BOND_TIMEOUT_MS / 1000}s)")
    }
  }

  private suspend fun awaitBondStateChange(context: Context, device: BluetoothDevice, pin: String) {
    suspendCancellableCoroutine<Unit> { cont ->
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_PAIRING_REQUEST -> {
              // reflection: setPin()/setPairingConfirmation() là API ẩn
              // (@hide) của BluetoothDevice - không có trong SDK public,
              // nhưng đã ổn định qua nhiều đời Android, đúng cách nhiều app
              // OBD/ELM327 khác tự cấp PIN mà không cần hộp thoại hệ thống.
              try {
                device.javaClass.getMethod("setPin", ByteArray::class.java)
                  .invoke(device, pin.toByteArray())
                device.javaClass
                  .getMethod("setPairingConfirmation", Boolean::class.javaPrimitiveType)
                  .invoke(device, true)
                abortBroadcast()
              } catch (_: Exception) {
                // Máy/ROM này không hỗ trợ 2 API ẩn trên - để hệ thống tự xử
                // lý theo cách mặc định (rơi lại về đúng vấn đề "không hiện
                // ô nhập PIN" đã biết, nhưng không được để crash cả luồng).
              }
            }
            BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
              val bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)
              if (bondState == BluetoothDevice.BOND_BONDED) {
                try { context.unregisterReceiver(this) } catch (_: Exception) {}
                if (cont.isActive) cont.resume(Unit)
              } else if (bondState == BluetoothDevice.BOND_NONE) {
                try { context.unregisterReceiver(this) } catch (_: Exception) {}
                if (cont.isActive) {
                  cont.resumeWithException(BtPairingException("Ghép nối bị từ chối hoặc thất bại"))
                }
              }
            }
          }
        }
      }
      val filter = IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_PAIRING_REQUEST)
        addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        priority = IntentFilter.SYSTEM_HIGH_PRIORITY
      }
      // Broadcast hệ thống (protected, chỉ OS gửi được) - NOT_EXPORTED an
      // toàn hơn, không app thứ 3 nào giả mạo được intent này gửi tới ta.
      ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
      cont.invokeOnCancellation { try { context.unregisterReceiver(receiver) } catch (_: Exception) {} }

      val started = try {
        device.javaClass.getMethod("createBond").invoke(device) as Boolean
      } catch (e: Exception) {
        try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
        cont.resumeWithException(BtPairingException("Không gọi được createBond(): ${e.message}"))
        return@suspendCancellableCoroutine
      }
      if (!started) {
        try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
        cont.resumeWithException(BtPairingException("createBond() trả về false"))
      }
    }
  }

  // ELM327 luôn kết thúc phản hồi bằng ký tự '>' (prompt sẵn sàng nhận lệnh
  // tiếp theo) - cùng quy ước đã dùng ở phía BLE (BleService.ts responseBuffer).
  private fun readUntilPrompt(input: InputStream): String {
    val buffer = StringBuilder()
    val deadline = System.currentTimeMillis() + 5000
    val chunk = ByteArray(256)
    while (System.currentTimeMillis() < deadline) {
      if (input.available() > 0) {
        val n = input.read(chunk)
        if (n > 0) {
          buffer.append(String(chunk, 0, n))
          if (buffer.contains('>')) return buffer.toString()
        }
      } else {
        Thread.sleep(50)
      }
    }
    if (buffer.isEmpty()) throw BtPairingException("Không nhận được phản hồi trong 5s (timeout)")
    return buffer.toString()
  }
}
