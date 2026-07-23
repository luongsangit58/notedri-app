# Build Android trên Windows (không qua EAS Cloud)

## Vì sao build kiểu này

`eas build --local` **không hỗ trợ Windows** (chỉ macOS/Linux) - dừng ngay với lỗi
"Unsupported platform". `eas build` (cloud) thì phụ thuộc hạn mức build miễn phí
của tài khoản Expo, hết hạn mức phải chờ reset hàng tháng hoặc trả phí. Cách
trong file này gọi thẳng Gradle - luôn dùng được trên Windows, không tốn hạn
mức cloud, ra APK/AAB sau vài phút.

## Điều kiện cần có sẵn trên máy

- **Java 17 (Temurin)**: `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`
- **Android SDK** của đúng user đang chạy: `C:\Users\<user>\AppData\Local\Android\Sdk`

  ⚠ Biến môi trường `$ANDROID_HOME` mặc định của shell có thể trỏ sai sang thư
  mục của user khác trên cùng máy (đã gặp thật: mặc định trỏ `C:\Users\Sang\...`
  dù đang chạy trên máy `PC`) - luôn override thủ công bằng `export ANDROID_HOME=...`
  ở mỗi phiên terminal mới, đừng tin giá trị mặc định.

- **Khoá ký release thật** (để tải lên Play Console, không phải khoá debug):
  - `credentials.json` (gốc project) - chứa đường dẫn keystore + mật khẩu.
  - `credentials/android/keystore.jks` - file keystore thật.

  Cả 2 file đều bị `.gitignore` (không có trong repo) - phải copy thủ công từ
  máy/nguồn lưu trữ khác vào đúng vị trí trên máy build trước khi build release.
  **Thiếu 2 file này app vẫn build được nhưng sẽ ký nhầm bằng `debug.keystore`**
  (xem mục "Ký sai khoá" bên dưới) - Play Console sẽ từ chối bản tải lên.

## Các bước (chạy trong Git Bash, từ `notedri-app/`)

```bash
cd /c/laragon/www/notedri-app

# 1. Đồng bộ lại thư mục android/ theo app.json/config plugin hiện tại (an
#    toàn, chạy lại nhiều lần được - android/ đã gitignore, tự sinh lại mỗi
#    lần). Bước này CŨNG tự nối đúng khoá ký release nếu có credentials.json
#    (xem withAndroidReleaseSigning.js).
npx expo prebuild --platform android --no-install

# 2. Build - chỉnh ANDROID_HOME/JAVA_HOME đúng máy trước khi chạy
cd android
export ANDROID_HOME=/c/Users/PC/AppData/Local/Android/Sdk
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"

# APK (cài trực tiếp lên máy/đầu Android để test)
./gradlew.bat :app:assembleRelease --console=plain

# AAB (nộp lên Play Console) - build cả 2 cùng lúc cũng được:
# ./gradlew.bat :app:bundleRelease :app:assembleRelease --console=plain
./gradlew.bat :app:bundleRelease --console=plain
```

Build mất khoảng 5-8 phút (lâu hơn nếu chưa có cache Gradle từ lần trước).

## File ra

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

## Tăng versionCode trước khi build bản phát hành

Play Console yêu cầu `versionCode` tăng dần mỗi lần tải lên - sửa TRƯỚC bước
`expo prebuild` ở trên:

```json
// app.json
"android": {
  "versionCode": 36   // tăng thêm 1 so với lần trước, giữ nguyên versionName
}
```

## Xác nhận đã ký đúng khoá thật (nên làm trước khi nộp Play Console)

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
"$JAVA_HOME/bin/keytool" -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab | grep SHA1
```

So khớp dòng `SHA1:` in ra với vân tay khoá release thật (xem trong Play
Console → Phát hành → Tính toàn vẹn ứng dụng, hoặc hỏi người quản lý khoá).

## Sự cố thường gặp

### Ký sai khoá (Play Console báo "sai vân tay chữ ký")

Đã xảy ra thật: build.gradle mặc định của template React Native/Expo ký CẢ
buildType `release` bằng chính `debug.keystore` nếu không tìm thấy cấu hình
khoá release riêng. Nguyên nhân luôn là 1 trong 2:
- Máy build **thiếu** `credentials.json`/`credentials/android/keystore.jks` -
  copy 2 file này vào đúng vị trí rồi `expo prebuild` lại.
- Đã sửa tay `android/app/build.gradle` hoặc thư mục `android/` cũ còn sót lại
  từ trước khi có `withAndroidReleaseSigning.js` - xoá `android/` rồi
  `npx expo prebuild --platform android --clean --no-install` để sinh sạch lại.

**Không tự tạo keystore release mới** để "chữa cháy" - APK/AAB ký bằng keystore
khác sẽ không cài đè lên được bản đã phát hành trước đó (và Play Console cũng
từ chối thẳng vì không khớp khoá đã đăng ký).

### Chỉ cần build nhanh để test, không cần ký đúng khoá release

Build bản debug (ký bằng debug keystore mặc định, luôn có sẵn, cài chồng lên
bản cũ không lỗi xung đột chữ ký, đủ dùng để test tính năng dù không tối
ưu/minify như release):

```bash
./gradlew.bat :app:assembleDebug --console=plain
```
APK ra ở `android/app/build/outputs/apk/debug/app-debug.apk`.

### `ANDROID_HOME` sai

Nếu Gradle báo không tìm thấy SDK/build-tools, kiểm tra lại `echo $ANDROID_HOME`
đang trỏ đúng thư mục Android SDK của **user đang chạy terminal**, không phải
giá trị mặc định của hệ thống (xem cảnh báo ở mục "Điều kiện cần có sẵn").
