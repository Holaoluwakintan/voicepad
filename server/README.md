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
ALLOWED_ORIGINS=*
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

## Models

English translation uses `whisper-large-v3` by default. Original-language transcription uses `whisper-large-v3-turbo` by default.
