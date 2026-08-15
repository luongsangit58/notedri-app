# iOS Release Checklist — NoteDri

Theo dõi tiến độ đưa app lên App Store. Cập nhật trạng thái từng bước khi hoàn thành.

## 1. Chuẩn bị tài khoản Apple Developer
- [x] Thanh toán Apple Developer Program, nhận email xác nhận
- [x] Truy cập App Store Connect
- [x] Đăng nhập EAS CLI (`luongsangit58@gmail.com`)

## 2. Setup build môi trường dev
- [x] Đăng ký UDID iPhone XS qua `eas device:create` (Website flow, quét QR)
- [x] `eas build:configure` — cấu hình iOS, đăng nhập Apple account, tạo Distribution Certificate qua EAS
- [x] Thêm `expo-build-properties`, set `deploymentTarget: "16.0"` (fix lỗi `RNMLKitTextRecognition` cần deployment target cao hơn)
- [ ] Build development client thành công (`eas build --platform ios --profile development`)
- [ ] Cài dev client lên iPhone XS (qua link/QR sau khi build xong, trust certificate trong Settings)
- [ ] Chạy `npx expo start --dev-client`, kết nối thành công từ iPhone XS

## 3. Test trên máy thật (iPhone XS)
- [ ] Kết nối Bluetooth OBD2 adapter
- [ ] NFC quẹt thẻ nhận diện xe
- [ ] Định vị nền (ghi hành trình khi app đóng)
- [ ] Camera + nhận diện text (đọc ODO / hóa đơn xăng — ML Kit)
- [ ] Nhận dạng giọng nói (đọc số ODO/tiền)
- [ ] Quảng cáo AdMob hiển thị đúng
- [ ] Đăng nhập Google / Sign in with Apple
- [ ] Permission dialogs hiện đúng tiếng Việt, đúng thời điểm

## 4. Build bản preview/internal (tuỳ chọn, mời người khác test không qua TestFlight)
- [ ] Thêm profile iOS cho `preview` trong `eas.json`
- [ ] Build & cài thử qua link ad-hoc

## 5. Chuẩn bị metadata App Store Connect
- [ ] Mô tả app (tiếng Việt + tiếng Anh)
- [ ] Ảnh chụp màn hình (đủ kích thước theo yêu cầu Apple)
- [ ] Icon app (đã có `assets/icon.png` — kiểm tra đúng size 1024x1024)
- [ ] Privacy Policy URL
- [ ] Category, age rating
- [ ] Ký Paid Applications Agreement (nếu có in-app purchase/quảng cáo trả phí)
- [ ] Thông tin thuế/ngân hàng (nếu cần)

## 6. Build & submit production
- [ ] `eas build --platform ios --profile production`
- [ ] `eas submit --platform ios --latest`
- [ ] Thêm tester vào TestFlight (email nội bộ)
- [ ] Test bản TestFlight trên iPhone XS
- [ ] Submit for App Review trên App Store Connect
- [ ] App được duyệt (thường 1-3 ngày)

---

## Ghi chú / vấn đề gặp phải
- Build iOS **không thể chạy local trên Windows** — bắt buộc dùng EAS cloud build (cần máy Mac mới build local được).
- `asccli.sh` (asc) chỉ là CLI quản lý App Store Connect, không thay thế được Xcode/build — vẫn cần Mac, không dùng được cho vấn đề build trên Windows.
- Lần build đầu lỗi `EAS_BUILD_HIGHER_MINIMUM_DEPLOYMENT_TARGET_ERROR` do pod `RNMLKitTextRecognition` cần deployment target cao hơn mặc định → fix bằng `expo-build-properties` set `16.0`.
