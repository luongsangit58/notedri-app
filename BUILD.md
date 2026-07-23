# Build APK / AAB — notedri-app

Hướng dẫn build file cài đặt Android cho notedri-app (`com.notedri`) để test hoặc nộp lên Google Play, build ngay trên máy (không qua cloud EAS).

## Yêu cầu máy đã cài sẵn

- Node.js (qua nvm) + Java JDK 17 + Android SDK (platform-tools, build-tools, platforms)
- Nếu mở terminal mới chưa thấy lệnh `node`/`adb`, chạy: `source ~/.bashrc`
- **RAM**: build native (NDK, biên dịch 4 kiến trúc CPU song song) khá ngốn RAM + có thể làm máy lag/swap
  đầy trong lúc build (đã từng thấy swap full 4/4GB). Đóng bớt Chrome/VSCode nếu máy lag quá trong lúc build.
  Không ảnh hưởng tới kết quả, chỉ là trải nghiệm dùng máy lúc đó chậm hơn.
- Build lần đầu mất **~20 phút** (biên dịch native code + tải Gradle/NDK dependencies lần đầu), các lần sau nhanh hơn nhờ cache `~/.gradle`.

## 1. Đăng nhập EAS (chỉ cần làm 1 lần / khi hết hạn)

```bash
cd /home/sangnl/Downloads/TMP/notedri-app
npx eas-cli login
npx eas-cli whoami          # xác nhận đúng tài khoản
```

## 2. ⚠️ Kiểm tra keystore trước khi build production

Project đã publish lên Google Play và dùng **Google Play App Signing**. Chỉ được ký bằng đúng **upload key** đang khớp với Play Console, dùng nhầm keystore sẽ bị Play Store từ chối bản cập nhật.

Keystore đúng hiện tại (đã xác nhận khớp Play Console lúc thiết lập máy này):

- **Build Credentials**: `F7ChYGg5So` **(Default)**
- SHA-1: `E7:C3:62:65:6A:94:40:6E:75:0E:01:EB:A5:43:C2:FC:8D:59:FA:D4`

Kiểm tra lại bất cứ khi nào nghi ngờ:

```bash
npx eas-cli credentials
# chọn: Android → production → Keystore: Manage everything needed to build your project
# so SHA-1 với Play Console: Kiểm thử và phát hành > Được bảo vệ bằng Play >
#   Dịch vụ bảo vệ của Cửa hàng Play > Bảo vệ khoá ký ứng dụng > "Chứng chỉ khoá tải lên"
```

**Không bao giờ chọn "Generate new keystore"** khi được hỏi trong lúc build, trừ khi chắc chắn đây là app hoàn toàn mới chưa từng publish.

## 3. Build APK (test / internal testing)

**Khuyến nghị** — dùng script `scripts/build-local.sh`, tự động dừng Gradle daemon cũ (giải
phóng RAM còn giữ từ lần build trước) + giới hạn build 1 kiến trúc CPU (`arm64-v8a`, hầu hết
điện thoại Android đời 2018+ đều dùng) + giới hạn RAM/số worker Gradle, giúp máy đỡ lag/treo
lúc build:

```bash
npm run build:apk
```

Cách thường (nếu muốn build đủ 4 kiến trúc CPU hoặc máy còn nhiều RAM rảnh):

```bash
npx eas-cli build --platform android --profile preview --local
```

- Khi được hỏi credentials → chọn dùng keystore hiện có (Default `F7ChYGg5So`)
- `eas build --local` build trong thư mục tạm (`/tmp/...`, tự xoá sau khi xong), **không phải** trong
  `notedri-app/android/` — file kết quả được copy về thư mục gốc project với tên
  **`notedri-app/build-<timestamp>.apk`**

## 4. Build AAB (nộp lên Google Play)

**Khuyến nghị** — cũng dùng script `scripts/build-local.sh`, tự động dừng Gradle daemon cũ +
giới hạn RAM/số worker Gradle. **Không** giới hạn kiến trúc CPU như build APK ở bước 3: AAB nộp
Google Play bắt buộc phải chứa đủ cả 4 ABI (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) để
Play Store tự tách APK phù hợp cho từng thiết bị người dùng — thiếu ABI sẽ khiến một số máy
Android cũ/x86 không cài được app. Script đã tự xử lý đúng việc này theo profile:

```bash
npm run build:aab
```

Cách thường (nếu máy còn nhiều RAM rảnh):

```bash
npx eas-cli build --platform android --profile production --local
```

- File kết quả: **`notedri-app/build-<timestamp>.aab`** (ví dụ đã build thành công: `build-1784177961585.aab`, ~90MB)
- Vì build đủ 4 ABI nên tốn RAM/CPU và mất thời gian hơn build APK (bước 3) đáng kể — đóng
  hết Chrome/VSCode trước khi chạy và kiên nhẫn chờ.

### Kiểm tra lại chữ ký sau khi build (khuyến nghị, đặc biệt lần đầu trên máy mới)

```bash
unzip -p build-<timestamp>.aab META-INF/*.RSA | keytool -printcert | grep SHA1
# Phải khớp đúng: E7:C3:62:65:6A:94:40:6E:75:0E:01:EB:A5:43:C2:FC:8D:59:FA:D4
```

## 5. Nộp lên Play Console

Vào Play Console → app **NoteDri** → **Kiểm thử và phát hành → Phát hành công khai** (hoặc kênh test phù hợp: alpha/internal) → tạo bản phát hành mới → tải file `.aab` ở bước 4 lên.

## Lưu ý

- Lần build đầu tiên khá lâu vì Gradle phải tải dependencies.
- Nếu `npx eas-cli` báo lỗi thiếu Android SDK/Java, kiểm tra lại `echo $ANDROID_SDK_ROOT` và `java -version`.
- Số hiệu build (`versionCode`) tăng dần theo cấu hình `autoIncrement: true` trong `eas.json` (profile production) — không cần tự tay sửa `app.json`.
- Tài khoản `luongsangit58` dùng gói **Free** của EAS: build cloud (`eas build` không có `--local`)
  bị giới hạn số lượng build Android/tháng, hết hạn mức sẽ báo lỗi "This account has used its
  Android builds from the Free plan this month" và phải đợi reset đầu tháng sau (hoặc nâng cấp gói
  trả phí). Vì vậy quy trình trong file này luôn dùng `--local` để build ngay trên máy, không phụ
  thuộc hạn mức cloud.
