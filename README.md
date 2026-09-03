# VoicePad

VoicePad is an Expo mobile and web app for recording voice notes and converting them to English text with Groq Whisper.

## Run locally

Use two separate PowerShell windows. The server and Expo app must never be started from the same folder.

### Window 1: transcription server

```powershell
cd "C:\Users\USERR\voicepad-groq-clean\server"
npm install
$env:GROQ_API_KEY="YOUR_REAL_GROQ_API_KEY"
npm start
```

Keep this window open. The server listens on port `8787`.

### Window 2: Expo app

```powershell
cd "C:\Users\USERR\voicepad-groq-clean"
npm install
npx expo start --clear
```

The project root is the folder containing the main `package.json`, `app.json`, and `src` directory. Do not run Expo from `server`.

## Server URL defaults

The app uses the following defaults when `EXPO_PUBLIC_TRANSCRIPTION_API_URL` is not set:

- Web: `http://localhost:8787`
- Android emulator: `http://10.0.2.2:8787`

For a physical phone on the same Wi-Fi as the computer, create `.env` in the project root with the computer’s LAN IP:

```env
EXPO_PUBLIC_TRANSCRIPTION_API_URL=http://192.168.1.20:8787
```

Replace the example IP with the computer’s IPv4 address from `ipconfig`, then restart Expo.

## Test the server

From another PowerShell window:

```powershell
Invoke-WebRequest http://localhost:8787/health
```

Expected response:

```json
{"ok":true,"service":"voicepad-transcription"}
```

## Transcription behavior

When a recording stops, VoicePad saves the audio locally first, then calls the server. The server sends the audio to Groq’s `/audio/translations` endpoint using `whisper-large-v3`, returning English text. The Groq key remains server-side and must never be added to the Expo `.env` file or committed to Git.

## Development rules

Do not run `npm audit fix --force` in this Expo project; it can change Expo package versions and break compatibility. Install dependencies with `npm install` only.

The server implementation and deployment notes are in [`server/README.md`](server/README.md).
