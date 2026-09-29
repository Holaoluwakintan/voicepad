/**
 * Notes storage — SQLite-backed (migrated from AsyncStorage JSON blob).
 *
 * Migration path:
 *   1. On first open, if the legacy AsyncStorage blob exists, import all notes
 *      into SQLite and then delete the old blob.
 *   2. All subsequent reads/writes go directly to SQLite.
 *
 * The public API (loadNotes, insertNote, updateNote, removeNote, etc.) is
 * identical to the old AsyncStorage version so no callers need to change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

export const NOTES_STORAGE_KEY = '@voicepad/notes';
export const NOTES_BACKUP_KEY = '@voicepad/notes-backup';
export const NOTES_RECOVERY_KEY = '@voicepad/notes-recovery';
export const NOTES_STORAGE_VERSION = 2; // bumped for SQLite migration

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
  audioUploadStatus?: 'pending' | 'uploaded' | 'failed';
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

// ─── SQLite setup ─────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _dbReady: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbReady) return _dbReady;
  _dbReady = (async () => {
    const db = await SQLite.openDatabaseAsync('voicepad.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT,
        audio_uri TEXT,
        audio_path TEXT,
        audio_upload_status TEXT,
        source TEXT,
        category TEXT,
        duration_seconds INTEGER,
        pinned INTEGER NOT NULL DEFAULT 0,
        transcript TEXT,
        summary TEXT,
        transcription_status TEXT,
        transcription_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);
    `);
    _db = db;
    // Run legacy migration once
    await _migrateLegacyIfNeeded(db);
    return db;
  })();
  return _dbReady;
}

function rowToNote(row: Record<string, any>): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? null,
    audioUri: row.audio_uri ?? undefined,
    audioPath: row.audio_path ?? undefined,
    audioUploadStatus: row.audio_upload_status ?? undefined,
    source: row.source ?? undefined,
    category: (row.category as NoteCategory) ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    pinned: Boolean(row.pinned),
    transcript: row.transcript ?? undefined,
    summary: row.summary ?? undefined,
    transcriptionStatus: row.transcription_status ?? undefined,
    transcriptionError: row.transcription_error ?? undefined,
  };
}

async function _migrateLegacyIfNeeded(db: SQLite.SQLiteDatabase) {
  try {
    const migrated = await AsyncStorage.getItem('@voicepad/sqlite_migrated');
    if (migrated === 'true') return;

    const raw = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) {
      await AsyncStorage.setItem('@voicepad/sqlite_migrated', 'true');
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    const notes: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed as StoredNotes)?.notes ?? [];

    if (Array.isArray(notes) && notes.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const note of notes) {
          const n = note as Note;
          if (!n?.id || !n?.title) continue;
          await db.runAsync(
            `INSERT OR IGNORE INTO notes
             (id,title,content,created_at,updated_at,deleted_at,audio_uri,audio_path,
              audio_upload_status,source,category,duration_seconds,pinned,transcript,
              summary,transcription_status,transcription_error)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            n.id, n.title, n.content ?? '', n.createdAt,
            n.updatedAt ?? null, n.deletedAt ?? null,
            n.audioUri ?? null, n.audioPath ?? null,
            n.audioUploadStatus ?? null, n.source ?? null,
            n.category ?? null, n.durationSeconds ?? null,
            n.pinned ? 1 : 0, n.transcript ?? null,
            n.summary ?? null, n.transcriptionStatus ?? null,
            n.transcriptionError ?? null
          );
        }
      });
    }

    // Keep a backup, mark migrated, then remove the old blob
    await AsyncStorage.setItem(NOTES_BACKUP_KEY, raw);
    await AsyncStorage.setItem('@voicepad/sqlite_migrated', 'true');
    await AsyncStorage.removeItem(NOTES_STORAGE_KEY);
  } catch (err) {
    // Migration failure is non-fatal — SQLite will start fresh
    console.warn('SQLite migration failed (non-fatal):', err);
  }
}

// ─── Storage recovery (kept for backward compatibility) ────────────────────────

export async function hasStorageRecovery(): Promise<boolean> {
  // With SQLite we no longer need the old recovery flag, but we keep this
  // so _layout.tsx doesn't need to change.
  return (await AsyncStorage.getItem(NOTES_RECOVERY_KEY)) === 'true';
}
export async function clearStorageRecovery(): Promise<void> {
  await AsyncStorage.removeItem(NOTES_RECOVERY_KEY);
}

export async function restoreNotesFromBackup(): Promise<boolean> {
  try {
    const backup = await AsyncStorage.getItem(NOTES_BACKUP_KEY);
    if (!backup) return false;
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(NOTES_STORAGE_KEY, backup);
      await clearStorageRecovery();
      return true;
    }
    const parsed: unknown = JSON.parse(backup);
    const notes: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed as StoredNotes)?.notes ?? [];
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const note of notes) {
        const n = note as Note;
        if (!n?.id) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO notes
           (id,title,content,created_at,updated_at,deleted_at,audio_uri,audio_path,
            audio_upload_status,source,category,duration_seconds,pinned,transcript,
            summary,transcription_status,transcription_error)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          n.id, n.title, n.content ?? '', n.createdAt,
          n.updatedAt ?? null, n.deletedAt ?? null,
          n.audioUri ?? null, n.audioPath ?? null,
          n.audioUploadStatus ?? null, n.source ?? null,
          n.category ?? null, n.durationSeconds ?? null,
          n.pinned ? 1 : 0, n.transcript ?? null,
          n.summary ?? null, n.transcriptionStatus ?? null,
          n.transcriptionError ?? null
        );
      }
    });
    await clearStorageRecovery();
    return true;
  } catch {
    return false;
  }
}

// ─── Web Fallback (AsyncStorage) ─────────────────────────────────────────────

let _writeQueueWeb = Promise.resolve();
function enqueueWeb<T>(op: () => Promise<T>): Promise<T> {
  const next = _writeQueueWeb.then(op, op);
  _writeQueueWeb = next.then(() => {}, () => {});
  return next;
}

function parseStoredNotesWeb(raw: string): Note[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const notes = Array.isArray(parsed) ? parsed : (parsed as StoredNotes)?.notes;
    return Array.isArray(notes) ? (notes as Note[]) : [];
  } catch {
    return [];
  }
}

async function loadNotesWeb(includeDeleted = false): Promise<Note[]> {
  try {
    const saved = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
    if (!saved) return [];
    const notes = parseStoredNotesWeb(saved);
    return includeDeleted ? notes : notes.filter((n) => !n.deletedAt);
  } catch {
    return [];
  }
}

async function writeNotesWeb(notes: Note[]): Promise<void> {
  const current = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
  if (current) await AsyncStorage.setItem(NOTES_BACKUP_KEY, current);
  const payload: StoredNotes = { version: NOTES_STORAGE_VERSION, notes, savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload));
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function loadNotes(includeDeleted = false): Promise<Note[]> {
  if (Platform.OS === 'web') {
    return loadNotesWeb(includeDeleted);
  }
  try {
    const db = await getDb();
    const sql = includeDeleted
      ? 'SELECT * FROM notes ORDER BY pinned DESC, created_at DESC'
      : 'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at DESC';
    const rows = await db.getAllAsync<Record<string, any>>(sql);
    return rows.map(rowToNote);
  } catch (err) {
    console.warn('loadNotes failed:', err);
    await AsyncStorage.setItem(NOTES_RECOVERY_KEY, 'true').catch(() => {});
    return [];
  }
}

export async function saveNotes(notes: Note[]): Promise<void> {
  if (Platform.OS === 'web') {
    return enqueueWeb(() => writeNotesWeb(notes));
  }
  // Used by sync.ts which passes a full array — replace all non-deleted rows
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const n of notes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO notes
         (id,title,content,created_at,updated_at,deleted_at,audio_uri,audio_path,
          audio_upload_status,source,category,duration_seconds,pinned,transcript,
          summary,transcription_status,transcription_error)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        n.id, n.title, n.content ?? '', n.createdAt,
        n.updatedAt ?? new Date().toISOString(), n.deletedAt ?? null,
        n.audioUri ?? null, n.audioPath ?? null,
        n.audioUploadStatus ?? null, n.source ?? null,
        n.category ?? null, n.durationSeconds ?? null,
        n.pinned ? 1 : 0, n.transcript ?? null,
        n.summary ?? null, n.transcriptionStatus ?? null,
        n.transcriptionError ?? null
      );
    }
  });
}

export async function insertNote(note: Note): Promise<Note> {
  if (Platform.OS === 'web') {
    return enqueueWeb(async () => {
      const all = await loadNotesWeb(true);
      const withTimestamps: Note = { ...note, updatedAt: note.updatedAt || new Date().toISOString() };
      await writeNotesWeb([withTimestamps, ...all.filter((item) => item.id !== note.id)]);
      return withTimestamps;
    });
  }
  const db = await getDb();
  const withTimestamps: Note = { ...note, updatedAt: note.updatedAt || new Date().toISOString() };
  await db.runAsync(
    `INSERT OR REPLACE INTO notes
     (id,title,content,created_at,updated_at,deleted_at,audio_uri,audio_path,
      audio_upload_status,source,category,duration_seconds,pinned,transcript,
      summary,transcription_status,transcription_error)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    withTimestamps.id, withTimestamps.title, withTimestamps.content ?? '',
    withTimestamps.createdAt, withTimestamps.updatedAt ?? null,
    withTimestamps.deletedAt ?? null,
    withTimestamps.audioUri ?? null, withTimestamps.audioPath ?? null,
    withTimestamps.audioUploadStatus ?? null, withTimestamps.source ?? null,
    withTimestamps.category ?? null, withTimestamps.durationSeconds ?? null,
    withTimestamps.pinned ? 1 : 0, withTimestamps.transcript ?? null,
    withTimestamps.summary ?? null, withTimestamps.transcriptionStatus ?? null,
    withTimestamps.transcriptionError ?? null
  );
  return withTimestamps;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note | null> {
  if (Platform.OS === 'web') {
    return enqueueWeb(async () => {
      const all = await loadNotesWeb(true);
      let updatedNote: Note | null = null;
      const next = all.map((item) => {
        if (item.id === id) {
          updatedNote = { ...item, ...patch, updatedAt: new Date().toISOString() };
          return updatedNote;
        }
        return item;
      });
      await writeNotesWeb(next);
      return updatedNote;
    });
  }
  const db = await getDb();
  // Fetch current row
  const current = await db.getFirstAsync<Record<string, any>>(
    'SELECT * FROM notes WHERE id = ?', id
  );
  if (!current) return null;
  const merged: Note = { ...rowToNote(current), ...patch, updatedAt: new Date().toISOString() };
  await db.runAsync(
    `UPDATE notes SET
       title=?,content=?,updated_at=?,deleted_at=?,audio_uri=?,audio_path=?,
       audio_upload_status=?,source=?,category=?,duration_seconds=?,pinned=?,
       transcript=?,summary=?,transcription_status=?,transcription_error=?
     WHERE id=?`,
    merged.title, merged.content ?? '', merged.updatedAt ?? null,
    merged.deletedAt ?? null, merged.audioUri ?? null, merged.audioPath ?? null,
    merged.audioUploadStatus ?? null, merged.source ?? null,
    merged.category ?? null, merged.durationSeconds ?? null,
    merged.pinned ? 1 : 0, merged.transcript ?? null,
    merged.summary ?? null, merged.transcriptionStatus ?? null,
    merged.transcriptionError ?? null, id
  );
  return merged;
}

export async function deleteLocalAudio(uri?: string | null): Promise<void> {
  if (!uri || Platform.OS === 'web') return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (err) {
    console.warn('Could not delete local audio file:', err);
  }
}

export async function removeNote(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    return enqueueWeb(async () => {
      const all = await loadNotesWeb(true);
      const now = new Date().toISOString();
      await writeNotesWeb(all.map((item) => item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item));
    });
  }
  const db = await getDb();
  const row = await db.getFirstAsync<{ audio_uri?: string }>('SELECT audio_uri FROM notes WHERE id = ?', id);
  if (row?.audio_uri) {
    await deleteLocalAudio(row.audio_uri);
  }
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE notes SET deleted_at=?, updated_at=?, audio_uri=NULL WHERE id=?',
    now, now, id
  );
}

export async function purgeNote(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    return enqueueWeb(async () => {
      const all = await loadNotesWeb(true);
      await writeNotesWeb(all.filter((item) => item.id !== id));
    });
  }
  const db = await getDb();
  const row = await db.getFirstAsync<{ audio_uri?: string }>('SELECT audio_uri FROM notes WHERE id = ?', id);
  if (row?.audio_uri) {
    await deleteLocalAudio(row.audio_uri);
  }
  await db.runAsync('DELETE FROM notes WHERE id=?', id);
}
