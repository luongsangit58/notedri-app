// Chính sách phân loại lỗi tạm thời/vĩnh viễn dùng chung cho các hàng đợi đồng bộ offline
// (GpsTripSyncQueue, obd/TripSyncQueue). Gộp lại một nơi để tránh 2 bản copy-paste lệch nhau
// khi cần đổi chính sách (đã từng xảy ra: thêm 401/403 vào diện tạm thời + giới hạn số lần thử).
//
// - 4xx (trừ 429/401/403) = lỗi client vĩnh viễn (payload sai, xe đã xoá...) -> BỎ, retry vô ích.
// - Mạng lỗi / 5xx / 429 = tạm thời -> GIỮ vô thời hạn (không bỏ theo số lần thử).
// - 401/403 = tạm thời NHƯNG có giới hạn (MAX_AUTH_RETRIES lần): có thể do token chưa nạp kịp
//   lúc cold-start hoặc đang đổi phiên, nhưng nếu vẫn lỗi sau ngần đó lần thử thì khả năng cao
//   là vĩnh viễn (xe/thiết bị đã xoá, hết quyền...) -> bỏ, tránh chiếm slot hàng đợi mãi mãi.
export const MAX_AUTH_RETRIES = 5;

export function isPermanentSyncError(status: number | undefined, retriesSoFar: number): boolean {
  if (status === undefined || status < 400 || status >= 500 || status === 429) return false;
  const isAuthStatus = status === 401 || status === 403;
  return !isAuthStatus || retriesSoFar >= MAX_AUTH_RETRIES;
}
