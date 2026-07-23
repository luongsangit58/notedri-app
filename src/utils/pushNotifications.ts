import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDeviceId } from './deviceId';
import client from '../api/client';

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

export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const expoPushToken = tokenData.data;
    const device_id = await getDeviceId();

    await client.post('/auth/push-token', { expo_push_token: expoPushToken, device_id });
  } catch {
    // Push notifications are non-critical — silently ignore errors
  }
}
