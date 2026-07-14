import axios from 'axios';
import { Alert } from 'react-native';
import { API_URL } from '../utils/api';

const client = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json' },
  timeout: 30000,
});

client.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('../store/authStore');
  const { useI18nStore } = await import('../i18n');
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = useI18nStore.getState().lang ?? 'vi';
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // 401 -> tự đăng xuất. NHƯNG bỏ qua nếu CHÍNH request /auth/logout bị 401: nếu không,
    // logout() gọi authApi.logout() -> 401 -> interceptor lại gọi logout() -> đệ quy không thoát
    // (token chưa kịp xoá vì set(token:null) nằm trong finally, chỉ chạy khi authApi.logout() xong).
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.includes('/auth/logout')) {
      const { useAuthStore } = await import('../store/authStore');
      await useAuthStore.getState().logout();
    }

    // Premium hết hạn/bị hạ gói NGAY GIỮA phiên OBD đang sống (server middleware
    // EnsurePremium trả error:'premium_required', 403): trước đây client không có
    // cách nào biết để dừng phiên - live monitor cứ chạy vô thời hạn trên tài
    // khoản đã hết hạn vì is_premium trong bộ nhớ chỉ làm mới lúc cold-start/login.
    // `user` chỉ được cập nhật khi CHÍNH request này thật sự chứng minh server đã
    // từ chối - không đoán/poll định kỳ.
    if (error.response?.status === 403 && error.response?.data?.error === 'premium_required') {
      const { useAuthStore } = await import('../store/authStore');
      const user = useAuthStore.getState().user;
      if (user?.is_premium) {
        useAuthStore.getState().setUser({ ...user, is_premium: false });
        const { bleService } = await import('../services/obd/BleService');
        if (bleService.isConnected()) {
          const { useI18nStore } = await import('../i18n');
          const t = useI18nStore.getState().t;
          await bleService.disconnect().catch(() => {});
          Alert.alert(t('obd.premium_expired_title'), t('obd.premium_expired_body'));
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
