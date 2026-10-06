// ====================
//  Imports & Core Setup
// ====================
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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
// Groq's Whisper endpoint caps uploads at 25MB, while Deepgram accepts larger.
// 45MB accommodates ~2 hours of 48kbps voice audio while preventing RAM spikes.
const maxFileSize = 45 * 1024 * 1024;
const groqMaxFileSize = 25 * 1024 * 1024; // Groq's own hard limit
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: maxFileSize },
});
const groqBaseUrl = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS?.trim();
const allowedOrigins = rawAllowedOrigins
  ? rawAllowedOrigins.split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean)
  : [];
const isProduction = process.env.NODE_ENV === 'production';

// -----------------------------------------------------------------------
//  Web Preview Guest Limit
//  The web site gets 10 free transcriptions per IP per day (rolling 24h).
//  Mobile guests get a small daily quota; authenticated users bypass this.
//  Signed-in users bypass this entirely via authMiddleware.
// -----------------------------------------------------------------------
const WEB_GUEST_DAILY_LIMIT = Number(process.env.WEB_GUEST_DAILY_LIMIT ?? 10);
const webGuestUsage = new Map(); // ip -> [timestamp, ...]
const MOBILE_GUEST_DAILY_LIMIT = Number(process.env.MOBILE_GUEST_DAILY_LIMIT ?? 3);
const mobileGuestUsage = new Map(); // ip -> { timestamps, requestKeys }
// Clean stale entries once per hour
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  for (const [ip, timestamps] of webGuestUsage.entries()) {
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) webGuestUsage.delete(ip);
    else webGuestUsage.set(ip, fresh);
  }
}, 60 * 60_000).unref?.();

function isMobileGuestLimited(ip, requestKey) {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const current = mobileGuestUsage.get(ip) ?? { timestamps: [], requestKeys: new Map() };
  current.timestamps = current.timestamps.filter((timestamp) => timestamp > cutoff);
  for (const [key, timestamp] of current.requestKeys.entries()) {
    if (timestamp <= cutoff) current.requestKeys.delete(key);
  }
  // Multipart fallback retries use the same idempotency key and count once.
  if (requestKey && current.requestKeys.has(requestKey)) {
    mobileGuestUsage.set(ip, current);
    return false;
  }
  if (current.timestamps.length >= MOBILE_GUEST_DAILY_LIMIT) {
    mobileGuestUsage.set(ip, current);
    return true;
  }
  current.timestamps.push(Date.now());
  if (requestKey) current.requestKeys.set(requestKey, Date.now());
  mobileGuestUsage.set(ip, current);
  return false;
}

function isWebGuestLimited(ip) {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const recent = (webGuestUsage.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= WEB_GUEST_DAILY_LIMIT) return true;
  recent.push(Date.now());
  webGuestUsage.set(ip, recent);
  return false;
}
const requestsByIp = new Map();
const requestsByUser = new Map();
const idempotencyResponses = new Map();
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Number(process.env.MAX_REQUESTS_PER_MINUTE ?? 60);
const maxRequestsPerUserPerWindow = Number(process.env.MAX_REQUESTS_PER_USER_PER_MINUTE ?? 120);
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

