/**
 * EWMA (Exponential Weighted Moving Average) từng bước - dùng để làm mượt giá trị
 * HIỂN THỊ trên gauge live OBD2 (mục 12 kiểm toán thuật toán 16/07), giảm giật do
 * nhiễu lượng tử hoá BLE. KHÔNG dùng cho giá trị đưa vào rule engine chẩn đoán -
 * làm mượt sẽ trễ pha và có thể bỏ sót đỉnh ngắn thật (vd 1 lần quá nhiệt thoáng qua).
 *
 * @param prev Giá trị mượt hiện tại (null nếu chưa có mẫu nào).
 * @param next Giá trị RAW mới đọc được từ OBD2 (null nếu PID không trả về lần này).
 * @param alpha Trọng số cho mẫu mới (0-1). Cao hơn = bám sát dữ liệu gần đây hơn
 *              nhưng nhạy nhiễu hơn. 0.3 là điểm khởi đầu hợp lý.
 * @returns Giá trị mượt mới. Giữ nguyên $prev khi $next null (không kéo gauge về 0/mất giá trị
 *          chỉ vì 1 lần đọc PID lỗi thoáng qua).
 */
export function ewmaStep(prev: number | null, next: number | null, alpha = 0.3): number | null {
  if (next === null) return prev;
  if (prev === null) return next;
  return alpha * next + (1 - alpha) * prev;
}
