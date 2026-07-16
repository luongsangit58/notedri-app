import { bleService } from './BleService';
import { extractPayload, isNoData, isPlausibleValue, parseDtcCodes, PID_REGISTRY } from './obdParser';
import { readCurrentVin } from './capabilityService';

// Capability-aware polling (ý #18): PID xe không hỗ trợ (Honda City: 2F fuel,
// 5C oil temp đều NO DATA - fixture #2) bị bỏ qua ngay, không tốn round-trip BLE.
// null = chưa dò được capability → poll đủ như cũ.
let activePidWhitelist: Set<string> | null = null;

export function setActivePidWhitelist(pids: string[] | null): void {
  activePidWhitelist = pids ? new Set(pids.map((p) => p.toUpperCase())) : null;
}

export type ObdSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  fuelLevelPct: number | null;
  oilTempC: number | null;
  throttlePct: number | null;
  // PID 42 - điện áp hệ thống từ ECU (xe Sang hỗ trợ, xác nhận fixture #3):
  // tín hiệu cho rule máy phát/ắc-quy của Diagnostic Engine
  controlModuleVoltage: number | null;
  timestamp: number;
};

export type DtcCode = {
  code: string;
  description: string | null;
};

async function readPid(pid: string): Promise<number[] | null> {
  // Capability đã dò được và PID này không nằm trong đó → khỏi hỏi xe
  if (activePidWhitelist && !activePidWhitelist.has(pid.toUpperCase())) return null;

  try {
    const response = await bleService.sendCommand(`01${pid}`);
    if (isNoData(response) || response.includes('ERROR') || response.includes('?')) {
      return null;
    }
    // extractPayload (obdParser) xử lý cả response dính liền do ATS0 ("410C1034"),
    // dòng phụ ngăn bằng \r ("SEARCHING...\r410C1034") lẫn định dạng có dấu cách -
    // parser cũ tách theo space nên null toàn bộ (fixture #2, màn hình toàn "-").
    return extractPayload(response, '01', pid);
  } catch {
    return null;
  }
}

/**
 * Init nhẹ chạy lại SAU reconnect grace: fixture #5 cho thấy adapter tự reboot
 * (nguyên nhân rớt BLE) → mất hết cài đặt, echo + dấu cách quay lại. Không ATZ
 * (adapter vừa reset rồi, đỡ 1 giây), chỉ nắn lại 4 cài đặt parser phụ thuộc.
 */
export async function reinitElm327AfterReconnect(): Promise<void> {
  for (const cmd of ['ATE0', 'ATL0', 'ATH0', 'ATS0']) {
    await bleService.sendCommand(cmd, 2000).catch(() => {});
  }
}

export type InitResult =
  | { ok: true; dataAvailable: boolean; rawRpmResponse?: string }
  | { ok: false; dataAvailable: false };

export async function initializeElm327(): Promise<InitResult> {
  try {
    await bleService.sendCommand('ATZ', 3000);
    await bleService.sendCommand('ATE0');
    await bleService.sendCommand('ATL0');
    await bleService.sendCommand('ATH0');
    await bleService.sendCommand('ATS0');
    await bleService.sendCommand('ATSP0');

    // Health-check: try reading RPM and Speed to confirm the vehicle ECU is responding.
    // Both null means the adapter connected but the car is off, uses an unsupported
    // protocol, or the vehicle predates OBD2 (pre-2005 VN market).
    const [rpm, speed] = await Promise.all([readRpm(), readSpeed()]);
    const dataAvailable = rpm !== null || speed !== null;

    // Dò best-effort CHỈ ĐỂ GHI LOG PHIÊN: phiên bản adapter, protocol.
    // Bitmap 0100/0120/... KHÔNG probe ở đây nữa - capabilityService dò + parse thật.
    if (dataAvailable) {
      for (const probe of ['ATI', 'ATDPN']) {
        await bleService.sendCommand(probe, 3000).catch(() => {});
      }
      // VIN qua readCurrentVin() (không phải probe thô) để dùng chung cache phiên
      // (sửa 15/7) - loadCapability() gọi readCurrentVin() ngay sau connect() sẽ
      // THẤY VIN đã đọc ở đây, khỏi gửi 0902 lần 2 (fixture #5: 0902 từng bị gửi
      // 3 lần trong 1.2s đầu phiên).
      await readCurrentVin().catch(() => {});
    }

    if (!dataAvailable) {
      // Capture raw RPM response for compatibility debugging.
      // Shown in the warning banner so users can report it.
      let rawRpmResponse: string | undefined;
      try {
        rawRpmResponse = await bleService.sendCommand('010C', 2000);
      } catch {
        rawRpmResponse = undefined;
      }
      return { ok: true, dataAvailable: false, rawRpmResponse };
    }

    return { ok: true, dataAvailable: true };
  } catch {
    return { ok: false, dataAvailable: false };
  }
}

export async function readRpm(): Promise<number | null> {
  const bytes = await readPid('0C');
  if (!bytes || bytes.length < 2) return null;
  const rpm = ((bytes[0] * 256) + bytes[1]) / 4;
  return isPlausibleValue('0C', rpm) ? rpm : null;
}

