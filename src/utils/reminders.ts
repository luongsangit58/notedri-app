// Backend ReminderController::index trả mỗi item dạng { reminder: {...}, eval: {...} }.
// Mọi màn hình app đọc field phẳng (item.hang_muc, item.remaining_days, item.status...)
// nên phải gộp lại trước khi dùng. Dùng chung để tránh lệch giữa các màn.
export function flattenReminders(data: any): any[] {
  const list: any[] = data?.data ?? data ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((x: any) => (x && x.reminder ? { ...x.reminder, ...x.eval } : x));
}

// Map status backend (ok|sap_toi|toi_han|qua_han|chua_du_lieu) -> nhóm mức độ.
export type ReminderSeverity = 'overdue' | 'due' | 'ok' | 'unknown';
export function reminderSeverity(status?: string): ReminderSeverity {
  if (status === 'qua_han') return 'overdue';
  if (status === 'toi_han' || status === 'sap_toi') return 'due';
  if (status === 'ok') return 'ok';
  return 'unknown';
}

// status có cần chú ý (đỏ/vàng) không
export function reminderIsUrgent(status?: string): boolean {
  return status === 'qua_han' || status === 'toi_han' || status === 'sap_toi';
}
