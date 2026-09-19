import crypto from 'node:crypto';
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
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:8081,http://localhost:19006').split(',').map((value) => value.trim()).filter(Boolean);
const requestsByIp = new Map();
const requestsByUser = new Map();
const idempotencyResponses = new Map();
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Number(process.env.MAX_REQUESTS_PER_MINUTE ?? 10);
const maxRequestsPerUserPerWindow = Number(process.env.MAX_REQUESTS_PER_USER_PER_MINUTE ?? 20);
const idempotencyTtlMs = 10 * 60_000;

// Periodically clean up stale IPs to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestsByIp.entries()) {
    const recent = timestamps.filter((timestamp) => now - timestamp < rateWindowMs);
    if (recent.length === 0) {
      requestsByIp.delete(ip);
    } else {
      requestsByIp.set(ip, recent);
    }
  }
  for (const [userId, timestamps] of requestsByUser.entries()) {
    const recent = timestamps.filter((timestamp) => now - timestamp < rateWindowMs);
    if (recent.length === 0) requestsByUser.delete(userId);
    else requestsByUser.set(userId, recent);
  }
  for (const [key, entry] of idempotencyResponses.entries()) {
    if (now - entry.createdAt >= idempotencyTtlMs) idempotencyResponses.delete(key);
  }
}, 5 * 60_000).unref?.();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by VoicePad CORS policy'));
  },
  credentials: true,
}));

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader('x-request-id', req.requestId);
  next();
});

app.all(['/health', '/ping'], (_req, res) => res.json({ ok: true, service: 'voicepad-transcription', timestamp: Date.now() }));

// Render Free Tier keep-alive: ping self every 13 minutes if deployed on Render
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV === 'production' ? 'https://voicepad-transcription.onrender.com' : null);
if (renderExternalUrl) {
  setInterval(async () => {
    try {
      await fetch(`${renderExternalUrl}/health`);
    } catch {}
  }, 13 * 60_000).unref?.();
}

const termsSections = [
  { title: '1. Acceptance of Terms', content: 'By downloading, accessing, or using VoicePad, you agree to be legally bound by these Terms of Service.' },
  { title: '2. Eligibility & Account Responsibilities', content: 'You must be at least 13 years of age (16 in the EEA) to use VoicePad. You are responsible for safeguarding your account credentials.' },
  { title: '3. Audio Recording & Multi-Party Consent Laws', content: 'IMPORTANT NOTICE: Audio recording consent laws vary by jurisdiction. You covenant that you have obtained all necessary permissions before recording any individual. VoicePad bears zero liability for unconsented recordings made by users.' },
  { title: '4. AI Transcription & Summary Disclaimer', content: 'Transcriptions and summaries are probabilistic machine learning outputs. VoicePad makes no warranty regarding absolute accuracy. The service is NOT intended for court reporting, emergency, or medical transcription.' },
  { title: '5. Intellectual Property & User Ownership', content: 'You retain 100% ownership of your audio, notes, and transcripts. VoicePad does NOT sell or train public AI models on your private data.' },
  { title: '6. Prohibited Activities', content: 'Prohibited activities include illegal surveillance, harassing content, reverse engineering, and automated abuse.' },
  { title: '7. Limitation of Liability', content: 'VoicePad is provided AS IS. To the maximum extent permitted by law, VoicePad shall not be liable for incidental, special, or consequential damages.' },
  { title: '8. Account Deletion', content: 'You may delete your account and all associated cloud notes and recordings at any time in the app settings.' },
];

const privacySections = [
  { title: '1. Commitment to Privacy', content: 'VoicePad is designed on a local-first privacy architecture. Your private data is never sold or used for advertising.' },
  { title: '2. Information We Collect', content: 'We collect account credentials (if you sign in), recorded audio and scanned photos (solely when you request transcription), and diagnostic metadata.' },
  { title: '3. Local-First Processing', content: 'VoicePad functions fully offline. If you do not create a cloud sync account, your notes never leave your device except when you explicitly initiate AI transcription.' },
  { title: '4. AI Subprocessors (Groq Whisper & Llama)', content: 'Audio and images are transmitted over encrypted TLS directly to our secure proxy and processed ephemerally on enterprise infrastructure without retention for model training.' },
  { title: '5. Cloud Storage & Security', content: 'Cloud notes are protected by PostgreSQL Row Level Security (RLS). Audio files are stored in private buckets accessible only via short-lived signed URLs.' },
  { title: '6. User Rights & Data Erasure', content: 'Under GDPR and CCPA, you have full rights to export your data or permanently delete your account and all stored records.' },
  { title: '7. Permissions', content: 'Microphone, Camera, and Photo permissions are used strictly for recording voice notes and scanning documents for text extraction.' },
];

