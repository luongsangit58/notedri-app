import { BleManager, Device, State, Characteristic, BleRestoredState, BleErrorCode } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
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

// Chip Bluetooth rẻ tiền trên đầu Android ô tô (firmware BLE non chuẩn/lỗi) có
// thể không phản hồi connectToDevice() trong thời gian hợp lý - dùng option
// `timeout` gốc của thư viện (native, tự huỷ connection attempt khi hết giờ,
// KHÔNG phải Promise.race phía JS vốn để lại 1 tiến trình connect native chạy
// ngầm dù JS đã "bỏ cuộc") để đảm bảo luôn thoát ra được và retry thay vì kẹt
// "Đang kết nối..." vĩnh viễn. Đây là lớp bảo vệ MỀM duy nhất code làm được
// cho lỗi firmware thật sự - không sửa được chip, chỉ đảm bảo app không đứng
// hình vì nó.
const CONNECT_TIMEOUT_MS = 12000;

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

  /**
   * Cho phép module KHÁC (vd obdKeepAliveService) ghi 1 dòng chẩn đoán vào
   * đúng session log xuất ra cùng fixture - trước đây trạng thái keep-alive
   * (chạy được hay bị bỏ qua vì thiếu quyền) không hề xuất hiện trong log xuất
   * ra, nên khi có khoảng lặng dài bất thường (rà soát 20/7, fixture 13/7) chỉ
   * đoán được nguyên nhân chứ không xác nhận được.
   */
  logDiagnostic(tag: string, detail: string): void {
    this.logSession(tag, detail);
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
        const device = await this.connectWithMtuFallback(deviceId, 8000);
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
      // BLUETOOTH_SCAN/BLUETOOTH_CONNECT chỉ tồn tại từ Android 12 (API 31) trở
      // lên. Trên đầu Android ô tô đời cũ (vd Unisoc UMS512, thường Android
      // 9/10), xin 2 quyền này qua requestMultiple khiến vài ROM tuỳ biến trả
      // về "denied" cho quyền không tồn tại thay vì bỏ qua, làm cả nhóm luôn
      // fail vĩnh viễn (báo cáo 20/7: mở Cài đặt ứng dụng cũng không có mục
      // Bluetooth để bật vì quyền đó không áp dụng cho OS này). Trước 12,
      // BLUETOOTH/BLUETOOTH_ADMIN là quyền cài-đặt-thời (không cần xin runtime)
      // nên chỉ cần xin vị trí để quét BLE.
      if (Platform.Version >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        const granted = Object.values(result).every(
          (r) => r === PermissionsAndroid.RESULTS.GRANTED
        );
        // Ghi rõ TỪNG quyền (không chỉ true/false gộp) - khi ROM tuỳ biến deny
        // riêng 1 quyền trong nhóm, log gộp không phân biệt được quyền nào bị
        // chặn so với quyền không tồn tại trên OS đó.
        this.logSession('#permission', Object.entries(result).map(([k, v]) => `${k}=${v}`).join(','));
        return granted;
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      this.logSession('#permission', `ACCESS_FINE_LOCATION=${result} (API<31, BLUETOOTH_SCAN/CONNECT không áp dụng)`);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  /**
   * Android: startDeviceScan() trả về DANH SÁCH RỖNG (không lỗi) nếu quyền vị
   * trí đã cấp nhưng công tắc "Vị trí" (Location Services) toàn hệ thống đang
   * TẮT - yêu cầu của OS khi app không khai báo neverForLocation cho
   * BLUETOOTH_SCAN. Đầu Android ô tô không có GPS rời thường tắt sẵn công tắc
   * này (báo cáo 20/7: quét mãi không thấy Vgate dù Bluetooth đã bật, quyền
   * đã cấp) - phải phát hiện TRƯỚC khi quét để báo đúng nguyên nhân, nếu không
   * user chỉ thấy "không tìm thấy thiết bị" chung chung và bó tay.
   */
  async isLocationServicesEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
    this.logSession('#location_services', String(enabled));
    return enabled;
  }

  /**
   * Android: thử bật Bluetooth hộ user (BluetoothAdapter.enable - chạy tới
   * Android 12; Android 13+ bị OS chặn thì trả false để UI hướng dẫn mở cài đặt).
   * iOS không cho app bật Bluetooth - luôn false.
   */
  async tryEnableBluetooth(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      // manager.enable() gọi BluetoothAdapter.enable() - Android 13+ CHẶN lệnh này
      // nhưng một số ROM (MIUI...) không throw ngay mà TREO promise vô thời hạn
      // thay vì reject, khiến nút "Bật Bluetooth" trông như không phản hồi (phản
      // hồi 15/7). Ép timeout 2s: quá giờ coi như bị chặn, rơi xuống mở Cài đặt
      // hệ thống - vẫn đúng hành vi mong muốn cho trường hợp Android 13+.
      await Promise.race([
        this.manager.enable(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ENABLE_TIMEOUT')), 2000)),
      ]);
      this.logSession('#enable_bluetooth', 'ok');
      return true;
    } catch (e: any) {
      this.logSession('#enable_bluetooth', `failed: ${e?.message ?? 'unknown'}`);
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
  private bleError(code: 'BT_OFF' | 'BT_UNSUPPORTED' | 'BT_TIMEOUT' | 'SCAN_START_FAILED'): Error {
    const t = useI18nStore.getState().t;
    const msg =
      code === 'BT_OFF' ? t('obd.bluetooth_off')
      : code === 'BT_UNSUPPORTED' ? t('obd.bluetooth_unsupported')
      : code === 'SCAN_START_FAILED' ? t('obd.scan_start_failed')
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
    this.logSession('#ble_state', current);
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
          this.logSession('#ble_state', `${state} (sau ${current})`);
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
        this.logSession('#ble_state', `timeout - kẹt ở ${current}`);
        reject(this.bleError('BT_TIMEOUT'));
      }, 5000);
    });
  }

  /**
   * Lỗi trạng thái Bluetooth từ chính native SDK (vd quét lúc BT tắt) đến kèm
   * message tiếng Anh gốc - dịch lại qua bleError() trước khi đưa ra UI, tránh
   * lẫn tiếng Anh vào giao diện tiếng Việt (Sang phản hồi 16/7: quét lúc BT tắt
   * vẫn hiện "BluetoothLE is powered off").
   */
  private translateBleError(error: Error & { errorCode?: BleErrorCode }): Error {
    switch (error.errorCode) {
      case BleErrorCode.BluetoothPoweredOff:
        return this.bleError('BT_OFF');
      case BleErrorCode.BluetoothUnsupported:
        return this.bleError('BT_UNSUPPORTED');
      case BleErrorCode.BluetoothUnauthorized:
      case BleErrorCode.BluetoothInUnknownState:
      case BleErrorCode.BluetoothResetting:
        return this.bleError('BT_TIMEOUT');
      case BleErrorCode.ScanStartFailed:
        // Android chặn ("throttle") app gọi startScan() quá nhiều lần trong
        // thời gian ngắn (bật/tắt BT, đổi "hiện tất cả thiết bị", bấm "Quét
        // lại" liên tục lúc test) - lệnh quét sau đó luôn fail ngay lập tức
        // với message gốc "Cannot start scanning operation" không dịch được
        // (báo cáo 20/7: lỗi này vẫn hiện tiếng Anh dù đã sửa quyền/Location).
        // Không có cách nào code tự gỡ throttle - chỉ báo đúng nguyên nhân +
        // hướng khắc phục (đợi ít phút hoặc tắt bật lại Bluetooth) thay vì để
        // lộ message native khó hiểu.
        return this.bleError('SCAN_START_FAILED');
      case BleErrorCode.DeviceConnectionFailed:
        // Bao gồm cả trường hợp native `timeout` option (ConnectionOptions)
        // hết giờ - chip BLE của thiết bị không phản hồi kịp GATT connect.
        // Đây là lỗi phần cứng/firmware thật sự (không sửa được), chỉ dịch
        // lại message cho rõ + gợi ý thử lại thay vì để lộ message tiếng Anh
        // gốc từ native SDK.
        return new Error(useI18nStore.getState().t('obd.connect_hw_timeout'));
      default:
        return error;
    }
  }

  // ScanStartFailed đa số là lỗi ĐĂNG KÝ TẠM THỜI (native scanner của lần quét
  // trước chưa kịp huỷ hẳn khi lần quét mới đăng ký ngay - hay gặp vì
  // startScan() ở useObd gọi stop() rồi start() lại gần như cùng 1 tick khi
  // quyền/Location đã sẵn có từ trước) hoặc Android tự chặn app quét quá nhiều
  // lần liên tục trong 30s. Cả 2 trường hợp đều CÓ THỂ tự qua nếu đợi 1 chút
  // rồi thử lại - không cần user tự bấm "Quét lại". Chỉ retry cho ĐÚNG mã lỗi
  // này (không phải BT tắt hay lỗi khác) vì nguyên nhân của các mã khác không
  // hết chỉ vì đợi.
  private static readonly SCAN_START_RETRY_DELAYS_MS = [800, 2000];

  scanForDevices(
    onFound: (device: ObdDevice) => void,
    onError: (error: Error) => void,
    showAll = false
  ): () => void {
    const found = new Set<string>();
    // Ghi cả thiết bị KHÔNG tên và thiết bị bị bộ lọc whitelist loại - khi user
    // báo "quét không thấy" mà không có log này thì không phân biệt được là
    // scanner không nhận được quảng bá nào cả (lỗi adapter/chip xe), hay CÓ
    // nhận được nhưng tên adapter lạ bị lọc mất (chỉ cần bật "hiện tất cả").
    let unnamedCount = 0;
    let filteredOut = 0;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;

    const beginScan = () => {
      this.logSession('#scan', `start showAll=${showAll}${retryAttempt > 0 ? ` (retry ${retryAttempt})` : ''}`);
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (stopped) return;
        if (error) {
          if (
            error.errorCode === BleErrorCode.ScanStartFailed &&
            retryAttempt < BleService.SCAN_START_RETRY_DELAYS_MS.length
          ) {
            const waitMs = BleService.SCAN_START_RETRY_DELAYS_MS[retryAttempt];
            retryAttempt++;
            this.logSession('#scan', `ScanStartFailed - tự thử lại sau ${waitMs}ms`);
            this.manager.stopDeviceScan();
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (!stopped) beginScan();
            }, waitMs);
            return;
          }
          const translated = this.translateBleError(error);
          this.logSession('#scan', `error: ${translated.message} (native code=${error.errorCode})`);
          onError(translated);
          return;
        }
        if (!device || !device.name) { unnamedCount++; return; }
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
            this.logSession('#scan', `found "${device.name}" ${device.id} rssi=${device.rssi ?? '?'}`);
            onFound({ id: device.id, name: device.name });
          }
        } else {
          filteredOut++;
        }
      });
    };

    beginScan();

    return () => {
      stopped = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      this.manager.stopDeviceScan();
      this.logSession('#scan', `stop - found=${found.size} filteredOut=${filteredOut} unnamed=${unnamedCount}`);
    };
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  // Chặn double-tap/2 lời gọi connect() chồng lấn (vd bấm 2 dòng thiết bị liên
  // tiếp trước khi UI kịp disable): nếu không, 2 luồng dò GATT chạy song song
  // sẽ cùng ghi vào responseBuffer dùng chung -> dữ liệu lẫn lộn giữa 2 phiên.
  private connecting = false;

  // Lỗi trạng thái adapter (BT tắt/không hỗ trợ/đang reset...) không liên quan
  // gì tới MTU - thử lại ngay lập tức chỉ tốn thêm 1 timeout đầy đủ (tới 12s)
  // trước khi báo đúng lỗi, không giúp kết nối thành công hơn.
  private static readonly ADAPTER_STATE_ERROR_CODES: ReadonlySet<BleErrorCode> = new Set([
    BleErrorCode.BluetoothPoweredOff,
    BleErrorCode.BluetoothUnsupported,
    BleErrorCode.BluetoothUnauthorized,
    BleErrorCode.BluetoothInUnknownState,
    BleErrorCode.BluetoothResetting,
  ]);

  /**
   * Chip BLE rẻ tiền (thường gặp trên đầu Android ô tô) có thể treo/rớt khi
   * thương lượng MTU lớn (512 byte, cần để đọc response OBD dài không bị cắt
   * khúc) - firmware yếu chỉ quen với MTU mặc định 23 byte. Timeout mỗi lần
   * thử là lớp chặn "treo vĩnh viễn"; thử lại 1 lần KHÔNG xin MTU lớn trước
   * khi báo lỗi hẳn - đây là điều duy nhất code có thể làm cho lỗi firmware
   * thật sự (không sửa được chip, chỉ tăng khả năng vẫn kết nối được ở MTU
   * thấp hơn, chấp nhận response OBD có thể bị chia nhiều gói hơn).
   */
  private async connectWithMtuFallback(deviceId: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<Device> {
    try {
      return await this.manager.connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: 512,
        timeout: timeoutMs,
      });
    } catch (error: any) {
      if (BleService.ADAPTER_STATE_ERROR_CODES.has(error?.errorCode)) {
        throw this.translateBleError(error);
      }
      await this.manager.cancelDeviceConnection(deviceId).catch(() => {});
      try {
        return await this.manager.connectToDevice(deviceId, {
          autoConnect: false,
          timeout: timeoutMs,
        });
      } catch (fallbackError: any) {
        throw this.translateBleError(fallbackError);
      }
    }
  }

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

      const device = await this.connectWithMtuFallback(deviceId);

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
