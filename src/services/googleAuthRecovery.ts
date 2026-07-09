import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

// Khôi phục callback Google (đăng nhập HOẶC liên kết tài khoản) khi OS kill hẳn tiến trình app
// trong lúc Custom Tab/ASWebAuthenticationSession còn mở (máy yếu RAM) - openAuthSessionAsync()
// không bao giờ resolve vì JS context đã mất. Đặt cờ TRƯỚC khi mở phiên OAuth; App.tsx gọi
// recoverPendingGoogleAuthIfAny() một lần lúc cold-start (mount trước RootNavigator, không phụ
// thuộc đã đăng nhập hay chưa) để đọc Linking.getInitialURL() nếu cờ còn đó.
// CHỈ đọc getInitialURL khi cờ này đang bật -> không biến thành listener toàn cục chấp nhận
// bất kỳ deep-link nào (tránh chèn token/xác nhận link từ nơi khác).
const PENDING_KEY = 'google_auth_pending_kind';
type PendingKind = 'login' | 'link';

export async function markGooglePending(kind: PendingKind): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, kind).catch(() => {});
}

export async function clearGooglePending(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
}

function extractParams(urlStr: string): URLSearchParams {
  const qIndex = urlStr.indexOf('?');
  const hIndex = urlStr.indexOf('#');
  const query = qIndex >= 0 ? urlStr.slice(qIndex + 1) : hIndex >= 0 ? urlStr.slice(hIndex + 1) : '';
  return new URLSearchParams(query);
}

async function finishPendingGoogleAuth(kind: PendingKind, urlStr: string): Promise<void> {
  const params = extractParams(urlStr);
  if (params.get('error')) return; // lỗi từ Google - im lặng lúc cold-start, user tự thử lại

  if (kind === 'login') {
    const token = params.get('token');
    if (!token) return;
    const me = await authApi.me(token);
    const userData = me.data?.data ?? me.data;
    await useAuthStore.getState().setSession(token, userData);
    return;
  }

  // kind === 'link'
  if (!params.get('linked')) return;
  const me = await authApi.me();
  const userData = me.data?.data ?? me.data;
  useAuthStore.getState().setUser({ ...(useAuthStore.getState().user ?? {}), ...userData });
}

// Gọi 1 lần lúc app cold-start (App.tsx). Không throw - lỗi khôi phục chỉ khiến user phải tự
// đăng nhập/liên kết lại, không nên làm crash app.
export async function recoverPendingGoogleAuthIfAny(): Promise<void> {
  const kind = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!kind) return;
  await clearGooglePending(); // dùng 1 lần, tránh xử lý lặp ở lần mở sau
  const url = await Linking.getInitialURL().catch(() => null);
  if (!url) return;
  await finishPendingGoogleAuth(kind as PendingKind, url).catch(() => {});
}
