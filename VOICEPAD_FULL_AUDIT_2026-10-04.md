# VoicePad full audit — 2026-10-04

## Executive diagnosis

The transcription Render service is alive:

- `GET /health` returns HTTP 200.
- `GET /ping` is available.
- `/privacy` and `/terms` return HTTP 200.
- `/models` currently returns a provider model list, which indicates that at least one Groq-compatible provider credential is configured and reachable.

However, a synthetic invalid audio request to `/transcribe` returned HTTP 502 (`Transcription provider could not process the audio`). This does **not** prove valid speech transcription is broken because the test payload was not a real audio recording. A real recorded speech sample is still required for final end-to-end proof.

The current GitHub `main` branch passes:

- TypeScript check
- Expo lint, with six warnings
- All 8 server tests

Passing these checks does not prove recording, authentication, Supabase, OCR, provider credentials, or a production EAS build work.

## Important source/deployment mismatch

The exported archive and GitHub `main` are not identical. The archive contains an extra `app.config.js` and differs in `app.json`, `package.json`, `render.yaml`, `server/index.mjs`, and AdMob code. Do not build from the old ZIP. Use a fresh clone of GitHub `main`, or create one known release commit and build only from that commit.

The live Render service also appears to be configured differently from the archive and repository examples. In particular, the current GitHub `render.yaml` sets `REQUIRE_AUTH=false`, while the archive had `REQUIRE_AUTH=true`. Render dashboard environment variables override repository YAML, so the dashboard values must be checked directly.

## What is working / verified

### Source health

- The current GitHub branch compiles successfully.
- Server tests pass: 8 passed, 0 failed.
- The server has health and ping endpoints.
- The server has multipart and base64 JSON transcription paths.
- The server has Groq, Deepgram, and Gemini fallback code.
- The app has Supabase email/password auth, OAuth initiation, password reset initiation, local note storage, cloud note sync, audio upload, summary, OCR, and deletion code.
- The current GitHub `app.json` contains the root AdMob plugin configuration, matching the latest build-fix commit.

### Live Render

- Render is not down.
- DNS/TLS/HTTP routing works.
- The service is responding as `voicepad-transcription`.
- The model-list endpoint is reachable.

## What is not verified and must be tested manually

- Valid speech transcription from an Android/iOS recording.
- Valid web MediaRecorder transcription.
- Supabase sign-up, email confirmation, sign-in, OAuth, password reset, and sign-out against the actual project.
- Supabase RLS and storage upload/download/delete with a real user.
- Gemini OCR with a real document photo.
- Summary generation with a real transcript.
- Background/locked-screen recording.
- A fresh EAS preview build installed on a physical device.
- Render deployment using the current GitHub commit rather than an older dashboard-selected commit.

## Critical production problems

### 1. Render configuration is inconsistent

The committed current GitHub configuration includes:

```env
REQUIRE_AUTH=false
MAX_REQUESTS_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_MINUTE=20
```

The server code also defaults to allowing unauthenticated non-web/mobile requests when `REQUIRE_AUTH` is not explicitly true. This explains why a mobile request can reach provider processing without a Supabase session, but it also means anyone who discovers the endpoint can spend provider credits.

Recommended immediate choice:

- For a controlled staging/demo release: keep `REQUIRE_AUTH=false`, but enforce strict per-IP/per-device quotas and label it staging.
- For production: set `REQUIRE_AUTH=true`, verify that the app sends a valid Supabase bearer token, and give signed-in users a server-side quota.

Do not switch to `REQUIRE_AUTH=true` blindly before testing sign-in in the exact EAS build; otherwise the app will show “Sign in required” and transcription will appear broken.

### 2. Provider failures are hidden from the user and observability is too weak

The server tries many providers/models and returns the same generic 502 after all failures. The client then shows a generic retry message. There is no authenticated admin diagnostic endpoint showing provider status, failure class, latency, or last successful provider.

Render logs must be checked immediately after one real recording. Look for:

```text
transcription_request
transcription_model_failed
transcription_attempt_failed
deepgram_failed
gemini_transcription_failed
groq_transcription_succeeded
deepgram_transcription_succeeded
gemini_transcription_succeeded
```

If there is no `transcription_request`, the app is calling the wrong URL or failing before the request leaves the device. If there is a request but every provider fails, the problem is credentials, provider model availability, file format, size, or language support.

### 3. The server has hard-coded Supabase fallback credentials

The current server source contains fallback Supabase URL and anon-key values instead of requiring them from Render environment variables. Remove hard-coded deployment credentials and fail clearly when production configuration is missing. Public anon keys are not service-role secrets, but they still should not be embedded as server defaults.

