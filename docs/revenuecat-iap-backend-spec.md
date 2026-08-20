# RevenueCat IAP — backend Laravel (notedri)

App chuyển hẳn sang mua Premium qua Apple IAP/Google Play Billing (RevenueCat SDK), bỏ
`/premium/redeem` tự chế (bị Apple 3.1.1 reject, xem
[apple-hardware-bundle-compliance.md](apple-hardware-bundle-compliance.md)).

## QUYẾT ĐỊNH 2026-08-20 — bỏ gói 3/6/12 tháng, chỉ còn Lifetime

- **Bỏ hẳn subscription 3/6/12 tháng.** Chỉ còn 1 sản phẩm **Lifetime** (mua 1 lần,
  129.000đ, không hết hạn) — cấu hình trong RevenueCat/App Store Connect/Play Console
  là non-subscription product gắn với entitlement `PREMIUM` (duration "Lifetime").
- **Tự động cấp 30 ngày Premium dùng thử cho MỌI tài khoản mới** (đăng ký email/OTP,
  Google, Apple — cả web lẫn app) — không còn luồng "gửi yêu cầu → admin duyệt"
  (`/premium/trial` phía app, `premium/request` phía web đã bị xoá hẳn, không chỉ ẩn UI).
- Backend đã triển khai (không còn là spec-chưa-làm) — xem danh sách file bên dưới.

## Việc app đã làm (repo `notedri-app`)

- `src/services/iap/RevenueCatService.ts`: cấu hình SDK, `identify(userId)` sau mỗi lần
  đăng nhập, `reset()` khi đăng xuất, mua gói qua `Purchases.purchasePackage()`, restore
  qua `Purchases.restorePurchases()`. Không đổi gì cho Lifetime — code vốn không hardcode
  loại sản phẩm, chỉ list `offering.availablePackages` hiện tại.
- `PremiumScreen.tsx`: bỏ hẳn nút "yêu cầu dùng thử" (tự động cấp ở backend rồi, không
  cần thao tác), chỉ còn liệt kê gói (giờ chỉ có Lifetime) từ RevenueCat Offering + nút
  mua + nút Restore Purchases.
- `authStore.ts`: `setSession()` tự hiện 1 thông báo chào mừng "được tặng 30 ngày
  Premium" MỘT LẦN/tài khoản (guard bằng AsyncStorage key `trial_welcome_shown_<id>`)
  khi backend trả `on_trial: true` — áp dụng đồng nhất cho cả 3 luồng đăng ký (OTP,
  Google, Apple) vì cả 3 đều gọi `setSession()`.

## Việc backend đã làm (repo `notedri`)

### 1. Tự động cấp trial khi tạo tài khoản

`app/Observers/UserObserver.php::grantSignupTrial()` — hook vào `User::created()`
(chạy cho MỌI điểm tạo user: OTP mobile, Google mobile, Apple mobile, OTP web, Google
OAuth web, Google One Tap web — không cần sửa từng nơi). Dùng lại `User::grantTrial()`
sẵn có (forceFill vì `plan`/`plan_expires_at` bị guard mass-assignment), số ngày lấy từ
`config('plans.trial_days')` (= 30), bỏ qua nếu `isAdmin()`.

**Lưu ý lịch sử:** migration `2026_06_18_090000_reset_auto_granted_trials_to_free.php`
từng CHỦ ĐỘNG đảo ngược đúng hành vi này ("Trial giờ là OPT-IN") — quyết định 2026-08-20
đảo ngược lại lần nữa, có chủ đích, đã xác nhận với business.

### 2. Endpoint nhận webhook RevenueCat

`POST /api/v1/webhooks/revenuecat` (public, route ngoài `auth:sanctum` — xác thực bằng
header `Authorization: Bearer <secret>`, so khớp `config('services.revenuecat.webhook_secret')`
= env `REVENUECAT_WEBHOOK_SECRET`, cấu hình secret trùng khớp ở RevenueCat dashboard >
Integrations > Webhooks).

Đã cài: `app/Http/Controllers/Api/V1/RevenueCatWebhookController.php`.

- `event.app_user_id` (= `users.id`, app đã `Purchases.logIn(String(userId))`) → tìm
  `User`. ID không phải số hoặc không tìm thấy user → bỏ qua êm, không phải lỗi.
