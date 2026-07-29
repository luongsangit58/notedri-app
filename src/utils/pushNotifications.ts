import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDeviceId } from './deviceId';
import client from '../api/client';
import { PermissionManager } from '../services/permissions/PermissionManager';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // force_logout: xử lý im lặng, không hiện alert
    if (notification.request.content.data?.type === 'force_logout') {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true };
  },
});

// Lắng nghe push "force_logout" → tự đăng xuất ngay
// Chỉ đăng ký 1 lần để tránh nhiều listener chồng nhau khi module bị re-import.
let forceLogoutListenerRegistered = false;
if (!forceLogoutListenerRegistered) {
  forceLogoutListenerRegistered = true;
  Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.type === 'force_logout') {
      import('../store/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().logout();
      }).catch(() => {});
    }
  });
}

async function sendTokenToServer(): Promise<void> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoPushToken = tokenData.data;
  const device_id = await getDeviceId();

  await client.post('/auth/push-token', { expo_push_token: expoPushToken, device_id });
}

/**
 * Đồng bộ token push CHỈ KHI quyền thông báo ĐÃ được cấp sẵn - KHÔNG BAO GIỜ tự xin quyền.
 * Gọi mỗi lần đăng nhập (login()/setSession() trong authStore.ts) để làm mới token (thiết bị
 * cài lại app, xoá app data...) cho user đã từng đồng ý thông báo ở phiên trước - không phải
 * launch/login mới đủ lý do để bật popup xin quyền (refactor JIT permission: quyền thông báo chỉ
 * xin đúng lúc user chạm vào tính năng cần thông báo, xem registerPushTokenAfterPermission()).
 */
export async function syncPushTokenIfGranted(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const { granted } = await PermissionManager.getNotificationStatus();
    if (!granted) return;
    await sendTokenToServer();
  } catch {
    // Push notifications are non-critical — silently ignore errors
  }
}

/**
 * Xin quyền thông báo (CÓ THỂ bật popup hệ thống nếu chưa cấp) rồi đăng ký token - CHỈ gọi từ
 * những nơi user vừa thể hiện rõ ý muốn nhận thông báo (tạo/sửa nhắc nhở, mở màn Thông báo lần
 * đầu) - KHÔNG gọi từ login()/setSession() nữa (dùng syncPushTokenIfGranted() cho đó), tránh bật
 * popup ngay sau khi đăng nhập mà user chưa chạm tới tính năng thông báo nào.
 */
export async function registerPushTokenAfterPermission(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const { granted } = await PermissionManager.requestNotifications();
    if (!granted) return;
    await sendTokenToServer();
  } catch {
    // Push notifications are non-critical — silently ignore errors
  }
}
