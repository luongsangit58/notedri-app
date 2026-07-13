/**
 * Test parser ELM327 bằng DỮ LIỆU THẬT từ fixture obd-fixtures/vgate-honda-city-20260713-02.json
 * (Vgate iCar Pro BLE + ELM327 v2.3 + Honda City, init ATE0/ATL0/ATH0/ATS0/ATSP0).
 * Đây là hồi quy cho bug "màn hình toàn dấu -": ATS0 làm response dính liền
 * ("410C1034") trong khi parser cũ tách token theo dấu cách.
 */
import { extractPayload, isNoData, parseSupportedPids, PID_REGISTRY } from '../obdParser';

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
