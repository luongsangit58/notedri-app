import { useT } from '../../i18n';

// Rà soát 20/8: tính năng "tự mở app khi Bluetooth kết nối lại OBD2" mà nudge
// này phục vụ đã tắt tạm thời (xem autoWakeSync.ts - user lo ngại app trông
// như "luôn luôn chạy nền"). Nhắc xin quyền thông báo cho 1 tính năng đang tắt
// chỉ gây khó hiểu. No-op cho tới khi autoWakeSync.ts bật lại.
export async function maybeNudgeAutoWakeNotificationPermission(_t: ReturnType<typeof useT>): Promise<void> {}
