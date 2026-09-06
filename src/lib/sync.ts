import { Note, loadNotes, saveNotes } from './notes';
import { supabase } from './supabase';

export type SyncResult = { ok: boolean; message?: string };

function toRow(note: Note, userId: string) {
  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    created_at: note.createdAt,
    audio_uri: note.audioUri ?? null,
    source: note.source ?? 'voice',
    category: note.category ?? 'Personal',
    duration_seconds: note.durationSeconds ?? null,
    pinned: note.pinned ?? false,
    transcript: note.transcript ?? null,
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
    audioUri: typeof row.audio_uri === 'string' ? row.audio_uri : undefined,
    source: row.source === 'text' ? 'text' : 'voice',
    category: ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(String(row.category)) ? row.category as Note['category'] : 'Personal',
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : undefined,
    pinned: Boolean(row.pinned),
    transcript: typeof row.transcript === 'string' ? row.transcript : undefined,
    transcriptionStatus: ['pending', 'ready', 'failed'].includes(String(row.transcription_status)) ? row.transcription_status as Note['transcriptionStatus'] : undefined,
    transcriptionError: typeof row.transcription_error === 'string' ? row.transcription_error : undefined,
  };
}

export async function syncNotes(userId: string): Promise<SyncResult> {
  if (!supabase) return { ok: false, message: 'Cloud sync is not configured.' };
  try {
    const localNotes = await loadNotes();
    if (localNotes.length) {
      const { error: uploadError } = await supabase.from('notes').upsert(localNotes.map((note) => toRow(note, userId)), { onConflict: 'id' });
      if (uploadError) return { ok: false, message: uploadError.message };
    }
    const { data, error } = await supabase.from('notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) return { ok: false, message: error.message };
    if (data) await saveNotes(data.map(fromRow));
    return { ok: true };
  } catch {
    return { ok: false, message: 'Cloud sync is temporarily unavailable. Your local notes are safe.' };
  }
}
