import { Platform } from 'react-native';
import Constants from 'expo-constants';
import mobileAds from 'react-native-google-mobile-ads';

type AdMobExtra = {
  androidBannerAdUnitId?: string;
  iosBannerAdUnitId?: string;
};

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
