# VoicePad transcription server

This small server keeps the Groq API key off the mobile app. VoicePad sends audio to the server, which calls Groq's audio translation endpoint and returns English text.

## Run locally

```bash
cd server
npm install
export GROQ_API_KEY="your-server-only-key"
npm start
```

On Windows PowerShell:

```powershell
cd server
npm install
$env:GROQ_API_KEY="your-server-only-key"
npm start
```

The server listens on the hosting platform's `PORT` value, or `8787` locally.

## Hosted deployment

The repository includes `/render.yaml` for a Node web service. In Render, create a new Blueprint from the GitHub repository and set the required secret:

```text
GROQ_API_KEY=your-new-server-only-key
```

Optional production variables are:

```text
GROQ_TRANSLATION_MODEL=whisper-large-v3
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
MAX_REQUESTS_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_MINUTE=20
ALLOWED_ORIGINS=https://your-web-origin.example
# REQUIRE_AUTH=false lets signed-out (guest) users transcribe. Set it to "true" only if
# every user of your app is required to sign in first, otherwise guests get a 401.
REQUIRE_AUTH=false
```

The service health check is:

```text
GET /health
```

The public app should use the resulting HTTPS URL, for example:

```env
EXPO_PUBLIC_TRANSCRIPTION_API_URL=https://voicepad-transcription.onrender.com
```

Never put `GROQ_API_KEY` in the Expo `.env`, source code, ZIP, or mobile build. Keep the key only in the server hosting provider's private environment settings.

Before deploying, apply the versioned SQL migration in `supabase/migrations/`. It creates the account deletion function, processing job records, quota records, and synchronization conflict records. Production AI routes require a valid Supabase bearer token and an `Idempotency-Key` header.

## Models

English translation uses `whisper-large-v3` by default. Original-language transcription uses `whisper-large-v3-turbo` by default.
