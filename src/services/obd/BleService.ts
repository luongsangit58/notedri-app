import { BleManager, Device, State, Characteristic, BleRestoredState } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { useI18nStore } from '../../i18n';
import { useObdSessionStore } from '../../store/obdSessionStore';

// KHÔNG hardcode characteristic UUID (bài học fixture 13/7: Vgate iCar Pro thật
// có service e7810a71 nhưng KHÔNG có characteristic be781a71-... từng hardcode -
// mọi lệnh WRITE_ERROR). TX/RX được DÒ ĐỘNG từ GATT: TX = char ghi được,
// RX = char notify/indicate. Danh sách dưới chỉ để XẾP HẠNG ưu tiên khi adapter
// quảng bá nhiều service serial cùng lúc - không phải điều kiện bắt buộc.
const PREFERRED_SERIAL_SERVICE_PREFIXES = [
  '000018f0', // chuẩn serial ELM327 BLE phổ biến nhất (Vgate iCar Pro dùng cái này)
  '0000fff0',
  '0000ffe0',
  'e7810a71', // Vgate custom
];

// Service hệ thống GATT - không bao giờ là kênh serial
const GENERIC_GATT_SERVICES = new Set([
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
]);

export type ObdDevice = { id: string; name: string };
export type ConnectionState =
  | 'disconnected' | 'scanning' | 'connecting' | 'reconnecting' | 'connected' | 'error';
export type SessionLogEntry = { t: number; cmd: string; res: string };
export type LinkQuality = 'good' | 'fair' | 'poor' | 'unknown';

