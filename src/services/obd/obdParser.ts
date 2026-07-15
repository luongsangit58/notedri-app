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
 * Ghép response ISO-TP nhiều frame của ELM327 (ATH0+ATS0) thành 1 chuỗi hex.
 * Format thật từ fixture #3 (0902 VIN):
 *   "014\r0:4902014D5248\r1:474B353833304A\r2:54303430303035"
 * Dòng đầu = TỔNG SỐ BYTE (hex); các dòng "n:HEX" ghép theo index.
 * Trả null nếu không phải dạng multi-frame HOẶC dữ liệu bị THIẾU (rớt frame).
 *
 * Toàn vẹn (sửa 14/7 theo rà soát): BLE thật có thể rớt gói. Trước đây hàm chỉ
 * sort theo index rồi ghép - rớt frame GIỮA/index trùng vẫn trả chuỗi ghép SAI
 * âm thầm, khiến parseDtcCodes phát mã lỗi SAI. Giờ:
 *  - Yêu cầu index LIÊN TỤC từ 0 (0,1,2,...) - rớt frame giữa/trùng -> null.
 *  - Header độ dài (nếu có) chỉ để CẮT đệm dư về đúng số byte (không dùng để
 *    reject: ngữ nghĩa header chỉ kiểm chứng trên 1 fixture VIN, không đủ chắc
 *    để chặn - rớt frame CUỐI đã được chặn ở tầng sau: parseVin đòi đúng 17 ký
 *    tự, parseDtcCodes chỉ báo THIẾU mã (an toàn) chứ không báo SAI mã).
 * (Giới hạn có chủ ý: index 1 ký tự hex nên >15 frame sẽ lặp - DTC/VIN luôn
 *  ngắn hơn thế nên không xét vòng lặp, đúng phạm vi thực tế.)
 */
export function assembleIsoTpFrames(response: string): string | null {
  const lines = response
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length > 0);

  const frames: Array<[number, string]> = [];
  let declaredBytes: number | null = null;
  for (const line of lines) {
    const m = line.match(/^([0-9A-F]):([0-9A-F]+)$/);
    if (m) {
      frames.push([parseInt(m[1], 16), m[2]]);
    } else if (declaredBytes === null && /^[0-9A-F]{1,3}$/.test(line)) {
      // Dòng hex ngắn KHÔNG có dấu ':' TRƯỚC các frame = header tổng số byte.
      declaredBytes = parseInt(line, 16);
    }
  }
  if (frames.length === 0) return null;

  frames.sort((a, b) => a[0] - b[0]);

  // Index phải liên tục 0..n-1 (rớt frame giữa hoặc trùng index = dữ liệu hỏng).
  for (let i = 0; i < frames.length; i++) {
    if (frames[i][0] !== i) return null;
  }

  let hex = frames.map((f) => f[1]).join('');

  // Header chỉ để CẮT đệm dư (không reject) - xem docblock.
  if (declaredBytes !== null) {
    const needHex = declaredBytes * 2;
    if (hex.length > needHex) hex = hex.slice(0, needHex);
  }

  return hex;
}

/** Chuỗi hex của response: multi-frame thì ghép, không thì lấy dòng hex đầu tiên. */
function responseHex(response: string): string | null {
  const assembled = assembleIsoTpFrames(response);
  if (assembled) return assembled;

  const line = response
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, ''))
    .find((l) => l.length > 0 && /^[0-9A-F]+$/.test(l));
  return line ?? null;
}

/**
 * Parse VIN từ response mode 09 02. Payload sau "490201" (01 = số bản ghi)
 * là 17 byte ASCII. Fixture #3: → "MRHGK5830JT040005".
 */
export function parseVin(response: string): string | null {
  const hex = responseHex(response);
  if (!hex) return null;

  const idx = hex.indexOf('4902');
  if (idx === -1) return null;

  // Bỏ "4902" + 1 byte số-bản-ghi, phần còn lại là ASCII
  const payload = hex.slice(idx + 6);
  let vin = '';
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const byte = parseInt(payload.slice(i, i + 2), 16);
    if (byte === 0) continue; // padding
    vin += String.fromCharCode(byte);
  }
  vin = vin.trim().toUpperCase();

  // VIN chuẩn: 17 ký tự, không dùng I/O/Q
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

