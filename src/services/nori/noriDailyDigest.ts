import * as Notifications from 'expo-notifications';

// Nori: báo cáo sức khỏe xe hàng ngày qua 1 thông báo cục bộ (local), không cần
// backend cron. Lên lịch lại (cancel + reschedule cùng 1 identifier cố định)
// mỗi khi HomeScreen có dữ liệu sức khỏe mới nhất - nội dung thông báo luôn là
// bản tóm tắt gần nhất tại thời điểm lên lịch, KHÔNG tính toán lại lúc bắn ra
// (giới hạn của local notification: không chạy JS nền được).
const NORI_DAILY_NOTIFICATION_ID = 'nori-daily-digest';
const DEFAULT_HOUR = 20;
const DEFAULT_MINUTE = 0;

export async function scheduleNoriDailyDigest(
  title: string,
  body: string,
  hour: number = DEFAULT_HOUR,
  minute: number = DEFAULT_MINUTE,
): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    await Notifications.cancelScheduledNotificationAsync(NORI_DAILY_NOTIFICATION_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: NORI_DAILY_NOTIFICATION_ID,
      content: { title, body, data: { type: 'nori_daily_digest' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  } catch {
    // Thông báo hàng ngày không phải luồng thiết yếu - lỗi (quyền bị từ chối,
    // thiết bị không hỗ trợ...) không được chặn phần còn lại của app.
  }
}

export async function cancelNoriDailyDigest(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NORI_DAILY_NOTIFICATION_ID).catch(() => {});
}
