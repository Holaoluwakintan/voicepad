# VoicePad setup on a new Windows laptop

## 1. Install prerequisites

Install Node.js LTS from https://nodejs.org/ or with PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell, then verify:

```powershell
node --version
npm --version
npx --version
```

## 2. Open this project

Extract the downloaded ZIP to a folder such as:

```text
C:\Users\YOUR_NAME\voicepad
```

Then open PowerShell and run:

```powershell
cd "$HOME\voicepad"
npm install
npm --prefix server install
npm --prefix web install
```

## 3. Add local Android and iOS AdMob settings

The ZIP intentionally does not include private/local environment files. Create a file named `.env` in the project root:

```env
ADMOB_ANDROID_APP_ID=your-android-admob-app-id
ADMOB_IOS_APP_ID=your-ios-admob-app-id
EXPO_PUBLIC_ADMOB_BANNER_ID=your-android-banner-unit-id
EXPO_PUBLIC_ADMOB_IOS_BANNER_ID=your-ios-banner-unit-id
```

These are public app/ad identifiers, but keep the file uncommitted.

For the web environment, create `web/.env`:

```env
VITE_ADSENSE_CLIENT=ca-pub-your-publisher-id
VITE_ADSENSE_SLOT=your-display-ad-unit-id
VITE_ADSENSE_HOST=
VITE_SITE_URL=https://your-real-production-domain.com
```

## 4. Log in to EAS

```powershell
npx eas-cli@latest login
npx eas-cli@latest project:info
```

The Expo project owner must grant your Expo account access to the VoicePad project. If the project is not visible, sign in with the Expo account that owns it or ask the owner to add you as a collaborator.

## 5. Add EAS cloud environment variables

Use the Expo dashboard or run these commands after logging in:

```powershell
npx eas-cli@latest env:create --name ADMOB_ANDROID_APP_ID --value "your-android-admob-app-id" --environment production --visibility sensitive
npx eas-cli@latest env:create --name ADMOB_IOS_APP_ID --value "your-ios-admob-app-id" --environment production --visibility sensitive
npx eas-cli@latest env:create --name EXPO_PUBLIC_ADMOB_BANNER_ID --value "your-android-banner-unit-id" --environment production --visibility sensitive
npx eas-cli@latest env:create --name EXPO_PUBLIC_ADMOB_IOS_BANNER_ID --value "your-ios-banner-unit-id" --environment production --visibility sensitive
```

Repeat for the `preview` environment if you want internal preview builds. The project `eas.json` already maps development, preview, and production profiles to the matching EAS environments.

## 6. Verify and build

```powershell
npx expo config --type public
npm run typecheck
npm run lint
npm --prefix web run check
npm --prefix web test
npm --prefix web run build
```

Android preview APK:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Production Android build:

```powershell
npx eas-cli@latest build --platform android --profile production
```

Production iOS build:

```powershell
npx eas-cli@latest build --platform ios --profile production
```

Do not use production AdMob ads while testing and never click your own ads. Use Google test ads during development.
