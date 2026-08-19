# Apple App Store Review — Bán kèm KONNWEI KW906 + gói dịch vụ 3/6/12 tháng

Ghi lại toàn bộ ngữ cảnh, quyết định và phương án cho đợt từ chối App Store
2026-08-18, để dùng lại khi Apple trả lời hoặc khi resubmit. Đọc file này
trước khi động vào bất kỳ code nào liên quan đến kích hoạt Premium/IAP trên
iOS.

## 0. QUYẾT ĐỊNH CUỐI CÙNG (2026-08-19) — đã triển khai

Sau khi cân nhắc kỹ toàn bộ phương án né IAP (3.1.4, 3.1.3(b) multiplatform
recognition, web-claim...), **chốt bỏ hẳn hướng né IAP** — chấp nhận hoa hồng
Apple/Google, đổi lấy việc loại bỏ hoàn toàn rủi ro pháp lý/review lặp lại.
Lý do: mọi phương án né IAP đều có điểm chung là "proof mua hàng ngoài App
Store -> backend tự cấp N tháng Premium", cùng bản chất với Data Transfer
Code vừa bị 3.1.1 reject dù đổi tên/thêm điều kiện gì đi nữa — rủi ro strike
lần 2 lên tài khoản dev không đáng để đổi lấy vài % hoa hồng.

**Mô hình mới:**
- Marketplace (Shopee/TikTok): bán KW906 THUẦN PHẦN CỨNG, không kèm tháng
  dịch vụ nào.
- Dashboard/đồng hồ trực tiếp, đọc PID sống: **free vĩnh viễn** cho mọi
  account có OBD kết nối (đúng nhóm hardware-dependent ở §6 dưới) — không
  cần hạ tầng gì, không liên quan billing.
- Premium (báo cáo, Nori AI, thành tựu...): mua qua **Apple IAP thật**
  (Auto-Renewable Subscription 3/6/12 tháng qua RevenueCat) và **Google Play
  Billing** tương ứng — không còn redeem code, không còn web-claim, không
  còn định danh phần cứng cho mục đích cấp quyền.
- **1 tháng free trial** cấu hình trực tiếp bằng Introductory Offer trên
  chính sản phẩm subscription (StoreKit/Play Billing) — không phải flow
  admin duyệt thủ công cũ (`/premium/trial`, xem ghi chú dư thừa trong
  [revenuecat-iap-backend-spec.md](revenuecat-iap-backend-spec.md)).

**Đã triển khai ở app (2026-08-19):**
- Gỡ hẳn `/premium/redeem` khỏi `PremiumScreen.tsx` (UI nhập mã kích hoạt).
- Cài `react-native-purchases` (RevenueCat SDK), wrapper ở
  `src/services/iap/RevenueCatService.ts`.
- `authStore.ts` gọi `Purchases.logIn(user.id)`/`logOut()` đúng thời điểm.
- `PremiumScreen.tsx` liệt kê gói từ RevenueCat Offering + nút mua + nút
  Restore Purchases.
- Spec webhook cho backend (chưa code, backend là repo Laravel riêng):
  [revenuecat-iap-backend-spec.md](revenuecat-iap-backend-spec.md).

**Còn cần làm (ngoài phạm vi sửa code, thuộc App Store Connect/Play
Console/RevenueCat dashboard — xem hướng dẫn chi tiết trong chat, không lưu ở
đây vì là thao tác UI console, không phải quyết định kỹ thuật):**
tạo sản phẩm subscription thật + Review Screenshot (giải quyết 2.1(b)), tạo
project RevenueCat + Entitlement + Offering, dọn IAP draft cũ trong ASC,
implement webhook thật ở backend Laravel theo spec trên, test Sandbox trước
khi submit.

**Câu hỏi 3.1.4 đã gửi Apple (§3 dưới) không còn là trọng tâm** — không cần
đợi Apple trả lời mới nộp bản mới, vì mô hình mới không còn dựa vào 3.1.4
nữa. Giữ lại §1-§9 dưới đây làm lịch sử/tài liệu tham khảo.

---

## 1. Bối cảnh — thư từ chối 2026-08-18

Submission ID `e60bcce1-f80b-4013-a123-0384f4e71595`, review trên iPhone 17
Pro Max, version 1.0 (3). Ba vấn đề:

- **Guideline 2.1(b) — Performance/App Completeness:** chưa nộp sản phẩm IAP
  nào để review (thiếu ảnh chụp App Review screenshot bắt buộc khi submit IAP).
