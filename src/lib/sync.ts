import { Note, loadNotes, saveNotes, updateNote } from './notes';
import { supabase } from './supabase';
import { uploadAudioToCloud } from './storage';

export type SyncResult = { ok: boolean; message?: string };

function toRow(note: Note, userId: string) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt || note.createdAt,
    deleted_at: note.deletedAt || null,
    audio_uri: note.audioUri ?? null,
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
    audioUri: typeof row.audio_uri === 'string' ? row.audio_uri : undefined,
    audioPath: typeof row.audio_path === 'string' ? row.audio_path : undefined,
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

export async function syncNotes(userId: string): Promise<SyncResult> {
  if (!supabase) return { ok: false, message: 'Cloud sync is not configured.' };

  try {
    // 1. Load all local notes (including soft-deleted notes to sync tombstones)
    const localNotes = await loadNotes(true);

    // 2. Background audio upload for any voice notes that have not yet uploaded audio to Supabase Storage
    for (const note of localNotes) {
      if (note.source === 'voice' && note.audioUri && !note.audioPath && !note.deletedAt) {
        try {
          const uploadedPath = await uploadAudioToCloud(userId, note.id, note.audioUri);
          if (uploadedPath) {
            note.audioPath = uploadedPath;
            await updateNote(note.id, { audioPath: uploadedPath });
          }
        } catch {
          // Non-blocking: continue sync even if individual audio upload is retrying
        }
      }
    }

    // 3. Upsert local notes to Supabase
    if (localNotes.length > 0) {
      const { error: uploadError } = await supabase
        .from('voicepad_notes')
        .upsert(localNotes.map((note) => toRow(note, userId)), { onConflict: 'id' });

      if (uploadError) {
        console.warn('Sync upload error:', uploadError.message);
        return { ok: false, message: uploadError.message };
      }
    }

    // 4. Fetch all remote notes for this user
    const { data: remoteRows, error: fetchError } = await supabase
      .from('voicepad_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return { ok: false, message: fetchError.message };
    }

    if (remoteRows) {
      const remoteNotes = remoteRows.map(fromRow);
      const mergedMap = new Map<string, Note>();

      // Populate local notes first
      for (const local of localNotes) {
        mergedMap.set(local.id, local);
      }

      // Merge with remote notes using timestamp conflict resolution
      for (const remote of remoteNotes) {
        const local = mergedMap.get(remote.id);

        if (!local) {
          // New note from another device
          mergedMap.set(remote.id, remote);
        } else {
          // Both exist: compare update timestamps
          const localTime = new Date(local.updatedAt || local.createdAt).getTime();
          const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();

          if (remoteTime > localTime) {
            // Remote is newer: preserve local audioUri if matching, but accept remote metadata
            mergedMap.set(remote.id, {
              ...remote,
              audioUri: local.audioUri || remote.audioUri,
            });
          }
        }
      }

      await saveNotes(Array.from(mergedMap.values()));
    }

    return { ok: true };
  } catch (err) {
    console.error('syncNotes failed:', err);
    return { ok: false, message: 'Cloud sync is temporarily unavailable. Your local notes are safe.' };
  }
}
