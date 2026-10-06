import AsyncStorage from '@react-native-async-storage/async-storage';

import { Note, clearPendingPurges, getPendingPurges, loadNotes, saveNotes } from './notes';
import { supabase } from './supabase';

// Privacy (v1.1.3): sync carries TEXT only (title, notes, transcript, summary, metadata).
// Audio recordings are never uploaded to cloud storage; they stay on the device that made them.
export type SyncResult = { ok: boolean; message?: string; conflicts?: number; pushed?: number; pulled?: number };

function toRow(note: Note, userId: string) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt || note.createdAt,
    deleted_at: note.deletedAt || null,
    // A device-local URI is not portable and must never be written to cloud metadata.
    audio_uri: null,
    // audio_path is only ever set on notes from before v1.1.3 (legacy cloud audio). New notes keep it null.
    audio_path: note.audioPath ?? null,
    source: note.source ?? 'voice',
    category: note.category ?? 'Personal',
    duration_seconds: note.durationSeconds ?? null,
    pinned: note.pinned ?? false,
    transcript: note.transcript ?? null,
    summary: note.summary ?? null,
    transcription_status: note.transcriptionStatus ?? null,
    transcription_error: note.transcriptionError ?? null,
  };
}

function fromRow(row: Record<string, unknown>): Note {
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled note'),
    content: String(row.content ?? ''),
    createdAt: String(row.created_at),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    // Legacy audio_uri values are intentionally ignored. Use audio_path for cloud audio.
    audioUri: undefined,
    audioPath: typeof row.audio_path === 'string' ? row.audio_path : undefined,
    audioUploadStatus: ['pending', 'uploaded', 'failed'].includes(String(row.audio_upload_status))
      ? (row.audio_upload_status as Note['audioUploadStatus'])
      : undefined,
    source: row.source === 'text' ? 'text' : 'voice',
    category: ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(String(row.category))
      ? (row.category as Note['category'])
      : 'Personal',
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : undefined,
    pinned: Boolean(row.pinned),
    transcript: typeof row.transcript === 'string' ? row.transcript : undefined,
    summary: typeof row.summary === 'string' ? row.summary : undefined,
    transcriptionStatus: ['pending', 'ready', 'failed'].includes(String(row.transcription_status))
      ? (row.transcription_status as Note['transcriptionStatus'])
      : undefined,
    transcriptionError: typeof row.transcription_error === 'string' ? row.transcription_error : undefined,
  };
}

// ─── Sync engine (v1.1.4) ─────────────────────────────────────────────────────
// Each note keeps a per-account "baseline": the local updatedAt and the cloud
// updated_at it last agreed on. A note whose local updatedAt differs from its
// baseline was edited on this device and is pushed; a note whose cloud updated_at
// differs was edited elsewhere and is pulled. This does not depend on the phone's
// clock agreeing with the server's, and an unchanged note is never re-uploaded
// (re-uploading used to bump its cloud timestamp and let stale copies win).
type Baseline = Record<string, { l: string; r: string }>;
const baselineKey = (userId: string) => `@voicepad/sync_baseline_v1:${userId}`;

