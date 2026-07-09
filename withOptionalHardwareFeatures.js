const { withAndroidManifest } = require('@expo/config-plugins');

// Android tự động suy ra các <uses-feature required="true"> từ permission
// (CAMERA -> camera/camera.autofocus, ACCESS_FINE_LOCATION -> location.gps, ...)
// nếu app không khai báo tường minh. Đầu Android trên ô tô (vd Unisoc UMS512)
// thường không có camera/GPS rời, nên Google Play lọc luôn thiết bị là
// "không tương thích". Khai báo required="false" để không bị lọc, app đã tự
// xử lý permission runtime nên vẫn an toàn khi thiếu phần cứng.
const OPTIONAL_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.microphone',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.bluetooth_le',
  // Một số ROM đầu Android ô tô đời rẻ (không phải AAOS chính chủ) tự set
  // cờ "loại thiết bị = automotive" dù chỉ là Android thường cài sẵn Play
  // Store. Nếu không khai báo tường minh, Play có thể áp bộ lọc tương thích
  // riêng cho form-factor ô tô và loại app handheld thông thường.
  'android.hardware.type.automotive',
  // QUAN TRỌNG NHẤT: nếu app KHÔNG khai báo <uses-feature touchscreen> tường
  // minh, Android/Google Play tự NGẦM ĐỊNH required="true" (mặc định lịch sử
  // dành cho app điện thoại). Nhiều đầu Android ô tô không báo cáo cảm ứng
  // đúng chuẩn (điều khiển qua encoder/nút cứng hoặc driver cảm ứng tuỳ biến)
  // -> bị Play lọc "không tương thích thiết bị". Đây là nguyên nhân phổ biến
  // nhất khiến app không cài được trên màn hình ô tô qua CH Play.
  'android.hardware.touchscreen',
];

module.exports = function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }
    for (const name of OPTIONAL_FEATURES) {
      const exists = manifest['uses-feature'].some(
        (f) => f.$?.['android:name'] === name
      );
      if (!exists) {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }
    return config;
  });
};
