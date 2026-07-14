/**
 * Test parser ELM327 bằng DỮ LIỆU THẬT từ fixture obd-fixtures/vgate-honda-city-20260713-02.json
 * (Vgate iCar Pro BLE + ELM327 v2.3 + Honda City, init ATE0/ATL0/ATH0/ATS0/ATSP0).
 * Đây là hồi quy cho bug "màn hình toàn dấu -": ATS0 làm response dính liền
 * ("410C1034") trong khi parser cũ tách token theo dấu cách.
 */
import { extractPayload, isNoData, parseSupportedPids, parseVin, parseDtcCodes, PID_REGISTRY } from '../obdParser';

describe('extractPayload - format thật từ fixture #2 (ATS0, không dấu cách)', () => {
  it('parse RPM 410C1034 → 1037 rpm', () => {
    const bytes = extractPayload('410C1034', '01', '0C');
    expect(bytes).toEqual([0x10, 0x34]);
    expect(PID_REGISTRY['0C'].decode(bytes!)).toBe(1037);
  });

  it('parse RPM có dòng SEARCHING ngăn bằng \\r (lệnh đầu sau ATSP0)', () => {
    const bytes = extractPayload('SEARCHING...\r410C1034', '01', '0C');
    expect(bytes).toEqual([0x10, 0x34]);
  });

  it('parse speed 410D00 → 0 km/h (xe đỗ)', () => {
    const bytes = extractPayload('410D00', '01', '0D');
    expect(bytes).toEqual([0x00]);
    expect(PID_REGISTRY['0D'].decode(bytes!)).toBe(0);
  });

  it('parse engine load 410469 → 41%', () => {
    const bytes = extractPayload('410469', '01', '04');
    expect(PID_REGISTRY['04'].decode(bytes!)).toBe(41);
  });

  it('parse coolant 41055F → 55°C', () => {
    const bytes = extractPayload('41055F', '01', '05');
    expect(PID_REGISTRY['05'].decode(bytes!)).toBe(55);
  });

  it('parse throttle 411128 → 16%', () => {
    const bytes = extractPayload('411128', '01', '11');
    expect(PID_REGISTRY['11'].decode(bytes!)).toBe(16);
  });

  it('vẫn parse được định dạng CÓ dấu cách của adapter khác', () => {
    expect(extractPayload('41 0C 10 34', '01', '0C')).toEqual([0x10, 0x34]);
    expect(extractPayload('41 05 5F', '01', '05')).toEqual([0x5f]);
  });

  it('echo lệnh ATZ không bị nhận nhầm là payload', () => {
    expect(extractPayload('ATZ\r\r\rELM327 v2.3', '01', '0C')).toBeNull();
  });

  it('response của PID khác không khớp', () => {
    expect(extractPayload('410D00', '01', '0C')).toBeNull();
  });
});

describe('isNoData - PID xe không hỗ trợ (Honda City: 012F, 015C)', () => {
  it('nhận diện NO DATA', () => {
    expect(isNoData('NO DATA')).toBe(true);
    expect(isNoData('NODATA')).toBe(true);
    expect(isNoData('410C1034')).toBe(false);
  });
});

describe('parseVin - format multi-frame thật từ fixture #3', () => {
  it('ghép ISO-TP và ra đúng VIN xe Honda City', () => {
    const raw = '014\r0:4902014D5248\r1:474B353833304A\r2:54303430303035';
    expect(parseVin(raw)).toBe('MRHGK5830JT040005');
  });

  it('NO DATA / rác → null', () => {
    expect(parseVin('NO DATA')).toBeNull();
    expect(parseVin('ELM327 v2.3')).toBeNull();
  });
});

