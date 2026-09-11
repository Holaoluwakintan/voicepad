import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTES_STORAGE_KEY = '@voicepad/notes';

export const NOTE_CATEGORIES = ['Lectures', 'Sermons', 'Meetings', 'Personal'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  audioUri?: string;
  audioPath?: string;
  source?: 'voice' | 'text';
  category?: NoteCategory;
  durationSeconds?: number;
  pinned?: boolean;
  transcript?: string;
  summary?: string;
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
  if (!seconds || seconds <= 0) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// In-memory mutex to ensure atomic read-modify-write operations
let writeQueue = Promise.resolve();

function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(() => {}, () => {});
  return next;
}

/**
 * Loads notes from local storage.
 * @param includeDeleted - If false (default), excludes notes marked with deletedAt.
 */
export async function loadNotes(includeDeleted = false): Promise<Note[]> {
  try {
    const saved = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
    if (!saved) return [];
    const parsed: Note[] = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return includeDeleted ? parsed : parsed.filter((note) => !note.deletedAt);
  } catch {
    return [];
  }
}

export async function saveNotes(notes: Note[]) {
  return enqueueOperation(async () => {
    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  });
}

export async function insertNote(note: Note) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const now = new Date().toISOString();
    const withTimestamps: Note = {
      ...note,
      updatedAt: note.updatedAt || now,
    };
    const next = [withTimestamps, ...all.filter((item) => item.id !== note.id)];
    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
    return withTimestamps;
  });
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note | null> {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const now = new Date().toISOString();
    let updatedNote: Note | null = null;

    const next = all.map((note) => {
      if (note.id === id) {
        updatedNote = { ...note, ...patch, updatedAt: now };
        return updatedNote;
      }
      return note;
    });

    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
    return updatedNote;
  });
}

/**
 * Soft-deletes a note by setting deletedAt and updatedAt.
 * Sync will push the deletedAt timestamp to Supabase, preventing resurrection.
 */
export async function removeNote(id: string) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const now = new Date().toISOString();

    const next = all.map((note) => {
      if (note.id === id) {
        return { ...note, deletedAt: now, updatedAt: now };
      }
      return note;
    });

    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
  });
}

/**
 * Permanently deletes a note from local storage.
 */
export async function purgeNote(id: string) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const next = all.filter((note) => note.id !== id);
    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
  });
}
