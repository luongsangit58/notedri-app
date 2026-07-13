import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'obd_paired_devices';

export type PairedDevice = {
  bleDeviceId: string;
  vehicleId: number;
  vehicleName: string;
};

async function readAll(): Promise<PairedDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeAll(devices: PairedDevice[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(devices));
}

// Gọi sau mỗi lần connect() thành công để BleService.handleRestoredState() (iOS
// background restore) và NFC tag biết thiết bị BLE này thuộc xe nào.
export async function savePairing(pairing: PairedDevice): Promise<void> {
  const devices = await readAll();
  const next = devices.filter((d) => d.bleDeviceId !== pairing.bleDeviceId);
  next.push(pairing);
  await writeAll(next);
}

// Có từng ghép ít nhất 1 thiết bị chưa - dùng để quyết định có đáng khởi tạo
// BleManager sớm (và có thể kéo theo prompt quyền Bluetooth) hay không. User
// Premium chưa từng dùng OBD2 thì chưa có kết nối nào để "restore" cả.
export async function hasAnyPairing(): Promise<boolean> {
  const devices = await readAll();
  return devices.length > 0;
}

export async function getPairingForVehicle(vehicleId: number): Promise<PairedDevice | null> {
  const devices = await readAll();
  return devices.find((d) => d.vehicleId === vehicleId) ?? null;
}
