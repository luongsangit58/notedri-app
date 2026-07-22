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
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// UUID chuẩn Serial Port Profile - MỌI adapter ELM327 Bluetooth Classic (kể cả
// Vgate) đều đăng ký service này, không cần dò như BLE (GATT service UUID tuỳ
// hãng, xem PREFERRED_SERIAL_SERVICE_PREFIXES trong BleService.ts).
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

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

    val found = LinkedHashMap<String, Map<String, Any>>()
    adapter.bondedDevices?.forEach { d ->
      found[d.address] = mapOf("address" to d.address, "name" to (d.name ?: d.address), "bonded" to true)
    }

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
              context.unregisterReceiver(this)
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
      cont.invokeOnCancellation { context.unregisterReceiver(receiver) }

      adapter.cancelDiscovery()
      val started = adapter.startDiscovery()
      if (!started) {
        context.unregisterReceiver(receiver)
        cont.resumeWithException(BtPairingException("Không bắt đầu quét được (startDiscovery trả về false)"))
      }
    }

    return found.values.toList()
  }

  private suspend fun pairAndTestAtz(address: String, pin: String): String {
    val context = appContext.reactContext
      ?: throw BtPairingException("React context không sẵn sàng")
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw BtPairingException("Máy không có Bluetooth Adapter")
    val device = adapter.getRemoteDevice(address)

    ensureBonded(context, device, pin)

    return withContext(Dispatchers.IO) {
      val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
      adapter.cancelDiscovery()
      try {
        socket.connect()
        socket.outputStream.write("ATZ\r".toByteArray())
        socket.outputStream.flush()
        readUntilPrompt(socket.inputStream)
      } finally {
        try { socket.close() } catch (_: Exception) {}
      }
    }
  }

  // Đã ghép nối (từ lần thử trước, kể cả qua Cài đặt hệ thống nếu may mắn
  // thành công) thì bỏ qua toàn bộ bước xin PIN - createBond() lại trên thiết
  // bị đã BOND_BONDED sẽ không làm gì cả, không cần né riêng nhưng check sớm
  // cho rõ luồng và khỏi treo chờ broadcast không bao giờ tới.
  private suspend fun ensureBonded(context: Context, device: BluetoothDevice, pin: String) {
    if (device.bondState == BluetoothDevice.BOND_BONDED) return

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
                context.unregisterReceiver(this)
                if (cont.isActive) cont.resume(Unit)
              } else if (bondState == BluetoothDevice.BOND_NONE) {
                context.unregisterReceiver(this)
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
      cont.invokeOnCancellation { context.unregisterReceiver(receiver) }

      val started = try {
        device.javaClass.getMethod("createBond").invoke(device) as Boolean
      } catch (e: Exception) {
        context.unregisterReceiver(receiver)
        cont.resumeWithException(BtPairingException("Không gọi được createBond(): ${e.message}"))
        return@suspendCancellableCoroutine
      }
      if (!started) {
        context.unregisterReceiver(receiver)
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
