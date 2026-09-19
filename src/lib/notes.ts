import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTES_STORAGE_KEY = '@voicepad/notes';
export const NOTES_BACKUP_KEY = '@voicepad/notes-backup';
export const NOTES_RECOVERY_KEY = '@voicepad/notes-recovery';
export const NOTES_STORAGE_VERSION = 1;

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

type StoredNotes = { version: number; notes: Note[]; savedAt: string };

export function getNoteCategory(note: Note): NoteCategory { return note.category ?? 'Personal'; }
export function countWords(content: string) { const trimmed = content.trim(); return trimmed ? trimmed.split(/\s+/).length : 0; }
export function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

let writeQueue = Promise.resolve();
function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(() => {}, () => {});
  return next;
}

function isValidNote(note: unknown): note is Note {
  if (!note || typeof note !== 'object') return false;
  const value = note as Partial<Note>;
  return typeof value.id === 'string' && typeof value.title === 'string' && typeof value.content === 'string' && typeof value.createdAt === 'string';
}

function parseStoredNotes(raw: string): Note[] {
  const parsed: unknown = JSON.parse(raw);
  const notes = Array.isArray(parsed) ? parsed : (parsed as StoredNotes)?.notes;
  if (!Array.isArray(notes) || !notes.every(isValidNote)) throw new Error('Local note data is invalid.');
  return notes;
}

export async function hasStorageRecovery(): Promise<boolean> { return (await AsyncStorage.getItem(NOTES_RECOVERY_KEY)) === 'true'; }
export async function clearStorageRecovery(): Promise<void> { await AsyncStorage.removeItem(NOTES_RECOVERY_KEY); }

export async function restoreNotesFromBackup(): Promise<boolean> {
  return enqueueOperation(async () => {
    const backup = await AsyncStorage.getItem(NOTES_BACKUP_KEY);
    if (!backup) return false;
    const notes = parseStoredNotes(backup);
    await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: NOTES_STORAGE_VERSION, notes, savedAt: new Date().toISOString() } satisfies StoredNotes));
    await clearStorageRecovery();
    return true;
  });
}

/** Loads notes without silently treating corruption as an empty account. */
export async function loadNotes(includeDeleted = false): Promise<Note[]> {
  try {
    const saved = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
    if (!saved) return [];
    const parsed = parseStoredNotes(saved);
    return includeDeleted ? parsed : parsed.filter((note) => !note.deletedAt);
  } catch {
    await AsyncStorage.setItem(NOTES_RECOVERY_KEY, 'true').catch(() => {});
    return [];
  }
}

async function writeNotes(notes: Note[]) {
  const current = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
  if (current) await AsyncStorage.setItem(NOTES_BACKUP_KEY, current);
  const payload: StoredNotes = { version: NOTES_STORAGE_VERSION, notes, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload));
  await clearStorageRecovery();
}

export async function saveNotes(notes: Note[]) {
  return enqueueOperation(() => writeNotes(notes));
}

export async function insertNote(note: Note) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const withTimestamps: Note = { ...note, updatedAt: note.updatedAt || new Date().toISOString() };
    await writeNotes([withTimestamps, ...all.filter((item) => item.id !== note.id)]);
    return withTimestamps;
  });
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note | null> {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    let updatedNote: Note | null = null;
    const next = all.map((note) => {
      if (note.id === id) { updatedNote = { ...note, ...patch, updatedAt: new Date().toISOString() }; return updatedNote; }
      return note;
    });
    await writeNotes(next);
    return updatedNote;
  });
}

export async function removeNote(id: string) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    const now = new Date().toISOString();
    await writeNotes(all.map((note) => note.id === id ? { ...note, deletedAt: now, updatedAt: now } : note));
  });
}

export async function purgeNote(id: string) {
  return enqueueOperation(async () => {
    const all = await loadNotes(true);
    await writeNotes(all.filter((item) => item.id !== id));
  });
}
