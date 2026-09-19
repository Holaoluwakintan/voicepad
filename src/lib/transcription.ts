import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';

import { TRANSCRIPTION_API_URL, toFriendlyErrorMessage } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/supabase';

export type TranscriptionResult = {
  text: string;
  languages?: { code: string }[];
};

// ─── Background Pre-Warming Ping ─────────────────────────────────────────────
/**
 * Fires a lightweight background ping to the server to initiate container
 * spin-up ahead of time (e.g. while the user is recording or choosing files).
 */
export function wakeUpTranscriptionServer(): void {
  try {
    fetch(`${TRANSCRIPTION_API_URL}/health`, { method: 'GET' }).catch(() => {});
  } catch {}
}

const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes to comfortably absorb Render cold starts

async function performTranscriptionAttempt(
  audioUri: string,
  options: { noteId: string; filename?: string }
): Promise<TranscriptionResult> {
  const nativeFilename = options.filename ?? `voicepad-${options.noteId}.m4a`;
  const authHeaders = await getAuthHeaders();
  const idempotencyKey = `transcribe-${options.noteId}`;

  // On Native (Android / iOS), first attempt native File.upload for robust background streaming
  if (Platform.OS !== 'web') {
    try {
      const file = new File(audioUri);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const uploadResult = await file.upload(`${TRANSCRIPTION_API_URL}/transcribe`, {
          httpMethod: 'POST',
          uploadType: UploadType.MULTIPART,
          fieldName: 'file',
          mimeType: 'audio/m4a',
          parameters: {
            noteId: options.noteId,
            mode: 'english',
          },
          headers: {
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...authHeaders,
          },
          signal: controller.signal,
        });

        const status = uploadResult.status;
        let payload: any = null;
        try {
          payload = JSON.parse(uploadResult.body);
        } catch {}

        if (status >= 200 && status < 300 && payload?.text && typeof payload.text === 'string') {
          return { text: payload.text.trim() };
        }
        if (status < 200 || status >= 300) {
          throw new Error(payload?.error ?? `Server error (${status})`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (nativeErr: any) {
      if (nativeErr?.name === 'AbortError') {
        throw new Error('Transcription timed out. The server may still be waking up. Please retry.');
      }
      console.warn('Native upload failed, attempting fallback fetch:', nativeErr?.message);
    }
  }

  // Web or fallback fetch path
  const form = new FormData();
  form.append('noteId', options.noteId);
  form.append('mode', 'english');

  if (Platform.OS === 'web') {
    let audioBlob: Blob;
    try {
      const blobResponse = await fetch(audioUri);
      if (!blobResponse.ok) throw new Error(`recording URL returned ${blobResponse.status}`);
      audioBlob = await blobResponse.blob();
    } catch {
      throw new Error('Could not read the audio recording. Please record again and try once more.');
    }
    const extension = audioBlob.type.includes('ogg')
      ? 'ogg'
      : audioBlob.type.includes('mp4')
      ? 'm4a'
      : 'webm';
    form.append('file', audioBlob, `voicepad-${options.noteId}.${extension}`);
  } else {
    form.append('file', {
      uri: audioUri,
      name: nativeFilename,
      type: 'audio/m4a',
    } as unknown as Blob);
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...authHeaders,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Transcription timed out. The server took too long to wake up. Please retry in a few moments.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Transcription failed (${response.status})`);
  }
  if (!payload?.text || typeof payload.text !== 'string') {
    throw new Error('Server returned an empty transcript.');
  }

  return {
    text: payload.text.trim(),
  };
}

export async function transcribeAudio(
  audioUri: string,
  options: { noteId: string; filename?: string }
): Promise<TranscriptionResult> {
  try {
    return await performTranscriptionAttempt(audioUri, options);
  } catch (firstError) {
    // Automatic 1x retry on cold-start timeouts or network drops
    const rawMsg = String(firstError);
    const isRetryable =
      rawMsg.includes('timed out') ||
      rawMsg.includes('AbortError') ||
      rawMsg.includes('network') ||
      rawMsg.includes('502') ||
      rawMsg.includes('503');

    if (isRetryable) {
      console.log('Transcription initial attempt encountered transient error; retrying in 2s…');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        return await performTranscriptionAttempt(audioUri, options);
      } catch (secondError) {
        throw new Error(toFriendlyErrorMessage(secondError, 'Transcription service is currently unavailable. Please retry shortly.'));
      }
    }
    throw new Error(toFriendlyErrorMessage(firstError, 'Transcription failed. Please try again.'));
  }
}
