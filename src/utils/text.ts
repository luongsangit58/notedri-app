/**
 * Chuẩn hoá chuỗi để tìm kiếm KHÔNG dấu, không phân biệt hoa/thường.
 * Vd: normalizeSearch("Hà Nội") === "ha noi" -> gõ "ha noi" vẫn ra "Hà Nội".
 * Dùng map thủ công vì Hermes hỗ trợ String.normalize không ổn định.
 */
export function normalizeSearch(str: string): string {
  return (str ?? '')
    .toLowerCase()
    .replace(/[àáảãạăằắẳẵặâầấẩẫậ]/g, 'a')
    .replace(/[èéẻẽẹêềếểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôồốổỗộơờớởỡợ]/g, 'o')
    .replace(/[ùúủũụưừứửữự]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .trim();
}
