import { create } from 'zustand';
import { InteractionManager, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/auth';
import { queryClient } from '../api/queryClient';
import { storage } from '../utils/storage';
import { syncPushTokenIfGranted } from '../utils/pushNotifications';
import { sendDeviceHeartbeat } from '../api/devices';
import { useI18nStore, translate } from '../i18n';
import { clearGpsQueue } from '../services/gps/GpsTripSyncQueue';
import { clearObdQueue } from '../services/obd/TripSyncQueue';
import { clearObdSessionQueue } from '../services/obd/ObdSessionSyncQueue';
import { clearDtcReportQueue, clearDtcResolveQueue } from '../services/obd/ObdDtcSyncQueue';
import { clearPairings } from '../services/obd/pairedDevices';
import { useObdSessionStore } from './obdSessionStore';
import {
  identify as identifyRevenueCat, reset as resetRevenueCat,
  getCustomerInfo as getRevenueCatCustomerInfo, isEntitled as isRevenueCatEntitled,
} from '../services/iap/RevenueCatService';

interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  plan?: string;
  is_premium?: boolean;
  on_trial?: boolean;
  vehicle_limit?: number;
  can_add_vehicle?: boolean;
  locale?: 'vi' | 'en' | null;
}

// Báo 1 LẦN DUY NHẤT/tài khoản việc đăng ký được tặng Premium 30 ngày (backend tự cấp ở
// UserObserver::created(), xem docs/apple-hardware-bundle-compliance.md) - guard bằng
// AsyncStorage theo user.id để không hiện lại mỗi lần mở app trong suốt 30 ngày dùng thử.
async function maybeAnnounceSignupTrial(user: User): Promise<void> {
  if (!user.on_trial) return;
  const key = `trial_welcome_shown_${user.id}`;
  try {
    if (await AsyncStorage.getItem(key)) return;
    await AsyncStorage.setItem(key, '1');
  } catch {
    return; // Lỗi đọc/ghi cờ - thà bỏ qua còn hơn hiện lặp lại nhiều lần.
  }
  Alert.alert(translate('auth.trial_welcome_title'), translate('auth.trial_welcome_body'));
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

// Rà soát 21/8 (3): identify() (gọi ngay dưới mỗi lần vào hàm này) chỉ đồng bộ app_user_id
// phía SDK RevenueCat - is_premium ở backend (users.plan) chỉ đổi khi webhook RevenueCat xử
// lý xong, có độ trễ. Khách redeem Offer Code (KW906) NGOÀI app (web -> App Store/Play
// Store) rồi mới mở/đăng nhập lại NoteDri sẽ không có gì tự thử lại /me ngoài đúng 1 lần lúc
// vào hàm - đúng lúc webhook chưa xong thì is_premium kẹt false tới khi khách tự vào Premium
// bấm "Khôi phục giao dịch mua". Dò bằng getCustomerInfo() (chỉ đọc trạng thái SDK đã biết
// sẵn, KHÔNG kích hoạt lại luồng restore/re-auth của StoreKit như restorePurchases()) - dừng
// ngay nếu SDK cũng chưa thấy gì (đa số trường hợp mở app bình thường, không đoán mò/không
// bật popup Apple ID ngoài ý muốn cho user không có gì cần khôi phục - quan trọng vì app
// đang chờ Apple duyệt lại). Chỉ khi SDK ĐÃ thấy entitlement mà backend chưa cập nhật kịp
// mới tự thử lại /me vài lần.
async function syncPremiumIfEntitledButStale(currentUser: User): Promise<void> {
  if (currentUser.is_premium) return;
  // Chốt lại token của PHIÊN ĐĂNG NHẬP hiện tại - vòng lặp bên dưới chờ tới 30s, nếu user
  // đăng xuất (hoặc đăng nhập tài khoản khác) ngay giữa lúc đang chờ, không được ghi đè
  // user hiện tại bằng dữ liệu của phiên đã kết thúc/đổi chủ (kiểm tra lại token trước MỌI
  // lần đọc/ghi bên dưới, không chỉ 1 lần lúc vào hàm).
  const sessionToken = useAuthStore.getState().token;
  if (!sessionToken) return;
  try {
    const info = await getRevenueCatCustomerInfo();
    if (!info || !isRevenueCatEntitled(info)) return;

    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (useAuthStore.getState().token !== sessionToken) return;
      const res = await authApi.me().catch(() => null);
      const fresh = res?.data?.data ?? res?.data;
      if (fresh?.is_premium) {
        if (useAuthStore.getState().token !== sessionToken) return;
        await storage.setUser(JSON.stringify(fresh));
        useAuthStore.setState({ user: fresh });
        return;
      }
    }
  } catch { /* non-critical - lần mở app sau hoặc bấm tay "Khôi phục giao dịch mua" vẫn tự lấy đúng dữ liệu */ }
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
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setUser: (user: User) => void;
  setSession: (token: string, user: User) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isLoggingOut: false,
  userSynced: false,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const token = await storage.getToken();
      const userStr = await storage.getUser();
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ token, user, isLoading: false });
        identifyRevenueCat(user.id);
        // Tạo/cập nhật device session cho user đã đăng nhập sẵn (heartbeat upsert).
        sendDeviceHeartbeat();
        // Background refresh so plan/limit changes on the server are picked up
        authApi.me().then(res => {
          const fresh = res.data?.data ?? res.data;
          if (fresh) {
            storage.setUser(JSON.stringify(fresh));
            set({ user: fresh });
            adoptAccountLocale(fresh); // đồng bộ ngôn ngữ theo tài khoản khi mở lại app
            void syncPremiumIfEntitledButStale(fresh);
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
      // Rà soát 16/7: cùng lỗi rò rỉ chéo tài khoản như GPS ở trên nhưng phía OBD2 -
      // obdLiveMonitor/BLE là module-level singleton, KHÔNG tự dừng theo lifecycle màn
      // hình hay theo logout(). Nếu user rút thẻ đăng xuất trong khi adapter vẫn cắm,
      // BLE ở lại "connected" -> lúc rớt kết nối tự nhiên sau đó (adapter mất điện, xe
      // tắt máy...) listener disconnect của obdLiveMonitor đọc token/vehicleId LÚC ĐÓ,
      // có thể đã thuộc tài khoản MỚI vừa đăng nhập trên cùng máy -> phiên OBD của user
      // cũ bị gắn nhầm/gửi dưới token user mới. Ngắt BLE ngay tại đây (token cũ vẫn còn
      // hợp lệ) để buộc listener chạy trong ngữ cảnh đúng - clearObdSessionQueue() bên
      // dưới xoá sạch hàng đợi ngay sau đó nên không cần đợi enqueue/flush xong.
      try {
        const { bleService } = await import('../services/obd/BleService');
        if (bleService.isConnected()) await bleService.disconnect();
      } catch { /* non-critical */ }
      // Rà soát 2026-07-28 (rà soát Nori Agent, cùng lớp lỗi rò rỉ chéo tài khoản như GPS/BLE ở
      // trên): `noriAgentStore` KHÔNG BAO GIỜ tự dispose() theo logout() - agent + toàn bộ
      // uiMessages (lịch sử hội thoại thật, có thể chứa số liệu xe/chi phí nhạy cảm) sống mãi
      // trong bộ nhớ tới khi tắt hẳn app, vì `init()` no-op nếu đã có agent. Trên máy dùng
      // chung, user B đăng nhập sau user A trên CÙNG app session sẽ thấy nguyên lịch sử chat
      // của user A. Import động (không import thẳng ở đầu file) vì `noriAgentStore.ts` đã
      // import ngược lại `authStore.ts` - import thẳng 2 chiều sẽ vòng lặp.
      try {
        const { useNoriAgentStore } = await import('./noriAgentStore');
        useNoriAgentStore.getState().dispose();
      } catch { /* non-critical */ }
      await storage.deleteToken();
      await storage.deleteUser();
      queryClient.clear(); // xoá toàn bộ cache React Query khi đăng xuất
      // Xoá hàng đợi chuyến đi chưa sync: tránh đẩy chuyến/lịch sử vị trí của user cũ
      // sang tài khoản mới đăng nhập trên cùng thiết bị.
      await clearGpsQueue();
      await clearObdQueue();
      await clearObdSessionQueue();
      await clearDtcReportQueue();
      await clearDtcResolveQueue();
      useObdSessionStore.getState().patch({ pendingSyncCount: 0 });
      // Xoá luôn pairing OBD local để user khác trên cùng máy không bị auto-connect
      // hoặc state "đang ghép" của người dùng trước bám lại.
      await clearPairings();
      await resetRevenueCat();
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
    identifyRevenueCat(user.id);
    void syncPremiumIfEntitledButStale(user);
    InteractionManager.runAfterInteractions(() => {
      syncPushTokenIfGranted().catch(() => {});
    });
    maybeAnnounceSignupTrial(user);
  },
}));
