import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds, { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { useAuthStore } from '../../store/authStore';

type AdMobExtra = {
  androidBannerAdUnitId?: string;
  iosBannerAdUnitId?: string;
  androidInterstitialAdUnitId?: string;
  iosInterstitialAdUnitId?: string;
  androidAppOpenAdUnitId?: string;
  iosAppOpenAdUnitId?: string;
};

// Chưa mở bán gói Premium "hết quảng cáo" -> tạm hiện ads cho tất cả user kể cả
// is_premium. Đổi thành true khi triển khai quyền lợi Premium hết quảng cáo.
export const ADS_FREE_FOR_PREMIUM = false;

let initPromise: Promise<void> | null = null;

function getExtra(): AdMobExtra {
  const expoConfigExtra = (Constants.expoConfig as any)?.extra ?? (Constants.manifest as any)?.extra ?? {};
  return (expoConfigExtra.admob ?? {}) as AdMobExtra;
}

export function getAdMobBannerAdUnitId(): string {
  const extra = getExtra();
  const adUnitId = (Platform.OS === 'ios' ? extra.iosBannerAdUnitId : extra.androidBannerAdUnitId) ?? '';
  return adUnitId.trim();
}

function getAdMobInterstitialAdUnitId(): string {
  const extra = getExtra();
  const adUnitId = (Platform.OS === 'ios' ? extra.iosInterstitialAdUnitId : extra.androidInterstitialAdUnitId) ?? '';
  return adUnitId.trim();
}

export function getAdMobAppOpenAdUnitId(): string {
  const extra = getExtra();
  const adUnitId = (Platform.OS === 'ios' ? extra.iosAppOpenAdUnitId : extra.androidAppOpenAdUnitId) ?? '';
  return adUnitId.trim();
}

// Sau mỗi lượt lưu (refuel/service/odometer), cứ N lần mới chèn 1 interstitial
// để tránh làm phiền user và vi phạm chính sách "quá nhiều quảng cáo" của AdMob.
const SAVE_COUNT_KEY = 'admob_save_count';
const SHOW_INTERSTITIAL_EVERY = 3;

export async function maybeShowInterstitialAfterSave(): Promise<void> {
  if (ADS_FREE_FOR_PREMIUM && useAuthStore.getState().user?.is_premium) return;

  const raw = await AsyncStorage.getItem(SAVE_COUNT_KEY).catch(() => null);
  const count = (Number(raw) || 0) + 1;
  await AsyncStorage.setItem(SAVE_COUNT_KEY, String(count)).catch(() => {});
  if (count % SHOW_INTERSTITIAL_EVERY !== 0) return;

  const adUnitId = __DEV__ ? TestIds.INTERSTITIAL : getAdMobInterstitialAdUnitId();
  if (!adUnitId) return;

  await new Promise<void>((resolve) => {
    const interstitial = InterstitialAd.createForAdRequest(adUnitId);
    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      unsubscribeLoaded();
      interstitial.show();
    });
    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      unsubscribeClosed();
      unsubscribeError();
      resolve();
    });
    const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      console.warn('AdMob interstitial failed:', error);
      unsubscribeClosed();
      unsubscribeError();
      resolve();
    });
    interstitial.load();
  });
}

export function initializeAdMob(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = mobileAds()
    .initialize()
    .then(() => {})
    .catch((error) => {
      console.warn('AdMob init failed:', error);
    });

  return initPromise;
}