export async function readSpeed(): Promise<number | null> {
  const bytes = await readPid('0D');
  if (!bytes || bytes.length < 1) return null;
  return isPlausibleValue('0D', bytes[0]) ? bytes[0] : null;
}

export async function readEngineLoad(): Promise<number | null> {
  const bytes = await readPid('04');
  if (!bytes || bytes.length < 1) return null;
  const load = Math.round((bytes[0] * 100) / 255);
  return isPlausibleValue('04', load) ? load : null;
}

export async function readCoolantTemp(): Promise<number | null> {
  const bytes = await readPid('05');
  if (!bytes || bytes.length < 1) return null;
  const tempC = bytes[0] - 40;
  return isPlausibleValue('05', tempC) ? tempC : null;
}

export async function readFuelLevel(): Promise<number | null> {
  const bytes = await readPid('2F');
  if (!bytes || bytes.length < 1) return null;
  const pct = Math.round((bytes[0] * 100) / 255);
  return isPlausibleValue('2F', pct) ? pct : null;
}

export async function readOilTemp(): Promise<number | null> {
  const bytes = await readPid('5C');
  if (!bytes || bytes.length < 1) return null;
  const tempC = bytes[0] - 40;
  return isPlausibleValue('5C', tempC) ? tempC : null;
}

export async function readThrottle(): Promise<number | null> {
  const bytes = await readPid('11');
  if (!bytes || bytes.length < 1) return null;
  const pct = Math.round((bytes[0] * 100) / 255);
  return isPlausibleValue('11', pct) ? pct : null;
}

export async function readVoltage(): Promise<number | null> {
  const bytes = await readPid('42');
  if (!bytes || bytes.length < 2) return null;
  const volts = Math.round(((bytes[0] * 256 + bytes[1]) / 1000) * 100) / 100;
  return isPlausibleValue('42', volts) ? volts : null;
}

// 5 PID sau đây đã có decoder trong obdParser.PID_REGISTRY nhưng trước 14/7
// CHƯA từng được đọc ở đâu cả - chỉ dùng cho màn "Xem tất cả thông số" (kỹ
// thuật), KHÔNG gọi trong readSnapshot()/vòng poll 3s của obdLiveMonitor để
// không kéo dài round-trip BLE của live monitor cho dữ liệu ít dùng.
export async function readFuelTrimShortB1(): Promise<number | null> {
  const bytes = await readPid('06');
  if (!bytes || bytes.length < 1) return null;
  const pct = Math.round((((bytes[0] - 128) * 100) / 128) * 10) / 10;
  return isPlausibleValue('06', pct) ? pct : null;
}

export async function readIntakeManifoldPressure(): Promise<number | null> {
  const bytes = await readPid('0B');
  if (!bytes || bytes.length < 1) return null;
  return isPlausibleValue('0B', bytes[0]) ? bytes[0] : null;
}

export async function readIntakeAirTemp(): Promise<number | null> {
  const bytes = await readPid('0F');
  if (!bytes || bytes.length < 1) return null;
  const tempC = bytes[0] - 40;
  return isPlausibleValue('0F', tempC) ? tempC : null;
}

export async function readAmbientAirTemp(): Promise<number | null> {
  const bytes = await readPid('46');
  if (!bytes || bytes.length < 1) return null;
  const tempC = bytes[0] - 40;
  return isPlausibleValue('46', tempC) ? tempC : null;
}

export async function readFuelRate(): Promise<number | null> {
  const bytes = await readPid('5E');
  if (!bytes || bytes.length < 2) return null;
  const rate = Math.round(((bytes[0] * 256 + bytes[1]) / 20) * 10) / 10;
  return isPlausibleValue('5E', rate) ? rate : null;
}

export type ObdExtendedSnapshot = {
  fuelTrimShortB1Pct: number | null;
  intakeManifoldPressureKpa: number | null;
  intakeAirTempC: number | null;
  ambientAirTempC: number | null;
  fuelRateLPerHour: number | null;
  timestamp: number;
};

/** Chỉ dùng cho màn kỹ thuật - 5 PID KHÔNG nằm trong readSnapshot() của live monitor. */
export async function readExtendedSnapshot(): Promise<ObdExtendedSnapshot> {
  const fuelTrimShortB1Pct = await readFuelTrimShortB1();
  const intakeManifoldPressureKpa = await readIntakeManifoldPressure();
  const intakeAirTempC = await readIntakeAirTemp();
  const ambientAirTempC = await readAmbientAirTemp();
  const fuelRateLPerHour = await readFuelRate();

  return {
    fuelTrimShortB1Pct,
    intakeManifoldPressureKpa,
    intakeAirTempC,
    ambientAirTempC,
    fuelRateLPerHour,
    timestamp: Date.now(),
  };
}

