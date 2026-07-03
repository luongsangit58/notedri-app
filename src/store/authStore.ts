import { create } from 'zustand';
import { authApi } from '../api/auth';
import { queryClient } from '../api/queryClient';
import { storage } from '../utils/storage';
import { registerPushToken } from '../utils/pushNotifications';
import { sendDeviceHeartbeat } from '../api/devices';
import { useI18nStore } from '../i18n';
import { clearGpsQueue } from '../services/gps/GpsTripSyncQueue';
import { clearObdQueue } from '../services/obd/TripSyncQueue';

interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  plan?: string;
  is_premium?: boolean;
  vehicle_limit?: number;
  can_add_vehicle?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setUser: (user: User) => void;
  setSession: (token: string, user: User) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const token = await storage.getToken();
      const userStr = await storage.getUser();
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ token, user, isLoading: false });
        // Tạo/cập nhật device session cho user đã đăng nhập sẵn (heartbeat upsert).
        sendDeviceHeartbeat();
        // Background refresh so plan/limit changes on the server are picked up
        authApi.me().then(res => {
          const fresh = res.data?.data ?? res.data;
          if (fresh) {
            storage.setUser(JSON.stringify(fresh));
            set({ user: fresh });
          }
        }).catch(() => {});
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.login(email, password);
      // Bóc envelope giống me()/setSession -> nếu backend đổi shape sang { data: {...} }
      // vẫn không lưu nhầm token=undefined.
      const { token, user } = response.data?.data ?? response.data;
      await storage.setToken(token);
      await storage.setUser(JSON.stringify(user));
      queryClient.clear(); // xoá cache user cũ để không lẫn dữ liệu khi đổi tài khoản
      set({ token, user, isLoading: false });
      registerPushToken();
      sendDeviceHeartbeat();
    } catch (error: any) {
      const message = error.response?.data?.message ?? useI18nStore.getState().t('auth.login_failed');
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  loginWithGoogle: async (idToken: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.googleMobile(idToken);
      // Bóc envelope giống me()/setSession (xem login).
      const { token, user } = response.data?.data ?? response.data;
      await storage.setToken(token);
      await storage.setUser(JSON.stringify(user));
      queryClient.clear(); // xoá cache user cũ để không lẫn dữ liệu khi đổi tài khoản
      set({ token, user, isLoading: false });
      registerPushToken();
      sendDeviceHeartbeat();
    } catch (error: any) {
      const message = error.response?.data?.message ?? useI18nStore.getState().t('auth.google_login_failed');
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    try {
      const { token } = get();
      if (token) {
        await authApi.logout().catch(() => {});
      }
    } finally {
      await storage.deleteToken();
      await storage.deleteUser();
      queryClient.clear(); // xoá toàn bộ cache React Query khi đăng xuất
      // Xoá hàng đợi chuyến đi chưa sync: tránh đẩy chuyến/lịch sử vị trí của user cũ
      // sang tài khoản mới đăng nhập trên cùng thiết bị.
      await clearGpsQueue();
      await clearObdQueue();
      set({ user: null, token: null });
    }
  },

  setUser: (user: User) => set({ user }),
  setSession: async (token: string, user: User) => {
    await storage.setToken(token);
    await storage.setUser(JSON.stringify(user));
    queryClient.clear(); // xoá cache user cũ để không lẫn dữ liệu khi đổi tài khoản
    set({ token, user, isLoading: false });
    registerPushToken();
  },
  clearError: () => set({ error: null }),
}));
