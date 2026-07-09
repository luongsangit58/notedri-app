import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { getAdMobBannerAdUnitId } from '../services/ads/admob';

export default function AdMobBanner() {
  const adUnitId = __DEV__ ? TestIds.BANNER : getAdMobBannerAdUnitId();
  if (Platform.OS === 'web' || !adUnitId) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(error) => {
          console.warn('AdMob banner failed to load:', error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
});
