/**
 * Shared utility functions — single source of truth.
 * Previously duplicated across multiple screen files.
 */

// ─── API URL ──────────────────────────────────────────────────────────────────
const defaultApiUrl = 'https://voicepad-transcription.onrender.com';

export const TRANSCRIPTION_API_URL =
  process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() || defaultApiUrl;

// ─── Note IDs ─────────────────────────────────────────────────────────────────
/**
 * Generates a collision-safe unique note ID using crypto.randomUUID()
 * when available (all modern runtimes), falling back to timestamp + random.
 */
export function generateNoteId(prefix: 'voice' | 'text' | 'pad' | 'ocr'): string {
  const uid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${uid}`;
}

// ─── Date formatting ─────────────────────────────────────────────────────────
/**
 * Formats a note's createdAt ISO string into a human-readable label.
 * "Today, 2:30 PM"  or  "Sep 14 · 2:30 PM"
 * Previously duplicated in index.tsx and notes.tsx.
 */
export function formatNoteDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
  } catch {
    return dateString;
  }
}

// ─── Supported audio MIME types ───────────────────────────────────────────────
export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
];

export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.mp4', '.wav', '.ogg', '.webm', '.aac', '.flac'];

/** Returns true if the given file is a supported audio format */
export function isSupportedAudio(name = '', mimeType = ''): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return (
    SUPPORTED_AUDIO_TYPES.some((t) => mimeType.startsWith(t)) ||
    SUPPORTED_AUDIO_EXTENSIONS.includes(ext)
  );
}

// ─── User-Friendly Error Translation ──────────────────────────────────────────
/**
 * Translates low-level Java/Android, network, or server exceptions into
 * crisp, friendly, actionable English messages.
 */
export function toFriendlyErrorMessage(err: unknown, fallbackMessage = 'An unexpected error occurred. Please try again.'): string {
  if (!err) return fallbackMessage;

  const raw = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Android DNS / Host resolution errors
  if (
    lower.includes('unknownhostexception') ||
    lower.includes('no address associated with hostname') ||
    lower.includes('unable to resolve host')
  ) {
    return 'Unable to reach the cloud server. Please check your internet connection (Wi-Fi or mobile data) and try again.';
  }

  // Network offline / connection drops
  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('connectexception') ||
    lower.includes('econnrefused') ||
    lower.includes('enetunreach')
  ) {
    return 'Network connection problem. Please verify you are connected to the internet and retry.';
  }

  // Timeouts / Server Cold Starts
  if (
    lower.includes('sockettimeoutexception') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborterror')
  ) {
    return 'Connection timed out. The server was taking too long to respond. Please try again in a few seconds.';
  }

  // SSL / Certificate issues
  if (lower.includes('sslhandshakeexception') || lower.includes('cert_') || lower.includes('certificate')) {
    return 'Secure connection could not be established. Please check your device date, time, and network settings.';
  }

  // Supabase Auth specific
  if (lower.includes('invalid login credentials') || lower.includes('invalid_grant')) {
    return 'Incorrect email or password. Please double check and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email has not been confirmed yet. Please check your inbox for the confirmation link.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }

  // Cloud / Render Server Wake-up (502 / 503)
  if (lower.includes('502') || lower.includes('bad gateway') || lower.includes('503') || lower.includes('service unavailable')) {
    return 'Cloud server is waking up. Please retry in 15–30 seconds.';
  }

  // Return clean string without raw technical traces
  if (raw.length > 180 || raw.includes('java.net.') || raw.includes('at android.') || raw.includes('at com.')) {
    return 'Unable to complete request due to a network connection issue. Please check your connection and retry.';
  }

  return raw;
}
