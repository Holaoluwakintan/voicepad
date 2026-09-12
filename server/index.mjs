import cors from 'cors';
import express from 'express';
import multer from 'multer';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch {}
  try { process.loadEnvFile('../.env'); } catch {}
}

const app = express();
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'voicepad-transcription' }));

app.get('/models', async (_req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  try {
    const resp = await fetch(`${groqBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    });
    const data = await resp.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Could not fetch models' });
  }
});

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < rateWindowMs);
  recent.push(now);
  requestsByIp.set(ip, recent);
  return recent.length > maxRequestsPerWindow;
}

function rateLimitMiddleware(req, res, next) {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }
  next();
}

app.post('/transcribe', rateLimitMiddleware, upload.single('file'), async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });
  const isAudio =
    req.file.mimetype.startsWith('audio/') ||
    req.file.mimetype.startsWith('video/') ||
    req.file.mimetype === 'application/octet-stream' ||
    /\.(m4a|mp4|webm|ogg|wav|mp3|aac)$/i.test(req.file.originalname || '');
  if (!isAudio) return res.status(400).json({ error: 'Unsupported audio format.' });

  // Default to whisper-large-v3-turbo on transcriptions for blazing-fast transcription speed
  const models = [
    process.env.GROQ_TRANSCRIPTION_MODEL,
    'whisper-large-v3-turbo',
    'whisper-large-v3',
  ].filter(Boolean);

  console.log(`transcription_request file=${req.file.originalname || 'unknown'} bytes=${req.file.size}`);

  for (const model of models) {
    try {
      const form = new FormData();
      form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/mp4' }), req.file.originalname || 'voice-note.m4a');
      form.append('model', model);
      form.append('response_format', 'json');
      form.append('temperature', '0');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let response;
      try {
        response = await fetch(`${groqBaseUrl}/audio/transcriptions`, {
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
        console.warn(`transcription_model_failed model=${model} status=${response.status}`, payload?.error?.message);
        continue; // Try next model candidate
      }
      if (payload?.text && typeof payload.text === 'string') {
        console.log(`groq_transcription_succeeded model=${model}`);
        return res.json({ text: payload.text.trim(), model });
      }
    } catch (err) {
      console.warn(`transcription_attempt_failed model=${model}`, err instanceof Error ? err.message : err);
    }
  }

  return res.status(502).json({ error: 'Transcription provider could not process the audio. Please retry.' });
});

app.post('/summarize', rateLimitMiddleware, async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });

  const text = req.body?.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Transcript text is required.' });
  }

  // Use llama-3.1-8b-instant as primary (available to all Groq tiers, sub-second latency) with fallbacks
  const modelsToTry = [
    process.env.GROQ_SUMMARY_MODEL,
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
  ].filter(Boolean);

  console.log(`summary_request chars=${text.length}`);

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      let response;
      try {
        response = await fetch(`${groqBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are VoicePad AI, an expert executive assistant and note-taker. Provide a crisp, structured breakdown of the user transcript. Follow this exact format:\n\n' +
                  '### 📌 Executive Summary\n2-3 concise sentences summarizing the core message.\n\n' +
                  '### 🔑 Key Takeaways\n- Bullet points of the primary ideas and insights discussed.\n\n' +
                  '### ⚡ Action Items & Next Steps\n- [ ] Concrete tasks, decisions, or follow-ups mentioned (or "None mentioned" if none).',
              },
              {
                role: 'user',
                content: text.slice(0, 32000),
              },
            ],
            temperature: 0.2,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.warn(`summary_model_failed model=${model} status=${response.status}`, payload?.error?.message);
        continue; // Try next candidate model
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (content && typeof content === 'string') {
        console.log(`groq_summary_succeeded model=${model}`);
        return res.json({ summary: content.trim(), model });
      }
    } catch (err) {
      console.warn(`summary_attempt_failed model=${model}`, err instanceof Error ? err.message : err);
    }
  }

  return res.status(502).json({ error: 'AI summary could not be generated. Please retry.' });
});

// Image-to-Text OCR Vision Endpoint (Llama 3.2 Vision)
app.post('/ocr', rateLimitMiddleware, upload.single('image'), async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });

  let base64Data = '';
  let mimeType = 'image/jpeg';

  if (req.file) {
    base64Data = req.file.buffer.toString('base64');
    mimeType = req.file.mimetype || 'image/jpeg';
  } else if (req.body?.image) {
    const raw = req.body.image;
    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        base64Data = raw;
      }
    } else {
      base64Data = raw;
    }
  } else {
    return res.status(400).json({ error: 'An image file or base64 data is required.' });
  }

  const visionModels = [
    process.env.GROQ_VISION_MODEL,
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision',
    'llama-3.2-90b-vision',
    'meta-llama/llama-3.2-11b-vision-instruct',
    'meta-llama/llama-3.2-90b-vision-instruct',
    'qwen/qwen-2.5-vl-72b-instruct',
    'llava-v1.5-7b-4096-preview',
  ].filter(Boolean);

  let lastErrorMessage = '';

  for (const model of visionModels) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      let response;
      try {
        response = await fetch(`${groqBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract and transcribe all text from this image accurately (whiteboard, document, handwritten notes, lecture slides, or textbook). Format cleanly with headings and bullet points where helpful. Output ONLY the transcribed content without any extra intro or conversational commentary.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Data}`,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        lastErrorMessage = payload?.error?.message || `Groq returned status ${response.status} for model ${model}`;
        console.warn(`vision_model_failed model=${model} status=${response.status}`, lastErrorMessage);
        continue;
      }

      const text = payload?.choices?.[0]?.message?.content;
      if (text && typeof text === 'string') {
        const firstLine = text.split('\n')[0].replace(/^[#*\s-]+/, '').trim().slice(0, 50);
        return res.json({
          text: text.trim(),
          title: firstLine || 'Photo Note',
          model,
        });
      }
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`vision_attempt_failed model=${model}`, lastErrorMessage);
    }
  }

  return res.status(502).json({
    error: lastErrorMessage || 'Could not transcribe image. Please ensure the image is clear and retry.',
  });
});

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Audio file is larger than 25 MB.' });
  return res.status(400).json({ error: error?.message || 'Invalid request.' });
});

app.listen(port, '0.0.0.0', () => console.log(`VoicePad transcription server listening on http://0.0.0.0:${port}`));
