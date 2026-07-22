package expo.modules.notedribtpairing

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.InputStream
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// UUID chuẩn Serial Port Profile - MỌI adapter ELM327 Bluetooth Classic (kể cả
// Vgate) đều đăng ký service này, không cần dò như BLE (GATT service UUID tuỳ
// hãng, xem PREFERRED_SERIAL_SERVICE_PREFIXES trong BleService.ts).
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

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

// Rà soát 22/7 (trả lời câu hỏi "nếu Android-Vlink đang kết nối với thiết bị
// khác thì sao"): module Serial Bluetooth giá rẻ (ELM327 clone) hầu như chỉ
// nhận 1 kết nối tại 1 thời điểm - nếu bận, BluetoothSocket.connect()/read()
// có thể block khá lâu theo timeout ngầm KHÔNG rõ ràng của hệ thống, không có
// tham số timeout riêng để truyền vào. Đóng socket từ 1 coroutine canh gác
// song song (xem openSocket()) là cách chuẩn để ép lệnh đang block ném lỗi
// ngay, thay vì phụ thuộc hệ thống.
private const val CONNECT_ATTEMPT_TIMEOUT_MS = 10_000L

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
  // Chỉ 1 kết nối Classic sống tại 1 thời điểm (đúng model của BleService.ts
  // phía JS - 1 app chỉ nói chuyện với 1 adapter OBD2 cùng lúc). readerJob đọc
  // liên tục từ socket, đẩy từng đoạn dữ liệu qua event "onClassicData" (base64,
  // CÙNG bảng mã btoa/atob JS đã dùng cho BLE) để BleService.ts dùng lại nguyên
  // logic gộp buffer/tìm dấu '>' đã viết cho BLE mà không cần phân biệt transport.
  private var activeSocket: BluetoothSocket? = null
  private var readerJob: Job? = null
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  // Dọn kết nối CŨ khi bắt đầu 1 connectClassic() mới (phòng thủ, JS đã tự
  // chặn double-connect nhưng không dựa hoàn toàn vào đó) không được để lộ ra
  // JS 1 sự kiện "mất kết nối" giả cho phiên MỚI sắp mở ngay sau đó - cờ này
  // báo cho đúng job reader sắp kết thúc biết nó bị đóng CHỦ ĐỘNG để tự bỏ qua
  // sendEvent của chính nó, không phải do dùng chung 1 job (chỉ có tối đa 1
  // readerJob sống tại 1 thời điểm - closeActiveSocket() luôn đóng job cũ
  // xong xuôi trước khi connectClassic() mở job mới).
  private var suppressNextDisconnectEvent = false

  override fun definition() = ModuleDefinition {
    Name("NotedriBtPairing")
    Events("onClassicData", "onClassicDisconnected")

    // AsyncFunction() của DSL này nhận lambda THƯỜNG (không phải suspend) -
    // đã chạy trên thread nền riêng (không phải JS thread) nên runBlocking ở
    // đây an toàn, chỉ là cầu nối gọi hàm suspend bên trong, không chặn UI.
    AsyncFunction("pairAndTestAtz") { address: String, pin: String ->
      runBlocking { pairAndTestAtz(address, pin) }
    }

    // Rà soát 22/7 (user không chấp nhận phải tự gõ tay địa chỉ MAC): liệt kê
    // thiết bị Classic Bluetooth ĐÃ GHÉP NỐI để bấm chọn, giống trải nghiệm
    // màn quét BLE - xem lý do bỏ bước tự quét sống ở comment discoverDevices().
    AsyncFunction("discoverDevices") {
      runBlocking { discoverDevices() }
    }

    // Kết nối THẬT dùng cho luồng OBD chính (khác pairAndTestAtz - chỉ test 1
    // lần ATZ rồi đóng): mở socket, GIỮ SỐNG, đọc liên tục và đẩy dữ liệu qua
    // onClassicData tới khi disconnectClassic() được gọi hoặc mất kết nối.
    AsyncFunction("connectClassic") { address: String, pin: String ->
      runBlocking { connectClassic(address, pin) }
    }

    // command đã được JS mã hoá base64 (btoa) giống hệt cách BLE ghi
    // characteristic - decode ở đây rồi ghi thẳng byte thô vào socket, không
    // qua thêm biến đổi nào để tránh lệch dữ liệu giữa 2 transport.
    AsyncFunction("writeClassic") { base64: String ->
      writeClassic(base64)
    }

    AsyncFunction("disconnectClassic") {
      closeActiveSocket(suppressEvent = false)
    }
  }

  // Rà soát 22/7 (log thật notedri-obd-session.json 22/7 11:00): live discovery
  // qua adapter.startDiscovery() từng có ở đây, nhưng kể cả khi BLE scan đã
  // dừng hẳn 0-49ms TRƯỚC lúc gọi (loại trừ giả thuyết tranh chấp radio với
  // BLE), discovery vẫn "found 0" sau đủ 12s timeout trên đúng ROM/chip này -
  // tức KHÔNG PHẢI do tranh chấp BLE, mà chính adapter.startDiscovery() (Classic)
  // cũng không đáng tin cậy để tìm thiết bị CHƯA ghép nối trên phần cứng này.
  // Ngược lại getBondedDevices() luôn chạy đúng và ổn định trong mọi lần test.
  // Quyết định (Sang, 22/7): bỏ hẳn bước tự quét, đi đúng quy trình Vgate
  // khuyến nghị cho Android - user tự ghép nối "Android-Vlink" (PIN 1234) qua
  // Cài đặt Bluetooth hệ thống trước, app chỉ cần đọc danh sách đã ghép.
  private fun discoverDevices(): List<Map<String, Any>> {
    val context = appContext.reactContext
      ?: throw BtPairingException("React context không sẵn sàng")
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw BtPairingException("Máy không có Bluetooth Adapter")
    // startDiscovery() trả về false (không throw, không lộ nguyên nhân) khi
    // Bluetooth đang TẮT - phải tự kiểm tra trước để báo đúng lý do, thay vì
    // để lộ message kỹ thuật khó hiểu (rà soát 22/7, user chụp màn hình gặp
    // đúng trường hợp này).
    if (!adapter.isEnabled) {
      throw BtPairingException("Bluetooth đang tắt - bật Bluetooth rồi thử lại")
    }

    return adapter.bondedDevices
      ?.map { d -> mapOf("address" to d.address, "name" to (d.name ?: d.address), "bonded" to true) }
      ?: emptyList()
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

    val socket = openSerialSocketWithRetry(device)
    return try {
      withContext(Dispatchers.IO) {
        socket.outputStream.write("ATZ\r".toByteArray())
        socket.outputStream.flush()
        readUntilPrompt(socket.inputStream)
      }
    } finally {
      // Spike: chỉ test 1 lần rồi đóng - khác connectClassic() giữ socket
      // sống cho cả phiên OBD.
      try { socket.close() } catch (_: Exception) {}
    }
  }

  // Rà soát 22/7 (log thật: ghép nối OK, connect() OK, nhưng đọc phản hồi bị
  // "read failed, socket might closed... read ret: -1" - remote đóng kết nối
  // ngay sau khi bắt tay xong). Module Serial Bluetooth giá rẻ (HC-05/06,
  // nhiều clone ELM327) thường KHÔNG cài đặt đúng chuẩn Secure Simple Pairing -
  // socket "secure" (mặc định của createRfcommSocketToServiceRecord) có thể
  // bắt tay mã hoá xong rồi bị chính firmware phía adapter chủ động ngắt.
  // "Insecure" bỏ qua bước mã hoá/xác thực đó - thử trước, nếu vẫn lỗi mới rơi
  // về "secure" (đối xứng với cách xử lý fallback MTU/legacyScan bên BLE - thử
  // phương án rẻ nhất trước, không cần biết chắc cái nào đúng). Bọc thêm vòng
  // thử lại (CONNECT_RETRY_DELAYS_MS) - biện pháp an toàn rẻ tiền, không dựa
  // trên bằng chứng cụ thể nào về việc kết nối hay bị chập chờn. Dùng chung
  // cho cả pairAndTestAtz (spike) và connectClassic (kết nối thật, giữ sống).
  private suspend fun openSerialSocketWithRetry(device: BluetoothDevice): BluetoothSocket {
    var lastError: Exception = BtPairingException("Không kết nối được")
    for (attempt in 0..CONNECT_RETRY_DELAYS_MS.size) {
      if (attempt > 0) delay(CONNECT_RETRY_DELAYS_MS[attempt - 1])
      try {
        return try {
          openSocket(device, insecure = true)
        } catch (_: Exception) {
          openSocket(device, insecure = false)
        }
      } catch (e: Exception) {
        lastError = e
      }
    }
    throw lastError
  }

  // Mở + connect() 1 socket, trả về Ở TRẠNG THÁI SẴN SÀNG ghi/đọc - KHÔNG tự
  // đóng, khác connectAndSendAtz cũ đã gộp luôn ghi/đọc/đóng vào 1 hàm. Vòng
  // đời sau đó do caller quyết định (pairAndTestAtz đóng ngay sau 1 lần test,
  // connectClassic giữ mở tới khi disconnect).
  private suspend fun openSocket(device: BluetoothDevice, insecure: Boolean): BluetoothSocket = coroutineScope {
    val socket = if (insecure) {
      device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
    } else {
      device.createRfcommSocketToServiceRecord(SPP_UUID)
    }
    // BluetoothSocket không có tham số timeout cho connect()/read() - đóng
    // socket từ coroutine canh gác này ép lệnh đang block (nếu có) ném lỗi
    // ngay khi hết CONNECT_ATTEMPT_TIMEOUT_MS, thay vì phụ thuộc timeout ngầm
    // của hệ thống (không rõ bao lâu, đặc biệt khi adapter đang bận với 1
    // kết nối khác).
    val watchdog = launch {
      delay(CONNECT_ATTEMPT_TIMEOUT_MS)
      try { socket.close() } catch (_: Exception) {}
    }
    try {
      withContext(Dispatchers.IO) {
        socket.connect()
        // Vài module Serial giá rẻ cần 1 khoảng lặng ngắn sau connect() trước
        // khi nhận byte đầu tiên - ghi ngay có thể rơi vào lúc firmware chưa
        // kịp chuyển sang chế độ nhận lệnh (thực hành phổ biến với HC-05/06
        // clone).
        Thread.sleep(150)
      }
      watchdog.cancel()
      socket
    } catch (e: Exception) {
      watchdog.cancel()
      try { socket.close() } catch (_: Exception) {}
      throw e
    }
  }

  // Kết nối THẬT cho phiên OBD chính - mở socket rồi ĐỌC LIÊN TỤC trên 1
  // coroutine nền, đẩy từng đoạn qua onClassicData tới khi disconnect (chủ
  // động hoặc mất kết nối). BleService.ts phía JS gộp các đoạn này vào đúng
  // buffer/tìm dấu '>' đã dùng cho BLE - không cần logic riêng cho Classic.
  private suspend fun connectClassic(address: String, pin: String) {
    // Dọn socket CŨ (nếu có, vd gọi lại connectClassic() khi 1 phiên trước
    // chưa kịp đóng hẳn) TRƯỚC khi mở mới - lặng lẽ (suppressEvent=true) vì
    // đây là dọn dẹp nội bộ, không phải user chủ động ngắt, JS không cần biết.
    closeActiveSocket(suppressEvent = true)

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

    val socket = openSerialSocketWithRetry(device)
    activeSocket = socket
    readerJob = moduleScope.launch {
      val buffer = ByteArray(512)
      var reason = "closed"
      try {
        while (isActive) {
          // read() là lời gọi BLOCK (không phải suspend) - coroutine này nằm
          // trên Dispatchers.IO (moduleScope) nên không chặn JS thread. Khi
          // closeActiveSocket() đóng socket từ nơi khác, read() đang block sẽ
          // ném IOException ngay lập tức (không đợi timeout hệ thống), rơi
          // xuống catch bên dưới - đây là cách DUY NHẤT để "huỷ" 1 lời gọi
          // block kiểu này, cancel() coroutine thường không đủ.
          val n = socket.inputStream.read(buffer)
          if (n < 0) {
            reason = "EOF - remote đóng kết nối"
            break
          }
          if (n > 0) {
            sendEvent("onClassicData", mapOf("data" to Base64.encodeToString(buffer, 0, n, Base64.NO_WRAP)))
          }
        }
      } catch (e: Exception) {
        reason = e.message ?: "unknown"
      }
      val suppress = suppressNextDisconnectEvent
      suppressNextDisconnectEvent = false
      if (!suppress) sendEvent("onClassicDisconnected", mapOf("reason" to reason))
    }
  }

  private fun writeClassic(base64: String) {
    val socket = activeSocket ?: throw BtPairingException("Chưa kết nối Classic Bluetooth")
    val bytes = Base64.decode(base64, Base64.NO_WRAP)
    socket.outputStream.write(bytes)
    socket.outputStream.flush()
  }

  private fun closeActiveSocket(suppressEvent: Boolean) {
    if (suppressEvent) suppressNextDisconnectEvent = true
    readerJob?.cancel()
    readerJob = null
    try { activeSocket?.close() } catch (_: Exception) {}
    activeSocket = null
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
