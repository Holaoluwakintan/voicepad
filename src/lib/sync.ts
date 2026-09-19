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
    // A device-local URI is not portable and must never be written to cloud metadata.
    audio_uri: null,
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
    const localNotes = await loadNotes(true);

    for (const note of localNotes) {
      if (note.source === 'voice' && note.audioUri && !note.audioPath && !note.deletedAt) {
        try {
          const uploadedPath = await uploadAudioToCloud(userId, note.id, note.audioUri);
          if (uploadedPath) {
            note.audioPath = uploadedPath;
            await updateNote(note.id, { audioPath: uploadedPath });
          }
        } catch {
          // Continue note sync; audio can be retried without exposing its local URI.
        }
      }
    }

    if (localNotes.length > 0) {
      const { error: uploadError } = await supabase
        .from('voicepad_notes')
        .upsert(localNotes.map((note) => toRow(note, userId)), { onConflict: 'id' });
      if (uploadError) {
        console.warn('Sync upload error:', uploadError.message);
        return { ok: false, message: uploadError.message };
      }
    }

    const { data: remoteRows, error: fetchError } = await supabase
      .from('voicepad_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (fetchError) return { ok: false, message: fetchError.message };

    if (remoteRows) {
      const remoteNotes = remoteRows.map(fromRow);
      const mergedMap = new Map<string, Note>();
      for (const local of localNotes) mergedMap.set(local.id, local);

      for (const remote of remoteNotes) {
        const local = mergedMap.get(remote.id);
        if (!local) {
          mergedMap.set(remote.id, remote);
          continue;
        }

        const localTime = new Date(local.updatedAt || local.createdAt).getTime();
        const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();
        if (remoteTime > localTime) {
          const hasContentConflict = Boolean(local.content?.trim()) && Boolean(remote.content?.trim()) && local.content.trim() !== remote.content.trim();
          // Record the conflict instead of injecting a confusing marker into the note body.
          if (hasContentConflict && !remote.content.includes(local.content.trim())) {
            await supabase.from('voicepad_sync_conflicts').insert({
              user_id: userId,
              note_id: remote.id,
              local_payload: local,
              remote_payload: remote,
            });
          }
          // The remote revision wins deterministically until the conflict UI resolves it.
          // Preserve the local device URI only; the cloud path remains portable.
          mergedMap.set(remote.id, { ...remote, audioUri: local.audioUri });
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

export { toRow, fromRow };
