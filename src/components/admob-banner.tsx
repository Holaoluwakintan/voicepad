import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

const TERMS_KEY = '@voicepad/terms_accepted_v1';

export function AdMobBanner() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TERMS_KEY).then((value) => setConsented(value === 'true'));
  }, []);

  if (Platform.OS === 'web' || !consented) return null;

  // Keep Expo Go and web builds safe: the native module is only required on a native build.
  // Production builds must provide EXPO_PUBLIC_ADMOB_BANNER_ID; development uses Google's test ID.
  let ads: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ads = require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
  const BannerAd = ads.BannerAd;
  const bannerSize = ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
  const unitId = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID || ads.TestIds.BANNER
    : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || ads.TestIds.BANNER;
  if (!ads.__voicepadInitialized) {
    ads.__voicepadInitialized = true;
    void ads.default().initialize();
  }

  return (
    <View style={styles.container} accessibilityLabel="Advertisement">
      <BannerAd unitId={unitId} size={bannerSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 8,
  },
});
