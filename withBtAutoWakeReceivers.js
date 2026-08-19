const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// Rà soát 19/8: receiver native cho tính năng "tự thức app khi Bluetooth kết
// nối lại KW906" (không cần mở app tay/chạm NFC) - xem AclConnectedReceiver.kt/
// BleScanResultReceiver.kt/BootCompletedReceiver.kt trong modules/notedri-bt-pairing.
// android/ không được commit (Continuous Native Generation, xem .gitignore)
// nên PHẢI qua config plugin, không sửa tay AndroidManifest.xml sinh ra được -
// cùng lý do withNfcIntentFilter.js đã làm trước đó.
const RECEIVERS = [
  {
    // ACTION_ACL_CONNECTED nằm trong danh sách broadcast được Android miễn
    // trừ giới hạn broadcast ngầm định (protected, chỉ hệ thống gửi được) -
    // receiver khai báo tĩnh vẫn nhận được dù app đã bị kill hẳn.
    name: 'expo.modules.notedribtpairing.AclConnectedReceiver',
    actions: ['android.bluetooth.device.action.ACL_CONNECTED'],
  },
  {
    // Cùng lý do miễn trừ như trên - dùng để tự đăng ký lại BLE PendingIntent
    // scan sau khi máy khởi động lại (đăng ký cũ không sống sót qua reboot).
    name: 'expo.modules.notedribtpairing.BootCompletedReceiver',
    actions: ['android.intent.action.BOOT_COMPLETED'],
  },
  {
    // Đích của BLE scan PendingIntent (BleAutoWakeScanner) - nhắm THẲNG vào
    // component này (explicit intent), không cần intent-filter theo action,
    // nhưng vẫn phải khai báo <receiver> để hệ thống biết class này tồn tại
    // khi app chưa chạy.
    name: 'expo.modules.notedribtpairing.BleScanResultReceiver',
    actions: [],
  },
];

module.exports = function withBtAutoWakeReceivers(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (!app.receiver) app.receiver = [];

    for (const r of RECEIVERS) {
      const alreadyPresent = app.receiver.some((x) => x.$?.['android:name'] === r.name);
      if (alreadyPresent) continue;

      const entry = {
        $: {
          'android:name': r.name,
          'android:exported': 'false',
          'android:enabled': 'true',
        },
      };
      if (r.actions.length > 0) {
        entry['intent-filter'] = [
          {
            $: {},
            action: r.actions.map((a) => ({ $: { 'android:name': a } })),
          },
        ];
      }
      app.receiver.push(entry);
    }

    return config;
  });
};
