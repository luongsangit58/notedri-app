import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AdFormat, AdView } from 'react-native-applovin-max';
import { getAppLovinBannerAdUnitId } from '../services/ads/appLovin';

export default function AppLovinBanner() {
  const adUnitId = getAppLovinBannerAdUnitId();
  if (Platform.OS === 'web' || !adUnitId) return null;

  return (
    <View style={styles.container}>
      <AdView
        adUnitId={adUnitId}
        adFormat={AdFormat.BANNER}
        style={styles.banner}
        onAdLoadFailed={(errorInfo) => {
          console.warn('AppLovin banner failed to load:', errorInfo);
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
  banner: {
    width: '100%',
    height: 'auto',
    backgroundColor: '#111827',
  },
});
