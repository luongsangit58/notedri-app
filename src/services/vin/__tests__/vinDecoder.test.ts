import { decodeVinModelYear, decodeVinRegionHint } from '../vinDecoder';

// VIN thật từ fixture xe Sang (Honda City/Jazz lắp ráp Thái Lan, xem
// brainstorming-session-2026-07-13-knowledge-first-roadmap.md)
const REAL_VIN = 'MRHGK5830JT040005';

describe('decodeVinModelYear', () => {
  it('VIN thật (ký tự thứ 10 = J) -> 2018, không phải 1988 (chu kỳ mới ưu tiên khi không có hint)', () => {
    expect(decodeVinModelYear(REAL_VIN, undefined, 2026)).toBe(2018);
  });

  it('có hintYear gần chu kỳ CŨ hơn -> chọn chu kỳ cũ', () => {
    // Ký tự 'J' = 2018 hoặc 1988 - hint 1990 gần 1988 hơn nhiều so với 2018.
    expect(decodeVinModelYear(REAL_VIN, 1990, 2026)).toBe(1988);
  });

  it('năm thuộc chu kỳ mới nhưng vẫn ở TƯƠNG LAI so với nowYear -> lùi về chu kỳ cũ', () => {
    // 'Y' ở đúng vị trí index 9 (ký tự thứ 10) = 2030 (tương lai nếu nowYear=2026) -> phải trả 2000.
    const vin = 'MRHGK5830YT040005';
    expect(vin[9]).toBe('Y'); // tự kiểm tra vị trí trước khi tin vào test
    expect(decodeVinModelYear(vin, undefined, 2026)).toBe(2000);
  });

  it('VIN sai định dạng (không đủ 17 ký tự) -> null', () => {
    expect(decodeVinModelYear('SAI', undefined, 2026)).toBeNull();
  });

  it('VIN chứa ký tự cấm (I/O/Q) -> null', () => {
    expect(decodeVinModelYear('MRHGKI830JT040005', undefined, 2026)).toBeNull();
  });
});

describe('decodeVinRegionHint', () => {
  it('VIN thật (ký tự đầu M) -> null CÓ CHỦ Ý (M không nằm trong danh sách tin cậy - né đoán sai)', () => {
    // Xe thật là Thái Lan lắp ráp ("MRH...") - nếu bảng có "M -> Ấn Độ" sẽ SAI cho
    // đúng chiếc xe làm fixture cho tính năng này. Đây là lý do M bị loại có chủ ý.
    expect(decodeVinRegionHint(REAL_VIN)).toBeNull();
  });

  it('ký tự đầu J -> Nhật Bản', () => {
    const vin = 'J' + REAL_VIN.slice(1);
    expect(vin).toHaveLength(17);
    expect(decodeVinRegionHint(vin)).toBe('Nhật Bản');
  });

  it('ký tự đầu K -> Hàn Quốc', () => {
    const vin = 'K' + REAL_VIN.slice(1);
    expect(decodeVinRegionHint(vin)).toBe('Hàn Quốc');
  });

  it('ký tự đầu 1 -> Mỹ', () => {
    const vin = '1' + REAL_VIN.slice(1);
    expect(decodeVinRegionHint(vin)).toBe('Mỹ');
  });

  it('VIN sai định dạng -> null', () => {
    expect(decodeVinRegionHint('SAI')).toBeNull();
  });
});
