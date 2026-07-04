import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AdMobBanner as ExpoAdMobBanner } from 'expo-ads-admob';

const BANNER_AD_UNIT_ID = __DEV__
  ? 'ca-app-pub-3940256099942544/6300978111' // Google test banner ad unit id
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN';

export default function AdMobBanner() {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (Platform.OS === 'web' || failedToLoad) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ExpoAdMobBanner
        bannerSize="smartBannerPortrait"
        adUnitID={BANNER_AD_UNIT_ID}
        servePersonalizedAds={true}
        onDidFailToReceiveAdWithError={(event: any) => {
          setFailedToLoad(true);
          console.warn('AdMob banner failed to load:', event.nativeEvent.error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
});
