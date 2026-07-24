import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Appearance } from 'react-native';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import ObdSessionBanner from './src/components/ObdSessionBanner';
import NoriFloatingButton from './src/components/nori/NoriFloatingButton';
import { useThemeStore } from './src/utils/theme';
import { useCockpitThemeStore } from './src/store/cockpitThemeStore';
import { useI18nStore } from './src/i18n';
import { flushPendingTrips } from './src/services/obd/TripSyncQueue';
import { bleService } from './src/services/obd/BleService';
import { hasAnyPairing } from './src/services/obd/pairedDevices';
import { flushPendingGpsTrips } from './src/services/gps/GpsTripSyncQueue';
import { maybeAutoShutdownStale, autoArmIfReady } from './src/services/gps/GpsTripTracker';
import { vehiclesApi } from './src/api/vehicles';
import { initDeepLinkService } from './src/services/nfc/DeepLinkService';
import { sendDeviceHeartbeat } from './src/api/devices';
import { useAuthStore } from './src/store/authStore';
import { initializeAdMob } from './src/services/ads/admob';
import { recoverPendingGoogleAuthIfAny } from './src/services/googleAuthRecovery';

async function tryAutoArmGpsTracking(): Promise<void> {
  try {
    const res = await vehiclesApi.list();
    const raw = (res as any)?.data;
    const vehicles: any[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
    if (!defaultVehicle?.id) return;

    await autoArmIfReady(defaultVehicle.id);
    // Không hiện Alert nhắc bật tự động ghi hành trình khi thiếu quyền: dễ chồng lấn
    // với các dialog xin quyền khác (thông báo, vị trí...) xuất hiện ngay sau login.
  } catch {
    // Best-effort - không được để lỗi ở đây làm gãy luồng khởi động app chính.
  }
}
// Side-effect import: registers the GPS_TRIP_TRACKING background task at module load time
import './src/services/gps/GpsTripTracker';

function AppLoader({ children }: { children: React.ReactNode }) {
  const loadTheme = useThemeStore(s => s.loadSaved);
  const loadLang = useI18nStore(s => s.loadSaved);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    loadTheme();
    loadLang();
    void useCockpitThemeStore.getState().loadSaved();
    void initializeAdMob();
    // Khôi phục đăng nhập/liên kết Google nếu OS kill app giữa lúc đang chờ callback (xem
    // src/services/googleAuthRecovery.ts). Đặt ở đây (không phải LoginScreen/ProfileScreen) vì
    // AppLoader luôn mount lúc cold-start bất kể đã đăng nhập hay chưa - còn Login/Profile thì
    // tuỳ trạng thái mà có thể không phải màn hình được mở lại.
    void recoverPendingGoogleAuthIfAny();
    // Rà soát 22/7: bản build trước từng lên lịch 1 thông báo local hàng ngày cho Nori
    // (đã bỏ - trùng với push sức khỏe xe thông minh hơn backend đã có sẵn). Huỷ 1 lần
    // ở đây để dọn nốt thông báo đã lỡ lên lịch trên máy đã cài bản build đó, tránh nó
    // cứ bắn mãi dù code lên lịch đã không còn.
    Notifications.cancelScheduledNotificationAsync('nori-daily-digest').catch(() => {});
  }, []);

  // Ép tạo BleManager sớm - bắt buộc để restoreStateIdentifier (iOS background BLE
  // restore) có cơ hội nhận callback khi CoreBluetooth đánh thức app nền. Gate kép:
  // (1) isPremium - user Free không dùng được OBD2 nên không đụng BLE vô cớ; (2)
  // hasAnyPairing - "restore" chỉ có ý nghĩa nếu đã từng kết nối OBD2 ít nhất 1 lần;
  // premium user chưa từng dùng tính năng này cũng không nên bị hỏi quyền Bluetooth
  // ngay khi vừa mở app / vừa nâng cấp.
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  useEffect(() => {
    if (!isPremium) return;
    hasAnyPairing().then((paired) => {
      if (paired) bleService.ensureInitialized();
    });
  }, [isPremium]);

  // Flush hàng đợi chuyến CHỈ khi đã có token (sau khi hydrate xong hoặc vừa login).
  // Nếu chạy lúc cold-start trước khi token nạp -> request không Authorization -> 401 ->
  // chuyến bị bỏ (mất dữ liệu) + interceptor gọi logout() (đăng xuất giả). Gate theo token.
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) return;
    flushPendingTrips().catch(() => {});
    maybeAutoShutdownStale().catch(() => {}); // đóng chuyến bị kẹt từ phiên trước (app bị kill)
    flushPendingGpsTrips().catch(() => {});
    // GPS tự ghi hành trình (rà soát 16/7): trước đây phải tự bấm nút bật lại mỗi
    // khi service tự tắt do rảnh 20 phút - dễ quên trước khi lái, mất chuyến oan.
    // Tự bật lại NẾU quyền đã có sẵn (im lặng); nếu thiếu quyền, nhắc 1 lần duy nhất.
    tryAutoArmGpsTracking();
  }, [token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        // Chỉ flush/heartbeat khi còn phiên đăng nhập -> tránh gọi API không token (401).
        if (useAuthStore.getState().token) {
          flushPendingTrips().catch(() => {});
          maybeAutoShutdownStale().catch(() => {});
          flushPendingGpsTrips().catch(() => {});
          sendDeviceHeartbeat(); // giữ last_seen_at tươi -> is_online đúng
          // Rà soát 17/7 (user hỏi): trước đây chỉ tự bật lại ghi hành trình lúc
          // app MỞ (cold start). Nếu service tự tắt do rảnh 20 phút trong lúc app
          // vẫn ở nền (chưa bị đóng hẳn) rồi user lái luôn mà không mở lại app,
          // hành trình sẽ không được ghi. Kiểm tra lại mỗi lần app quay về
          // foreground - tự bật lại NẾU quyền đã có sẵn (im lặng, không hỏi lại).
          tryAutoArmGpsTracking();
        }
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  // Live-follow theme: OS đổi sáng/tối lúc app đang chạy -> đổi ngay NẾU user chưa tự chọn.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => useThemeStore.getState().applySystemIfFollowing());
    return () => sub.remove();
  }, []);

  // Deep link NFC/OBD - notedri://autodrive (thẻ đã ghi sẵn vehicleId+deviceId) và
  // https://notedri.com/connect (App Link, tự suy ra adapter từ pairing gần nhất).
  // Cold start (app đã đóng) đi qua getInitialURL(); app đang chạy nền/foreground đi
  // qua sự kiện 'url'. Xem DeepLinkService để biết cách 2 dạng URL này được phân biệt.
  useEffect(() => initDeepLinkService(), []);

  // Chạm vào push "phát hiện mã lỗi mới" (obdLiveMonitor -> dtcNotificationStore) ->
  // mở thẳng lịch sử/DTC của đúng xe thay vì chỉ mở app về màn hình mặc định.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; vehicleId?: number } | undefined;
      if (data?.type === 'dtc_alert' && data.vehicleId && navigationRef.isReady()) {
        navigationRef.navigate('OBDTrips', { vehicleId: data.vehicleId });
      }
    });
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppLoader>
            <NavigationContainer ref={navigationRef}>
              <RootNavigator />
              <ObdSessionBanner />
              <NoriFloatingButton />
            </NavigationContainer>
          </AppLoader>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
