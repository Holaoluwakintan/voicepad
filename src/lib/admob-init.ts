/**
 * Initialise AdMob once at startup on native builds, safely.
 *
 * v1.1.5: Google's User Messaging Platform (UMP) runs first. It shows Google's consent form
 * only where the law requires it (EEA, UK, Switzerland) and only until the user answers.
 * Ads are initialised only when UMP says ads may be requested. If UMP cannot be reached
 * (offline, or no consent message published in AdMob yet) and consent was never given,
 * no ads are requested in that session.
 */
let privacyOptionsRequired = false;
let resolveAdsAllowed: (allowed: boolean) => void = () => {};
const adsAllowed = new Promise<boolean>((resolve) => { resolveAdsAllowed = resolve; });

/** Resolves once UMP has answered: true when ads may be requested. */
export function whenAdsAllowed(): Promise<boolean> {
  return adsAllowed;
}

export async function initAdMob(): Promise<void> {
  let ads: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ads = require('react-native-google-mobile-ads');
  } catch {
    resolveAdsAllowed(false);
    return; // react-native-google-mobile-ads not linked (Expo Go): ignore
  }
  try {
    await ads.AdsConsent.gatherConsent();
  } catch {
    // keep going: getConsentInfo below decides whether ads may be requested
  }
  let canRequestAds = false;
  try {
    const info = await ads.AdsConsent.getConsentInfo();
    canRequestAds = Boolean(info?.canRequestAds);
    privacyOptionsRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch {
    canRequestAds = false;
  }
  if (!canRequestAds) {
    resolveAdsAllowed(false);
    return;
  }
  try {
    await ads.default().initialize();
  } catch {
    // ignore: the banner may still load on its own
  }
  resolveAdsAllowed(true);
}

/** True when the user is in a region where Google requires an "ad privacy choices" entry point. */
export function isAdPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequired;
}

/** Re-opens Google's consent form so the user can change their ad choices. */
export async function showAdPrivacyOptions(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads');
    await ads.AdsConsent.showPrivacyOptionsForm();
  } catch {
    // ignore
  }
}
