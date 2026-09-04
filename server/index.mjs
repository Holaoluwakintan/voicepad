import cors from 'cors';
import express from 'express';
import multer from 'multer';

const app = express();
const port = Number(process.env.PORT ?? 8787);
const maxFileSize = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize },
});
const groqBaseUrl = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((value) => value.trim()).filter(Boolean);
const requestsByIp = new Map();
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Number(process.env.MAX_REQUESTS_PER_MINUTE ?? 10);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed.'));
  },
}));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'voicepad-transcription' }));

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < rateWindowMs);
  recent.push(now);
  requestsByIp.set(ip, recent);
  return recent.length > maxRequestsPerWindow;
}

app.post('/transcribe', upload.single('file'), async (req, res) => {
  if (isRateLimited(req.ip)) return res.status(429).json({ error: 'Too many transcription requests. Please wait a minute and try again.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });
  if (!req.file.mimetype.startsWith('audio/') && !req.file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'Unsupported audio format.' });

  const mode = req.body?.mode === 'original' ? 'original' : 'english';
  const endpoint = mode === 'english' ? 'translations' : 'transcriptions';
  const model = mode === 'english'
    ? process.env.GROQ_TRANSLATION_MODEL || 'whisper-large-v3'
    : process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';

  console.log(`transcription_request mode=${mode} file=${req.file.originalname || 'unknown'} bytes=${req.file.size} model=${model}`);

  try {
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/mp4' }), req.file.originalname || 'voice-note.m4a');
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (mode === 'english') form.append('language', 'en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response;
    try {
      response = await fetch(`${groqBaseUrl}/audio/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('groq_transcription_failed', response.status, payload?.error?.message || 'provider error');
      return res.status(502).json({ error: payload?.error?.message || 'Groq transcription failed. The audio is still saved locally.' });
    }
    if (!payload?.text || typeof payload.text !== 'string') return res.status(502).json({ error: 'Groq returned no transcript.' });

    console.log(`groq_transcription_succeeded mode=${mode}`);
    return res.json({ text: payload.text, mode, model });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Groq transcription timed out. Please retry.' : 'Transcription provider is temporarily unavailable. Please retry.';
    console.error('transcription_failed', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: message });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Audio file is larger than 25 MB.' });
  return res.status(400).json({ error: error?.message || 'Invalid request.' });
});

app.listen(port, '0.0.0.0', () => console.log(`VoicePad transcription server listening on http://0.0.0.0:${port}`));