### 4. `/models` is unauthenticated

`GET /models` can call the provider without authentication and exposes provider model information. It should be protected or removed from production. It also consumes provider access and can be abused.

### 5. CORS is permissive when `ALLOWED_ORIGINS` is absent

The server intentionally allows all origins when `ALLOWED_ORIGINS` is empty. Production must set a concrete value, for example:

```env
ALLOWED_ORIGINS=https://your-web-domain.example
```

Do not use `*` with credentials.

## Transcription audit

### Client path

The mobile and web clients support:

1. Multipart upload.
2. Base64 JSON fallback.
3. A 120-second client timeout.
4. One retry for timeout/network/502/503 errors.
5. Supabase bearer headers when a session exists.

### Defects still present

- The client still sends `mode: 'english'` in multipart transcription even when another language is selected. The server ignores `mode`, but this is stale and confusing.
- Retry from the note detail screen omits the saved language, so a retry may use automatic detection rather than the user’s selected language.
- Empty transcripts are treated as provider failure instead of a clear “No speech detected” result.
- Multiple legacy/new Expo file-system APIs are mixed. This can break uploads on some SDK/runtime combinations.
- The record screen contains unused language-picker state, indicating the language UI and implementation are out of sync.
- The recording comment says 48 kbps is approximately 100 minutes under 25 MB; the real duration is materially lower. Long recordings may skip Groq and depend on fallbacks.
- Supported Yoruba, Hausa, and Igbo behavior is not validated against each configured provider. A language can appear in the picker while every provider rejects or performs poorly on it.
- Background recording is not proven. Android declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, not a microphone-specific foreground service permission.

### Likely causes of “no transcription”

1. The installed APK was built from stale source or stale EAS environment variables.
2. `EXPO_PUBLIC_TRANSCRIPTION_API_URL` points to the wrong Render service.
3. `REQUIRE_AUTH=true` is active in Render while the installed app has no valid Supabase session.
4. The request reaches Render, but provider keys/models fail; only Render logs can distinguish this.
5. The recorded file cannot be read by the selected Expo file-system API.
6. The selected language is unsupported by the provider fallback chain.
7. The app is using an old build where the transcription payload or URL was different.

## Photo-to-text/OCR audit

### Implemented path

- The scan screen can take one photo or select up to 20 images.
- Each image is processed sequentially.
- The client sends base64 data to `/ocr`.
- The server sends the image to Gemini Vision.
- Extracted text can be edited, copied, and saved locally.

### Defects and risks

- There is no provider-independent live OCR test in the repository.
- A batch of 20 images can still hold a large amount of base64 data in JavaScript memory.
- There is no exponential backoff for provider 429 responses.
- The server says “under 15 MB” while the actual check allows approximately 20 MB of base64 data.
- The client catches each page failure and can return partial results without a strong retry workflow for failed pages.
- OCR requires a working Gemini key; Groq Vision is described in comments but the current route only calls Gemini Vision.

## Authentication audit

### Implemented

- Supabase session persistence uses AsyncStorage on native and localStorage on web.
- Email/password sign-in and sign-up exist.
- OAuth for Google and Apple exists.
- Password-reset email initiation exists.
- Auth headers are sent to AI endpoints when a session exists.

### Problems

- The server can be configured to allow AI access without authentication, but the UI still presents sign-in-related states. This creates inconsistent expectations.
- OAuth redirect URLs are generated dynamically and must be allow-listed in Supabase for both web and mobile builds.
- Password-reset completion requires the matching reset route and recovery event handling to be present in the exact shipped build; this must be tested on a physical device and web.
- The UI stores profile metadata and the server relies on environment/configuration rather than a complete server entitlement system.
- There is no end-to-end auth test using the actual Supabase project.

Required Supabase URL configuration should include the actual web origin and the mobile schemes produced by the app, for example:

```text
https://your-web-domain.example
https://your-web-domain.example/auth/callback
voicepad://auth/callback
voicepad://auth/reset-password
```

Use the exact redirect shown by `Linking.createURL()` in the built app; do not guess it.

## Monetization and entitlement audit

The Pro feature is not a real subscription system:

- `upgrade.tsx` calls `supabase.auth.updateUser({ data: { is_pro: true } })`.
- A user can self-assign Pro metadata.
- Guest users receive a “Pro Activated” alert without payment.
- The UI promises Store Payments, unlimited AI, PDF export, and priority models that are not fully implemented or server-enforced.
- Ad hiding is controlled by writable user metadata.

