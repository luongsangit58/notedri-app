import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'obd_paired_devices';

export type PairedDevice = {
  bleDeviceId: string;
  vehicleId: number;
  vehicleName: string;
  // Mốc kết nối thành công gần nhất (ms epoch) - nuôi trạng thái "lâu không thấy
  // thiết bị" ở màn chi tiết xe (ý #12/#13: nudge passive, không bắn push làm phiền).
  lastConnectedAt?: number;
  // Transport của lần kết nối gần nhất (22/7) - "bleDeviceId" thực chất là địa
  // chỉ MAC khi transport='classic' (không phải BLE GATT id), nhưng giữ tên
  // field cũ để không phải migrate dữ liệu đã lưu. Thiếu field (pairing lưu
  // trước 22/7) coi như 'ble' - hành vi cũ, không đổi cho user hiện tại.
  // Dùng để OBDSetupScreen tự chuyển đúng mode + tự kết nối lại (auto-reconnect
  // cho Classic, xem targetTransport ở đó) thay vì luôn mặc định BLE.
  transport?: 'ble' | 'classic';
  // Opt-in (25/7, góp ý user: mở lại app không tự kết nối, nhưng KHÔNG được tự
  // bật mặc định cho mọi người - tốn pin quét BLE mỗi lần mở app kể cả khi
  // không ở trong xe) - user tự bật ở OBDSetupScreen. undefined = chưa từng
  // chọn (coi như false, không nudge lại nếu đã có giá trị rõ ràng).
  autoConnect?: boolean;
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
  // Giữ lại lựa chọn autoConnect đã có (25/7) - useObd.ts gọi hàm này sau MỌI
  // lần connect thành công mà không biết gì về field này, ghi đè trực tiếp sẽ
  // âm thầm xoá mất lựa chọn user đã bật ở OBDSetupScreen mỗi khi họ kết nối lại.
  //
  // Dedupe theo cả device lẫn vehicle:
  // - 1 thiết bị chỉ nên thuộc 1 xe tại một thời điểm
  // - 1 xe chỉ nên giữ 1 pairing "hiện hành" để getPairingForVehicle() và
  //   auto-connect không bám bản ghi cũ khi adapter đổi máy.
  const previous = devices.find((d) => d.vehicleId === pairing.vehicleId);
  const next = devices.filter(
    (d) => d.bleDeviceId !== pairing.bleDeviceId && d.vehicleId !== pairing.vehicleId,
  );
  next.push({
    ...pairing,
    autoConnect: pairing.autoConnect ?? previous?.autoConnect,
    lastConnectedAt: pairing.lastConnectedAt ?? Date.now(),
  });
  await writeAll(next);
}

export async function removePairingForVehicle(vehicleId: number): Promise<void> {
  const devices = await readAll();
  await writeAll(devices.filter((d) => d.vehicleId !== vehicleId));
}

export async function clearPairings(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// User bật/tắt "Hỏi trước khi tự kết nối" cho 1 xe cụ thể (OBDSetupScreen).
export async function setAutoConnect(vehicleId: number, enabled: boolean): Promise<void> {
  const devices = await readAll();
  const idx = devices.findIndex((d) => d.vehicleId === vehicleId);
  if (idx === -1) return;
  devices[idx] = { ...devices[idx], autoConnect: enabled };
  await writeAll(devices);
}

// Pairing ĐỦ ĐIỀU KIỆN tự kết nối khi mở app (đã bật autoConnect) - dùng gần
// nhất trong số đó, để ObdAutoConnect chỉ thử ĐÚNG 1 xe mỗi lần mở/quay lại
// app thay vì quét song song nhiều xe cùng lúc.
//
// Rà soát 27/7 (user hỏi): nếu >1 xe cùng bật switch này, ưu tiên XE MẶC ĐỊNH
// (preferredVehicleId, do ObdAutoConnect truyền vào từ resolveDefaultVehicle())
// thay vì luôn lấy "kết nối gần nhất" - trước đây 2 đường vào auto-connect
// (thẻ NFC/App Link dùng is_default, còn đường này dùng lastConnectedAt) có
// thể chọn ra 2 xe KHÁC NHAU cho cùng 1 tài khoản, gây lẫn lộn xe.
export async function getAutoConnectPairing(preferredVehicleId?: number): Promise<PairedDevice | null> {
  const devices = await readAll();
  const eligible = devices.filter((d) => d.autoConnect);
  if (eligible.length === 0) return null;
  if (preferredVehicleId != null) {
    const preferred = eligible.find((d) => d.vehicleId === preferredVehicleId);
    if (preferred) return preferred;
  }
  return eligible.slice().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))[0];
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

// Thiết bị này đang ghép với xe nào - nuôi hộp thoại "chuyển Vgate sang xe khác?"
export async function getPairingForDevice(bleDeviceId: string): Promise<PairedDevice | null> {
  const devices = await readAll();
  return devices.find((d) => d.bleDeviceId === bleDeviceId) ?? null;
}

// Pairing dùng gần nhất - nuôi thẻ "Kết nối OBD2" ở Home (chỉ hiện khi có pairing)
export async function getMostRecentPairing(): Promise<PairedDevice | null> {
  const devices = await readAll();
  if (devices.length === 0) return null;
  return devices
    .slice()
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))[0];
}
