import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

const OBD_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const OBD_WRITE_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_NOTIFY_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

const VGATE_SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
const VGATE_WRITE_UUID = 'be781a71-0000-1000-8000-00805f9b34fb';
const VGATE_NOTIFY_UUID = 'be781a71-0001-1000-8000-00805f9b34fb';

export type ObdDevice = { id: string; name: string };
export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';

class BleService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private notifyCharacteristic: Characteristic | null = null;
  private writeCharUuid: string = OBD_WRITE_UUID;
  private activeServiceUuid: string = OBD_SERVICE_UUID;
  private responseBuffer: string = '';
  private responseResolver: ((value: string) => void) | null = null;
  private responseRejecter: ((err: Error) => void) | null = null;

  // Serial command queue: each sendCommand chains onto this promise so
  // commands are guaranteed to execute one at a time.
  private commandQueue: Promise<void> = Promise.resolve();

  // Callback fired when device unexpectedly disconnects
  onDisconnect: (() => void) | null = null;

  constructor() {
    this.manager = new BleManager();
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

  async waitForBleReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          subscription.remove();
          resolve();
        } else if (state === State.PoweredOff || state === State.Unsupported) {
          subscription.remove();
          reject(new Error('Bluetooth không khả dụng'));
        }
      }, true);
    });
  }

  scanForDevices(
    onFound: (device: ObdDevice) => void,
    onError: (error: Error) => void
  ): () => void {
    const found = new Set<string>();
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) { onError(error); return; }
      if (!device || !device.name) return;
      const name = device.name.toUpperCase();
      if (
        name.includes('OBD') || name.includes('ELM') ||
        name.includes('VGATE') || name.includes('VEEPEAK') ||
        name.includes('OBD2') || name.includes('OBDII') || name.includes('ICAR')
      ) {
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

  async connect(deviceId: string): Promise<void> {
    this.manager.stopDeviceScan();

    const device = await this.manager.connectToDevice(deviceId, {
      autoConnect: false,
      requestMTU: 512,
    });

    await device.discoverAllServicesAndCharacteristics();
    this.connectedDevice = device;

    const services = await device.services();
    const serviceUuids = services.map((s) => s.uuid.toLowerCase());

    let serviceUuid: string;
    let notifyUuid: string;

    if (serviceUuids.includes(VGATE_SERVICE_UUID.toLowerCase())) {
      serviceUuid = VGATE_SERVICE_UUID;
      notifyUuid = VGATE_NOTIFY_UUID;
      this.writeCharUuid = VGATE_WRITE_UUID;
    } else {
      serviceUuid = OBD_SERVICE_UUID;
      notifyUuid = OBD_NOTIFY_UUID;
      this.writeCharUuid = OBD_WRITE_UUID;
    }
    this.activeServiceUuid = serviceUuid;

    this.notifyCharacteristic = await device.monitorCharacteristicForService(
      serviceUuid,
      notifyUuid,
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

    // Propagate unexpected disconnect to callers (e.g. useObd hook)
    device.onDisconnected(() => {
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

      this.onDisconnect?.();
    });
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
      return Promise.reject(new Error('Chưa kết nối thiết bị OBD'));
    }

    const device = this.connectedDevice;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseResolver = null;
        this.responseRejecter = null;
        reject(new Error(`OBD timeout: ${command}`));
      }, timeoutMs);

      this.responseResolver = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      this.responseRejecter = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      const encoded = btoa(command + '\r');
      device.writeCharacteristicWithResponseForService(
        this.activeServiceUuid,
        this.writeCharUuid,
        encoded
      ).catch((err) => {
        clearTimeout(timer);
        this.responseResolver = null;
        this.responseRejecter = null;
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch {
        // Already disconnected — ignore
      }
      this.connectedDevice = null;
    }
    this.commandQueue = Promise.resolve();
    this.onDisconnect = null;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getDeviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  destroy() {
    this.manager.destroy();
  }
}

export const bleService = new BleService();