// Reads all PIDs sequentially (BleService serializes via queue, but explicit
// sequential order avoids interleaving with DTC reads or AT commands).
export async function readSnapshot(): Promise<ObdSnapshot> {
  const rpm          = await readRpm();
  const speedKmh     = await readSpeed();
  const engineLoadPct = await readEngineLoad();
  const coolantTempC  = await readCoolantTemp();
  const fuelLevelPct  = await readFuelLevel();
  const oilTempC      = await readOilTemp();
  const throttlePct   = await readThrottle();
  const controlModuleVoltage = await readVoltage();

  return {
    rpm,
    speedKmh,
    engineLoadPct,
    coolantTempC,
    fuelLevelPct,
    oilTempC,
    throttlePct,
    controlModuleVoltage,
    timestamp: Date.now(),
  };
}

export async function readDtcCodes(): Promise<DtcCode[]> {
  try {
    // Giữ nguyên ATH0/ATS0 như mọi lệnh khác - format multi-frame khi nhiều mã
    // đã đo thật qua 0902 (VIN) và parseDtcCodes xử lý được. Bỏ trò bật/tắt ATH1
    // cũ: đổi state adapter giữa chừng là nguồn lỗi (bài học fixture #1/#2).
    const response = await bleService.sendCommand('03', 5000);
    return parseDtcCodes(response).map((code) => ({ code, description: null }));
  } catch {
    return [];
  }
}

/**
 * Mode 07 - Pending DTC: lỗi ECU đang GHI NHẬN nhưng chưa đủ chu kỳ lái để xác
 * nhận thành mã lỗi chính thức (mode 03). Ý nghĩa khác hẳn DTC thật - KHÔNG được
 * gộp chung/hiển thị như lỗi chính thức (dễ báo động giả), chỉ mang tính "đang
 * hình thành". Cùng cấu trúc payload mode 03, khác byte echo (07 -> 47).
 */
export async function readPendingDtcCodes(): Promise<DtcCode[]> {
  try {
    const response = await bleService.sendCommand('07', 5000);
    return parseDtcCodes(response, '47').map((code) => ({ code, description: null }));
  } catch {
    return [];
  }
}

/**
 * Mode 0A - Permanent DTC: mã lỗi ĐÃ XÁC NHẬN mà không thể xoá bằng cách ngắt
 * ắc-quy/xoá bằng scan tool thông thường (chỉ tự xoá khi ECU xác nhận đã sửa
 * qua vài chu kỳ lái) - độ tin cậy cao hơn mode 03, gần như không đổi trong 1
 * phiên nên KHÔNG cần đọc lặp lại như mode 03/07 (xem obdLiveMonitor.ts).
 */
export async function readPermanentDtcCodes(): Promise<DtcCode[]> {
  try {
    const response = await bleService.sendCommand('0A', 5000);
    return parseDtcCodes(response, '4A').map((code) => ({ code, description: null }));
  } catch {
    return [];
  }
}

export type FreezeFrameSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  coolantTempC: number | null;
  engineLoadPct: number | null;
  fuelTrimShortB1Pct: number | null;
  controlModuleVoltage: number | null;
};

// Mode 02 - Freeze Frame: ảnh chụp thông số ECU tại ĐÚNG thời điểm mã lỗi mode
// 03 được ghi nhận (frame 0, chuẩn ELM327 "02<PID>00"). Response cùng định
// dạng mode 01 (PID_REGISTRY.decode tái dùng được), chỉ khác byte echo (41->42)
// - extractPayload() đã nhận mode làm tham số nên không cần sửa parser.
async function readFreezeFramePid(pid: string): Promise<number[] | null> {
  if (activePidWhitelist && !activePidWhitelist.has(pid.toUpperCase())) return null;
  try {
    const response = await bleService.sendCommand(`02${pid}00`, 4000);
    if (isNoData(response) || response.includes('ERROR') || response.includes('?')) return null;
    return extractPayload(response, '02', pid);
  } catch {
    return null;
  }
}

/**
 * Chỉ gọi khi mode 03 vừa phát hiện DTC MỚI trong phiên (xem obdLiveMonitor.ts)
 * - không đọc mỗi vòng poll như snapshot thường, tốn round-trip vô ích cho 1
 * dữ liệu chỉ có giá trị đúng lúc lỗi xảy ra.
 */
export async function readFreezeFrame(): Promise<FreezeFrameSnapshot> {
  const rpmBytes = await readFreezeFramePid('0C');
  const speedBytes = await readFreezeFramePid('0D');
  const coolantBytes = await readFreezeFramePid('05');
  const loadBytes = await readFreezeFramePid('04');
  const trimBytes = await readFreezeFramePid('06');
  const voltBytes = await readFreezeFramePid('42');

  return {
    rpm: rpmBytes ? PID_REGISTRY['0C'].decode(rpmBytes) : null,
    speedKmh: speedBytes ? PID_REGISTRY['0D'].decode(speedBytes) : null,
    coolantTempC: coolantBytes ? PID_REGISTRY['05'].decode(coolantBytes) : null,
    engineLoadPct: loadBytes ? PID_REGISTRY['04'].decode(loadBytes) : null,
    fuelTrimShortB1Pct: trimBytes ? PID_REGISTRY['06'].decode(trimBytes) : null,
    controlModuleVoltage: voltBytes ? PID_REGISTRY['42'].decode(voltBytes) : null,
  };
}
