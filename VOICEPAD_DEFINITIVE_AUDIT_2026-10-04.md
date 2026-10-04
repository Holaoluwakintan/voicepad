# VoicePad definitive pre-preview audit

**Audit date:** 2026-10-04  
**Audited checkout:** local `main` at commit `2216cca`  
**Remote state:** local `main` is **4 commits ahead of `origin/main`**  
**Preview status:** deliberately paused until the release source and Render deployment are aligned

## Executive verdict

The current source is in a reasonable **preview-candidate** state, but the currently deployed Render service is not yet aligned with it. A preview APK built from local commit `2216cca` would contain the new guest-first behavior, while the app would still call a Render service that is visibly serving older behavior.

**Do not treat the app as release-ready until these two actions are complete:**

1. Push the four local commits to GitHub `main`.
2. Redeploy the single `voicepad-transcription` Render service from that commit and confirm the deploy SHA.

The source checks are clean, but a real-device transcription, OCR, sign-in, and AdMob test are still required.

## Rating summary

| Area | Rating | Definite status |
|---|---:|---|
| Local TypeScript/build hygiene | Strong | TypeScript passes; lint passes; server syntax passes |
| Server security in current source | Strong | Production auth, CORS fail-closed behavior, protected `/models`, base64 validation |
| Guest access design | Good | Mobile guests receive a configurable daily quota; signed-in users bypass it |
| Authentication implementation | Average | Email/password, OAuth, reset, persistence exist; real Supabase flow is not integration-tested |
| Transcription implementation | Average | Multipart, base64 fallback, timeout/retry, provider fallback exist; real speech has not been proven on a device |
| Photo-to-text/OCR | Average | End-to-end path exists and server upload bug is fixed; no real-photo automated test or quota UX test |
| AdMob | Good for preview | Native plugin and app IDs exist; banner is shown after consent; actual serving/revenue remains unverified |
| Monetization | Intentionally incomplete | No payment is taken and no fake Pro entitlement is granted |
| Sync/cloud storage | Average | Local-first and cloud sync exist; conflict and multi-device behavior need device testing |
| UI/UX | Good preview baseline | Home, recording, notes, scan, profile and navigation received premium redesign work |
| Production deployment | Blocked | Live Render service is stale relative to current source |

## What is working and verified

### Local source verification

The following passed on the audited checkout:

- `npm run typecheck`
- `npm run lint`
- `npm run test:server` — 8 tests passed, 0 failed
- `node --check server/index.mjs`
- `git diff --check`

The source has these implemented paths:

- Local note creation, editing, deletion, and persistence
- Audio recording and audio-file selection
- Multipart transcription upload
- Base64 JSON transcription fallback
- 120-second client timeout and transient retry
- Groq transcription with Deepgram and Gemini fallback code
- Photo capture and photo-library selection
- Single-page and multi-page scan flow
- Gemini Vision OCR route
- Copy and save scanned text to notes
- Email/password sign-in and sign-up
- Email confirmation resend
- Google/Apple OAuth initiation
- Password reset initiation and recovery routes
- Supabase session persistence on native and web
- Cloud note sync and private audio storage helpers
- AdMob native plugin and initialization
- Premium UI redesign across the primary app surfaces

### Current guest behavior in source

The current source is configured for the requested policy:

- Mobile guests may use AI without signing in.
- Default mobile guest quota is **3 AI requests per rolling 24 hours**.
- `MOBILE_GUEST_DAILY_LIMIT` can change that value on Render.
- Authenticated users bypass the guest quota and use the authenticated rate limits.
- After the guest quota is reached, the server returns a clear sign-in-required response.
- The recorder turns that response into: “Your free guest transcriptions are used up for today. Sign in to continue using AI transcription.”
- Multipart fallback retries with the same idempotency key count only once toward the mobile guest quota.

### Current monetization behavior in source

- AdMob remains enabled on native builds after consent.
- The unfinished “Remove ads / Go Pro” banner nudge was removed.
- The Upgrade screen no longer writes `is_pro` into user metadata.
- Guests cannot fake a Pro entitlement through the client.
- No subscription payment is taken.
- The app does not claim that a user has successfully paid for Pro.

