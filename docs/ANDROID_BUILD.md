# Building VoicePad for Android (release)

`android/` is gitignored and hand-maintained. **Never run `expo prebuild --clean`.**
If `android/` is ever regenerated with `npx expo prebuild`, these config plugins in `app.json` re-apply the custom native changes:

| Change | Where it comes from on prebuild |
| --- | --- |
| Share sheet: receive audio (WhatsApp voice notes) on MainActivity | `plugins/with-share-intent.js` (+ `share-intent-activity.kt.txt`) |
| `android.targetSdkVersion=36` (Play requirement from Aug 31, 2026) | `plugins/with-android-build-props.js` |
| `expo.useLegacyPackaging=true` (compressed native libs; installs on Android Go) | `plugins/with-android-build-props.js` |
| No `SYSTEM_ALERT_WINDOW` permission | `android.blockedPermissions` in `app.json` |
| Chevron launcher icon + splash | `assets/images/*` + `app.json` adaptiveIcon / expo-splash-screen |

One thing prebuild does **not** recreate: the release signing config. Re-add this to `android/app/build.gradle`
(`signingConfigs { release { ... } }` and `buildTypes.release.signingConfig`) after a prebuild:

```gradle
release {
    if (project.hasProperty('VOICEPAD_UPLOAD_STORE_FILE')) {
        storeFile file(VOICEPAD_UPLOAD_STORE_FILE)
        storePassword VOICEPAD_UPLOAD_STORE_PASSWORD
        keyAlias VOICEPAD_UPLOAD_KEY_ALIAS
        keyPassword VOICEPAD_UPLOAD_KEY_PASSWORD
    }
}
```

Pass the four values as `ORG_GRADLE_PROJECT_VOICEPAD_UPLOAD_*` environment variables. The keystore and its
passwords are never committed.

## Build

```bash
cd android
./gradlew bundleRelease assembleRelease --no-daemon --max-workers=1
# Play Store:  app/build/outputs/bundle/release/app-release.aab
# Sideload:    app/build/outputs/apk/release/app-release.apk  (then zipalign -P 16 + apksigner v2/v3)
```

Bump `versionCode` / `versionName` in both `app.json` and `android/app/build.gradle`.
