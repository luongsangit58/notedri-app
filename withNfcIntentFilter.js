const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// Chạm thẻ NFC dùng action riêng android.nfc.action.NDEF_DISCOVERED (KHÔNG phải
// android.intent.action.VIEW dùng cho click link/App Link) - thiếu filter này thì
// Android không coi app là ứng viên xử lý tag, rơi về hộp thoại chọn app chung.
//
// KHÔNG khai qua app.json "android.intentFilters": plugin có sẵn của Expo
// (@expo/config-plugins IntentFilters.js) LUÔN tự thêm tiền tố
// "android.intent.action." vào action, biến "android.nfc.action.NDEF_DISCOVERED"
// thành chuỗi vô nghĩa "android.intent.action.android.nfc.action.NDEF_DISCOVERED"
// mỗi lần `expo prebuild` chạy lại - filter bị mất mà không có lỗi/cảnh báo gì.
const NFC_DATA = { scheme: 'https', host: 'notedri.com', pathPrefix: '/connect' };

module.exports = function withNfcIntentFilter(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    const alreadyPresent = mainActivity['intent-filter'].some(
      (f) => f.action?.[0]?.$?.['android:name'] === 'android.nfc.action.NDEF_DISCOVERED'
    );
    if (!alreadyPresent) {
      mainActivity['intent-filter'].push({
        $: {},
        action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [
          {
            $: {
              'android:scheme': NFC_DATA.scheme,
              'android:host': NFC_DATA.host,
              'android:pathPrefix': NFC_DATA.pathPrefix,
            },
          },
        ],
      });
    }

    return config;
  });
};
