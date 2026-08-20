import { Platform } from 'react-native';
import NotedriBtPairing from '../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';

// Rà soát 20/8 (user báo lo ngại: tính năng "tự mở app khi Bluetooth kết nối
// lại OBD2 đã ghép nối" - dùng ACL_CONNECTED tĩnh + BLE PendingIntent scan nền,
// xem modules/notedri-bt-pairing - khiến user cảm giác app "luôn luôn chạy nền"
// dù chưa từng tự tay mở app/quét NFC). TẮT TẠM THỜI ở đây - luôn đồng bộ 2
// danh sách MAC RỖNG xuống native, bất kể trạng thái pairing/switch auto-connect
// thật sự là gì. Cache rỗng khiến AclConnectedReceiver/BleScanResultReceiver
// phía native không còn khớp thiết bị nào để báo, và BleAutoWakeScanner.arm()
// (gọi với bleMacs rỗng) tự disarm() - vô hiệu hoá hoàn toàn 2 đường vào nền mà
// KHÔNG cần đổi AndroidManifest/receiver native (an toàn đẩy qua OTA JS update,
// không cần chờ duyệt lại Play Store). Máy đã cài bản có cache MAC cũ (từ commit
// 6150107) cũng được dọn sạch ngay lần gọi tiếp theo (App.tsx lúc khởi động).
//
// Auto-connect khi MỞ APP (ObdAutoConnect.tsx) hoặc quét NFC không bị ảnh hưởng
// - đây vẫn là 2 đường vào hợp lệ duy nhất, đúng yêu cầu "phải mở app mới auto
// connect". Muốn bật lại tính năng nền này: khôi phục thân hàm về logic đọc
// getAllPairedDevices()/useObdAutoConnectSettingsStore ở commit 6150107.
export async function syncAutoWakeDevices(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await NotedriBtPairing.syncAutoWakeDevices([], []).catch(() => {});
}
