const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// PiP (Picture-in-Picture) cho màn "Đồng hồ" OBD2 (Android) - Activity phải tự
// khai android:supportsPictureInPicture, KHÔNG có cách nào bật qua app.json
// "android.*" thường (không phải key Expo hỗ trợ sẵn), phải tự sửa manifest
// qua plugin giống withNfcIntentFilter.js/withOptionalHardwareFeatures.js.
//
// android:resizeableActivity bắt buộc phải true để vào được PiP (Android yêu
// cầu). configChanges cần thêm "smallestScreenSize" (Expo đã tự set sẵn phần
// còn lại: keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|
// locale|layoutDirection) - thiếu cờ này Activity bị RESTART khi khung PiP đổi
// kích thước, mất trạng thái kết nối OBD đang chạy giữa chừng.
const REQUIRED_CONFIG_CHANGES = ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation'];

function mergeConfigChanges(existing) {
  const parts = (existing || '').split('|').map((s) => s.trim()).filter(Boolean);
  for (const flag of REQUIRED_CONFIG_CHANGES) {
    if (!parts.includes(flag)) parts.push(flag);
  }
  return parts.join('|');
}

module.exports = function withPictureInPicture(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    mainActivity.$['android:configChanges'] = mergeConfigChanges(mainActivity.$['android:configChanges']);
    return config;
  });
};