// Base64-encoded audio (the native JSON fallback path) inflates file size by ~33%,
// so this needs headroom above maxFileSize (45MB). 60MB safely absorbs up to ~1.8h of voice.
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));
app.use(cors({
  origin(origin, callback) {
    // Development/test may omit origins; production must be explicitly allowlisted.
    if (isProduction && !allowedOrigins.length) {
      return callback(new Error('ALLOWED_ORIGINS must be configured in production'));
    }
    if (!allowedOrigins.length || !origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by VoicePad CORS policy'));
  },
  credentials: true,
}));

// Render sits behind Cloudflare, so Express's req.ip can be a shared proxy address.
// Prefer the real client address the edge passes along; fall back to req.ip.
function clientIpOf(req) {
  const edge = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  if (edge) return String(edge).trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip;
}

app.use((req, res, next) => {
  req.clientIp = clientIpOf(req);
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader('x-request-id', req.requestId);
  next();
});

app.all(['/health', '/ping'], (_req, res) => res.json({ ok: true, service: 'voicepad-transcription', timestamp: Date.now() }));

// Render Free Tier keep-alive: ping self every 13 minutes if deployed on Render
// Use RENDER_EXTERNAL_URL env var (set in Render dashboard) for the keep-alive ping.
// We do NOT fall back to a hardcoded URL because the service name could change.
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || null;
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

// The website is the single source of truth for the legal pages (v1.1.3).
app.get('/privacy', (_req, res) => res.redirect(302, 'https://voicepadapp.vercel.app/privacy'));
app.get('/terms', (_req, res) => res.redirect(302, 'https://voicepadapp.vercel.app/terms'));

// Accept the project URL in any common shape (…/rest/v1/, trailing slashes) so the
// token check always hits https://<project>.supabase.co/auth/v1/user.
const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
// Production must never silently run as an unauthenticated AI proxy.
const requireAuth = isProduction || process.env.REQUIRE_AUTH === 'true';


async function authMiddleware(req, res, next) {
  // Try to verify the Bearer token if present (applies to both web signed-in and mobile)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && supabaseUrl && supabaseAnonKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: supabaseAnonKey },
      });
      if (resp.ok) req.user = await resp.json();
    } catch {}
  }

  const clientType = req.headers['x-client-type'];
  const isWebGuest = !isProduction && clientType === 'web' && !req.user;

  if (isWebGuest) {
    // Web guest: apply per-IP daily limit instead of auth
    if (isWebGuestLimited(req.clientIp)) {
      return res.status(429).json({
        error: 'You have reached the 10-transcription daily web preview limit. Download the VoicePad Android APK for unlimited access.',
        upgradeUrl: process.env.APK_DOWNLOAD_URL || null,
        limitReached: true,
        requestId: req.requestId,
      });
    }
    // Mark as guest so downstream handlers can differentiate
    req.isWebGuest = true;
    return next();
  }

  const isMobileGuest = clientType === 'mobile' && !req.user;
  if (isMobileGuest) {
    const requestKey = `${req.path}:${String(req.headers['idempotency-key'] || req.body?.noteId || '').trim()}`;
    if (isMobileGuestLimited(req.clientIp, requestKey)) {
      return res.status(429).json({
        error: 'Your free guest transcriptions are used up for today. Sign in to continue using VoicePad AI.',
        guestLimitReached: true,
        signInRequired: true,
        dailyLimit: MOBILE_GUEST_DAILY_LIMIT,
        requestId: req.requestId,
      });
    }
    req.isMobileGuest = true;
    return next();
  }

  // All non-guest clients require auth when production/auth mode is enabled.
  if (requireAuth && !req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to use VoicePad AI.', requestId: req.requestId });
  }

  next();
}



