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

// Parse hex response from ELM327
function parseHexByte(hex: string): number {
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
      return parts.slice(headerIdx + 2).map((h) => parseHexByte(h));
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

export async function initializeElm327(): Promise<boolean> {
  try {
    await bleService.sendCommand('ATZ', 3000);   // Reset
    await bleService.sendCommand('ATE0');         // Echo off
    await bleService.sendCommand('ATL0');         // Linefeeds off
    await bleService.sendCommand('ATH0');         // Headers off - easier parsing
    await bleService.sendCommand('ATS0');         // Spaces off
    await bleService.sendCommand('ATSP0');        // Auto protocol
    return true;
  } catch {
    return false;
  }
}

export async function readRpm(): Promise<number | null> {
  const bytes = await readPid('0C');
  if (!bytes || bytes.length < 2) return null;
  // RPM = ((A*256)+B)/4
  return ((bytes[0] * 256) + bytes[1]) / 4;
}

export async function readSpeed(): Promise<number | null> {
  const bytes = await readPid('0D');
  if (!bytes || bytes.length < 1) return null;
  // Speed = A km/h
  return bytes[0];
}

export async function readEngineLoad(): Promise<number | null> {
  const bytes = await readPid('04');
  if (!bytes || bytes.length < 1) return null;
  // Load = A*100/255
  return Math.round((bytes[0] * 100) / 255);
}

export async function readCoolantTemp(): Promise<number | null> {
  const bytes = await readPid('05');
  if (!bytes || bytes.length < 1) return null;
  // Temp = A - 40 (degrees C)
  return bytes[0] - 40;
}

export async function readFuelLevel(): Promise<number | null> {
  const bytes = await readPid('2F');
  if (!bytes || bytes.length < 1) return null;
  // Level = A*100/255
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

export async function readSnapshot(): Promise<ObdSnapshot> {
  const [rpm, speedKmh, engineLoadPct, coolantTempC, fuelLevelPct, oilTempC, throttlePct] =
    await Promise.all([
      readRpm(),
      readSpeed(),
      readEngineLoad(),
      readCoolantTemp(),
      readFuelLevel(),
      readOilTemp(),
      readThrottle(),
    ]);

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
    // Switch to headers on to parse multi-frame DTC response
    await bleService.sendCommand('ATH1');
    const response = await bleService.sendCommand('03', 5000);
    await bleService.sendCommand('ATH0');

    if (response.includes('NO DATA') || response.includes('NODATA')) return [];

    const codes: DtcCode[] = [];
    const lines = response.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const parts = line.replace(/\s+/g, ' ').toUpperCase().split(' ');
      // DTC response: 43 XX YY XX YY ...
      const startIdx = parts.findIndex((p) => p === '43');
      if (startIdx === -1) continue;

      const data = parts.slice(startIdx + 1);
      for (let i = 0; i + 1 < data.length; i += 2) {
        const byte1 = parseHexByte(data[i]);
        const byte2 = parseHexByte(data[i + 1]);
        if (byte1 === 0 && byte2 === 0) continue;

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
