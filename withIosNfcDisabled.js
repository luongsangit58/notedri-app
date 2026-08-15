const { withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

// Đã quyết định bỏ NFC trên iOS (BLE auto-reconnect - xem BleService.ts
// restoreStateIdentifier - đã đảm nhiệm việc "lên xe tự kết nối"; Core NFC không cho app
// tự mở khi quét thẻ lúc khoá máy/tắt app như Android nên không còn đủ giá trị để giữ,
// trong khi vẫn phải xin thêm 1 permission (NFCReaderUsageDescription) + 1 capability lúc
// Apple review). react-native-nfc-manager (app.plugin.js) LUÔN tự thêm entitlement
// "com.apple.developer.nfc.readersession.formats" bất kể có truyền nfcPermission hay
// không, nên cần chạy plugin NÀY để gỡ lại. Android không đụng tới.
//
// Rà soát 15/8 (bug thật bắt được lúc build production đầu tiên lên Apple - lỗi
// ITMS-90778 "NDEF is disallowed" vì entitlement NDEF vẫn còn trong bản build dù
// file này đã xoá): @expo/config-plugins chạy các mod CÙNG LOẠI (vd withEntitlementsPlist)
// theo thứ tự NGƯỢC với thứ tự khai trong mảng "plugins" của app.json - plugin khai SAU
// lại được THỰC THI TRƯỚC (xem withMod.js: mỗi lần đăng ký mới sẽ "bọc" quanh mod cũ rồi
// gọi action mới TRƯỚC, gọi nextMod - tức mod cũ - SAU). File này PHẢI đứng TRƯỚC
// "react-native-nfc-manager" trong app.json (không phải sau như trực giác thông
// thường) để nó THỰC THI SAU nfc-manager - tức xoá đúng thứ nfc-manager vừa thêm,
// thay vì xoá trước rồi bị nfc-manager thêm lại đè lên. Đã xác minh bằng
// `npx expo config --json --type introspect` (entitlements/Info.plist sạch hoàn
// toàn NFC sau khi đổi thứ tự) - đừng đảo lại thứ tự 2 plugin này.
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