function renderLegalHtml(title, sections) {
  const cards = sections
    .map((s) => `<div class="card"><h2>${s.title}</h2><p>${s.content}</p></div>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - VoicePad</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F1F5FB; color: #182235; margin: 0; padding: 36px 16px; line-height: 1.6; }
    .container { max-width: 740px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 28px; }
    .eyebrow { color: #6D5DFB; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
    h1 { font-size: 32px; font-weight: 800; margin: 0 0 8px 0; }
    .updated { color: #687384; font-size: 14px; }
    .card { background: #FFFFFF; border-radius: 16px; border: 1px solid #E1E7F0; padding: 22px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(24,34,53,0.04); }
    h2 { font-size: 18px; margin-top: 0; margin-bottom: 8px; color: #182235; }
    p { margin: 0; color: #4A5568; font-size: 15px; }
    footer { text-align: center; color: #9AA4B2; font-size: 13px; margin-top: 36px; }
    a { color: #6D5DFB; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="eyebrow">VoicePad Official Legal</div>
      <h1>${title}</h1>
      <div class="updated">Effective: September 14, 2026</div>
    </header>
    ${cards}
    <footer>
      &copy; 2026 VoicePad. All rights reserved. &bull; <a href="/privacy">Privacy Policy</a> &bull; <a href="/terms">Terms of Service</a>
    </footer>
  </div>
</body>
</html>`;
}

app.get('/privacy', (_req, res) => res.type('html').send(renderLegalHtml('Privacy Policy', privacySections)));
app.get('/terms', (_req, res) => res.type('html').send(renderLegalHtml('Terms of Service', termsSections)));

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
// Paid AI routes are authenticated by default. Set REQUIRE_AUTH=false only for
// an explicitly isolated local development server, never in production.
const requireAuth = process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH !== 'false';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && supabaseUrl) {
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: authHeader,
          apikey: supabaseAnonKey,
        },
      });
      if (resp.ok) {
        req.user = await resp.json();
      }
    } catch {}
  }

  if (requireAuth && !req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to use VoicePad AI.', requestId: req.requestId });
  }

  next();
}

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
  const identity = req.user?.id;
  if (identity) {
    const now = Date.now();
    const recent = (requestsByUser.get(identity) ?? []).filter((timestamp) => now - timestamp < rateWindowMs);
    recent.push(now);
    requestsByUser.set(identity, recent);
    if (recent.length > maxRequestsPerUserPerWindow) {
      return res.status(429).json({ error: 'Your VoicePad AI usage limit has been reached. Please try again later.', requestId: req.requestId });
    }
  }
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.', requestId: req.requestId });
  }
  next();
}

function idempotencyMiddleware(req, res, next) {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (!key || key.length > 200) {
    return res.status(400).json({ error: 'An Idempotency-Key header is required for AI requests.', requestId: req.requestId });
  }
  const scopedKey = `${req.user?.id || req.ip}:${req.path}:${key}`;
  const previous = idempotencyResponses.get(scopedKey);
  if (previous) return res.status(previous.status).json(previous.body);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyResponses.set(scopedKey, { createdAt: Date.now(), status: res.statusCode, body });
    }
    return originalJson(body);
  };
  next();
}

const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
const groqApiKeyBackup = (process.env.GROQ_API_KEY_BACKUP || '').trim();

