export const ADS_FREE_FOR_PREMIUM = false;

export function getAdMobBannerAdUnitId(): string {
  return '';
}

export function getAdMobAppOpenAdUnitId(): string {
  return '';
}

export function initializeAdMob(): Promise<void> {
  return Promise.resolve();
}

export function maybeShowInterstitialAfterSave(): Promise<void> {
  return Promise.resolve();
}