## Live Render findings

The live service `https://voicepad-transcription.onrender.com` is reachable:

- `/health` returned HTTP 200.
- `/ping` returned HTTP 200.
- `/privacy` returned HTTP 200.
- `/terms` returned HTTP 200.

However, the live deployment is not aligned with the current source:

- Unauthenticated `GET /models` returned HTTP 200 live.
- Current source protects `/models` with authentication and rate limiting.
- Therefore the live service is running an older deployment, or its deployed source/configuration differs from local commit `2216cca`.

A deliberately invalid audio payload returned HTTP 502 with “Transcription provider could not process the audio.” This proves the live endpoint reached provider-processing logic and rejected invalid media. It **does not prove that valid recordings work or fail**; a real speech file is required.

## Transcription: definite status

### Strengths

- The client sends Supabase bearer credentials when a session exists.
- Guests can send requests with `X-Client-Type: mobile`.
- Native multipart upload is attempted first.
- Base64 JSON fallback protects against native multipart bridge issues.
- The server accepts both multipart and JSON audio payloads.
- Provider fallback logic exists.
- Large files skip Groq when they exceed Groq's 25 MB limit.
- Idempotency prevents a successful fallback retry from being processed twice.
- Errors now distinguish authentication failure from guest-quota exhaustion.

### Average / needs real testing

- There is no automated test using a real valid `.m4a`, `.wav`, or `.mp3` speech file.
- There is no physical Android test proving the `expo-file-system` path reads the generated recording correctly.
- Provider keys and model availability are not validated by CI.
- A provider can reject unsupported language selections even though the UI offers those languages.
- A 120-second timeout is long for a mobile UI and depends on Render cold-start behavior.
- The client still contains stale `mode: 'english'` fields in multipart payloads even when a language is selected; the server primarily uses `language`.
- The exact final provider and latency are only visible in Render logs.

### Definite answer

**Will it transcribe?** The code path is present and locally valid. The live service is reachable and provider-connected enough to reject invalid media. But a successful real transcription is **not yet proven**. The correct release test is a fresh APK recording 10–15 seconds of clear speech, followed immediately by checking Render logs for `groq_transcription_succeeded`, `deepgram_transcription_succeeded`, or `gemini_transcription_succeeded`.

## Photo-to-text: definite status

### Strengths

- Camera and photo-library permissions are requested.
- Single images and up to 20 selected images are supported.
- Images are sent to `/ocr` as base64 JSON.
- The server's disk-based Multer upload mismatch was fixed; OCR now reads the temporary file correctly.
- Extracted text can be edited, copied, and saved locally.
- Partial multi-page results identify pages that failed.

### Average / needs improvement

- There is no automated real-image OCR test.
- Twenty base64 images can use substantial JavaScript memory.
- OCR failures are collected per page, but there is no dedicated retry-only-failed-pages action.
- OCR currently depends primarily on Gemini Vision; the old “Groq Vision fallback” wording is not reliable documentation.
- Provider 429/backoff behavior is limited.
- A real clear JPG under 2 MB must be tested before trusting large multi-page scans.

### Definite answer

**Will picture-to-text work?** The client/server path is implemented and the server upload bug is fixed. It should work when a valid Gemini key is active and the image is clear, but it has not been proven with a real photo in this audit. Treat it as **preview-testable, not production-proven**.

## Authentication: definite status

### Strengths

- Supabase credentials are supplied through Expo environment variables.
- Sessions persist through AsyncStorage on native and localStorage on web.
- `getAuthHeaders()` sends the active access token to AI endpoints.
- Email/password sign-in and sign-up are implemented.
- OAuth uses an app callback URL on native and the web origin on web.
- Password reset uses a native `voicepad://auth/reset-password` callback.
- Server verifies bearer tokens through Supabase `/auth/v1/user`.
- Production source does not silently allow unauthenticated non-guest access.

### Average / needs real testing

