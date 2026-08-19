# RevenueCat IAP — spec cho backend Laravel (chưa triển khai)

App đã chuyển hẳn sang mua Premium qua Apple IAP/Google Play Billing (RevenueCat
SDK), bỏ hẳn `/premium/redeem` (bị Apple 3.1.1 reject, xem
[apple-hardware-bundle-compliance.md](apple-hardware-bundle-compliance.md)).
File này chỉ là spec — **backend nằm ở repo Laravel riêng
(`d:\SangTrang\notedri`), không sửa trực tiếp `.php` từ agent AI phía app**,
implement thủ công theo spec dưới đây.

## Việc app đã làm (repo này)

- `src/services/iap/RevenueCatService.ts`: cấu hình SDK, `logIn(userId)` sau
  mỗi lần đăng nhập, `logOut()` khi đăng xuất, mua gói qua
  `Purchases.purchasePackage()`, restore qua `Purchases.restorePurchases()`.
- `PremiumScreen.tsx`: liệt kê gói từ RevenueCat Offering hiện tại, nút mua,
  nút Restore Purchases (bắt buộc theo App Review Guidelines cho app bán
  subscription). Không còn ô nhập mã kích hoạt nào.
- `authStore.ts`: gọi `identify(user.id)`/`reset()` đúng thời điểm login/logout
  — RevenueCat dùng `user.id` (số, khớp cột `users.id` hiện có) làm
  `app_user_id`, không phải UUID ẩn danh.

## Việc backend cần làm

### 1. Endpoint nhận webhook RevenueCat

`POST /api/v1/webhooks/revenuecat` (public, không cần Bearer token — xác thực
bằng Authorization header RevenueCat tự gửi, cấu hình secret trong RevenueCat
dashboard > Integrations > Webhooks).

Payload chuẩn RevenueCat (`event.type` quan tâm):
`INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`,
`BILLING_ISSUE`. Field quan trọng: `event.app_user_id` (= `users.id` app đã
`logIn()`), `event.expiration_at_ms`, `event.entitlement_ids`.

### 2. Cập nhật entitlement — TÁI SỬ DỤNG field hiện có

Không cần bảng mới. Ghi thẳng vào field đã có sẵn (đúng field `/premium` đang
đọc để trả `is_premium`/`plan_expires_at` cho `PremiumScreen`):

```
users.plan_expires_at = event.expiration_at_ms (convert ms -> Carbon)
```

- `INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE`: set `plan_expires_at` theo
  `expiration_at_ms` mới nhất.
- `CANCELLATION`: KHÔNG cắt quyền ngay — user vẫn dùng tới hết chu kỳ đã trả
  tiền, chỉ là sẽ không tự renew. Không cần hành động gì (StoreKit/Play tự
  không gửi `RENEWAL` tiếp theo).
- `EXPIRATION`/`BILLING_ISSUE` (hết hạn thật): có thể để tự nhiên hết hạn theo
  `plan_expires_at` đã set từ trước (không cần set lại `null` thủ công, logic
  `is_premium` hiện tại của `/premium` chắc chắn đã so sánh `plan_expires_at`
  với `now()` — xác nhận lại đúng field/logic trước khi implement).

### 3. Đối chiếu tên sản phẩm ↔ số tháng

RevenueCat gửi `event.product_id` (khớp Product ID tạo trong ASC/Play
Console). Backend cần bảng map cứng (không cần DB, hardcode trong config
Laravel là đủ, ví dụ `config/revenuecat.php`):

```php
'product_months' => [
    'notedri_premium_3m'  => 3,
    'notedri_premium_6m'  => 6,
    'notedri_premium_12m' => 12,
],
```

`plan_expires_at` set trực tiếp từ `expiration_at_ms` RevenueCat trả về (đã
tính sẵn ngày hết hạn thật, gồm cả free trial) — **không cần tự cộng số
tháng thủ công**, bảng map trên chỉ dùng để hiển thị/log, tránh tính sai lệch
múi giờ/số ngày trong tháng.

### 4. Idempotency

RevenueCat có thể gửi trùng webhook (retry khi timeout) — dùng
`event.event_timestamp_ms` + `event.id` (nếu có trong payload) để bỏ qua
event đã xử lý, hoặc đơn giản là luôn set lại `plan_expires_at` (thao tác set
giá trị cuối cùng an toàn khi trùng lặp, không cộng dồn).

### 5. `/premium/trial` (flow admin duyệt trial thủ công cũ)

Endpoint này ĐANG vẫn tồn tại và UI app vẫn gọi (`requestTrial` trong
`PremiumScreen.tsx`, chưa bị xoá trong đợt sửa này). Vì gói IAP giờ có sẵn 1
tháng free trial qua chính StoreKit/Play Billing Introductory Offer, flow
admin-duyệt-thủ-công này đã dư thừa — cân nhắc bỏ ở lần sửa sau (ngoài phạm
vi đợt fix Apple reject hiện tại, không đụng để tránh mở rộng phạm vi thay
đổi không cần thiết).
