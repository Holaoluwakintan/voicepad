import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';

const TERMS_KEY = '@voicepad/terms_accepted_v1';

/**
 * AdMobBanner
 * - Hides completely when user has `is_pro: true` in Supabase user_metadata.
 * - Shows a native AdMob banner for free (consented) users on native builds.
 * - Shows a small "Remove ads" nudge below the banner so users know how to upgrade.
 * - Does nothing on web (AdSense is handled separately in the web build).
 * - AdMob is initialised once at app startup in _layout.tsx, not here.
 */
export function AdMobBanner() {
  const [consented, setConsented] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(TERMS_KEY).then((value) => setConsented(value === 'true'));
  }, []);

  // Pro users never see ads
  const isPro = Boolean(user?.user_metadata?.is_pro);
  if (isPro || Platform.OS === 'web' || !consented) return null;

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
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID || ads.TestIds.BANNER
    : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || ads.TestIds.BANNER;

  return (
    <View style={styles.container} accessibilityLabel="Advertisement">
      <BannerAd unitId={unitId} size={bannerSize} />
      <Pressable
        style={styles.removeAdsBtn}
        onPress={() => router.push('/upgrade')}
        accessibilityLabel="Remove ads by going Pro"
        accessibilityRole="button"
      >
        <Text style={styles.removeAdsText}>✨ Remove ads — Go Pro</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  removeAdsBtn: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  removeAdsText: {
    color: '#6D5DFB',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