- **Guideline 2.1 — Information Needed:** yêu cầu video demo pairing NFC giữa
  app và phần cứng, hoặc xác nhận app không dùng NFC.
- **Guideline 3.1.1 — Business/Payments:** *"the app uses data transfer codes
  to unlock in-app purchase products"* — tức cơ chế `/premium/redeem` (gõ mã
  kích hoạt do admin cấp, xem [[project_premium_activation_payment_gap]]) bị
  coi là mở khoá nội dung số bằng cơ chế ngoài IAP.

## 2. Mô hình kinh doanh muốn triển khai

Bán thiết bị KONNWEI KW906 kèm gói dịch vụ trả trước 3/6/12 tháng qua kênh
bên thứ ba (Shopee/TikTok) — khách trả tiền 1 lần duy nhất, sau đó tạo/đăng
nhập tài khoản NoteDri và liên kết thiết bị vật lý, dùng được ngay tính năng
đã mua **không phải trả tiền lần 2 qua IAP**.

## 3. Câu hỏi đã gửi Apple (nguyên văn, gửi sáng 2026-08-19)

```
We would like to clarify the intended business model before submitting an
updated binary.

NoteDri is an OBD-II diagnostic app that requires a physical OBD-II adapter,
such as the KONNWEI KW906, for its diagnostic functionality.

We plan to sell the physical KW906 together with a prepaid 3-, 6-, or
12-month NoteDri service package through third-party marketplaces. The
customer pays for the hardware and the bundled service in a single
transaction.

After receiving the hardware, the customer creates or logs into a NoteDri
account and links the physical OBD-II device to the account. The customer
would then be able to use the bundled OBD-related functionality without
purchasing the same service again through In-App Purchase.

Would this model be permitted under Guideline 3.1.4 (Hardware-Specific
Content), provided that the relevant functionality is dependent on the
physical OBD-II hardware?

We would appreciate your guidance before making changes to the app.
```

**Trạng thái tại thời điểm ghi chú (2026-08-19):** ASC đang ở
**"Waiting for Review"**, không sửa thêm được Notes/Resolution Center lúc
này. Khi khung phản hồi mở lại (Apple ra quyết định tiếp theo), gửi kèm luôn
phần xác nhận NFC ở §7.

## 4. Guideline 3.1.4 nói gì (nguyên văn từ developer.apple.com)

> **3.1.4 Hardware-Specific Content:** In limited circumstances, such as when
> features are dependent upon specific hardware to function, the app may
> unlock that functionality without using in-app purchase (e.g. an astronomy
> app that adds features when synced with a telescope). App features that
> work in combination with an approved physical product (such as a toy) on
> an *optional* basis may unlock functionality without using in-app
> purchase, provided that an in-app purchase option is available as well.
> You may not, however, require users to purchase unrelated products or
> engage in advertising or marketing activities to unlock app functionality.

Guideline có **2 nhánh**, khác điều kiện áp dụng:

| | Nhánh 1 — "dependent upon" | Nhánh 2 — "optional combination" |
|---|---|---|
| Ví dụ Apple | App thiên văn + kính viễn vọng | App + đồ chơi |
| Điều kiện | Tính năng không chạy nếu thiếu phần cứng | Tính năng dùng được không cần phần cứng, phần cứng chỉ tăng trải nghiệm |
| Bắt buộc có IAP song song? | Không | **Có** |

NoteDri rơi vào nhánh nào phụ thuộc **từng tính năng cụ thể** — xem audit ở
§6. Không phải toàn bộ "Premium" đủ điều kiện nhánh 1.

## 5. Nếu Apple duyệt 3.1.4 — checklist triển khai

1. **Backend:** thay `/premium/redeem` (cơ chế bị flagged) bằng endpoint
   riêng cho luồng bán-kèm-thiết-bị, ví dụ `POST /devices/activate` — chỉ
   chấp nhận khi request có bằng chứng vừa bắt tay ELM327 thật thành công
   (không chấp nhận gõ mã suông).
2. **Mã kích hoạt:** tự sinh (không lấy từ Konnwei — Konnwei xác nhận không
   có serial), in tem QR lên hộp lúc đóng gói, gắn với đơn hàng nội bộ
   (biết trước gói mấy tháng).
3. **App:** màn "Kích hoạt thiết bị" — nhập mã → chạy lại luồng kết nối OBD
   sẵn có (auto-connect bottom sheet, xem [[project_obd_autoconnect]]) → khi
   bắt tay ELM327 + đọc PID thành công, gọi API activate.
4. **Không dùng MAC Bluetooth làm định danh duy nhất** — xem §6b lý do.
5. **Android:** dùng chung 100% logic trên (không đụng Play Billing trong
   nhánh này).
