import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAppOpenAd, TestIds } from 'react-native-google-mobile-ads';
import { useAuthStore } from '../store/authStore';
import { getAdMobAppOpenAdUnitId, ADS_FREE_FOR_PREMIUM } from '../services/ads/admob';

// Hiện quảng cáo App Open khi user quay lại app từ nền (không hiện lúc cold
// start, để không chen vào splash/luồng đăng nhập lúc mở app lần đầu).
export default function AppOpenAdManager() {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const hasToken = useAuthStore((s) => !!s.token);
  const adUnitId = __DEV__ ? TestIds.APP_OPEN : getAdMobAppOpenAdUnitId();
  const skip = (ADS_FREE_FOR_PREMIUM && isPremium) || !hasToken || !adUnitId;

  const { isLoaded, isClosed, load, show } = useAppOpenAd(skip ? null : adUnitId);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!skip) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, isClosed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const cameToForeground = /background|inactive/.test(appState.current) && next === 'active';
      appState.current = next;
      if (cameToForeground && !skip && isLoaded) show();
    });
    return () => sub.remove();
  }, [skip, isLoaded, show]);

  return null;
}
