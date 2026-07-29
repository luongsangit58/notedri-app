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

/**
 * Chuẩn hoá text trước khi đưa vào TTS (expo-speech, Speech.speak) - text nguồn (LLM/local
 * template) có thể chứa markdown (**đậm**, *nghiêng*, gạch đầu dòng "- ") và số tiền viết tắt
 * kiểu "100.000đ" (`toLocaleString('vi-VN')` + "đ", xem LocalReplyTemplates.ts) - đọc thẳng ký
 * tự sẽ ra "sao sao" hoặc đọc nhầm "đ" thành 1 chữ cái rời thay vì "đồng".
 */
export function prepareTextForSpeech(text: string): string {
  return (text ?? '')
    // Xoá markdown TRƯỚC khi đổi tiền tệ - vd "**100.000đ**" có "*" đứng ngay sau "đ", nếu đổi
    // tiền trước thì lookahead bên dưới không khớp (còn sót "đ" chưa đổi được thành "đồng").
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    // Dọn nốt ký tự markdown lẻ (không ghép cặp được ở các bước trên) - đảm bảo "*" không bao
    // giờ còn sót lại tới TTS dù rơi vào mẫu chưa lường tới.
    .replace(/[*_#`~]/g, '')
    // Số tiền "100.000đ" / "100.000 đ" -> "100.000 đồng" (`toLocaleString('vi-VN')` + "đ", xem
    // LocalReplyTemplates.ts) - "đ" đứng NGAY SAU chữ số, không đụng tới các từ có sẵn "đ" khác
    // (được, đường...).
    .replace(/(\d[\d.,]*)\s*đ(?=[\s,.;:!?)/]|$)/gi, '$1 đồng')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
