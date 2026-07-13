import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

export type NfcVehicleLink = { vehicleId: number; bleDeviceId: string };

function buildAutoDriveUrl(link: NfcVehicleLink): string {
  return `notedri://autodrive?vehicleId=${link.vehicleId}&deviceId=${encodeURIComponent(link.bleDeviceId)}`;
}

function parseAutoDriveUrl(url: string): NfcVehicleLink | null {
  const match = url.match(/^notedri:\/\/autodrive\?(.+)$/);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const vehicleId = Number(params.get('vehicleId'));
  const deviceId = params.get('deviceId');
  if (!vehicleId || !deviceId) return null;
  return { vehicleId, bleDeviceId: decodeURIComponent(deviceId) };
}

export async function isNfcSupported(): Promise<boolean> {
  try {
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

// Có phần cứng NFC KHÔNG đồng nghĩa NFC đang bật (Android cho tắt riêng trong
// Settings). Không phân biệt 2 trường hợp này khiến user tắt NFC chỉ thấy lỗi
// ghi thẻ chung chung thay vì được hướng dẫn bật NFC lên.
export async function isNfcEnabled(): Promise<boolean> {
  try {
    return await NfcManager.isEnabled();
  } catch {
    // iOS không có khái niệm bật/tắt NFC ở Settings như Android - coi như bật
    // nếu API này không áp dụng/lỗi, để không chặn nhầm user iOS.
    return true;
  }
}

// NfcManager.start() khởi tạo native module - khuyến nghị gọi trước request đầu
// tiên (README: "recommended but not necessary"), gọi 1 lần rồi cache lại promise
// để tránh khởi tạo lại mỗi lần chạm thẻ.
let startPromise: Promise<void> | null = null;
function ensureStarted(): Promise<void> {
  if (!startPromise) {
    // Xoá cache khi start() lỗi - nếu không, 1 lần lỗi tạm thời (thoáng qua lúc
    // native module chưa sẵn sàng) sẽ làm mọi lần chạm thẻ sau đó trong cùng
    // phiên app luôn thất bại lại đúng lỗi cũ, không bao giờ có cơ hội thử lại.
    startPromise = NfcManager.start().catch((err) => {
      startPromise = null;
      throw err;
    });
  }
  return startPromise;
}

// Đóng session NFC đang mở (nếu có) - gọi khi user rời màn hình giữa chừng lúc
// đang chờ chạm thẻ, tránh giữ reader ở trạng thái bận cho lần chạm kế tiếp.
export async function cancelNfcSession(): Promise<void> {
  await NfcManager.cancelTechnologyRequest().catch(() => {});
}

// Ghi URL notedri://autodrive?... vào thẻ NFC trắng. Không lưu dữ liệu xe trong
// thẻ - chỉ lưu vehicleId + deviceId để tra cứu, khớp nguyên tắc "NFC chỉ là
// Physical Quick Trigger, không lưu dữ liệu" từ tài liệu thiết kế.
export async function writeVehicleTag(link: NfcVehicleLink): Promise<void> {
  await ensureStarted();
  await NfcManager.requestTechnology(NfcTech.Ndef);
  try {
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(buildAutoDriveUrl(link))]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    // Luôn đóng session dù ghi thành công hay lỗi - không đóng sẽ giữ NFC reader
    // ở trạng thái bận, lần chạm kế tiếp không hoạt động được.
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// Deep link đến từ OS (chạm NFC khi app đã đóng, hoặc bất kỳ nguồn notedri://autodrive
// nào khác) đi qua Linking listener ở App.tsx, không qua NfcManager - dùng chung
// parser này để 2 đường (đọc trực tiếp NFC vs Linking URL) luôn nhất quán.
export { parseAutoDriveUrl };