async function loadBaseline(userId: string): Promise<Baseline> {
  try {
    const raw = await AsyncStorage.getItem(baselineKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const ts = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0);

async function syncOnce(userId: string): Promise<SyncResult> {
  if (!supabase) return { ok: false, message: 'Cloud sync is not configured.' };

  // 1. Notes permanently deleted on this device: delete their cloud rows too.
  const purged = await getPendingPurges();
  if (purged.length > 0) {
    const { error: purgeError } = await supabase
      .from('voicepad_notes')
      .delete()
      .eq('user_id', userId)
      .in('id', purged);
    if (!purgeError) await clearPendingPurges(purged);
    else console.warn('Sync purge error:', purgeError.message);
  }

  // 2. Read the cloud copy.
  const { data: remoteRows, error: fetchError } = await supabase
    .from('voicepad_notes')
    .select('*')
    .eq('user_id', userId);
  if (fetchError) return { ok: false, message: fetchError.message };

  const remoteById = new Map<string, Record<string, unknown>>();
  for (const row of remoteRows ?? []) remoteById.set(String(row.id), row);

  const localNotes = await loadNotes(true);
  const localById = new Map<string, Note>(localNotes.map((n) => [n.id, n]));
  const baseline = await loadBaseline(userId);
  const nextBaseline: Baseline = { ...baseline };
  const purgedSet = new Set(purged);

  const toPush: Note[] = [];
  const toPull: Note[] = [];
  let conflicts = 0;

  for (const local of localNotes) {
    const remoteRow = remoteById.get(local.id);
    const base = baseline[local.id];
    const localStamp = local.updatedAt || local.createdAt;
    if (!remoteRow) {
      // New on this device (or never uploaded yet).
      toPush.push(local);
      continue;
    }
    const remoteStamp = String(remoteRow.updated_at ?? remoteRow.created_at ?? '');
    const localDirty = !base || base.l !== localStamp;
    const remoteChanged = !base || base.r !== remoteStamp;
    if (!localDirty && !remoteChanged) continue;
    if (localDirty && !remoteChanged) {
      toPush.push(local);
    } else if (remoteChanged && !localDirty) {
      toPull.push(fromRow(remoteRow));
    } else {
      // Edited on both sides (or first sync of a note present on both): newest wins.
      const remote = fromRow(remoteRow);
      const localWins = ts(localStamp) >= ts(remoteStamp);
      const differs =
        (local.content ?? '').trim() !== (remote.content ?? '').trim() ||
        (local.title ?? '') !== (remote.title ?? '') ||
        (local.summary ?? '') !== (remote.summary ?? '');
      if (base && differs) {
        conflicts += 1;
        await supabase.from('voicepad_sync_conflicts').insert({
          user_id: userId,
          note_id: local.id,
          local_payload: local,
          remote_payload: remote,
        }).then(() => {}, () => {});
      }
      if (localWins) toPush.push(local);
      else toPull.push(remote);
    }
  }

  for (const [id, row] of remoteById) {
    if (localById.has(id) || purgedSet.has(id)) continue;
    // On the cloud but not on this device: a reinstall, a new phone, or another device's note.
    toPull.push(fromRow(row));
  }

  // 3. Push this device's edits. The server returns the stored updated_at for the baseline.
  for (let i = 0; i < toPush.length; i += 100) {
    const chunk = toPush.slice(i, i + 100);
    const { data: pushed, error: uploadError } = await supabase
      .from('voicepad_notes')
      .upsert(chunk.map((note) => toRow(note, userId)), { onConflict: 'id' })
      .select('id, updated_at');
    if (uploadError) {
      console.warn('Sync upload error:', uploadError.message);
      await AsyncStorage.setItem(baselineKey(userId), JSON.stringify(nextBaseline)).catch(() => {});
      return { ok: false, message: 'Cloud sync failed. Your notes are safe on this phone; VoicePad will retry.' };
    }
    const stamps = new Map<string, string>((pushed ?? []).map((r: any) => [String(r.id), String(r.updated_at)]));
    for (const note of chunk) {
      const r = stamps.get(note.id);
      if (r) nextBaseline[note.id] = { l: note.updatedAt || note.createdAt, r };
    }
  }

  // 4. Pull edits made elsewhere. The device-local audio file (if any) is kept.
  if (toPull.length > 0) {
    const merged = toPull.map((remote) => {
      const local = localById.get(remote.id);
      const updatedAt = remote.updatedAt || remote.createdAt;
      return { ...remote, updatedAt, audioUri: local?.audioUri };
    });
    await saveNotes(merged);
    for (const note of merged) {
      nextBaseline[note.id] = { l: note.updatedAt!, r: note.updatedAt! };
    }
  }

  await AsyncStorage.setItem(baselineKey(userId), JSON.stringify(nextBaseline)).catch(() => {});

  const message = conflicts
    ? `${conflicts} note${conflicts === 1 ? ' was' : 's were'} edited on two devices; the newest version was kept.`
    : undefined;
  return { ok: true, message, conflicts, pushed: toPush.length, pulled: toPull.length };
}

let running: Promise<SyncResult> | null = null;
let rerun = false;

/** Two-way text sync for a signed-in user. Safe to call often; calls are coalesced. */
export async function syncNotes(userId: string): Promise<SyncResult> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let result: SyncResult;
    do {
      rerun = false;
      try {
        result = await syncOnce(userId);
      } catch (err) {
        console.error('syncNotes failed:', err);
        result = { ok: false, message: 'Cloud sync is temporarily unavailable. Your local notes are safe.' };
      }
    } while (rerun && result.ok);
    lastResult = result;
    for (const listener of syncListeners) {
      try { listener(result); } catch {}
    }
    return result;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

let lastResult: SyncResult | null = null;
const syncListeners = new Set<(result: SyncResult) => void>();
/** Listen for finished syncs (screens refresh their list when notes were pulled). */
export function onSyncFinished(listener: (result: SyncResult) => void): () => void {
  syncListeners.add(listener);
  return () => { syncListeners.delete(listener); };
}
export function getLastSyncResult(): SyncResult | null {
  return lastResult;
}

export { toRow, fromRow };
