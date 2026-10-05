/** Initialise AdMob once at startup on native builds, safely. */
export function initAdMob() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads');
    ads.default().initialize().catch(() => {});
  } catch {
    // react-native-google-mobile-ads not linked (Expo Go) — ignore
  }
}
