const fs = require('fs');
const path = require('path');
const { withAppBuildGradle } = require('@expo/config-plugins');

// Rà soát 23/7 (Play Console từ chối app-release.aab: "sai vân tay chữ ký" -
// SHA1 thật E7:C3:62:65:... nhưng bản tải lên là 5E:8F:16:06:...) - nguyên
// nhân: build.gradle mặc định của template React Native/Expo ký CẢ buildType
// "release" bằng chính debug.keystore (`signingConfig signingConfigs.debug`)
// nếu không có cấu hình riêng. `eas build --local`/EAS Cloud tự nối keystore
// thật vào bước build, nhưng ở đây gọi thẳng `gradlew.bat` (bắt buộc trên
// Windows - xem notedri-build-apk-local skill) nên bỏ qua bước đó, ký nhầm
// khoá debug suốt từ trước tới giờ mà không có cảnh báo gì lúc build.
//
// Đọc credentials.json TẠI THỜI ĐIỂM PREBUILD (không hardcode mật khẩu vào
// file này - credentials.json đã bị .gitignore, không commit). Máy dev khác
// chưa có file này thì bỏ qua, build vẫn chạy được (rơi về ký debug như cũ,
// không throw) - chỉ máy có credentials.json (dùng để phát hành thật) mới ký
// đúng khoá release.
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const credentialsPath = path.join(projectRoot, 'credentials.json');
    if (!fs.existsSync(credentialsPath)) return config;

    let creds;
    try {
      creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))?.android?.keystore;
    } catch (_e) {
      return config;
    }
    if (!creds?.keystorePath || !creds.keystorePassword || !creds.keyAlias || !creds.keyPassword) {
      return config;
    }

    // storeFile trong Gradle được tính từ thư mục android/app/, không phải
    // gốc project - phải tự quy đổi đường dẫn tương đối, không dùng thẳng
    // keystorePath (vốn tương đối với gốc project trong credentials.json).
    const keystoreAbsPath = path.join(projectRoot, creds.keystorePath);
    const relFromAppDir = path.relative(path.join(projectRoot, 'android', 'app'), keystoreAbsPath).split(path.sep).join('/');

    let contents = config.modResults.contents;

    contents = contents.replace(
      /signingConfigs\s*\{/,
      (m) => `${m}\n        release {\n            storeFile file('${relFromAppDir}')\n            storePassword '${creds.keystorePassword}'\n            keyAlias '${creds.keyAlias}'\n            keyPassword '${creds.keyPassword}'\n        }`,
    );

    // Chỉ đổi ĐÚNG signingConfig của buildType "release" (không đụng buildType
    // "debug" - cũng có dòng "signingConfig signingConfigs.debug" giống hệt) -
    // neo vào 2 dòng comment "Caution!..." chỉ xuất hiện 1 lần, ngay trước
    // dòng cần sửa trong template gốc.
    contents = contents.replace(
      /(\/\/ Caution! In production, you need to generate your own keystore file\.[\s\S]*?signingConfig signingConfigs\.)debug/,
      '$1release',
    );

    config.modResults.contents = contents;
    return config;
  });
};
