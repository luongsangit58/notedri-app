/**
 * Giải mã VIN 17 ký tự (chuẩn ISO 3780/SAE J853) - CHỈ 2 trường có thể trích
 * xuất tự tin mà KHÔNG cần bảng hãng/dòng xe riêng (bài học car_specs.json:
 * 24% thiếu/31% confidence thấp khi tự curate - xem
 * _bmad-output/brainstorming/brainstorming-session-2026-07-13-knowledge-first-roadmap.md
 * VIN #28/#31). Hàm THUẦN, không RN/API import - test độc lập được.
 *
 * KHÔNG giải mã hãng/dòng/trim - việc đó cần bảng WMI curated riêng (đã từ
 * chối làm nội bộ ở Giai đoạn C4).
 */

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/; // 17 ký tự, loại I/O/Q (dễ nhầm 1/0)

function normalize(vin: string): string | null {
  const v = vin.trim().toUpperCase();
  return VIN_PATTERN.test(v) ? v : null;
}

// Vị trí thứ 10 (index 9) = mã năm sản xuất, chu kỳ lặp 30 năm (SAE J853).
// Bảng dưới ghi năm của chu kỳ 2010-2039 (xe NoteDri phục vụ hầu hết đời hiện đại);
// chu kỳ 1980-2009 = giá trị này trừ 30.
const YEAR_CODE_MODERN: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  '1': 2031, '2': 2032, '3': 2033, '4': 2034, '5': 2035, '6': 2036, '7': 2037, '8': 2038, '9': 2039,
};

/**
 * Giải mã năm sản xuất từ ký tự thứ 10 của VIN. Vì mã lặp lại mỗi 30 năm, cần
 * chọn giữa 2 chu kỳ khả dĩ:
 * - Có `hintYear` (vd user đã nhập tay năm khác đâu đó trong form): chọn chu kỳ
 *   GẦN hintYear nhất.
 * - Không có hint: ưu tiên chu kỳ MỚI (2010+), trừ khi năm đó ở TƯƠNG LAI so với
 *   `nowYear` (xe không thể sản xuất ở tương lai) -> lùi về chu kỳ cũ.
 *
 * Trả null nếu VIN không đúng 17 ký tự chuẩn hoặc ký tự thứ 10 không hợp lệ.
 */
export function decodeVinModelYear(vin: string, hintYear?: number, nowYear: number = new Date().getFullYear()): number | null {
  const v = normalize(vin);
  if (!v) return null;

  const code = v[9];
  const modernYear = YEAR_CODE_MODERN[code];
  if (modernYear === undefined) return null;
  const olderYear = modernYear - 30;

  const candidates = [modernYear, olderYear].filter((y) => y <= nowYear);
  if (candidates.length === 0) return olderYear; // cả 2 đều ở tương lai (VIN có vấn đề) - trả giá trị cũ hơn cho an toàn

  if (hintYear !== undefined && hintYear !== null) {
    return candidates.reduce((a, b) => (Math.abs(a - hintYear) <= Math.abs(b - hintYear) ? a : b));
  }
  return Math.max(...candidates);
}

// Chỉ những ký tự ĐẦU VIN có vùng/quốc gia được nhiều nguồn công khai xác nhận
// THỐNG NHẤT (ISO 3780 WMI) - các ký tự còn lại (vd M/N/P/R/X/Y/Z...) bị bỏ
// CÓ CHỦ Ý vì các nguồn tham khảo không thống nhất ở mức chi tiết quốc gia cụ
// thể (chỉ thống nhất ở mức châu lục) - "chính xác hơn đoán" (kỷ luật dự án).
const REGION_FIRST_CHAR: Record<string, string> = {
  '1': 'Mỹ', '4': 'Mỹ', '5': 'Mỹ',
  '2': 'Canada',
  '3': 'Mexico',
  J: 'Nhật Bản',
  K: 'Hàn Quốc',
  L: 'Trung Quốc',
  W: 'Đức',
  S: 'Anh',
};

/**
 * Gợi ý vùng/quốc gia lắp ráp từ ký tự ĐẦU VIN (WMI) - CHỈ trả về khi đủ tin
 * cậy (xem danh sách hẹp REGION_FIRST_CHAR), null cho mọi trường hợp còn lại
 * thay vì đoán. Luôn hiển thị như "tham khảo", không phải sự thật tuyệt đối.
 */
export function decodeVinRegionHint(vin: string): string | null {
  const v = normalize(vin);
  if (!v) return null;
  return REGION_FIRST_CHAR[v[0]] ?? null;
}
