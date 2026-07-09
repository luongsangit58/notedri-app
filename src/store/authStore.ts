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
  locale?: 'vi' | 'en' | null;
}

// Áp ngôn ngữ đã lưu ở TÀI KHOẢN vào UI app (chỉ khi user đã chọn rõ vi/en) -> đồng bộ
// với web + email. locale null (chưa chọn) thì GIỮ lựa chọn hiện tại của máy.
function adoptAccountLocale(user: User | null): void {
  const i18n = useI18nStore.getState();
  // Có lựa chọn ngôn ngữ đổi ở máy nhưng CHƯA đẩy được lên tài khoản (đổi lúc offline):
  // KHÔNG để locale tài khoản (cũ) ghi đè -> thay vào đó thử đẩy lại lựa chọn local lên tài khoản.
  if (i18n.localePendingPush) {
    import('../api/profile')
      .then(({ profileApi }) => profileApi.setLocale(i18n.lang as 'vi' | 'en'))
      .then(() => useI18nStore.getState().setLocalePendingPush(false))
      .catch(() => { /* vẫn offline -> giữ pending, thử lại lần sau */ });
    return;
  }
  if (user?.locale === 'vi' || user?.locale === 'en') {
    if (i18n.lang !== user.locale) {
      i18n.setLang(user.locale);
    }
  }
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  // false = `user` chỉ mới là dữ liệu cache lúc cold-start, background refresh /auth/me
  // CHƯA xong (thành công hay thất bại). Màn hình nào quyết định điều hướng/chặn tính năng dựa
  // trên field có thể đổi giữa server (vd is_premium) nên đợi cờ này = true trước khi hành động,
  // tránh đá nhầm user Premium ra màn nâng cấp chỉ vì cache cũ chưa kịp làm mới.
  userSynced: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
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
  isLoggingOut: false,
  userSynced: false,
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
            adoptAccountLocale(fresh); // đồng bộ ngôn ngữ theo tài khoản khi mở lại app
          }
        }).catch(() => {})
          // Dù thành công hay lỗi (vd offline) cũng coi là "đã đồng bộ" - không có cách nào
          // mới hơn để đợi, chặn mãi mãi còn tệ hơn dùng tạm dữ liệu cache.
          .finally(() => set({ userSynced: true }));
      } else {
        // Không có phiên cũ để làm mới -> không có gì "cũ" cả, coi như đã đồng bộ ngay.
        set({ isLoading: false, userSynced: true });
      }
    } catch {
      set({ isLoading: false, userSynced: true });
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
      // Vừa đăng nhập -> user LUÔN là dữ liệu tươi từ server, không phải cache.
      set({ token, user, isLoading: false, userSynced: true });
      adoptAccountLocale(user); // đồng bộ ngôn ngữ theo tài khoản
      registerPushToken();
      sendDeviceHeartbeat();
    } catch (error: any) {
      const message = error.response?.data?.message ?? useI18nStore.getState().t('auth.login_failed');
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    // Chống gọi lại chồng lấn: nhiều request 401 cùng lúc (me + heartbeat...) sẽ gọi logout()
    // song song -> chỉ cho chạy 1 lần.
    if (get().isLoggingOut) return;
    set({ isLoggingOut: true });
    try {
      const { token } = get();
      if (token) {
        await authApi.logout().catch(() => {});
      }
    } finally {
      // DỪNG HẲN GPS tracking + xoá state chuyến đang chạy: nếu để foreground service chạy tiếp
      // sau đăng xuất, chuyến của user A có thể kết thúc rồi bị đẩy dưới token user B (rò rỉ vị trí
      // chéo tài khoản) + hao pin dù không còn ai đăng nhập. stopTracking(false) = KHÔNG lưu chuyến.
      try {
        const { stopTracking } = await import('../services/gps/GpsTripTracker');
        await stopTracking(false);
      } catch { /* non-critical */ }
      await storage.deleteToken();
      await storage.deleteUser();
      queryClient.clear(); // xoá toàn bộ cache React Query khi đăng xuất
      // Xoá hàng đợi chuyến đi chưa sync: tránh đẩy chuyến/lịch sử vị trí của user cũ
      // sang tài khoản mới đăng nhập trên cùng thiết bị.
      await clearGpsQueue();
      await clearObdQueue();
      set({ user: null, token: null, isLoggingOut: false, userSynced: false });
    }
  },

  setUser: (user: User) => set({ user }),
  setSession: async (token: string, user: User) => {
    await storage.setToken(token);
    await storage.setUser(JSON.stringify(user));
    queryClient.clear(); // xoá cache user cũ để không lẫn dữ liệu khi đổi tài khoản
    // Vừa đăng nhập (Google) -> user LUÔN là dữ liệu tươi từ server, không phải cache.
    set({ token, user, isLoading: false, userSynced: true });
    registerPushToken();
  },
  clearError: () => set({ error: null }),
}));
