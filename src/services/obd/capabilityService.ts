import AsyncStorage from '@react-native-async-storage/async-storage';
import { bleService } from './BleService';
import { parseSupportedPids, parseVin } from './obdParser';

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
  vin: string | null;
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

// Cache VIN THEO PHIÊN BLE (sửa 15/7): readCurrentVin() được loadCapability()
// gọi lại mỗi lần useObd.ts mount/remount trong khi BLE VẪN đang kết nối (ví
// dụ điều hướng ra vào Dashboard, app foreground) - trước đây mỗi lần đều gửi
// lại 0902 dù xe chắc chắn không đổi giữa chừng cùng 1 phiên, log adapter thật
// cho thấy 0902 bị gửi lặp không cần thiết. Reset khi ngắt kết nối - phiên mới
// (rút cắm sang xe khác) phải đọc lại thật.
let vinCacheThisSession: { value: string | null } | null = null;
bleService.addDisconnectListener(() => {
  vinCacheThisSession = null;
});

/**
 * Đọc VIN xe ĐANG cắm (mode 09, 1 lệnh) - dùng để phát hiện "cắm Vgate sang xe
 * KHÁC vào cùng bản ghi" (toàn vẹn dữ liệu, Sang duyệt 14/7). Null nếu xe không
 * hỗ trợ đọc VIN hoặc lỗi. Cache theo phiên BLE - gọi nhiều lần trong CÙNG 1
 * phiên chỉ gửi 0902 đúng 1 lần; lỗi KHÔNG được cache (adapter có thể trả lời
 * được ở lần gọi sau, đừng khoá cứng "không đọc được VIN" cho cả phiên).
 */
export async function readCurrentVin(): Promise<string | null> {
  if (vinCacheThisSession) return vinCacheThisSession.value;
  try {
    const vin = parseVin(await bleService.sendCommand('0902', 4000));
    vinCacheThisSession = { value: vin };
    return vin;
  } catch {
    return null;
  }
}

/** User bấm "Làm mới"/dò lại capability chủ động - buộc đọc VIN thật lần sau. */
export function invalidateVinCache(): void {
  vinCacheThisSession = null;
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
  // Toàn vẹn (sửa 14/7 theo rà soát): phân biệt "trang tiếp báo KHÔNG còn PID"
  // (dừng hợp lệ) với "lỗi BLE thoáng qua giữa chừng". Trước đây lỗi trang 2+
  // vẫn break rồi CACHE danh sách CỤT -> mã PID thật bị coi là không hỗ trợ
  // VĨNH VIỄN tới khi xoá cache tay. Giờ nếu lỗi giữa chừng: KHÔNG cache (để
  // phiên sau dò lại), vẫn trả về phần đã có cho phiên hiện tại dùng tạm.
  let incomplete = false;

  for (let base = 0x00; base <= 0xa0; base += 0x20) {
    const pidHex = base.toString(16).toUpperCase().padStart(2, '0');
    let response: string;
    try {
      response = await bleService.sendCommand(`01${pidHex}`, 4000);
    } catch {
      // Trang ĐẦU lỗi = chưa có gì -> để null như cũ (dò lại phiên sau).
      // Trang sau lỗi = có dữ liệu 1 phần nhưng CÒN trang chưa đọc -> đánh dấu
      // incomplete để không cache bản cụt.
      if (base > 0x00) incomplete = true;
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

  // VIN (mode 09 02): định danh xe thật - nuôi prefill "Thêm xe từ OBD" và
  // sau này thay vehicleId làm khoá cache. Đi qua readCurrentVin() để dùng
  // chung cache phiên (sửa 15/7) - discoverCapability() chỉ chạy khi cache
  // capability trống nên đây thường là lần đọc VIN ĐẦU của phiên (kết nối
  // lần đầu, đúng 1 trong 3 trigger hợp lệ), không phải đọc thừa.
  const vin = await readCurrentVin();

  const capability: VehicleCapability = {
    vehicleId,
    supportedPids: supported,
    vin,
    discoveredAt: new Date().toISOString(),
  };

  // Chỉ CACHE khi dò trọn vẹn (không lỗi giữa chừng) - bản cụt do rớt gói không
  // được ghi đè cache để phiên sau còn dò lại. Vẫn TRẢ VỀ cho phiên hiện tại.
  if (!incomplete) {
    const map = await readMap();
    map[String(vehicleId)] = capability;
    await AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});
  }

  return capability;
}
