import { Linking } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { claimOfferCode } from '../../api/offerCodes';

// notedri://redeem?token=...&target=... - đến từ trang web redeem mã Offer Code (KW906),
// xem RedeemCodeController::show() phía backend. "target" là link redeem thật của
// Apple/Google (đã urlencode) - app không cần tự dựng lại link, chỉ cần mở nó.
export function parseOfferCodeClaimUrl(url: string): { token: string; target: string } | null {
  const match = url.match(/^notedri:\/\/redeem\?(.+)$/);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const token = params.get('token');
  const target = params.get('target');
  if (!token || !target) return null;
  return { token, target: decodeURIComponent(target) };
}

// Chỉ claim (ghi dấu vết tham khảo) khi ĐANG đăng nhập sẵn - không bắt đăng nhập, không
// hiện màn hình/thao tác gì thêm (khách không cảm nhận có bước này). Lỗi ở đây không quan
// trọng (mất tín hiệu tham khảo, không ảnh hưởng gì tới việc redeem thật) - luôn mở tiếp
// "target" dù claim thành công hay không.
export async function handleOfferCodeClaimLink(url: string): Promise<void> {
  const parsed = parseOfferCodeClaimUrl(url);
  if (!parsed) return;

  if (useAuthStore.getState().token) {
    try {
      await claimOfferCode(parsed.token);
    } catch {
      // Non-critical - bỏ qua, vẫn mở tiếp link redeem thật bên dưới.
    }
  }

  await Linking.openURL(parsed.target);
}
