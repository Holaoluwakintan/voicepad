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