6. Với nhóm tính năng KHÔNG hardware-dependent (§6): vẫn cần tích hợp IAP
   thật (RevenueCat/react-native-iap) — xem §6.

## 6. Audit tính năng Premium — hardware-dependent hay không

Rà toàn bộ code (2026-08-19) để biết chính xác phần nào của Premium đủ điều
kiện nhánh 1 (miễn IAP), phần nào bắt buộc vẫn cần IAP thật nếu Apple chỉ
duyệt phạm vi hẹp.

### Hardware-dependent (đủ điều kiện nhánh 1)

| Tính năng | File |
|---|---|
| Dashboard đồng hồ trực tiếp (tốc độ/RPM/nhiệt độ... real-time) | `src/screens/obd/OBDDashboardScreen.tsx` |
| Luồng kết nối OBD (purpose=trip) | `src/screens/obd/OBDSetupScreen.tsx` |
| Skin giao diện đồng hồ (Racing/Minimal/Retro/Night/Fleet) | `src/components/obd/dashboard/layouts/*.tsx`, `GaugeCluster.tsx`, `DashboardStylePicker.tsx` |
| Khoá thiết bị nội bộ (chỉ hoạt động khi có phiên sống) | `src/hooks/useObd.ts` (`claimDeviceLock`) |
| Xem PID/thông số kỹ thuật trực tiếp | `src/screens/obd/OBDTechnicalScreen.tsx` (không premium-exclusive, dùng chung với luồng free) |
| Tự động kết nối lại OBD nền | `src/components/ObdAutoConnect.tsx` |

### KHÔNG hardware-dependent (vẫn cần IAP thật nếu 3.1.4 bị scope hẹp)

| Tính năng | File |
|---|---|
| Báo cáo/lịch sử phiên OBD, biểu đồ xu hướng | `src/screens/obd/ObdReportScreen.tsx`, `ObdTrendChart.tsx`, `ObdSessionDetailScreen.tsx` (code có comment: "xem báo cáo không cần đang kết nối OBD") |
| Badge DTC cũ trên chi tiết xe | `src/screens/vehicles/VehicleDetailScreen.tsx` (`useObdDtcEvents`) |
| Báo cáo tài chính/TCO các năm cũ | `src/screens/reports/ReportsScreen.tsx` (`hasLockedYears`) |
| Thành tựu/huy hiệu | `src/screens/achievements/AchievementsScreen.tsx` |
| Cài đặt cảnh báo lái xe không an toàn | `src/screens/profile/NotificationSettingsScreen.tsx` |
| Giới hạn số nhắc bảo dưỡng | `src/screens/reminders/RemindersScreen.tsx` |
| Xuất dữ liệu tài khoản | `src/screens/profile/ExportDataScreen.tsx` |
| Trợ lý AI Nori | `src/store/noriAgentStore.ts`, `src/agent/*` |
| Tìm trạm xăng/sạc gần đây | `src/screens/refuels/AddRefuelScreen.tsx`, `src/api/nearby.ts` |
| Yêu cầu chuyển nhượng "sổ bảo dưỡng" | `src/screens/vehicles/VehicleTransferRequestsScreen.tsx`, `src/api/vehicleTransfer.ts` |
| Quyền lợi chung (không giới hạn số xe/lịch sử) | `src/screens/profile/PremiumScreen.tsx` |

**Ghi chú (`purpose='diagnostics'` free cho mọi tài khoản):** màn "Chẩn đoán xe"
(`ObdSystemHealthScreen`, live DTC scan) hoàn toàn miễn phí, không bị gate bởi
Premium — không nằm trong phạm vi audit này.

**Kết luận:** nếu Apple chỉ chấp nhận 3.1.4 cho đúng nhóm 1, phần lớn giá trị
hiện tại của gói Premium (báo cáo, AI, thành tựu...) vẫn cần một con đường
IAP thật song song — không né được hoàn toàn.

## 6b. Vì sao bỏ hướng "định danh thiết bị qua MAC Bluetooth"

Ý tưởng ban đầu (đề xuất bởi ChatGPT — GATT) là đọc địa chỉ MAC Bluetooth của
KW906 làm định danh duy nhất cho từng unit. Đã loại bỏ vì:

- **iOS không bao giờ lộ MAC thật cho app** — CoreBluetooth chỉ trả về
  `CBPeripheral.identifier`, một UUID giả sinh riêng theo từng
  app+máy+thiết bị, không portable.