app.get('/models', authMiddleware, rateLimitMiddleware, async (_req, res) => {
  if (!process.env.GROQ_API_KEY && groqKeys.length === 0) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
  try {
    const activeKey = groqKeys[0] || process.env.GROQ_API_KEY;
    const resp = await fetch(`${groqBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${activeKey}` },
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
  if (isRateLimited(req.clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.', requestId: req.requestId });
  }
  next();
}

function idempotencyMiddleware(req, res, next) {
  const key = String(req.headers['idempotency-key'] || req.body?.noteId || req.body?.id || '').trim();
  if (!key) {
    return next();
  }
  const scopedKey = `${req.user?.id || req.clientIp}:${req.path}:${key}`;
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

function getApiKeyList(...sources) {
  const list = [];
  for (const src of sources) {
    if (!src) continue;
    const parts = String(src).split(',').map((k) => k.trim()).filter(Boolean);
    list.push(...parts);
  }
  return Array.from(new Set(list));
}

const groqKeys = getApiKeyList(
  process.env.GROQ_API_KEY,
  process.env.GROK_API_KEY,
  process.env.GROQ_API_KEY_1,
  process.env.GROK_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROK_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROK_API_KEY_3,
  process.env.GROQ_API_KEY_BACKUP,
  process.env.GROQ_API_KEYS,
  process.env.GROK_API_KEYS
);

const geminiKeys = getApiKeyList(
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_BACKUP,
  process.env.GEMINI_API_KEYS
);

const deepgramKeys = getApiKeyList(
  process.env.DEEPGRAM_API_KEY,
  process.env.DEEPGRAM_API_KEY_1,
  process.env.DEEPGRAM_API_KEY_2,
  process.env.DEEPGRAM_API_KEY_3,
  process.env.DEEPGRAM_API_KEYS
);

// Google retires Gemini model names regularly (2.0/2.5 now answer 404), so the list is
// configurable and uses the rolling "-latest" aliases as a safety net.
const geminiModels = getApiKeyList(
  process.env.GEMINI_MODELS,
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest'
);
const groqVisionModels = getApiKeyList(process.env.GROQ_VISION_MODELS, 'qwen/qwen3.8-27b');

async function callDeepgramTranscription(audioBuffer, mimeType, language) {
  if (deepgramKeys.length === 0 || !audioBuffer || audioBuffer.length === 0) return null;
  const langParam = language && language !== 'auto'
    ? `&language=${encodeURIComponent(language)}`
    : '&detect_language=true';
  for (const apiKey of deepgramKeys) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let response;
      try {
        response = await fetch(`https://api.deepgram.com/v1/listen?model=${process.env.DEEPGRAM_MODEL || 'nova-3'}&smart_format=true&punctuate=true${langParam}`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': mimeType || 'audio/m4a',
          },
          body: audioBuffer,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        console.warn(`deepgram_failed status=${response.status}`);
        continue;
      }
      const data = await response.json().catch(() => null);
      const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (transcript !== undefined && typeof transcript === 'string' && transcript.trim()) {
        console.log('deepgram_transcription_succeeded');
        return { text: transcript.trim(), model: `deepgram/${process.env.DEEPGRAM_MODEL || 'nova-3'}` };
      }
    } catch (err) {
      console.warn('deepgram_err', err instanceof Error ? err.message : err);
    }
  }
  return null;
}

async function callGeminiTranscription(audioBuffer, mimeType, language) {
  if (geminiKeys.length === 0 || !audioBuffer || audioBuffer.length === 0) return null;
  const base64Data = audioBuffer.toString('base64');
  const langInstruction = language && language !== 'auto'
    ? ` The spoken language is ${language}.`
    : '';
  const promptText = `Transcribe this audio recording verbatim.${langInstruction} Output ONLY the transcribed words and punctuation. Do NOT add preamble, markdown code blocks, or commentary. If the recording is completely silent or only contains static noise, reply with nothing.`;

  for (const apiKey of geminiKeys) {
    for (const model of geminiModels) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        let resp;
        try {
          resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: promptText,
                  },
                  {
                    inlineData: {
                      mimeType: mimeType || 'audio/m4a',
                      data: base64Data,
                    },
                  },
                ],
              }],
              generationConfig: { temperature: 0.1 },
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!resp.ok) {
          console.warn(`gemini_transcription_failed model=${model} status=${resp.status}`);
          continue;
        }

        const data = await resp.json().catch(() => null);
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
        if (text && text.trim()) {
          console.log(`gemini_transcription_succeeded model=${model}`);
          return { text: text.trim(), model: `gemini/${model}` };
        }
      } catch (err) {
        console.warn(`gemini_transcription_err model=${model}`, err instanceof Error ? err.message : err);
      }
    }
  }
  return null;
}

async function callGeminiSummary(text) {
  if (geminiKeys.length === 0) return null;
  for (const apiKey of geminiKeys) {
    for (const model of geminiModels) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(45_000),
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
  }
  return null;
}

const OCR_PROMPT = 'Extract and transcribe all text from this image accurately (whiteboard, document, handwritten notes, lecture slides, or textbook). Format cleanly with headings and bullet points where helpful. Output ONLY the transcribed content without any extra intro or conversational commentary.';

