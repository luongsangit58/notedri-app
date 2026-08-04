const { withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

// Đã quyết định bỏ NFC trên iOS (BLE auto-reconnect - xem BleService.ts
// restoreStateIdentifier - đã đảm nhiệm việc "lên xe tự kết nối"; Core NFC không cho app
// tự mở khi quét thẻ lúc khoá máy/tắt app như Android nên không còn đủ giá trị để giữ,
// trong khi vẫn phải xin thêm 1 permission (NFCReaderUsageDescription) + 1 capability lúc
// Apple review). react-native-nfc-manager (app.plugin.js) LUÔN tự thêm entitlement
// "com.apple.developer.nfc.readersession.formats" bất kể có truyền nfcPermission hay
// không, nên phải chạy plugin NÀY SAU nó trong app.json để gỡ lại. Android không đụng tới.
module.exports = function withIosNfcDisabled(config) {
  config = withInfoPlist(config, (config) => {
    delete config.modResults.NFCReaderUsageDescription;
    return config;
  });
  config = withEntitlementsPlist(config, (config) => {
    delete config.modResults['com.apple.developer.nfc.readersession.formats'];
    delete config.modResults['com.apple.developer.nfc.readersession.iso7816.select-identifiers'];
    delete config.modResults['com.apple.developer.nfc.readersession.felica.systemcodes'];
    return config;
  });
  return config;
};