describe('parseDtcCodes - mode 03 chuẩn SAE J1979 (kiểm chứng lại 14/7 qua tài liệu công khai)', () => {
  // SỬA 14/7: giả định ban đầu "có byte đếm sau 43" là SAI, đã kiểm chứng qua
  // x-engineer.org (giải mã byte-level Mode 03) + tài liệu tham chiếu PID OBD2
  // công khai (GitHub obd2-elm327-pid-reference): response chỉ là các cặp
  // 2-byte nối tiếp ngay sau "43" (không byte đếm), đệm 00 00 khi thiếu, tối đa
  // 3 mã/khung 7-byte trên K-line; CAN dùng multi-frame ISO-TP khi >2 mã. Mọi
  // chuỗi hex dưới đây được TÍNH TAY theo đúng công thức bit rồi giải mã ngược
  // lại để xác nhận round-trip, không suy đoán.
  it('xe khoẻ 4300 → không mã nào', () => {
    expect(parseDtcCodes('4300')).toEqual([]);
  });

  it('1 mã hệ powertrain: 434035 → C0035 (byte1≠0 nên không bị coi là đệm)', () => {
    expect(parseDtcCodes('434035')).toEqual(['C0035']);
  });

  it('1 mã hệ mạng: 43C100 → U0100', () => {
    expect(parseDtcCodes('43C100')).toEqual(['U0100']);
  });

  it('2 mã + đệm 00 00 đúng khung 7-byte thật: 43 0171 0420 0000 → P0171, P0420', () => {
    expect(parseDtcCodes('43017104200000')).toEqual(['P0171', 'P0420']);
  });

  it('3 mã lấp đầy đúng 1 khung (không đệm): 43 0171 0420 0300', () => {
    expect(parseDtcCodes('430171042003 00'.replace(/\s/g, ''))).toEqual(['P0171', 'P0420', 'P0300']);
  });

  it('multi-frame ISO-TP (>3 mã, format ghép giống VIN): 4 mã P0171/P0420/P0300/C0035', () => {
    const raw = '011\r0:4301710420\r1:03004035';
    expect(parseDtcCodes(raw)).toEqual(['P0171', 'P0420', 'P0300', 'C0035']);
  });

  it('NO DATA → rỗng', () => {
    expect(parseDtcCodes('NO DATA')).toEqual([]);
  });
});

describe('parseSupportedPids - bitmap THẬT từ fixture #3 (Honda City)', () => {
  it('trang 0100 thật: có 0C/0D/04/05/11, có bit trang sau (20)', () => {
    const pids = parseSupportedPids('4100BC3EA803', 0x00);
    expect(pids).toEqual(expect.arrayContaining(['04', '05', '0C', '0D', '11', '20']));
  });

  it('trang 0120 thật: KHÔNG có 2F (fuel level) - khớp NO DATA thực tế', () => {
    const pids = parseSupportedPids('4120801DB001', 0x20);
    expect(pids).not.toContain('2F');
    expect(pids).toContain('40'); // bit trang sau
  });

  it('trang 0140 thật: có 42 (điện áp - battery guardian) và 51 (fuel type - prefill)', () => {
    const pids = parseSupportedPids('41407AD08000', 0x40);
    expect(pids).toContain('42');
    expect(pids).toContain('51');
    expect(pids).not.toContain('5C'); // oil temp - khớp NO DATA thực tế
    expect(pids).not.toContain('60'); // không có trang sau → discovery dừng đúng chỗ
  });
});

describe('parseSupportedPids - bitmap chuẩn SAE', () => {
  it('parse ví dụ chuẩn 4100BE3FA813', () => {
    // BE = 10111110 → PID 01,03,04,05,06,07 (bit1=01... bit8=08 tắt)
    const pids = parseSupportedPids('4100BE3FA813', 0x00);
    expect(pids).toContain('01');
    expect(pids).not.toContain('02');
    expect(pids).toContain('03');
    expect(pids).toContain('04');
    expect(pids).toContain('05');
    expect(pids).toContain('06');
    expect(pids).toContain('07');
    expect(pids).not.toContain('08');
    // A8 = 10101000 → ...0D bật; 13 = 00010011 → 1C,1F,20 bật (bit cuối = trang sau tồn tại)
    expect(pids).toContain('0D');
    expect(pids).toContain('20');
  });

  it('trang 0120: base cộng đúng offset', () => {
    // 412080000000 → chỉ bit 1 bật = PID 21
    const pids = parseSupportedPids('412080000000', 0x20);
    expect(pids).toEqual(['21']);
  });

  it('NO DATA → mảng rỗng', () => {
    expect(parseSupportedPids('NO DATA', 0x00)).toEqual([]);
  });
});
