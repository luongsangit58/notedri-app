import { bleService } from './BleService';

export type ObdSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  fuelLevelPct: number | null;
  oilTempC: number | null;
  throttlePct: number | null;
  timestamp: number;
};

export type DtcCode = {
  code: string;
  description: string | null;
};

function parseHexByte(hex: string): number {
  if (!hex || !/^[0-9A-Fa-f]+$/.test(hex)) return NaN;
  return parseInt(hex, 16);
}

function extractBytes(response: string, mode: string, pid: string): number[] | null {
  const lines = response
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('SEARCHING'));

  for (const line of lines) {
    const parts = line.replace(/\s+/g, ' ').toUpperCase().split(' ');
    const expectedHeader = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0');
    const pidUpper = pid.toUpperCase();

    const headerIdx = parts.findIndex((p) => p === expectedHeader);
    if (headerIdx !== -1 && parts[headerIdx + 1] === pidUpper) {
      const bytes = parts.slice(headerIdx + 2).map((h) => parseHexByte(h));
      // Drop NaN values from malformed hex
      if (bytes.some((b) => isNaN(b))) return null;
      return bytes;
    }
  }
  return null;
}

async function readPid(pid: string): Promise<number[] | null> {
  try {
    const response = await bleService.sendCommand(`01${pid}`);
    if (response.includes('NO DATA') || response.includes('ERROR') || response.includes('?')) {
      return null;
    }
    return extractBytes(response, '01', pid);
  } catch {
    return null;
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
    // protocol, or the vehicle predates OBD-II (pre-2005 VN market).
    const [rpm, speed] = await Promise.all([readRpm(), readSpeed()]);
    const dataAvailable = rpm !== null || speed !== null;

    // Dò best-effort CHỈ ĐỂ GHI LOG PHIÊN (không parse, không dùng kết quả):
    // phiên bản adapter, protocol, bitmask PID hỗ trợ, VIN. Fixture xuất ra từ
    // log này là nguồn duy nhất để viết parser capability/VIN chính xác về sau -
    // cố tình KHÔNG đoán format ở đây (kỷ luật "chính xác trước" của checklist).
    if (dataAvailable) {
      for (const probe of ['ATI', 'ATDPN', '0100', '0120', '0140', '0160', '0902']) {
        await bleService.sendCommand(probe, 3000).catch(() => {});
      }
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
  return ((bytes[0] * 256) + bytes[1]) / 4;
}

export async function readSpeed(): Promise<number | null> {
  const bytes = await readPid('0D');
  if (!bytes || bytes.length < 1) return null;
  return bytes[0];
}

export async function readEngineLoad(): Promise<number | null> {
  const bytes = await readPid('04');
  if (!bytes || bytes.length < 1) return null;
  return Math.round((bytes[0] * 100) / 255);
}

export async function readCoolantTemp(): Promise<number | null> {
  const bytes = await readPid('05');
  if (!bytes || bytes.length < 1) return null;
  return bytes[0] - 40;
}

export async function readFuelLevel(): Promise<number | null> {
  const bytes = await readPid('2F');
  if (!bytes || bytes.length < 1) return null;
  return Math.round((bytes[0] * 100) / 255);
}

export async function readOilTemp(): Promise<number | null> {
  const bytes = await readPid('5C');
  if (!bytes || bytes.length < 1) return null;
  return bytes[0] - 40;
}

export async function readThrottle(): Promise<number | null> {
  const bytes = await readPid('11');
  if (!bytes || bytes.length < 1) return null;
  return Math.round((bytes[0] * 100) / 255);
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

  return {
    rpm,
    speedKmh,
    engineLoadPct,
    coolantTempC,
    fuelLevelPct,
    oilTempC,
    throttlePct,
    timestamp: Date.now(),
  };
}

export async function readDtcCodes(): Promise<DtcCode[]> {
  try {
    await bleService.sendCommand('ATH1');
    let response: string;
    try {
      response = await bleService.sendCommand('03', 5000);
    } finally {
      // Always restore headers-off even if command times out
      await bleService.sendCommand('ATH0').catch(() => {});
    }

    if (response.includes('NO DATA') || response.includes('NODATA')) return [];

    const codes: DtcCode[] = [];
    const lines = response.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const parts = line.replace(/\s+/g, ' ').toUpperCase().split(' ');
      const startIdx = parts.findIndex((p) => p === '43');
      if (startIdx === -1) continue;

      const data = parts.slice(startIdx + 1);
      for (let i = 0; i + 1 < data.length; i += 2) {
        const byte1 = parseHexByte(data[i]);
        const byte2 = parseHexByte(data[i + 1]);
        if (isNaN(byte1) || isNaN(byte2) || (byte1 === 0 && byte2 === 0)) continue;

        const typeChar = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
        const digit1 = (byte1 >> 4) & 0x03;
        const digit2 = byte1 & 0x0f;
        const digit3 = (byte2 >> 4) & 0x0f;
        const digit4 = byte2 & 0x0f;

        const code = `${typeChar}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`;
        codes.push({ code, description: null });
      }
    }

    return codes;
  } catch {
    return [];
  }
}