async function callGeminiSummary(text) {
  if (!geminiApiKey) return null;
  const geminiModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  for (const model of geminiModels) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                'You are VoicePad AI, an expert executive assistant and note-taker. Provide a crisp, structured breakdown of the user transcript. Follow this exact format:\n\n' +
                '### 📌 Executive Summary\n2-3 concise sentences summarizing the core message.\n\n' +
                '### 🔑 Key Takeaways\n- Bullet points of the primary ideas and insights discussed.\n\n' +
                '### ⚡ Action Items & Next Steps\n- [ ] Concrete tasks, decisions, or follow-ups mentioned (or "None mentioned" if none).\n\n' +
                `Transcript: ${text.slice(0, 40000)}`,
            }],
          }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!resp.ok) {
        console.warn(`gemini_summary_failed model=${model} status=${resp.status}`);
        continue;
      }
      const data = await resp.json().catch(() => null);
      const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
      if (content && content.trim()) {
        console.log(`gemini_summary_succeeded model=${model}`);
        return { summary: content.trim(), model: `gemini/${model}` };
      }
    } catch (err) {
      console.warn(`gemini_summary_err model=${model}`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

async function callGeminiVision(base64Data, mimeType) {
  if (!geminiApiKey) return null;
  const geminiVisionModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
  for (const model of geminiVisionModels) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Extract and transcribe all text from this image accurately (whiteboard, document, handwritten notes, lecture slides, or textbook). Format cleanly with headings and bullet points where helpful. Output ONLY the transcribed content without any extra intro or conversational commentary.',
              },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Data,
                },
              },
            ],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      });
      if (!resp.ok) {
        console.warn(`gemini_vision_failed model=${model} status=${resp.status}`);
        continue;
      }
      const data = await resp.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
      if (text && text.trim()) {
        const firstLine = text.split('\n')[0].replace(/^[#*\s-]+/, '').trim().slice(0, 50);
        console.log(`gemini_vision_succeeded model=${model}`);
        return {
          text: text.trim(),
          title: firstLine || 'Photo Note',
          model: `gemini/${model}`,
        };
      }
    } catch (err) {
      console.warn(`gemini_vision_err model=${model}`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

app.post('/transcribe', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, upload.single('file'), async (req, res) => {
  const groqKeys = [process.env.GROQ_API_KEY, groqApiKeyBackup].filter(Boolean);
  if (groqKeys.length === 0) return res.status(500).json({ error: 'No transcription API key is configured on the server.' });
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

  for (const apiKey of groqKeys) {
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
            headers: { Authorization: `Bearer ${apiKey}` },
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
  }

  return res.status(502).json({ error: 'Transcription provider could not process the audio. Please retry.' });
});

app.post('/summarize', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, async (req, res) => {
  const text = req.body?.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Transcript text is required.' });
  }

  console.log(`summary_request chars=${text.length}`);

  // 1. Primary: Groq LLM models
  if (process.env.GROQ_API_KEY) {
    const modelsToTry = [
      process.env.GROQ_SUMMARY_MODEL,
      'openai/gpt-oss-20b',
      'groq/compound-mini',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
    ].filter(Boolean);

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
  }

  // 2. Cascading Fallback: Google Gemini
  console.log('summary: Groq exhausted or unconfigured, attempting Google Gemini fallback');
  const geminiSummary = await callGeminiSummary(text);
  if (geminiSummary) {
    return res.json(geminiSummary);
  }

  return res.status(502).json({ error: 'AI summary could not be generated. All providers exhausted. Please retry.' });
});

// Image-to-Text OCR Vision Endpoint (Groq Qwen Vision + Gemini Vision fallback)
app.post('/ocr', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, upload.single('image'), async (req, res) => {
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

  let lastErrorMessage = '';

  // 1. Primary: Groq Vision models
  if (process.env.GROQ_API_KEY) {
    const visionModels = [
      process.env.GROQ_VISION_MODEL,
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
    ].filter(Boolean);

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
  }

  // 2. Cascading Fallback: Google Gemini Vision
  console.log('ocr: Groq vision exhausted or unconfigured, attempting Google Gemini Vision fallback');
  const geminiVision = await callGeminiVision(base64Data, mimeType);
  if (geminiVision) {
    return res.json(geminiVision);
  }

  return res.status(502).json({
    error: lastErrorMessage || 'Could not transcribe image. All providers exhausted. Please ensure the image is clear and retry.',
  });
});

app.use((error, _req, res, _next) => {
  if (error?.message?.includes('CORS')) return res.status(403).json({ error: 'Origin is not allowed.' });
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Audio file is larger than 25 MB.' });
  return res.status(400).json({ error: error?.message || 'Invalid request.' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => console.log(`VoicePad transcription server listening on http://0.0.0.0:${port}`));
}

export { app };
