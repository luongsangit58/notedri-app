import AsyncStorage from '@react-native-async-storage/async-storage';
import { bleService } from './BleService';
import { parseSupportedPids } from './obdParser';

const KEY = 'obd_vehicle_capabilities';

/**
 * Hồ sơ năng lực OBD của một chiếc xe (R8 checklist Knowledge Engine): xe hỗ trợ
 * PID nào - dò MỘT LẦN sau kết nối rồi cache; rule/dashboard/polling đều gate theo
 * đây thay vì danh sách cứng. Bằng chứng cần thiết: Honda City fixture #2 trả
 * NO DATA cho 012F (fuel level) và 015C (oil temp).
 *
 * Cache theo vehicleId (VIN sẽ thay khi parser mode 09 multi-frame hoàn thiện).
 */
export type VehicleCapability = {
  vehicleId: number;
  supportedPids: string[];
  discoveredAt: string;
};

type CapabilityMap = Record<string, VehicleCapability>;

async function readMap(): Promise<CapabilityMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getCachedCapability(vehicleId: number): Promise<VehicleCapability | null> {
  const map = await readMap();
  return map[String(vehicleId)] ?? null;
}

export async function clearCapability(vehicleId: number): Promise<void> {
  const map = await readMap();
  delete map[String(vehicleId)];
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

/**
 * Dò bitmap PID hỗ trợ theo chuẩn: 0100 → nếu bit PID 20 bật thì hỏi tiếp 0120,
 * cứ thế tới tối đa 01A0. Trả null (và KHÔNG cache) khi trang đầu đã thất bại -
 * đừng đóng đinh "xe không hỗ trợ gì" chỉ vì một lần đọc lỗi.
 */
export async function discoverCapability(vehicleId: number): Promise<VehicleCapability | null> {
  const supported: string[] = [];

  for (let base = 0x00; base <= 0xa0; base += 0x20) {
    const pidHex = base.toString(16).toUpperCase().padStart(2, '0');
    let response: string;
    try {
      response = await bleService.sendCommand(`01${pidHex}`, 4000);
    } catch {
      break;
    }

    const page = parseSupportedPids(response, base);
    if (page.length === 0) break;
    supported.push(...page);

    // Trang kế chỉ tồn tại khi bit "PID base+0x20" bật ở trang này
    const nextPage = (base + 0x20).toString(16).toUpperCase().padStart(2, '0');
    if (!page.includes(nextPage)) break;
  }

  if (supported.length === 0) return null;

  const capability: VehicleCapability = {
    vehicleId,
    supportedPids: supported,
    discoveredAt: new Date().toISOString(),
  };

  const map = await readMap();
  map[String(vehicleId)] = capability;
  await AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});

  return capability;
}
