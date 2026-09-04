import cors from 'cors';
import express from 'express';
import multer from 'multer';

const app = express();
const port = Number(process.env.PORT ?? 8787);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const groqBaseUrl = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';

app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true, service: 'voicepad-transcription' }));

app.post('/transcribe', upload.single('file'), async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required.' });
  }

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

    const response = await fetch(`${groqBaseUrl}/audio/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('groq_transcription_failed', response.status, payload);
      return res.status(502).json({ error: payload?.error?.message || 'Groq transcription failed. The audio is still saved locally.' });
    }

    if (!payload?.text || typeof payload.text !== 'string') {
      return res.status(502).json({ error: 'Groq returned no transcript.' });
    }

    console.log(`groq_transcription_succeeded mode=${mode}`);
    return res.json({ text: payload.text, mode, model });
  } catch (error) {
    console.error('transcription_failed', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'Transcription failed. The recording is still saved locally; try again.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`VoicePad transcription server listening on http://0.0.0.0:${port}`);
});
