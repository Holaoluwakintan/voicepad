const base = require('./app.json');

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env'); } catch {}
}

const androidAppId = process.env.ADMOB_ANDROID_APP_ID?.trim();
const iosAppId = process.env.ADMOB_IOS_APP_ID?.trim();
const plugins = [...(base.expo.plugins || [])];

if (androidAppId || iosAppId) {
  const adsPluginConfig = {
    ...(androidAppId ? { androidAppId } : {}),
    ...(iosAppId ? { iosAppId } : {}),
    userTrackingUsageDescription: 'This identifier helps deliver relevant ads. You can decline tracking in iOS settings.',
  };
  plugins.push([
    'react-native-google-mobile-ads',
    adsPluginConfig,
  ]);
}

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins,
  },
};
