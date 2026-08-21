import client from './client';

// Claim ngầm mã Offer Code (KW906) qua deep link từ trang redeem web - chỉ ghi dấu vết
// tham khảo "tài khoản nào vừa claim mã nào" cho admin, KHÔNG cấp quyền Premium gì (việc
// đó vẫn do app+RevenueCat lo qua đúng luồng IAP, độc lập hoàn toàn với API này). client
// tự đính kèm Authorization nếu đang đăng nhập (xem interceptor trong client.ts) - chưa
// đăng nhập thì request vẫn gửi nhưng backend trả lỗi xác thực, gọi nơi này phải tự bỏ
// qua lỗi (fire-and-forget, xem handleOfferCodeClaimLink.ts).
export function claimOfferCode(token: string) {
  return client.post(`/offer-codes/${encodeURIComponent(token)}/claim`);
}
