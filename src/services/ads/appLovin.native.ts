import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AppLovinMAX from 'react-native-applovin-max';

type AppLovinExtra = {
  sdkKey?: string;
  androidBannerAdUnitId?: string;
  iosBannerAdUnitId?: string;
};

let initPromise: Promise<void> | null = null;

function getExtra(): AppLovinExtra {
  const expoConfigExtra = (Constants.expoConfig as any)?.extra ?? (Constants.manifest as any)?.extra ?? {};
  return (expoConfigExtra.applovin ?? {}) as AppLovinExtra;
}

export function getAppLovinSdkKey(): string {
  return (getExtra().sdkKey ?? '').trim();
}

export function getAppLovinBannerAdUnitId(): string {
  const extra = getExtra();
  const adUnitId = (Platform.OS === 'ios' ? extra.iosBannerAdUnitId : extra.androidBannerAdUnitId) ?? '';
  return adUnitId.trim();
}

export function initializeAppLovinAds(): Promise<void> {
  const sdkKey = getAppLovinSdkKey();
  if (!sdkKey) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = AppLovinMAX.initialize(sdkKey)
    .then(() => {})
    .catch((error) => {
      console.warn('AppLovin MAX init failed:', error);
    })
    .then(() => {});

  return initPromise;
}
