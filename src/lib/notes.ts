import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function loadNotes(): Promise<Note[]> {
  const saved = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveNotes(notes: Note[]) {
  await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

export async function insertNote(note: Note) {
  const notes = await loadNotes();
  await saveNotes([note, ...notes.filter((item) => item.id !== note.id)]);
}

export async function updateNote(id: string, patch: Partial<Note>) {
  const notes = await loadNotes();
  const updated = notes.map((note) => note.id === id ? { ...note, ...patch } : note);
  await saveNotes(updated);
  return updated.find((note) => note.id === id) ?? null;
}

export async function removeNote(id: string) {
  const notes = await loadNotes();
  await saveNotes(notes.filter((note) => note.id !== id));
}