This should not be shipped as a paid feature. Replace it with either:

1. A clearly labelled “Coming soon / join waitlist” screen, or
2. A real RevenueCat/App Store/Google Play entitlement flow with server verification and a server-side entitlement table.

## Sync, deletion, and privacy audit

### Sync

The current sync now fetches after uploading local notes and detects some remote-vs-local conflicts, but it still performs broad upserts before a complete pull/merge cycle. It does not use a conditional revision check to prevent stale-device overwrites. Conflict counting is not incremented even when conflict rows are inserted.

Use pull-first merge, conditional revision updates, explicit conflict counts, and foreground/save-triggered sync.

### Deletion

Note deletion has improved in the current source because note detail deletes cloud audio, but the record-screen discard path still needs verification for cloud audio that is uploaded asynchronously. Deleted local/cloud note content must be blanked or hard-deleted according to the privacy policy.

### Privacy copy is inaccurate

The server policy still says:

- VoicePad “functions fully offline.”
- AI processors are “Groq Whisper & Llama.”
- Users have full export and deletion rights.

The implementation also sends data to Deepgram and Gemini, and a complete export path is not verified. Update the policy and consent UI before production.

## UI/UX quality issues found

- The upgrade screen is polished visually but advertises non-existent billing and entitlements.
- The recording screen has unused language-picker state and a fake/simple waveform rather than true audio amplitude history.
- Several screens still use emoji as primary icons.
- The app assets retain template/default visual choices: blue splash/adaptive background conflicts with the purple design system.
- The app does not consistently communicate whether a note is local, synced, pending, failed, or waiting for authentication.
- There are no robust empty/error states for every AI failure mode.
- Lint passes but reports six warnings, including unused state/imports in recording and upgrade screens.

## Current automated quality level

Current GitHub main:

- TypeScript: pass.
- ESLint: pass with 6 warnings.
- Server tests: 8 pass, 0 fail.
- Device/integration tests: absent.
- Real provider tests: absent.
- EAS build/install verification: not performed in this audit.

## Exact next steps

### Step 1 — Stop building from stale exports

1. Delete or archive the old ZIP.
2. Clone GitHub main fresh.
3. Record the commit SHA used for the build.
4. Build only from that checkout.
5. In EAS, verify the build environment variables before starting the build.

### Step 2 — Verify Render dashboard against the intended configuration

For the current Render service, set explicitly:

```env
NODE_ENV=production
REQUIRE_AUTH=false
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_USER_PER_MINUTE=20
ALLOWED_ORIGINS=https://your-web-domain.example
GROQ_API_KEY=<server-only value>
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
GEMINI_API_KEY=<server-only value if OCR/summary fallback is required>
DEEPGRAM_API_KEY=<server-only value if long-audio fallback is required>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<public anon/publishable key>
```

Use `REQUIRE_AUTH=false` only while validating the transcription path. After the first successful end-to-end test, decide whether production should require authentication and then test the authenticated EAS build.

Redeploy and confirm the Render deploy page shows the expected GitHub commit.

### Step 3 — Test one real recording

1. Install a fresh preview APK from the new commit.
2. Confirm the app’s `EXPO_PUBLIC_TRANSCRIPTION_API_URL` is exactly the Render URL.
3. Record 10–15 seconds of clear English speech.
4. Capture the note ID/request ID if displayed.
5. Check Render logs immediately.
6. Classify the failure as client URL/file/auth/provider.

### Step 4 — Test OCR separately

Use one clear JPG under 2 MB first. Do not start with a 20-page batch. Check Render logs for `gemini_vision_succeeded` or `gemini_vision_failed`.

### Step 5 — Fix before cosmetic redesign

Priority fixes:

1. Remove hard-coded server credentials and require Render environment variables.
2. Protect `/models`.
3. Decide and enforce one auth policy.
4. Fix file-system API consistency.
5. Fix language propagation and empty transcript handling.
6. Remove fake Pro activation.
7. Correct privacy policy and consent text.
8. Add a real E2E test for recording → transcription success/failure.
9. Add a real E2E test for image → OCR success/failure.
10. Then address visual polish and assets.

## Bottom line

The app is not failing because Render is completely down. The API is alive. The main problem is that the project has several different source/configuration states, no real device/provider integration tests, inconsistent authentication settings, and generic error handling that hides the actual provider failure. The next action should be a **fresh preview build from the current GitHub commit plus one real recording while watching Render logs**. Do not create a new Render service yet; first verify the existing service’s deployed commit and environment variables. A new Render service would likely reproduce the same configuration mistakes.
