import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Appearance } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { useThemeStore } from './src/utils/theme';
import { useI18nStore } from './src/i18n';
import { flushPendingTrips } from './src/services/obd/TripSyncQueue';
import { flushPendingGpsTrips } from './src/services/gps/GpsTripSyncQueue';
import { maybeAutoShutdownStale } from './src/services/gps/GpsTripTracker';
import { sendDeviceHeartbeat } from './src/api/devices';
import { useAuthStore } from './src/store/authStore';
import { initializeAdMob } from './src/services/ads/admob';
import { recoverPendingGoogleAuthIfAny } from './src/services/googleAuthRecovery';
// Side-effect import: registers the GPS_TRIP_TRACKING background task at module load time
import './src/services/gps/GpsTripTracker';

function AppLoader({ children }: { children: React.ReactNode }) {
  const loadTheme = useThemeStore(s => s.loadSaved);
  const loadLang = useI18nStore(s => s.loadSaved);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    loadTheme();
    loadLang();
    void initializeAdMob();
    // Khôi phục đăng nhập/liên kết Google nếu OS kill app giữa lúc đang chờ callback (xem
    // src/services/googleAuthRecovery.ts). Đặt ở đây (không phải LoginScreen/ProfileScreen) vì
    // AppLoader luôn mount lúc cold-start bất kể đã đăng nhập hay chưa - còn Login/Profile thì
    // tuỳ trạng thái mà có thể không phải màn hình được mở lại.
    void recoverPendingGoogleAuthIfAny();
  }, []);

  // Flush hàng đợi chuyến CHỈ khi đã có token (sau khi hydrate xong hoặc vừa login).
  // Nếu chạy lúc cold-start trước khi token nạp -> request không Authorization -> 401 ->
  // chuyến bị bỏ (mất dữ liệu) + interceptor gọi logout() (đăng xuất giả). Gate theo token.
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) return;
    flushPendingTrips().catch(() => {});
    maybeAutoShutdownStale().catch(() => {}); // đóng chuyến bị kẹt từ phiên trước (app bị kill)
    flushPendingGpsTrips().catch(() => {});
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

  return <>{children}</>;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppLoader>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </AppLoader>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
