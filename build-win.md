# Build Android trên Windows (không qua EAS Cloud)

`eas build --local` không hỗ trợ Windows, `eas build` cloud thì tốn hạn mức -
gọi thẳng Gradle luôn dùng được, không tốn hạn mức, ra APK/AAB sau vài phút.

## Điều kiện cần có sẵn

- Java 17: `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot`
- Android SDK đúng user đang chạy: `C:\Users\PC\AppData\Local\Android\Sdk`
  (⚠ `$ANDROID_HOME` mặc định có thể trỏ sai sang user khác - luôn `export` tay)
- `credentials.json` + `credentials/android/keystore.jks` ở gốc project (gitignore,
  copy tay từ nơi lưu trữ) - **thiếu 2 file này sẽ ký nhầm debug keystore**,
  Play Console từ chối bản tải lên.

## Mỗi lần build release (APK + AAB)

```bash
cd /c/laragon/www/notedri-app

# 1. Tăng versionCode trong app.json TRƯỚC (Play Console yêu cầu tăng dần mỗi lần)
#    "android": { "versionCode": <số cũ + 1> }

# 2. Sync lại android/ theo app.json/config plugin hiện tại (an toàn chạy lại nhiều
#    lần, tự nối khoá release nếu có credentials.json)
npx expo prebuild --platform android --no-install

# 3. Build
cd android
export ANDROID_HOME=/c/Users/PC/AppData/Local/Android/Sdk
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
./gradlew.bat :app:assembleRelease :app:bundleRelease --console=plain
```

Mất ~5-8 phút (lâu hơn nếu chưa có cache Gradle).

**File ra:**
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

## Xác nhận đã ký đúng khoá thật (trước khi nộp Play Console)

```bash
"$JAVA_HOME/bin/keytool" -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab | grep SHA1
```
So khớp `SHA1:` với vân tay khoá thật trong Play Console → Phát hành → Tính toàn vẹn ứng dụng.

## Sự cố thường gặp

- **Ký sai khoá** ("sai vân tay chữ ký" trên Play Console): thiếu
  `credentials.json`/keystore.jks, hoặc `android/` cũ còn sót từ trước khi có
  `withAndroidReleaseSigning.js` → xoá `android/` rồi
  `npx expo prebuild --platform android --clean --no-install`. Không tự tạo
  keystore mới để chữa cháy - sẽ không cài đè được bản đã phát hành.
- **Chỉ cần build nhanh để test** (không cần đúng khoá release):
  `./gradlew.bat :app:assembleDebug --console=plain` →
  `android/app/build/outputs/apk/debug/app-debug.apk`
- **`ANDROID_HOME` sai**: kiểm tra `echo $ANDROID_HOME` trỏ đúng SDK của user
  đang chạy terminal, không phải giá trị mặc định hệ thống.
- **Play Console báo "Mã phiên bản X đã được sử dụng"** dù `app.json` đã tăng
  đúng số: `android/` là thư mục tự sinh, KHÔNG tự cập nhật theo `app.json` -
  nếu build ngay sau khi sửa `versionCode` mà QUÊN chạy lại bước 2
  (`expo prebuild`), Gradle vẫn build với version cũ còn nằm trong
  `android/app/build.gradle`. Kiểm tra nhanh trước khi build:
  `grep versionCode android/app/build.gradle` - phải khớp số trong `app.json`,
  không khớp thì chạy lại bước 2 rồi build lại.
- **Build lỗi `FileSystemException: ... intermediary-bundle.aab: đang được
  process khác sử dụng`**: có 2 lệnh `gradlew` chạy song song cùng lúc (vd
  build cũ ở cửa sổ terminal khác chưa xong đã chạy build mới) - cùng ghi vào
  chung `android/app/build/...` nên đụng nhau. Đóng hết terminal đang build dở
  rồi `./gradlew.bat --stop` để tắt sạch daemon treo, sau đó build lại.