- Supabase redirect URLs must match the exact deployed web origin and native callback URL.
- OAuth and password reset have not been tested in the exact fresh APK.
- There is no end-to-end auth test against the actual Supabase project.
- If Supabase configuration is missing from the APK, the app intentionally falls back to local-only mode and cloud AI authentication will not work.
- A user whose sign-in fails can still use the three mobile guest requests; after that, sign-in is required.

### Definite answer

**If authentication fails, can users still use the app?** Yes, under the current requested policy. They can use local recording/notes and the limited mobile guest AI quota. After the guest quota is consumed, they must successfully sign in to continue AI requests. Cloud sync remains unavailable until a valid session exists.

## AdMob: definite status

### Strengths

- `react-native-google-mobile-ads` is in dependencies.
- The root plugin is configured in `app.json`.
- Android and iOS AdMob app IDs exist in native configuration.
- The banner is initialized at app startup on native builds.
- The banner is rendered only after the consent flag is accepted.
- The unfinished Pro upsell under the banner has been removed.

### Average / needs improvement

- Actual ad serving cannot be verified from this sandbox or from source inspection.
- The app must be installed as a native preview/development build; Expo Go will not link the native AdMob module.
- AdMob account/app status, ad unit status, policy review, and fill rate are external to this codebase.
- A production app should use Google test ads during development to avoid policy violations.
- The current consent flow is an app terms consent flag, not a complete Google UMP consent implementation for all jurisdictions.

### Definite answer

**Can AdMob run before Play Store publication?** The native app is configured to request banners before Play Store publication. However, actual impressions and earnings depend on the AdMob account, app registration, ad-unit configuration, device build, consent, policy status, and ad fill. A preview build can verify whether a banner loads; it cannot guarantee revenue.

## Deployment and Git blockers

### Current Git state

```text
HEAD: 2216cca feat(access): allow limited guest transcription with AdMob
main...origin/main [ahead 4]
```

The local source is ahead of GitHub by four commits. The untracked audit file is documentation only.

### Current Render state

The live Render service still exposes behavior from before the current hardening changes. That means the Render service must be redeployed from the pushed commit before the preview APK is used for a meaningful end-to-end test.

### Required deployment sequence

1. Push local `main` to GitHub:

   ```powershell
   git push origin main
   ```

2. In Render, redeploy the single service named `voicepad-transcription` from the new GitHub commit.
3. Confirm the Render deploy page shows commit `2216cca` or a later commit containing it.
4. Confirm these Render values:

   ```text
   NODE_ENV=production
   REQUIRE_AUTH=true
   MOBILE_GUEST_DAILY_LIMIT=3
   MAX_REQUESTS_PER_MINUTE=60
   MAX_REQUESTS_PER_USER_PER_MINUTE=120
   ALLOWED_ORIGINS=<actual production web origin>
   SUPABASE_URL=<your Supabase URL>
   SUPABASE_ANON_KEY=<your publishable/anon key>
   GROQ_API_KEY=<valid key>
   GEMINI_API_KEY=<valid key for OCR fallback>
   DEEPGRAM_API_KEY=<valid key for long-audio fallback, if used>
   ```

5. After redeploy, verify unauthenticated `/models` no longer returns the provider list. It should return an authentication error.
6. Build the preview APK from the pushed commit, not from an old ZIP or stale checkout.
7. Test in this order:
   - Open app and accept terms.
   - Record 10–15 seconds of speech as a guest.
   - Repeat until the guest quota is reached.
   - Confirm the sign-in prompt appears.
   - Sign in and confirm transcription continues.
   - Scan one clear JPG under 2 MB.
   - Confirm the AdMob banner appears on the native build.
   - Check Render logs after every AI request.

## Final release decision

**Source decision:** Ready for a controlled preview build.  
**Deployment decision:** Not ready for meaningful preview testing until the four local commits are pushed and Render is redeployed.  
**Transcription decision:** Implemented but not yet proven with valid speech.  
**OCR decision:** Implemented and corrected, but not yet proven with a real image.  
**Authentication decision:** Guest-first behavior is implemented; real Supabase sign-in/OAuth/reset still require device testing.  
**AdMob decision:** Native configuration is present and the premium upsell is removed; actual ad serving remains an external verification step.  
**Monetization decision:** No fake subscription or payment flow is active, as requested.
