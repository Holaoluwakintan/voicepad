import { supabase } from './supabase';

export const AUDIO_BUCKET = 'voicepad-audio';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Privacy (v1.1.3): VoicePad no longer uploads audio to cloud storage. Recordings stay on
 * the device that made them, and only text syncs. The helpers below exist only for notes
 * created before v1.1.3 that may still reference an older cloud file (audio_path):
 * playing it if it is still there (returns null gracefully when it is not) and removing it
 * when the user deletes the note.
 */

/**
 * Generates a secure, temporary signed URL (1 hour) for streaming/playing a remote voice note.
 */
export async function getSignedAudioUrl(audioPath?: string): Promise<string | null> {
  if (!supabase || !audioPath) return null;

  // Check cache first (valid for 50 minutes to avoid edge expiry)
  const cached = signedUrlCache.get(audioPath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(audioPath, 3600);

    if (error || !data?.signedUrl) {
      return null;
    }

    signedUrlCache.set(audioPath, {
      url: data.signedUrl,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });

    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Deletes remote voice note from Supabase Storage when a note is permanently deleted.
 */
export async function deleteAudioFromCloud(audioPath?: string): Promise<boolean> {
  if (!supabase || !audioPath) return false;

  try {
    const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([audioPath]);
    signedUrlCache.delete(audioPath);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Account deletion: removes every file in the signed-in user's own folder of the legacy
 * audio bucket (pre-1.1.3 backups). Storage policies only let a user list/delete their own
 * folder. Best effort: returns the number of files removed and never throws.
 */
export async function deleteAllCloudAudioForCurrentUser(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return 0;
    let removed = 0;
    for (let round = 0; round < 20; round += 1) {
      const { data: files, error } = await supabase.storage.from(AUDIO_BUCKET).list(userId, { limit: 100 });
      if (error || !files || files.length === 0) break;
      const paths = files.filter((f) => f.name).map((f) => `${userId}/${f.name}`);
      if (paths.length === 0) break;
      const { error: removeError } = await supabase.storage.from(AUDIO_BUCKET).remove(paths);
      if (removeError) break;
      removed += paths.length;
      paths.forEach((p) => signedUrlCache.delete(p));
    }
    return removed;
  } catch {
    return 0;
  }
}
