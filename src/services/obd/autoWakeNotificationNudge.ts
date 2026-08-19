import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionManager } from '../permissions/PermissionManager';
import { useT } from '../../i18n';

const NUDGE_SHOWN_KEY = 'obd_auto_wake_notif_nudge_shown';

// Rà soát 19/8: tính năng "tự mở app khi Bluetooth kết nối lại OBD2" báo qua
// notification (xem AutoWakeLauncher.kt) - nếu user đã tắt thông báo cho app
// (hoặc từ chối quyền POST_NOTIFICATIONS), NotificationManager.notify() phía
// native lặng lẽ không hiện gì, tính năng coi như vô hiệu mà user không biết
// tại sao. Nhắc 1 LẦN DUY NHẤT (không theo từng xe - cùng 1 mối lo, tránh
// nhắc 2 lần nếu user bật cả switch tổng lẫn switch riêng xe) ngay lúc họ bật
// 1 trong 2 switch auto-connect - cùng pattern nudge GPS-trip/keep-alive đã
// có ở OBDDashboardScreen.tsx (đặt cờ AsyncStorage TRƯỚC khi hiện Alert để
// không bao giờ lặp lại).
export async function maybeNudgeAutoWakeNotificationPermission(t: ReturnType<typeof useT>): Promise<void> {
  if (Platform.OS !== 'android') return;

  const shown = await AsyncStorage.getItem(NUDGE_SHOWN_KEY);
  if (shown) return;

  const status = await PermissionManager.getNotificationStatus();
  if (status.granted) return;

  await AsyncStorage.setItem(NUDGE_SHOWN_KEY, '1');
  Alert.alert(
    t('obd.auto_wake_notif_nudge_title'),
    t('obd.auto_wake_notif_nudge_body'),
    [
      { text: t('gps_trips.later'), style: 'cancel' },
      { text: t('obd.auto_wake_notif_nudge_cta'), onPress: () => { void PermissionManager.requestNotifications(); } },
    ],
  );
}
