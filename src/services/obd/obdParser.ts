/**
 * Parser thuần cho response ELM327 - KHÔNG import gì từ React Native để test được
 * bằng jest không cần mock. Mọi quy tắc ở đây đều đối chiếu với fixture thật:
 * obd-fixtures/vgate-honda-city-20260713-02.json (ELM327 v2.3 + Honda City, ATS0/ATE0/ATH0).
 *
 * Định dạng thật đã quan sát:
 * - "410C1034"                  (ATS0: KHÔNG dấu cách - parser cũ tách theo space nên hỏng)
 * - "SEARCHING...\r410C1034"    (dòng phụ ngăn bằng \r, KHÔNG phải \n)
 * - "ATZ\r\r\rELM327 v2.3"      (lệnh đầu còn echo vì ATE0 chưa kịp áp)
 * - "NO DATA"                   (PID xe không hỗ trợ, vd 012F/015C trên Honda City)
 * Parser đồng thời chấp nhận định dạng CÓ dấu cách ("41 0C 10 34") của adapter khác.
 */

/**
 * Tách payload byte cho response mode 01/02...: tìm chuỗi echo "41" + PID trong
 * từng dòng (đã bỏ hết whitespace), trả về các byte phía sau.
 */
export function extractPayload(response: string, mode: string, pid: string): number[] | null {
  const expected =
    (parseInt(mode, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0') + pid.toUpperCase();

  const lines = response
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length > 0);

  for (const line of lines) {
    // Dòng không thuần hex = thông báo phụ (SEARCHING..., OK, NO DATA, echo lệnh...)
    if (!/^[0-9A-F]+$/.test(line)) continue;

    const idx = line.indexOf(expected);
    if (idx === -1) continue;

    const payloadHex = line.slice(idx + expected.length);
    const bytes: number[] = [];
    for (let i = 0; i + 1 < payloadHex.length; i += 2) {
      bytes.push(parseInt(payloadHex.slice(i, i + 2), 16));
    }
    if (bytes.length > 0) return bytes;
  }
  return null;
}

/** Response có phải "xe không hỗ trợ / không trả lời" không. */
export function isNoData(response: string): boolean {
  const r = response.toUpperCase();
  return r.includes('NO DATA') || r.includes('NODATA');
}

/**
 * Parse bitmap "PID hỗ trợ" (0100/0120/0140/...): 4 byte payload, bit MSB-first,
 * bit thứ i (1-based) = PID (base + i). Ví dụ 4100 BE3FA813 → 01,02,03,04,06,07,08...
 */
export function parseSupportedPids(response: string, basePid: number): string[] {
  const pidHex = basePid.toString(16).toUpperCase().padStart(2, '0');
  const bytes = extractPayload(response, '01', pidHex);
  if (!bytes || bytes.length < 4) return [];

  const pids: string[] = [];
  for (let i = 0; i < 32; i++) {
    const byte = bytes[Math.floor(i / 8)];
    const bit = 7 - (i % 8);
    if ((byte >> bit) & 1) {
      pids.push((basePid + i + 1).toString(16).toUpperCase().padStart(2, '0'));
    }
  }
  return pids;
}

// ---- PID Registry: PID mode 01 mà NoteDri có thể poll ----
// Chỉ giữ PID thực sự dùng/sắp dùng (YAGNI) - thêm dần khi tính năng cần.

export type PidDefinition = {
  pid: string;
  name: string;
  unit: string;
  decode: (bytes: number[]) => number | null;
};

const b = (bytes: number[], i: number): number | null => (bytes.length > i ? bytes[i] : null);

export const PID_REGISTRY: Record<string, PidDefinition> = {
  '04': { pid: '04', name: 'Engine load', unit: '%', decode: (x) => (b(x, 0) === null ? null : Math.round((x[0] * 100) / 255)) },
  '05': { pid: '05', name: 'Coolant temperature', unit: '°C', decode: (x) => (b(x, 0) === null ? null : x[0] - 40) },
  '06': { pid: '06', name: 'Short term fuel trim B1', unit: '%', decode: (x) => (b(x, 0) === null ? null : Math.round(((x[0] - 128) * 100) / 128 * 10) / 10) },
  '0B': { pid: '0B', name: 'Intake manifold pressure', unit: 'kPa', decode: (x) => b(x, 0) },
  '0C': { pid: '0C', name: 'Engine RPM', unit: 'rpm', decode: (x) => (b(x, 1) === null ? null : (x[0] * 256 + x[1]) / 4) },
  '0D': { pid: '0D', name: 'Vehicle speed', unit: 'km/h', decode: (x) => b(x, 0) },
  '0F': { pid: '0F', name: 'Intake air temperature', unit: '°C', decode: (x) => (b(x, 0) === null ? null : x[0] - 40) },
  '11': { pid: '11', name: 'Throttle position', unit: '%', decode: (x) => (b(x, 0) === null ? null : Math.round((x[0] * 100) / 255)) },
  '2F': { pid: '2F', name: 'Fuel level', unit: '%', decode: (x) => (b(x, 0) === null ? null : Math.round((x[0] * 100) / 255)) },
  '42': { pid: '42', name: 'Control module voltage', unit: 'V', decode: (x) => (b(x, 1) === null ? null : Math.round(((x[0] * 256 + x[1]) / 1000) * 100) / 100) },
  '46': { pid: '46', name: 'Ambient air temperature', unit: '°C', decode: (x) => (b(x, 0) === null ? null : x[0] - 40) },
  '5C': { pid: '5C', name: 'Engine oil temperature', unit: '°C', decode: (x) => (b(x, 0) === null ? null : x[0] - 40) },
  '5E': { pid: '5E', name: 'Fuel rate', unit: 'L/h', decode: (x) => (b(x, 1) === null ? null : Math.round(((x[0] * 256 + x[1]) / 20) * 10) / 10) },
};
