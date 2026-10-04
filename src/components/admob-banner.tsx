import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

const TERMS_KEY = '@voicepad/terms_accepted_v1';

/**
 * AdMobBanner
 * - Shows for all users until a server-verified store entitlement is integrated.
 * - Shows a native AdMob banner for free (consented) users on native builds.
 * - Does nothing on web (AdSense is handled separately in the web build).
 * - AdMob is initialised once at app startup in _layout.tsx, not here.
 */
export function AdMobBanner() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TERMS_KEY).then((value) => setConsented(value === 'true'));
  }, []);

  if (Platform.OS === 'web' || !consented) return null;

  // Keep Expo Go and web builds safe: the native module is only required on a native build.
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
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID || 'ca-app-pub-1282831461622449/4405209438'
    : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || 'ca-app-pub-1282831461622449/3953869013';

  return (
    <View style={styles.container} accessibilityLabel="Advertisement">
      <BannerAd unitId={unitId} size={bannerSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 4,
  },
});
