# VoicePad transcription server

This small server keeps the Groq API key off the mobile app. VoicePad currently sends one clear request—**Transcribe to English**—and the server calls Groq’s audio translation endpoint:

`https://api.groq.com/openai/v1/audio/translations`

The server also supports the original-language endpoint at `/transcribe` when the multipart field `mode=original` is sent:

`https://api.groq.com/openai/v1/audio/transcriptions`

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

The server listens on port `8787`.

## Models

- English translation: `whisper-large-v3` by default.
- Original-language transcription: `whisper-large-v3-turbo` by default.

You can override them on the server:

```powershell
$env:GROQ_TRANSLATION_MODEL="whisper-large-v3"
$env:GROQ_TRANSCRIPTION_MODEL="whisper-large-v3-turbo"
```

## Connect the app

Create a `.env` file in the project root (do not commit it):

- Android emulator: `EXPO_PUBLIC_TRANSCRIPTION_API_URL=http://10.0.2.2:8787`
- Physical phone on the same Wi-Fi: use the computer's LAN IP, for example `EXPO_PUBLIC_TRANSCRIPTION_API_URL=http://192.168.1.20:8787`

Restart Expo after changing `.env`.

The mobile app saves the recording first, then sends it to the server. If translation fails, the audio remains available locally.

## Important security rule

Only put `GROQ_API_KEY` in the server terminal or server hosting environment. Never put it in the Expo `.env` file, source code, ZIP, or mobile build.
