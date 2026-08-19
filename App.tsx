import React, { useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/api/queryClient';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import ObdSessionBanner from './src/components/ObdSessionBanner';
import NetworkStatusToast from './src/components/NetworkStatusToast';
import ObdAutoConnect from './src/components/ObdAutoConnect';
import AppOpenAdManager from './src/components/AppOpenAdManager';
import NoriFloatingButton from './src/components/nori/NoriFloatingButton';
import { useThemeStore } from './src/utils/theme';
import { useCockpitThemeStore } from './src/store/cockpitThemeStore';
import { useObdAutoConnectSettingsStore } from './src/store/obdAutoConnectSettingsStore';
import { useI18nStore } from './src/i18n';
import { flushPendingTrips } from './src/services/obd/TripSyncQueue';
import { bleService } from './src/services/obd/BleService';
import { hasAnyPairing } from './src/services/obd/pairedDevices';
import { syncAutoWakeDevices } from './src/services/obd/autoWakeSync';
import { flushPendingGpsTrips } from './src/services/gps/GpsTripSyncQueue';
import { maybeAutoShutdownStale, autoArmIfReady, registerGpsRecoveryTask } from './src/services/gps/GpsTripTracker';
import { vehiclesApi } from './src/api/vehicles';
import { initDeepLinkService } from './src/services/nfc/DeepLinkService';
import { sendDeviceHeartbeat } from './src/api/devices';
import { useAuthStore } from './src/store/authStore';
import { initializeAdMob } from './src/services/ads/admob';
import { ensureConfigured as ensureRevenueCatConfigured } from './src/services/iap/RevenueCatService';
import { recoverPendingGoogleAuthIfAny } from './src/services/googleAuthRecovery';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { installGlobalErrorHandler, readLastFatalError } from './src/services/crashLog';

// Rà soát crash 7/8: đăng ký NGAY lúc module này load (không phải trong
// useEffect/component) - crash có thể xảy ra trước khi component đầu tiên
// kịp mount (xem crashLog.ts).
installGlobalErrorHandler();

async function tryAutoArmGpsTracking(): Promise<void> {
  try {
    const res = await vehiclesApi.list();
    const raw = (res as any)?.data;
    const vehicles: any[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
    if (!defaultVehicle?.id) return;

    // Rà soát 2026-08-14 (đào sâu case đa xe): đây là lối arm DUY NHẤT tự đoán xe
    // (theo "mặc định"/xe đầu tiên) mà không có tín hiệu phần cứng/thao tác user
    // nào xác nhận - tài khoản có >=2 xe thì guess này có thể sai (user sắp lái
    // xe KHÁC, không phải xe mặc định). Đánh dấu guessed để GpsTripTracker biết
    // KHÔNG được âm thầm giữ vehicleId này qua 1 lần dừng/tự finalize nếu không
    // có gì xác nhận lại (xem isVehicleClaimConfirmed()) - tránh ghi nhầm quãng
    // đường của xe khác vào xe được đoán. Tài khoản chỉ 1 xe thì không có gì để
    // đoán sai -> vẫn tin tưởng như cũ.
    await autoArmIfReady(defaultVehicle.id, { guessed: vehicles.length > 1 });
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
    // Đợi loadSaved() đọc xong công tắc tổng auto-connect từ AsyncStorage rồi
    // mới đồng bộ cache native (autoWakeSync.ts) - đồng bộ trước khi load xong
    // sẽ đọc nhầm giá trị mặc định `enabled: true` dù user đã tắt trước đó.
    void useObdAutoConnectSettingsStore.getState().loadSaved().then(() => {
      void syncAutoWakeDevices();
    });
    void initializeAdMob();
    ensureRevenueCatConfigured();
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
    // Rà soát crash 7/8: không có crash reporter nào gắn ngoài - in ra lỗi
    // fatal gần nhất (nếu có) để còn cách tra khi máy nối debugger/logcat.
    readLastFatalError().then((e) => {
      if (e) console.warn('[crashLog] previous session ended with a fatal error:', e.at, e.message);
    });
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
    // Rà soát 27/7: lưới an toàn cuối cùng dọn chuyến kẹt định kỳ (~15 phút, qua
    // WorkManager) - chạy được cả khi app không mở, tự phục hồi sau khi đầu xe
    // khởi động lại. Xem comment RECOVERY_TASK_NAME trong GpsTripTracker.ts.
    registerGpsRecoveryTask();
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
        navigationRef.navigate('ObdReport', { vehicleId: data.vehicleId });
      }
      // Chạm thông báo "đã lưu hành trình" (ngắt OBD2) -> mở thẳng màn Hành
      // trình GPS của đúng xe để xem/kiểm soát (Tạm dừng/Dừng theo dõi).
      if (data?.type === 'gps_trip_saved' && data.vehicleId && navigationRef.isReady()) {
        navigationRef.navigate('GpsTrips', { vehicleId: data.vehicleId });
      }
    });
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}

export default function App() {
  // Rà soát 15/8 (bug thật user báo: khe/viền màu sáng lộ ra ở mép trên-dưới
  // Home, không khớp nền tối của app) - NavigationContainer trước đây KHÔNG
  // được truyền `theme`, nên React Navigation dùng theme mặc định (nền xám
  // nhạt/trắng của DefaultTheme) cho card/scene container ở tầng dưới cùng -
  // bất kỳ khoảng nào JS chưa kịp vẽ đè màu nền tối riêng của từng màn hình lên
  // (viền/góc, lúc chuyển màn...) sẽ lộ đúng màu sáng mặc định đó. Truyền theme
  // khớp đúng bảng màu hiện tại của app (dark/light tự đổi theo cài đặt user)
  // để MỌI TẦNG bên dưới (kể cả những nơi JS chưa vẽ tới) đều cùng 1 màu nền.
  const themeColors = useThemeStore((s) => s.colors);
  const themeMode = useThemeStore((s) => s.mode);
  const navTheme = useMemo(() => {
    const base = themeMode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: themeColors.primary,
        background: themeColors.background,
        card: themeColors.surface,
        text: themeColors.text,
        border: themeColors.border,
        notification: themeColors.error,
      },
    };
  }, [themeMode, themeColors]);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Rà soát 2026-07-28 (bàn phím vẫn che input NoriChatScreen dù đã dựa vào
            android:windowSoftInputMode="adjustResize" - user báo "vẫn lỗi" sau khi test thật):
            adjustResize + KeyboardAvoidingView thuần react-native không đủ tin cậy trên nhiều
            ROM/Android version (đặc biệt với edge-to-edge ngày càng phổ biến, xem
            docs/nori-agent-plan.md) - chuyển sang `react-native-keyboard-controller` (thư viện
            hiện tại Expo khuyến nghị cho đúng use-case này, xem AGENTS.md + tài liệu Expo bản app
            đang dùng). `KeyboardProvider` PHẢI bọc ở gốc app để mọi component con (KeyboardStickyView
            ở NoriChatScreen, và bất kỳ màn hình nào dùng sau này) hoạt động được. */}
        <KeyboardProvider>
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <AppLoader>
                <NavigationContainer ref={navigationRef} theme={navTheme}>
                  <RootNavigator />
                  <ObdSessionBanner />
                  <NetworkStatusToast />
                  <ObdAutoConnect />
                  <AppOpenAdManager />
                  <NoriFloatingButton />
                </NavigationContainer>
              </AppLoader>
            </QueryClientProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
