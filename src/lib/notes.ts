export const NOTES_STORAGE_KEY = '@voicepad/notes';

export const NOTE_CATEGORIES = ['Lectures', 'Sermons', 'Meetings', 'Personal'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  audioUri?: string;
  source?: 'voice' | 'text';
  category?: NoteCategory;
  durationSeconds?: number;
  pinned?: boolean;
  transcript?: string;
  transcriptionStatus?: 'pending' | 'ready' | 'failed';
  transcriptionError?: string;
};

export function getNoteCategory(note: Note): NoteCategory {
  return note.category ?? 'Personal';
}

export function countWords(content: string) {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function formatDuration(seconds?: number) {
  if (!seconds) return '00:00';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
