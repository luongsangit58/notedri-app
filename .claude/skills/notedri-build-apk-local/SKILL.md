---
name: notedri-build-apk-local
description: 'Build an installable Android APK for notedri-app entirely on this machine (Gradle, no EAS cloud build/quota). Use when the user asks to "build APK", "build APK local", or wants a fresh installable build of the NoteDri app without going through EAS cloud.'
---

# NoteDri - Build APK Local

## Vì sao dùng cách này thay vì `eas build`

`eas build --local` **không hỗ trợ Windows** (chỉ macOS/Linux) - dừng ngay với lỗi
"Unsupported platform". `eas build` (cloud) thì phụ thuộc hạn mức build miễn phí
của tài khoản Expo (`luongsangit58`), hết hạn mức là phải chờ reset hàng tháng
hoặc nâng cấp gói trả phí. Cách trong skill này gọi thẳng Gradle - luôn dùng được
trên Windows, không tốn hạn mức cloud, ra APK sau vài phút.

## Điều kiện cần có sẵn trên máy (đã xác nhận có trên máy này)

- Java 17 (Temurin): `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`
- Android SDK của đúng user đang chạy: `C:\Users\PC\AppData\Local\Android\Sdk`
  (⚠ biến môi trường `$ANDROID_HOME` mặc định của shell trỏ SAI sang
  `C:\Users\Sang\AppData\Local\Android\Sdk` - phải override thủ công mỗi lần,
  đừng tin giá trị mặc định).

## Các bước (chạy trong Git Bash, từ `notedri-app/`)

1. **Đồng bộ lại thư mục `android/`** theo `app.json`/config plugin hiện tại
   (an toàn, có thể chạy lại nhiều lần - `android/` đã nằm trong `.gitignore`,
   là thư mục build tự sinh chứ không phải mã nguồn):

   ```bash
   cd /c/laragon/www/notedri-app
   npx expo prebuild --platform android --no-install
   ```

2. **Build APK** (khớp đúng profile `preview` trong `eas.json`: `buildType: "apk"`,
   `gradleCommand: ":app:assembleRelease"`) - chạy NỀN (`run_in_background: true`),
   thường mất 3-10 phút tuỳ máy còn cache Gradle hay không:

   ```bash
   cd /c/laragon/www/notedri-app/android
   export ANDROID_HOME=/c/Users/PC/AppData/Local/Android/Sdk
   export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
   ./gradlew.bat :app:assembleRelease --console=plain
   ```

3. **APK ra ở**: `notedri-app/android/app/build/outputs/apk/release/app-release.apk`

   Xác nhận file tồn tại + báo đường dẫn cho user, ví dụ:
   ```bash
   ls -la /c/laragon/www/notedri-app/android/app/build/outputs/apk/release/
   ```

## Nếu bước 2 lỗi vì thiếu chữ ký release (signing)

Build cloud EAS dùng keystore quản lý từ xa trên server Expo - build local
KHÔNG truy cập được keystore đó. Nếu Gradle báo lỗi liên quan `signingConfig`/
`keystore` không tìm thấy, đừng cố tự tạo keystore release mới (sẽ tạo ra APK
ký khác chữ ký với bản Play Store/bản EAS cũ, cài đè lên máy đã có bản cũ sẽ
báo lỗi "conflict xung đột chữ ký" và phải gỡ cài đặt trước). Thay vào đó build
bản debug (ký bằng debug keystore mặc định, luôn có sẵn, cài chồng lên bản cũ
không gặp lỗi xung đột chữ ký, đủ dùng để test tính năng dù không tối ưu/minify
như release):

```bash
./gradlew.bat :app:assembleDebug --console=plain
```
APK ra ở `android/app/build/outputs/apk/debug/app-debug.apk`.

## Sau khi có APK

Hỏi user có muốn gửi file trực tiếp hay chỉ cần biết đường dẫn - APK là file
nhị phân, không tự ý tải lên/chia sẻ ra ngoài máy khi chưa được yêu cầu.
