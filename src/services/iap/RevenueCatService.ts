import { Platform } from 'react-native';
import Purchases, { CustomerInfo, CustomerInfoUpdateListener, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

// Entitlement identifier phải KHỚP CHÍNH XÁC (phân biệt hoa/thường) với entitlement
// tạo trong RevenueCat dashboard (Entitlements -> "PREMIUM", xác nhận 19/8/2026 -
// dashboard lưu chữ HOA dù form nhập ban đầu gõ "premium") - cấu hình thủ công,
// không có trong code. Alias ở đây chỉ để không hardcode chuỗi rải rác nhiều nơi.
const ENTITLEMENT_ID = 'PREMIUM';

// API key khác nhau cho iOS/Android theo thiết kế RevenueCat (2 app riêng trong
// cùng 1 RevenueCat Project). Rỗng ở local/dev nếu .env chưa điền - configure()
// tự bỏ qua để không crash app lúc chưa có key thật (xem ensureConfigured()).
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

let configured = false;

/**
 * Khởi tạo SDK 1 lần - gọi sớm ở App root (giống ensureInitialized() của BleService).
 * Không throw nếu thiếu key: cho phép app chạy được ở môi trường chưa cấu hình
 * RevenueCat (dev/local) thay vì crash toàn bộ luồng Premium.
 */
export function ensureConfigured(): void {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) return;
  Purchases.configure({ apiKey });
  configured = true;
}

/** Gắn purchase vào đúng user NoteDri (gọi sau login/setSession) - để RevenueCat
 * dashboard/webhook trả về đúng app_user_id thay vì random UUID ẩn danh. */
export async function identify(userId: number): Promise<void> {
  ensureConfigured();
  if (!configured) return;
  try {
    await Purchases.logIn(String(userId));
  } catch {
    // Non-critical: purchase vẫn hoạt động dưới anonymous ID, chỉ mất liên kết
    // user_id ở webhook - initialize() lần sau sẽ logIn lại khi có token.
  }
}

/** Gọi khi logout - tránh entitlement của user A còn "dính" khi user B đăng nhập
 * cùng máy (cùng lớp bug rò rỉ chéo tài khoản như BLE/GPS trong authStore.logout()). */
export async function reset(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch { /* non-critical */ }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  ensureConfigured();
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export async function purchase(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/**
 * Bán kèm KW906 trên Shopee (20/8): user mua thiết bị + gói Premium nhập mã Offer
 * Code (Apple StoreKit) thay vì trả tiền lần 2 qua purchase() ở trên - đúng tài
 * liệu RevenueCat "ios-subscription-offers#offer-codes". iOS-only (native
 * SKPaymentQueue.presentCodeRedemptionSheet(), Android không có khái niệm này -
 * Play Console có cơ chế promo code riêng, chưa làm ở đây). Hàm CHỈ mở sheet hệ
 * thống - resolve ngay khi sheet HIỆN RA, không đợi user nhập/xác nhận xong (đó
 * là lý do cần addCustomerInfoUpdateListener bên dưới để biết lúc nào entitlement
 * thực sự đổi).
 */
export async function presentCodeRedemptionSheet(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  ensureConfigured();
  // Khác purchase()/restorePurchases() (không tự kiểm tra configured, để lệnh
  // gọi SDK tự throw) - ở đây phải tự throw rõ ràng vì thiếu key .env sẽ khiến
  // Purchases.presentCodeRedemptionSheet() bên dưới ÂM THẦM không làm gì (native
  // API không throw cho trường hợp SDK chưa configure() như purchasePackage()) -
  // nút "Nhập mã ưu đãi" sẽ trông như app đứng nếu không có throw này để
  // onError ở PremiumScreen hiện Alert.
  if (!configured) throw new Error('RevenueCat chưa được cấu hình (thiếu API key)');
  await Purchases.presentCodeRedemptionSheet();
}

/**
 * Redemption qua sheet hệ thống (trên) chạy hoàn toàn ngoài luồng JS - không có
 * callback "user vừa đổi mã xong". RevenueCat tự đẩy CustomerInfo mới qua listener
 * này ngay khi StoreKit xác nhận giao dịch, kể cả khi app đang nền lúc user gõ mã
 * xong trong sheet - PremiumScreen dùng để tự làm mới is_premium mà không cần
 * user tự kéo refresh tay.
 */
export function addCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void {
  Purchases.addCustomerInfoUpdateListener(listener);
}

export function removeCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void {
  Purchases.removeCustomerInfoUpdateListener(listener);
}

export function isEntitled(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}