- `event.type` thuộc `INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE`/`NON_RENEWING_PURCHASE`/
  `UNCANCELLATION` → set `plan = 'premium'`, `plan_expires_at = event.expiration_at_ms`
  (convert ms → Carbon) — **`expiration_at_ms` rỗng/null (đúng trường hợp mua Lifetime)
  → set `plan_expires_at = null`, đã xác nhận `User::planName()`/`isPremium()` coi
  `plan_expires_at IS NULL` + `plan='premium'` là Premium VĨNH VIỄN, không cần xử lý
  gì thêm.**
- `CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE` → không hành động (đã đúng theo thiết kế
  `planName()` tự so sánh `plan_expires_at` với `now()`).
- Idempotent tự nhiên: luôn set lại giá trị cuối cùng, không cộng dồn — trùng lặp webhook
  (RevenueCat retry khi timeout) vô hại.

### 3. Đơn giản hoá `/premium` (GET) + xoá luồng request thủ công

- `PremiumApiController::status()` bỏ `can_request`/`request_status` (không còn ý nghĩa
  gì khi không còn hàng chờ admin duyệt) — còn `is_premium`, `on_trial`, `plan`,
  `plan_expires_at`, `trial_days`.
- `PremiumApiController::requestTrial()` (route `POST premium/trial`) — **đã xoá hẳn**,
  không chỉ ẩn UI.
- Web mirror `Garage\PremiumController::requestTrial()` (route `premium/request`) —
  **đã xoá hẳn**, kèm `cleanContext()`/`CONTEXTS` không còn dùng.
- **Chưa đụng:** `Admin\UserController::approveRequest()/rejectRequest()` và model
  `PremiumInterest` — giờ là dead code từ phía khách hàng (không còn request nào được
  tạo mới), nhưng giữ lại để xem lịch sử request cũ + tránh mở rộng phạm vi sửa ngoài
  yêu cầu. Dọn ở đợt sau nếu cần.

### 4. `config/plans.php` — giá Lifetime

`'pricing' => ['lifetime' => ['amount' => (int) env('PREMIUM_PRICE_LIFETIME', 129000)]]`
— thay hẳn cấu trúc `1/3/6/12` tháng cũ (đã xác nhận không còn chỗ nào đọc field này
trước khi đổi, an toàn).

## Còn cần làm (ngoài phạm vi sửa code — App Store Connect/Play Console/RevenueCat
dashboard, thao tác UI console, không lưu chi tiết ở đây)

1. Tạo sản phẩm **Lifetime** (non-subscription, gắn entitlement `PREMIUM`, duration
   Lifetime) trên App Store Connect + Play Console + RevenueCat dashboard (Offering
   + Entitlement) — **xoá/không dùng lại** 3 sản phẩm subscription 3/6/12 tháng đã tạo
   trước đó (nếu ASC/Play Console đã có draft, hoàn thiện hoặc xoá tuỳ trạng thái review).
2. Set `REVENUECAT_WEBHOOK_SECRET` trong `.env` production + cấu hình đúng secret đó ở
   RevenueCat dashboard > Webhooks, trỏ URL `https://notedri.com/api/v1/webhooks/revenuecat`.
3. Set `PREMIUM_PRICE_LIFETIME` trong `.env` nếu muốn khác 129.000đ mặc định.
4. Test Sandbox (iOS) + Test track (Android) trước khi submit binary mới.
5. **Mở, chưa quyết:** trên web (notedri.com), gói Lifetime 129k hiện chưa có cổng thanh
   toán tự động (SePay đã gỡ bỏ hoàn toàn, không có `PaymentController`) — web vẫn dùng
   kênh liên hệ thủ công có sẵn (`garage.premium` → nút "Cần gia hạn hoặc hỗ trợ Premium?"
   → Feedback → admin liên hệ và cấp mã qua `PremiumCode`/`premium.redeem`, cơ chế này
   KHÔNG bị ảnh hưởng bởi chính sách Apple vì web không phải app store). Nếu muốn web tự
   thanh toán được (không qua admin thủ công), cần chọn một cổng thanh toán VN (PayOS/
   VNPay/MoMo) và xây tích hợp mới — quyết định nhà cung cấp cần bàn riêng trước khi code.
