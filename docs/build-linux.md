# Build APK/AAB local trên Linux

Build thẳng qua Gradle trên máy Linux, không qua `eas build` cloud (không tốn hạn mức
build miễn phí của tài khoản Expo, không cần chờ EAS). Tương đương bản hướng dẫn cho
Windows (skill `notedri-build-apk-local`) nhưng lệnh khác vì Linux dùng `./gradlew`
(không có đuôi `.bat`).

## Điều kiện cần có trên máy

- Java 17 (`java -version`)
- Android SDK, biến `ANDROID_HOME` trỏ đúng thư mục SDK (ví dụ `~/Android/Sdk`)
- Đã đăng nhập `eas-cli` (`npx eas-cli whoami`) — cần để lấy keystore thật lần đầu

## Bước 1 (chỉ làm 1 lần/máy) — lấy keystore release thật

Release build **phải** ký bằng đúng keystore đã đăng ký với Google Play + Google
Sign-In (SHA-1 `E7:C3:62:65:6A:94:40:6E:75:0E:01:EB:A5:43:C2:FC:8D:59:FA:D4`, build
credentials `F7ChYGg5So` trên EAS) - build bằng keystore khác thì:
- Cài đè lên máy đã có bản cũ sẽ báo lỗi xung đột chữ ký, phải gỡ cài đặt trước.
- Google/Apple Sign-In sẽ lỗi vì SHA-1 không khớp OAuth Client đã đăng ký trên Google
  Cloud Console.

Lấy keystore thật về máy:

```bash
npx eas-cli credentials
# Chọn Android -> chọn profile preview -> chọn "credentials.json: Upload/Download..."
# -> chọn "Download credentials from EAS to credentials.json"
# -> chọn build credentials "F7ChYGg5So (Default)"
```

Lệnh trên tạo ra `credentials.json` (đã gitignore) + `credentials/android/keystore.jks`
(đã gitignore) ở gốc repo. Sau đó tạo `keystore.properties` ở gốc repo (cũng đã
gitignore) từ 2 file đó - `build.gradle` đọc file này để ký release đúng khoá thật
(xem comment đầu `android/app/build.gradle`, biến `keystorePropertiesFile`):

```bash
python3 -c "
import json
with open('credentials.json') as f:
    d = json.load(f)
a = d['android']['keystore']
with open('keystore.properties', 'w') as f:
    f.write('storeFile=../credentials/android/keystore.jks\n')
    f.write('storePassword=' + a['keystorePassword'] + '\n')
    f.write('keyAlias=' + a['keyAlias'] + '\n')
    f.write('keyPassword=' + a['keyPassword'] + '\n')
"
```

`keystore.properties` + `credentials/` sống ở gốc repo (không phải trong `android/`)
vì `expo prebuild --clean` xoá/tái tạo `android/` mỗi lần, còn gốc repo thì không -
làm 1 lần, giữ nguyên cho mọi lần build sau, không cần lặp lại Bước 1.

## Bước 2 — đồng bộ `android/` theo `app.json`/config plugin hiện tại

An toàn để chạy lại nhiều lần (`android/` đã gitignore, là thư mục build tự sinh):

```bash
npx expo prebuild --platform android --no-install
```

## Bước 3a — Build APK (cài trực tiếp lên máy test)

```bash
cd android
ANDROID_HOME=~/Android/Sdk ./gradlew :app:assembleRelease --console=plain
```

APK ra ở `android/app/build/outputs/apk/release/app-release.apk`.

## Bước 3b — Build AAB (nộp lên Play Console)

```bash
cd android
ANDROID_HOME=~/Android/Sdk ./gradlew :app:bundleRelease --console=plain
```

AAB ra ở `android/app/build/outputs/bundle/release/app-release.aab`.

## Xác nhận APK ký đúng khoá thật (khuyên làm sau mỗi lần build)

```bash
ANDROID_HOME=~/Android/Sdk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk | grep SHA-1
```

Phải ra đúng `e7c362656a94406e750e01eba543c2fc8d59fad4`. Nếu ra SHA-1 khác (thường là
SHA-1 của `debug.keystore`) - nghĩa là `keystore.properties` ở gốc repo bị thiếu hoặc
sai đường dẫn, kiểm tra lại Bước 1.

## Nếu chưa muốn lấy keystore thật (chỉ test nhanh, không đụng Google/Apple Sign-In)

Build debug (ký bằng debug keystore tự sinh, không cần `keystore.properties`):

```bash
cd android
ANDROID_HOME=~/Android/Sdk ./gradlew :app:assembleDebug --console=plain
```

APK ra ở `android/app/build/outputs/apk/debug/app-debug.apk`. Bản này **không** test
được Google/Apple Sign-In (SHA-1 của debug keystore chưa đăng ký ở đâu cả) - chỉ dùng
để test các tính năng khác.