const RECONNECT_DELAYS_MS = [1000, 3000, 6000];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class BleService {
  private _manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private notifyCharacteristic: Characteristic | null = null;
  // TX/RX được gán trong attachToDevice() sau khi dò GATT - không có giá trị mặc định
  private writeCharUuid = '';
  private activeServiceUuid = '';
  private writeWithResponse = true;
  private responseBuffer: string = '';
  private responseResolver: ((value: string) => void) | null = null;
  private responseRejecter: ((err: Error) => void) | null = null;

  // Serial command queue: each sendCommand chains onto this promise so
  // commands are guaranteed to execute one at a time.
  private commandQueue: Promise<void> = Promise.resolve();

  // Nhật ký thô lệnh/response của phiên kết nối hiện tại (xoá khi connect mới).
  // Mục đích: phiên chạy thật đầu tiên trên xe xuất ra được fixture (loạt ATZ/0100/
  // 0902/03... và response nguyên văn) để viết unit test parser + capability profile
  // mà không cần ngồi trên xe. Entry bắt đầu bằng '#' là ghi chú sự kiện, không phải lệnh.
  private sessionLog: SessionLogEntry[] = [];
  private static readonly SESSION_LOG_MAX = 1000;

  private logSession(cmd: string, res: string): void {
    if (this.sessionLog.length >= BleService.SESSION_LOG_MAX) return;
    this.sessionLog.push({ t: Date.now(), cmd, res });
  }

  getSessionLog(): ReadonlyArray<SessionLogEntry> {
    return this.sessionLog;
  }

  // Listener set (C5 tầng 2): NHIỀU bên cùng nghe sự kiện kết nối - UI hook của
  // từng màn + obdTripManager toàn cục. Trước đây là callback đơn (gán đè nhau).
  private disconnectListeners = new Set<() => void>();
  private reconnectingListeners = new Set<(attempt: number) => void>();
  private reconnectedListeners = new Set<() => void>();

  /** Nghe sự kiện mất kết nối HẲN (sau reconnect grace / ngắt chủ động). Trả về unsubscribe. */
  addDisconnectListener(fn: () => void): () => void {
    this.disconnectListeners.add(fn);
    return () => this.disconnectListeners.delete(fn);
  }

  addReconnectingListener(fn: (attempt: number) => void): () => void {
    this.reconnectingListeners.add(fn);
    return () => this.reconnectingListeners.delete(fn);
  }

  addReconnectedListener(fn: () => void): () => void {
    this.reconnectedListeners.add(fn);
    return () => this.reconnectedListeners.delete(fn);
  }

  private reconnecting = false;
  private intentionalDisconnect = false;

  // Telemetry retention (ý #14): mốc phiên nằm ở singleton vì hook useObd bị
  // tạo mới khi chuyển màn (Setup → Dashboard) - ref trong hook sẽ mất mốc.
  // Reconnect grace thành công không reset mốc: vẫn là một phiên.
  private sessionStartedAt: number | null = null;
  private sessionDeviceName: string | null = null;

  /** Tuổi phiên hiện tại (giây) - đọc KHÔNG phá huỷ, cho rule engine (min_session_seconds). */
  getSessionAgeSeconds(): number {
    return this.sessionStartedAt ? Math.round((Date.now() - this.sessionStartedAt) / 1000) : 0;
  }

  /** Trả mốc phiên hiện tại rồi XOÁ - đảm bảo mỗi phiên chỉ report đúng 1 lần. */
  consumeSessionInfo(): { startedAt: number; deviceName: string | null } | null {
    if (this.sessionStartedAt === null) return null;
    const info = { startedAt: this.sessionStartedAt, deviceName: this.sessionDeviceName };
    this.sessionStartedAt = null;
    return info;
  }

  // Chất lượng đường truyền (ý #16): cửa sổ trượt kết quả lệnh 60s gần nhất.
  private linkResults: Array<{ t: number; ok: boolean }> = [];

  private recordLinkResult(ok: boolean): void {
    const now = Date.now();
    this.linkResults.push({ t: now, ok });
    // Giữ gọn: chỉ cần 60s gần nhất, tối đa 100 mẫu
    this.linkResults = this.linkResults.filter((r) => now - r.t <= 60000).slice(-100);
  }

  getLinkQuality(): LinkQuality {
    const now = Date.now();
    const recent = this.linkResults.filter((r) => now - r.t <= 60000);
    if (recent.length < 4) return 'unknown';
    const failRate = recent.filter((r) => !r.ok).length / recent.length;
    if (failRate > 0.4) return 'poor';
    if (failRate > 0.15) return 'fair';
    return 'good';
  }

  // Callback fired when iOS relaunches the app in the background and CoreBluetooth
  // hands back a peripheral we were already connected to (state restoration) -
  // lets AutoDriveManager pick up the trip without any user interaction.
  onAutoRestore: (() => void) | null = null;

  // Lazy: BleManager is only instantiated the first time BLE is actually needed.
  // Creating it at module load time triggers NativeEventEmitter before the
  // native layer is ready, causing "EventEmitter" warnings on every app start.
  private get manager(): BleManager {
    if (!this._manager) {
      this._manager = new BleManager({
        // iOS only (Android ignores these options): lets CoreBluetooth relaunch
        // the app in the background when a peripheral we were connected to before
        // the app was suspended/killed-by-system reconnects. Requires
        // isBackgroundEnabled in the react-native-ble-plx app.json plugin.
        restoreStateIdentifier: 'notedri-obd-restore',
        restoreStateFunction: (restoredState) => this.handleRestoredState(restoredState),
      });
    }
    return this._manager;
  }

  // Ép khởi tạo BleManager sớm (App root, không phải khi 1 màn hình OBD mount) -
  // restoreStateIdentifier chỉ nhận được callback từ iOS nếu manager cùng
  // identifier đã tồn tại lúc app được CoreBluetooth đánh thức nền. Nếu chờ đến
  // khi user tự mở màn OBD mới tạo manager, restore không bao giờ kịp nối vào.
  ensureInitialized(): void {
    void this.manager;
  }

  private handleRestoredState(restoredState: BleRestoredState | null) {
    const device = restoredState?.connectedPeripherals?.[0];
    if (!device) return;
    this.attachToDevice(device)
      .then(() => this.onAutoRestore?.())
      .catch(() => {
        // Restoration race: peripheral disconnected again before we finished
        // re-subscribing to notifications. Nothing to recover here - the
        // normal scan/connect flow (manual or AutoDrive) will retry later.
      });
  }

  // Shared by connect() (manual, user-initiated) and handleRestoredState()
  // (automatic, iOS background relaunch) - both need the exact same
  // discover -> pick UUID set -> subscribe notify -> watch disconnect sequence.
  private async attachToDevice(device: Device): Promise<void> {
    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;

    const services = await device.services();
    this.logSession('#device', `${device.name ?? '?'} ${device.id}`);
    this.logSession('#services', services.map((s) => s.uuid.toLowerCase()).join(','));

    // Dò GATT động: liệt kê MỌI characteristic + properties (log = bản đồ GATT
    // đầy đủ kiểu nRF Connect trong file export), rồi tự chọn kênh serial:
    // TX = char ghi được (ưu tiên write-with-response), RX = char notify/indicate.
    type SerialCandidate = {
      serviceUuid: string;
      tx: Characteristic;
      rx: Characteristic;
    };
    const candidates: SerialCandidate[] = [];

    for (const service of services) {
      const svcUuid = service.uuid.toLowerCase();
      if (GENERIC_GATT_SERVICES.has(svcUuid)) continue;

      const chars = await service.characteristics();
      for (const c of chars) {
        const props = [
          c.isReadable ? 'read' : null,
          c.isWritableWithResponse ? 'write' : null,
          c.isWritableWithoutResponse ? 'writeNoResp' : null,
          c.isNotifiable ? 'notify' : null,
          c.isIndicatable ? 'indicate' : null,
        ].filter(Boolean).join('|');
        this.logSession('#char', `${svcUuid} ${c.uuid.toLowerCase()} [${props}]`);
      }

      const tx = chars.find((c) => c.isWritableWithResponse)
        ?? chars.find((c) => c.isWritableWithoutResponse);
      const rx = chars.find((c) => c.isNotifiable) ?? chars.find((c) => c.isIndicatable);
      if (tx && rx) candidates.push({ serviceUuid: svcUuid, tx, rx });
    }

    if (candidates.length === 0) {
      this.logSession('#error', 'no serial channel (no service with writable + notifiable chars)');
      throw new Error(useI18nStore.getState().t('obd.no_serial_channel'));
    }

    // Nhiều service đủ điều kiện → ưu tiên service serial quen thuộc trước
    const rank = (uuid: string) => {
      const i = PREFERRED_SERIAL_SERVICE_PREFIXES.findIndex((p) => uuid.startsWith(p));
      return i === -1 ? PREFERRED_SERIAL_SERVICE_PREFIXES.length : i;
    };
    candidates.sort((a, b) => rank(a.serviceUuid) - rank(b.serviceUuid));

    const chosen = candidates[0];
    this.activeServiceUuid = chosen.serviceUuid;
    this.writeCharUuid = chosen.tx.uuid;
    this.writeWithResponse = chosen.tx.isWritableWithResponse;
    this.logSession('#tx', `${chosen.tx.uuid} (${this.writeWithResponse ? 'write' : 'writeNoResp'})`);
    this.logSession('#rx', `${chosen.rx.uuid} (${chosen.rx.isNotifiable ? 'notify' : 'indicate'})`);

    this.notifyCharacteristic = await device.monitorCharacteristicForService(
      chosen.serviceUuid,
      chosen.rx.uuid,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const chunk = atob(characteristic.value);
        this.responseBuffer += chunk;

        if (this.responseBuffer.includes('>')) {
          const response = this.responseBuffer.replace('>', '').trim();
          this.responseBuffer = '';
          if (this.responseResolver) {
            this.responseResolver(response);
            this.responseResolver = null;
            this.responseRejecter = null;
          }
        }
      }
    ) as unknown as Characteristic;

    // Unexpected disconnect → reconnect grace trước, chỉ báo onDisconnect khi hết cửa
    device.onDisconnected(() => this.handleDeviceDisconnected(device.id));
  }

  private handleDeviceDisconnected(deviceId: string): void {
    this.connectedDevice = null;
    this.notifyCharacteristic = null;
    this.responseBuffer = '';
    this.commandQueue = Promise.resolve(); // Drain queue

    // Reject any in-flight command
    if (this.responseRejecter) {
      this.responseRejecter(new Error('BLE disconnected'));
      this.responseResolver = null;
      this.responseRejecter = null;
    }

    // disconnect() chủ động gọi cancelConnection -> callback này vẫn bắn:
    // không được thử reconnect khi user cố tình ngắt. Cũng chặn re-entry
    // khi một attempt reconnect vừa attach xong lại rớt ngay (vòng lặp lo).
    if (this.intentionalDisconnect || this.reconnecting) {
      if (!this.reconnecting) {
        // Fire listener TRƯỚC khi clear store: telemetry cần đọc vehicleId
        this.disconnectListeners.forEach((fn) => fn());
        useObdSessionStore.getState().clear();
      }
      return;
    }

    void this.attemptReconnect(deviceId);
  }

  private async attemptReconnect(deviceId: string): Promise<void> {
    this.reconnecting = true;
    this.logSession('#disconnect', 'unexpected - reconnect grace start');

    for (let attempt = 1; attempt <= RECONNECT_DELAYS_MS.length; attempt++) {
      useObdSessionStore.getState().patch({ connected: false, reconnecting: true });
      this.reconnectingListeners.forEach((fn) => fn(attempt));
      await delay(RECONNECT_DELAYS_MS[attempt - 1]);

      // User có thể đã chủ động ngắt trong lúc chờ backoff
      if (this.intentionalDisconnect) {
        this.reconnecting = false;
        return;
      }

      try {
        const device = await this.manager.connectToDevice(deviceId, {
          autoConnect: false,
          requestMTU: 512,
          timeout: 8000,
        });
        await this.attachToDevice(device);

        // User có thể đã bấm "Ngắt kết nối" TRONG LÚC connectToDevice/attachToDevice
        // ở trên đang chạy (connectedDevice lúc đó là null nên disconnect() không có
        // gì để cancelConnection - chỉ set cờ này) - nếu không kiểm tra lại ở đây,
        // phiên vừa bị user ngắt sẽ "tự hồi sinh" ngay sau khi attach xong.
        if (this.intentionalDisconnect) {
          try { await device.cancelConnection(); } catch {}
          this.connectedDevice = null;
          this.notifyCharacteristic = null;
          this.reconnecting = false;
          return;
        }

        this.reconnecting = false;
        this.logSession('#reconnect', `ok attempt ${attempt}`);
        useObdSessionStore.getState().patch({ connected: true, reconnecting: false });
        this.reconnectedListeners.forEach((fn) => fn());
        return;
      } catch {
        this.logSession('#reconnect', `attempt ${attempt} failed`);
      }
    }

    this.reconnecting = false;
    // Fire listener TRƯỚC khi clear store (telemetry đọc vehicleId từ store)
    this.disconnectListeners.forEach((fn) => fn());
    useObdSessionStore.getState().clear();
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(result).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }

  /**
   * Android: thử bật Bluetooth hộ user (BluetoothAdapter.enable - chạy tới
   * Android 12; Android 13+ bị OS chặn thì trả false để UI hướng dẫn mở cài đặt).
   * iOS không cho app bật Bluetooth - luôn false.
   */
  async tryEnableBluetooth(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      await this.manager.enable();
      return true;
    } catch {
      return false;
    }
  }

  /** Đọc trạng thái Bluetooth hiện tại (tức thì) - cho UI check sớm trước khi quét. */
  async getBluetoothState(): Promise<State> {
    try {
      return await this.manager.state();
    } catch {
      return State.Unknown;
    }
  }

  /**
   * Theo dõi trạng thái Bluetooth (bật/tắt) cho UI - emitCurrent=true phát ngay
   * trạng thái hiện tại nên màn hình biết BT đang TẮT từ lúc mount, không phải
   * đợi user bấm quét rồi mới báo lỗi (user phản hồi 15/7: app không nhận biết
   * được máy đã bật Bluetooth hay chưa để đề xuất bật). Trả về hàm unsubscribe.
   */
  onBluetoothStateChange(fn: (state: State) => void): () => void {
    const subscription = this.manager.onStateChange(fn, true);
    return () => subscription.remove();
  }

  /**
   * Lỗi có .code để UI phân biệt: BT_OFF (tắt - bật được), BT_UNSUPPORTED (máy
   * không có BLE), BT_TIMEOUT (state kẹt Unknown/Resetting). Trước đây mọi
   * trường hợp trả CHUNG "Bluetooth không khả dụng" - user không biết là do
   * TẮT (bật lên là xong) hay máy không hỗ trợ (Sang phản hồi 14/7: app không
   * rõ có kiểm tra trạng thái Bluetooth máy hay không).
   */
  private bleError(code: 'BT_OFF' | 'BT_UNSUPPORTED' | 'BT_TIMEOUT'): Error {
    const t = useI18nStore.getState().t;
    const msg =
      code === 'BT_OFF' ? t('obd.bluetooth_off')
      : code === 'BT_UNSUPPORTED' ? t('obd.bluetooth_unsupported')
      : t('obd.bluetooth_unavailable');
    const err = new Error(msg) as Error & { code?: string };
    err.code = code;
    return err;
  }

  async waitForBleReady(): Promise<void> {
    // Kiểm tra TỨC THÌ trước (manager.state()) thay vì chỉ chờ onStateChange -
    // trạng thái TẮT/không-hỗ-trợ được phát hiện ngay, không phụ thuộc thời điểm
    // adapter phát sự kiện (nguồn cơn "app không kiểm tra được trạng thái BT").
    const current = await this.getBluetoothState();
    if (current === State.PoweredOn) return;
    if (current === State.PoweredOff) throw this.bleError('BT_OFF');
    if (current === State.Unsupported) throw this.bleError('BT_UNSUPPORTED');

    // Unknown/Resetting: state đang chuyển tiếp -> chờ ngắn qua onStateChange.
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(timer);
          subscription.remove();
          resolve();
        } else if (state === State.PoweredOff) {
          clearTimeout(timer);
          subscription.remove();
          reject(this.bleError('BT_OFF'));
        } else if (state === State.Unsupported) {
          clearTimeout(timer);
          subscription.remove();
          reject(this.bleError('BT_UNSUPPORTED'));
        }
      }, true);
      timer = setTimeout(() => {
        subscription.remove();
        reject(this.bleError('BT_TIMEOUT'));
      }, 5000);
    });
  }

  scanForDevices(
    onFound: (device: ObdDevice) => void,
    onError: (error: Error) => void,
    showAll = false
  ): () => void {
    const found = new Set<string>();
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) { onError(error); return; }
      if (!device || !device.name) return;
      const name = device.name.toUpperCase();
      // 'VLINK' bắt buộc phải có: Vgate iCar Pro BLE 4.0 quảng bá tên "IOS-Vlink",
      // không chứa OBD/ELM/VGATE/ICAR - thiếu nó là quét không bao giờ thấy adapter.
      const isKnownAdapter =
        name.includes('OBD') || name.includes('ELM') ||
        name.includes('VGATE') || name.includes('VEEPEAK') ||
        name.includes('VLINK') || name.includes('ICAR');
      if (showAll || isKnownAdapter) {
        if (!found.has(device.id)) {
          found.add(device.id);
          onFound({ id: device.id, name: device.name });
        }
      }
    });
    return () => this.manager.stopDeviceScan();
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  // Chặn double-tap/2 lời gọi connect() chồng lấn (vd bấm 2 dòng thiết bị liên
  // tiếp trước khi UI kịp disable): nếu không, 2 luồng dò GATT chạy song song
  // sẽ cùng ghi vào responseBuffer dùng chung -> dữ liệu lẫn lộn giữa 2 phiên.
  private connecting = false;

  async connect(deviceId: string): Promise<void> {
    if (this.connecting || this.connectedDevice) {
      // Gắn .code để caller (useObd) phân biệt được: đây là lời gọi "thua" trong
      // 1 cặp double-tap, KHÔNG PHẢI lỗi kết nối thật - không được dọn dẹp
      // (disconnect()) phiên đang được luồng kia xử lý.
      const err = new Error(useI18nStore.getState().t('obd.connect_in_progress'));
      (err as Error & { code?: string }).code = 'CONNECT_IN_PROGRESS';
      throw err;
    }
    this.connecting = true;
    try {
      this.manager.stopDeviceScan();
      this.intentionalDisconnect = false;
      this.linkResults = [];
      // Phiên mới = log mới; log phiên cũ giữ nguyên tới lúc này để user kịp xuất sau khi ngắt.
      this.sessionLog = [];

      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: 512,
      });

      await this.attachToDevice(device);
      this.sessionStartedAt = Date.now();
      this.sessionDeviceName = device.name ?? null;
      useObdSessionStore.getState().patch({
        connected: true,
        reconnecting: false,
        deviceName: this.sessionDeviceName,
      });
    } finally {
      this.connecting = false;
    }
  }

  // All callers go through this single entry point.
  // Commands are serialized via the promise chain — safe to call concurrently.
  async sendCommand(command: string, timeoutMs = 2000): Promise<string> {
    let resolve_: (v: string) => void;
    let reject_: (e: Error) => void;

    const resultPromise = new Promise<string>((res, rej) => {
      resolve_ = res;
      reject_ = rej;
    });

    // Chain onto the queue. Each task must not throw (use .catch inside) so
    // a failure doesn't stall the whole queue.
    this.commandQueue = this.commandQueue.then(async () => {
      try {
        const result = await this._sendCommandInternal(command, timeoutMs);
        resolve_!(result);
      } catch (err: any) {
        reject_!(err);
      }
    });

    return resultPromise;
  }

  private _sendCommandInternal(command: string, timeoutMs: number): Promise<string> {
    if (!this.connectedDevice) {
      return Promise.reject(new Error(useI18nStore.getState().t('obd.not_connected')));
    }

    const device = this.connectedDevice;

    // Xoá buffer dở TRƯỚC khi gửi lệnh mới: mảnh response còn sót của lệnh trước
    // (đặc biệt lệnh đã timeout) không được lẫn vào response của lệnh này.
    this.responseBuffer = '';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Xoá buffer khi timeout: response TRỄ của lệnh này không được resolve nhầm
        // vào promise của lệnh kế tiếp (đọc sai giá trị / sai DTC).
        this.responseBuffer = '';
        this.responseResolver = null;
        this.responseRejecter = null;
        this.logSession(command, '<<TIMEOUT>>');
        this.recordLinkResult(false);
        reject(new Error(`OBD timeout: ${command}`));
      }, timeoutMs);

      this.responseResolver = (value) => {
        clearTimeout(timer);
        this.logSession(command, value);
        this.recordLinkResult(true);
        resolve(value);
      };
      this.responseRejecter = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      const encoded = btoa(command + '\r');
      // Dùng đúng kiểu ghi mà characteristic TX hỗ trợ (dò được lúc attach)
      const writePromise = this.writeWithResponse
        ? device.writeCharacteristicWithResponseForService(this.activeServiceUuid, this.writeCharUuid, encoded)
        : device.writeCharacteristicWithoutResponseForService(this.activeServiceUuid, this.writeCharUuid, encoded);
      writePromise.catch((err) => {
        clearTimeout(timer);
        this.responseResolver = null;
        this.responseRejecter = null;
        this.logSession(command, `<<WRITE_ERROR: ${err?.message ?? 'unknown'}>>`);
        this.recordLinkResult(false);
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    // Chặn reconnect grace: đây là ngắt CHỦ ĐỘNG của user. KHÔNG clear store ở
    // đây - handleDeviceDisconnected (do cancelConnection kích) fire listener
    // trước rồi mới clear, để telemetry còn đọc được vehicleId.
    this.intentionalDisconnect = true;
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch {
        // Already disconnected — ignore
      }
      this.connectedDevice = null;
    } else {
      // Không có kết nối nào (gọi thừa) - dọn store cho chắc
      useObdSessionStore.getState().clear();
    }
    this.commandQueue = Promise.resolve();
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getDeviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  getDeviceName(): string | null {
    return this.connectedDevice?.name ?? this.sessionDeviceName;
  }

  destroy() {
    if (this._manager) {
      this._manager.destroy();
      this._manager = null;
    }
  }
}

export const bleService = new BleService();
