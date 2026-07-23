// Expo Modules API bọc lỗi throw từ native (Kotlin) thành 1 chuỗi nhiều dòng
// dạng "Call to function 'X.Y' has been rejected.\n→ Caused by: <lý do thật>" -
// hiện thẳng chuỗi này ra UI (rà soát 23/7: màn Kết nối Classic Bluetooth) vừa
// dài dòng vừa lộ chi tiết kỹ thuật (tên hàm nội bộ) không có ích cho user.
// Cắt về đúng phần lý do thật sau "Caused by:" nếu khớp mẫu, giữ nguyên chuỗi
// gốc nếu không (lỗi không qua Expo Modules, hoặc đã là message ngắn có sẵn).
export function cleanNativeErrorMessage(message: string | undefined | null): string {
  if (!message) return '';
  const match = message.match(/Caused by:\s*([\s\S]+)$/);
  return match ? match[1].trim() : message;
}