- **Android tự thấy 2 giá trị khác nhau** cho cùng 1 chip, tuỳ kết nối qua
  Classic Bluetooth (SPP, dùng khi pair màn hình ô tô) hay qua BLE/GATT —
  nhiều chip dual-mode giá rẻ report khác nhau ở 2 tầng, hoặc tự đổi địa chỉ
  BLE ngẫu nhiên mỗi lần bật nguồn (Random Static/Private Address).

**Thay vào đó:** không cần định danh chính xác từng unit. Chỉ cần **bắt buộc
app hoàn thành 1 phiên bắt tay ELM327 thật + đọc được PID sống** trước khi
cho activate — vừa đủ chứng minh "phụ thuộc phần cứng" cho Apple, vừa chặn
được trường hợp share mã text cho người không có thiết bị. Không cần
GATT Device Information Service/serial number riêng (dù nếu Konnwei có hỗ
trợ characteristic ổn định qua UUID 0x180A/0x2A25, đó sẽ là lựa chọn mạnh
hơn — cần test bằng nRF Connect trên thiết bị thật khi có hàng, hiện chưa có
KW906 vật lý để test).

## 7. Nếu Apple từ chối 3.1.4 — phương án dự phòng: Offer Code

- **iOS:** tạo 3 sản phẩm subscription IAP thật (3/6/12 tháng) trên App Store
  Connect, sinh **Apple Offer Code** (Custom Code) miễn phí gắn với từng gói.
  In QR redeem trực tiếp lên hộp:
  `https://apps.apple.com/redeem?ctx=offercodes&id=<APP_ID>&code=<CODE>` —
  quét QR → App Store tự mở sẵn màn xác nhận → 1 chạm là kích hoạt, không
  cần mở app trước.
- **Android:** tương đương bằng Google Play Promo Codes cho subscription.
- **Chi phí:** redeem code miễn phí = giao dịch StoreKit 0đ → Apple không
  thu % (không có tiền chảy qua họ ở bước này). Chỉ khi khách tự chọn gia
  hạn trả tiền trong app sau khi hết hạn gói bundle, lúc đó mới phát sinh
  hoa hồng Apple như bình thường (nên đăng ký App Store Small Business
  Program nếu doanh thu <$1M/năm để hưởng mức 15%).
- **Không cần chờ Apple duyệt case-by-case** — đây là cơ chế Apple tự thiết
  kế sẵn cho đúng use case này, an toàn tuyệt đối về chính sách.

## 8. Guideline 2.1 (NFC) — đã xử lý

Code hiện tại (`withIosNfcDisabled.js`, `NfcService.ts:20-33`) đã chủ động gỡ
bỏ hoàn toàn quyền NFC khỏi bản iOS từ trước (do một lần bị từ chối trước đó
vì `react-native-nfc-manager` tự động chèn entitlement — lỗi ITMS-90778).
`isNfcSupported()` ép cứng `false` trên iOS. NFC chỉ là tính năng thật trên
Android (chạm thẻ để tự kết nối lại thiết bị OBD2 đã ghép nối trước đó, xem
`DeepLinkService.ts`).

Nội dung trả lời Apple khi khung phản hồi mở lại:

```
The NoteDri app does not use NFC on the iOS build. The NFC feature (tap a
tag to identify the vehicle) exists only on the Android build, as a
convenience to quickly reconnect to a previously-paired OBD2 Bluetooth
adapter. The iOS build does not declare any NFC entitlement or usage
string. No demo video is needed for this feature since it is not present
on iOS.
```

Trước khi gửi, kiểm tra lại: (1) bản build đã nộp thực sự sạch NFC entitlement
(`npx expo config --json --type introspect`), (2) mô tả/ảnh chụp App Store
Connect bản iOS không còn nhắc tới NFC.

## 9. Việc cần làm tiếp theo

- [ ] Chờ Apple trả lời câu hỏi 3.1.4 (§3) — theo dõi Resolution Center khi
      hết trạng thái "Waiting for Review".
- [ ] Gửi riêng xác nhận NFC (§8) ngay khi ASC cho phép thêm nội dung.
- [ ] Nếu duyệt: triển khai theo checklist §5, ưu tiên nhóm hardware-dependent
      trước (§6), tính phương án IAP cho nhóm còn lại nếu cần.
- [ ] Nếu từ chối: chuyển sang Offer Code (§7), có thể build song song ngay
      từ bây giờ vì không phụ thuộc câu trả lời và không tốn chi phí.
- [ ] Dọn App Store Connect: xoá các IAP product draft dở dang (nguyên nhân
      lỗi 2.1(b)) trước khi nộp bản kế tiếp.
