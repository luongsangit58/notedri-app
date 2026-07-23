const { withAndroidManifest, withMainActivity, AndroidConfig, CodeGenerator } = require('@expo/config-plugins');

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

// Rà soát (build thật 23/7): ReactActivityLifecycleListener của bản
// expo-modules-core đang dùng KHÔNG có hook onPictureInPictureModeChanged
// ("overrides nothing" lúc biên dịch Kotlin) - phải tự chèn thẳng override
// vào MainActivity.kt SINH RA (không phải sửa tay 1 lần, plugin này tự chèn
// lại mỗi lần `expo prebuild` nên vẫn an toàn với CNG). mergeContents dùng
// marker comment nên chạy lại nhiều lần không bị chèn trùng.
function withPipMainActivity(config) {
  return withMainActivity(config, (config) => {
    const { contents } = CodeGenerator.mergeContents({
      src: config.modResults.contents,
      newSrc: [
        '  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {',
        '    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)',
        '    expo.modules.notedripip.NotedriPipModule.notifyPipModeChanged(isInPictureInPictureMode)',
        '  }',
      ].join('\n'),
      tag: 'notedri-pip-onPictureInPictureModeChanged',
      anchor: /class MainActivity\s*:\s*ReactActivity\(\)\s*\{/,
      offset: 1,
      comment: '//',
    });
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withPictureInPicture(config) {
  config = withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    mainActivity.$['android:configChanges'] = mergeConfigChanges(mainActivity.$['android:configChanges']);
    return config;
  });
  config = withPipMainActivity(config);
  return config;
};
