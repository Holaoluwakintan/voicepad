import { Platform } from 'react-native';
import { supabase } from './supabase';

export const AUDIO_BUCKET = 'voicepad-audio';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Uploads a local audio recording to Supabase Storage.
 * Stores audio in a private bucket under `${userId}/${noteId}.<ext>`.
 */
export async function uploadAudioToCloud(
  userId: string,
  noteId: string,
  localUri: string
): Promise<string | null> {
  if (!supabase || !userId || !localUri) return null;

  try {
    const isWeb = Platform.OS === 'web';
    const ext = isWeb ? 'webm' : 'm4a';
    const contentType = isWeb ? 'audio/webm' : 'audio/mp4';
    const filePath = `${userId}/${noteId}.${ext}`;

    let body: Blob | ArrayBuffer;

    if (isWeb) {
      const response = await fetch(localUri);
      body = await response.blob();
    } else {
      // Use standard fetch blob or ArrayBuffer for native file URI
      try {
        const { File } = await import('expo-file-system');
        const file = new File(localUri);
        body = await file.arrayBuffer();
      } catch {
        const response = await fetch(localUri);
        body = await response.blob();
      }
    }

    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(filePath, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn('Storage upload error:', error.message);
      return null;
    }

    return filePath;
  } catch (err) {
    console.warn('Audio cloud upload failed (offline or unconfigured):', err);
    return null;
  }
}

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