function ocrResult(text, model) {
  const clean = text.trim();
  const firstLine = clean.split('\n')[0].replace(/^[#*\s-]+/, '').trim().slice(0, 50);
  return { text: clean, title: firstLine || 'Photo Note', model };
}

async function callGroqVision(base64Data, mimeType) {
  if (groqKeys.length === 0) return null;
  for (const apiKey of groqKeys) {
    for (const model of groqVisionModels) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        let resp;
        try {
          resp = await fetch(`${groqBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: OCR_PROMPT },
                  { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } },
                ],
              }],
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) {
          console.warn(`groq_vision_failed model=${model} status=${resp.status}`, payload?.error?.message);
          continue;
        }
        const text = payload?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim()) {
          console.log(`groq_vision_succeeded model=${model}`);
          return ocrResult(text.replace(/<think>[\s\S]*?<\/think>/g, ''), `groq/${model}`);
        }
      } catch (err) {
        console.warn(`groq_vision_err model=${model}`, err instanceof Error ? err.message : err);
      }
    }
  }
  return null;
}

async function callGeminiVision(base64Data, mimeType) {
  if (geminiKeys.length === 0) return null;
  const geminiVisionModels = geminiModels;
  for (const apiKey of geminiKeys) {
    for (const model of geminiVisionModels) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(45_000),
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
  }
  return null;
}

app.post('/transcribe', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, upload.single('file'), async (req, res) => {
  let audioBuffer = null;
  let audioMimeType = 'audio/m4a';
  let originalFilename = 'voice-note.m4a';
  let tempDiskFile = null;

  try {
    if (req.file) {
      tempDiskFile = req.file.path;
      try {
        audioBuffer = await fs.promises.readFile(tempDiskFile);
      } catch (readErr) {
        console.warn('Could not read uploaded temp file:', readErr);
      }
      audioMimeType = req.file.mimetype || 'audio/m4a';
      originalFilename = req.file.originalname || 'voice-note.m4a';
    } else {
      const rawAudio = req.body?.audio || req.body?.audioBase64 || req.body?.audio_base64 || req.body?.file || req.body?.fileBase64 || req.body?.data;
      if (rawAudio) {
        const raw = String(rawAudio);
        let base64 = raw;
        if (raw.startsWith('data:')) {
          const match = raw.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            audioMimeType = match[1];
            base64 = match[2];
          }
        }
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
          return res.status(400).json({ error: 'Invalid base64 audio data.' });
        }
        try {
          audioBuffer = Buffer.from(base64, 'base64');
        } catch {}
        originalFilename = req.body.filename || req.body.fileName || 'voice-note.m4a';
        if (req.body.mimeType || req.body.contentType) {
          audioMimeType = req.body.mimeType || req.body.contentType;
        }
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Audio file or base64 data is required.' });
    }
  if (req.isWebGuest && audioBuffer.length > 25 * 1024 * 1024) {
    return res.status(429).json({
      error: 'Web preview recordings are limited to 10 minutes. Download the VoicePad Android APK for unlimited recording length.',
      upgradeUrl: process.env.APK_DOWNLOAD_URL || null,
      limitReached: true,
      requestId: req.requestId,
    });
  }
  if (audioBuffer.length > maxFileSize) {
    return res.status(413).json({ error: `Audio file is larger than ${Math.round(maxFileSize / (1024 * 1024))} MB.` });
  }


  // 1. Primary: Groq Whisper models across all configured Groq keys
  const models = [
    process.env.GROQ_TRANSCRIPTION_MODEL,
    'whisper-large-v3-turbo',
    'whisper-large-v3',
  ].filter(Boolean);

  console.log(`transcription_request file=${originalFilename} bytes=${audioBuffer.length} groqKeys=${groqKeys.length} deepgramKeys=${deepgramKeys.length} geminiKeys=${geminiKeys.length}`);

  // Groq will reject anything over 25MB outright, so a long recording should skip
  // straight to Deepgram/Gemini instead of burning every key/model combo on a guaranteed failure.
  const exceedsGroqLimit = audioBuffer.length > groqMaxFileSize;
  if (exceedsGroqLimit) {
    console.log(`transcription_skip_groq reason=file_too_large bytes=${audioBuffer.length} limit=${groqMaxFileSize}`);
  }

  const requestedLanguage = req.body?.language || req.query?.language;

  for (const apiKey of exceedsGroqLimit ? [] : groqKeys) {
    for (const model of models) {
      try {
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: audioMimeType || 'audio/mp4' }), originalFilename);
        form.append('model', model);
        form.append('response_format', 'json');
        form.append('temperature', '0');
        if (requestedLanguage && requestedLanguage !== 'auto') {
          form.append('language', requestedLanguage);
        }

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
        if (payload?.text !== undefined && typeof payload.text === 'string') {
          console.log(`groq_transcription_succeeded model=${model}`);
          return res.json({ text: payload.text.trim(), model });
        }
      } catch (err) {
        console.warn(`transcription_attempt_failed model=${model}`, err instanceof Error ? err.message : err);
      }
    }
  }

  // 2. Cascading Fallback: Deepgram Nova-2 speech-to-text
  console.log('transcribe: Groq keys exhausted or failed, attempting Deepgram fallback');
  const deepgramResult = await callDeepgramTranscription(audioBuffer, audioMimeType, requestedLanguage);
  if (deepgramResult) {
    return res.json(deepgramResult);
  }

  // 3. Cascading Fallback: Google Gemini Multimodal STT
  console.log('transcribe: Deepgram exhausted or failed, attempting Google Gemini STT fallback');
  const geminiResult = await callGeminiTranscription(audioBuffer, audioMimeType, requestedLanguage);
  if (geminiResult) {
    return res.json(geminiResult);
  }

    return res.status(502).json({ error: 'Transcription provider could not process the audio. Please retry.' });
  } finally {
    if (tempDiskFile) {
      fs.promises.unlink(tempDiskFile).catch(() => {});
    }
  }
});

app.post('/summarize', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, async (req, res) => {
  const text = req.body?.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Transcript text is required.' });
  }

  console.log(`summary_request chars=${text.length} groqKeys=${groqKeys.length} geminiKeys=${geminiKeys.length}`);

  // 1. Primary: Groq LLM models across all Groq keys
  const modelsToTry = [
    process.env.GROQ_SUMMARY_MODEL,
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
  ].filter(Boolean);

  for (const apiKey of groqKeys) {
    for (const model of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        let response;
        try {
          response = await fetch(`${groqBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
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

// Image-to-Text OCR Vision Endpoint (Google Gemini Vision + Groq Vision fallback)
app.post('/ocr', authMiddleware, rateLimitMiddleware, idempotencyMiddleware, upload.single('image'), async (req, res) => {
  let base64Data = '';
  let mimeType = 'image/jpeg';
  let tempDiskFile = null;

  if (req.file) {
    tempDiskFile = req.file.path;
    try {
      base64Data = (await fs.promises.readFile(req.file.path)).toString('base64');
    } catch {
      return res.status(400).json({ error: 'Could not read the uploaded image.' });
    }
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

  if (!base64Data || base64Data.length > 20 * 1024 * 1024) {
    if (tempDiskFile) fs.promises.unlink(tempDiskFile).catch(() => {});
    return res.status(413).json({ error: 'Image is too large. Choose an image under 15 MB.' });
  }

  // 1. Primary: Google Gemini Vision (ultra-reliable on document/notes OCR)
  console.log(`ocr_request bytes=${Math.round(base64Data.length * 0.75)} geminiKeys=${geminiKeys.length} groqKeys=${groqKeys.length}`);
  const visionResult = (await callGeminiVision(base64Data, mimeType)) || (await callGroqVision(base64Data, mimeType));
  try {
    if (visionResult) return res.json(visionResult);
    return res.status(502).json({
      error: 'Could not transcribe image. All OCR providers exhausted. Please ensure the image is clear and retry.',
    });
  } finally {
    if (tempDiskFile) fs.promises.unlink(tempDiskFile).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  if (error?.message?.includes('CORS')) return res.status(403).json({ error: 'Origin is not allowed.' });
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Audio file is larger than ${Math.round(maxFileSize / (1024 * 1024))} MB.` });
  return res.status(400).json({ error: error?.message || 'Invalid request.' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => console.log(`VoicePad transcription server listening on http://0.0.0.0:${port}`));
}

export { app };
