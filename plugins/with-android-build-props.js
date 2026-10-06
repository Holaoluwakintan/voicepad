/**
 * Expo config plugin: keeps VoicePad's hand-set android/gradle.properties values if
 * `expo prebuild` ever regenerates the (gitignored) android/ folder.
 *  - android.targetSdkVersion=36: Google Play requires API 36 for new apps and updates
 *    from Aug 31, 2026.
 *  - expo.useLegacyPackaging=true: compressed native libs (extractNativeLibs=true); this
 *    is what made the APK install on low-end Android Go phones (v1.0.2).
 */
const { withGradleProperties } = require('@expo/config-plugins');

const PROPS = {
  'android.targetSdkVersion': '36',
  'expo.useLegacyPackaging': 'true',
};

module.exports = function withAndroidBuildProps(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