/**
 * Parse mã lỗi từ response mode 03/07/0A (CAN - ISO 15765-4, protocol xe đã xác
 * nhận qua ATDPN=A7): "<echo mode+40>" + từng cặp 2 byte/mã, KHÔNG byte đếm.
 * Xe khoẻ: "4300". Nhiều mã (>2) sẽ về dạng multi-frame như VIN - responseHex
 * ghép sẵn. LƯU Ý: format này viết theo chuẩn SAE J1979 CAN + transport đã đo
 * thật cho mode 03; mode 07 (pending, echo "47")/0A (permanent, echo "4A")
 * dùng CHUNG cấu trúc payload theo chuẩn (chỉ khác byte echo) - chưa có mẫu
 * thật từ xe cho 2 mode này, cần fixture xác nhận khi có DTC thật để kiểm lại.
 */
export function parseDtcCodes(response: string, responsePrefix: string = '43'): string[] {
  if (isNoData(response)) return [];

  const hex = responseHex(response);
  if (!hex) return [];

  const idx = hex.indexOf(responsePrefix);
  if (idx === -1) return [];

  // Chuẩn SAE J1979 (xác nhận qua tài liệu công khai 14/7, sửa giả định "byte
  // đếm" ban đầu CHƯA kiểm chứng): KHÔNG có byte đếm sau byte echo mode - chỉ
  // là các cặp 2-byte nối tiếp (mỗi cặp = 1 mã), đệm 00 00 khi thiếu, tối đa 3
  // mã/khung 7-byte trên K-line; CAN dùng multi-frame ISO-TP (responseHex đã ghép sẵn).
  const codesHex = hex.slice(idx + responsePrefix.length);

  const codes: string[] = [];
  for (let i = 0; i + 3 < codesHex.length; i += 4) {
    const byte1 = parseInt(codesHex.slice(i, i + 2), 16);
    const byte2 = parseInt(codesHex.slice(i + 2, i + 4), 16);
    if (isNaN(byte1) || isNaN(byte2) || (byte1 === 0 && byte2 === 0)) continue;

    const typeChar = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
    const digit1 = (byte1 >> 4) & 0x03;
    const digit2 = byte1 & 0x0f;
    const digit3 = (byte2 >> 4) & 0x0f;
    const digit4 = byte2 & 0x0f;
    codes.push(
      `${typeChar}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`,
    );
  }
  return codes;
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

export type PidRange = { min: number; max: number };

// Ngưỡng vật lý hợp lý cho xe con (bài học fixture #5: parser tin tuyệt đối giá
// trị giải mã, không phân biệt được cảm biến thật với byte rác do rớt/lệch gói).
// Giá trị ngoài dải này bị coi là hỏng và trả null thay vì hiển thị số liệu sai.
export const PID_PLAUSIBLE_RANGE: Record<string, PidRange> = {
  '04': { min: 0, max: 100 },     // Engine load %
  '05': { min: -40, max: 150 },   // Coolant temperature °C
  '06': { min: -100, max: 100 },  // Short term fuel trim %
  // 0B/0D: PID 1-byte KHÔNG hệ số - dải khai báo trùng đúng dải byte thô (0-255)
  // vì bất kỳ ngưỡng thấp hơn nào cũng loại oan xe tăng áp (MAP kPa boost thật)
  // hoặc tốc độ cao thật (0D là max mà chuẩn J1979 1-byte có thể biểu diễn).
  // Check này KHÔNG bắt được byte rác cho riêng 2 PID này - chỉ có tác dụng
  // khi ghép với check tổng hợp khác (vd so khớp nhiều PID cùng lúc), rà soát
  // Blind Hunter xác nhận đây là no-op cho 2 PID này, chấp nhận đánh đổi.
  '0B': { min: 0, max: 255 },     // Intake manifold pressure kPa
  '0C': { min: 0, max: 8000 },    // Engine RPM - xe con phổ thông không vượt ngưỡng này
  '0D': { min: 0, max: 255 },     // Vehicle speed km/h
  '0F': { min: -40, max: 150 },   // Intake air temperature °C
  '11': { min: 0, max: 100 },     // Throttle position %
  '2F': { min: 0, max: 100 },     // Fuel level %
  '42': { min: 0, max: 30 },      // Control module voltage V (hệ 12V, kể cả sạc lỗi)
  '46': { min: -40, max: 100 },   // Ambient air temperature °C
  '5C': { min: -40, max: 150 },   // Engine oil temperature °C
  '5E': { min: 0, max: 3276.75 }, // Fuel rate L/h
};

/**
 * Giá trị đã giải mã có nằm trong dải vật lý hợp lý không. PID chưa khai báo
 * ngưỡng (chưa có trong PID_PLAUSIBLE_RANGE) mặc định hợp lệ - không chặn oan
 * PID mới thêm mà quên khai ngưỡng.
 */
export function isPlausibleValue(pid: string, value: number | null): boolean {
  if (value === null) return true;
  const range = PID_PLAUSIBLE_RANGE[pid.toUpperCase()];
  if (!range) return true;
  return value >= range.min && value <= range.max;
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
