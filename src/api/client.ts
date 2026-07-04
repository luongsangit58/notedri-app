import axios from 'axios';
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
    return Promise.reject(error);
  }
);

export default client;
