import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

// ELM327 BLE service/characteristic UUIDs (standard across most adapters)
const OBD_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const OBD_WRITE_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_NOTIFY_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

// Vgate iCar Pro BLE uses different UUIDs as fallback
const VGATE_SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
const VGATE_WRITE_UUID = 'be781a71-0000-1000-8000-00805f9b34fb';
const VGATE_NOTIFY_UUID = 'be781a71-0001-1000-8000-00805f9b34fb';

export type ObdDevice = {
  id: string;
  name: string;
};

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';

class BleService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private notifyCharacteristic: Characteristic | null = null;
  private writeCharUuid: string = OBD_WRITE_UUID;
  private responseBuffer: string = '';
  private responseResolver: ((value: string) => void) | null = null;

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
      if (error) {
        onError(error);
        return;
      }
      if (!device || !device.name) return;

      const name = device.name.toUpperCase();
      // Filter likely OBD adapters
      if (
        name.includes('OBD') ||
        name.includes('ELM') ||
        name.includes('VGATE') ||
        name.includes('VEEPEAK') ||
        name.includes('OBD2') ||
        name.includes('OBDII') ||
        name.includes('ICAR')
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

    // Detect which UUID set this device uses
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

    // Subscribe to notifications
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
          }
        }
      }
    ) as unknown as Characteristic;

    // Setup disconnect handler
    device.onDisconnected(() => {
      this.connectedDevice = null;
      this.notifyCharacteristic = null;
      this.responseBuffer = '';
    });
  }

  async sendCommand(command: string, timeoutMs = 2000): Promise<string> {
    if (!this.connectedDevice) throw new Error('Chưa kết nối thiết bị OBD');

    const services = await this.connectedDevice.services();
    const serviceUuids = services.map((s) => s.uuid.toLowerCase());

    const serviceUuid = serviceUuids.includes(VGATE_SERVICE_UUID.toLowerCase())
      ? VGATE_SERVICE_UUID
      : OBD_SERVICE_UUID;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseResolver = null;
        reject(new Error(`Timeout: ${command}`));
      }, timeoutMs);

      this.responseResolver = (value) => {
        clearTimeout(timer);
        resolve(value);
      };

      const encoded = btoa(command + '\r');
      this.connectedDevice!.writeCharacteristicWithResponseForService(
        serviceUuid,
        this.writeCharUuid,
        encoded
      ).catch((err) => {
        clearTimeout(timer);
        this.responseResolver = null;
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
    }
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
