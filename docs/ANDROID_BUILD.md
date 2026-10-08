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


## JS-only release without a native rebuild (used for 1.1.6, 2026-10-08)

When only JavaScript/TypeScript changed (no new native modules, no new images), the release APK can be
produced by swapping the Hermes bundle into the previous signed APK:

1. Build `index.android.bundle` exactly as Gradle does: `npx expo export:embed --eager --platform android --dev false
   --reset-cache --entry-file node_modules/expo-router/entry.js --bundle-output out/index.android.bundle.js
   --assets-dest out/res --minify false`, then `node_modules/hermes-compiler/hermesc/linux64-bin/hermesc -w -emit-binary
   -out out/index.android.bundle out/index.android.bundle.js -O -output-source-map`. With the four `EXPO_PUBLIC_*`
   values from `.env.example` set, building the 1.1.5 source this way reproduced the 1.1.5 APK's bundle byte for byte.
2. Replace `assets/index.android.bundle`, bump `versionCode`/`versionName` in the binary `AndroidManifest.xml` and in
   `assets/app.config`, then `zipalign -P 16 -f 4` and `apksigner sign --v1-signing-enabled false --v2-signing-enabled true
   --v3-signing-enabled true` with the release keystore.
3. 32-bit APK = the universal minus `lib/arm64-v8a/*`, aligned and signed the same way. It is only for phones whose
   Android is 32-bit: on a 64-bit phone Android shows "This app isn't compatible with the latest version of Android"
   for any app that has only 32-bit native code (AppWarnings.showDeprecatedAbiDialogIfNeeded). The default download
   (`/voicepad.apk`) is the universal APK.
