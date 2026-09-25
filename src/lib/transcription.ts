import * as FileSystem from 'expo-file-system';
import { FileSystemUploadType } from 'expo-file-system/legacy';
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

  // 1. On Native (Android / iOS), first attempt FileSystem.uploadAsync (native Multipart upload)
  if (Platform.OS !== 'web') {
    try {
      const uploadResult = await FileSystem.uploadAsync(
        `${TRANSCRIPTION_API_URL}/transcribe`,
        audioUri,
        {
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
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
        }
      );

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
    } catch (nativeErr: any) {
      if (nativeErr?.message?.includes('timed out') || nativeErr?.name === 'AbortError') {
        throw new Error('Transcription timed out. The server may still be waking up. Please retry.');
      }
      console.warn('Native multipart upload failed, falling back to base64 JSON payload:', nativeErr?.message);
    }

    // 2. Native Fallback: Read audio file directly as base64 and send standard JSON fetch
    // (100% immune to Android OkHttp FormDataPart and multipart bridge bugs)
    try {
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const jsonResponse = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...authHeaders,
          },
          body: JSON.stringify({
            audio: base64Audio,
            filename: nativeFilename,
            mimeType: 'audio/m4a',
            noteId: options.noteId,
          }),
          signal: controller.signal,
        });

        const jsonPayload = await jsonResponse.json().catch(() => null);
        if (jsonResponse.ok && jsonPayload?.text && typeof jsonPayload.text === 'string') {
          return { text: jsonPayload.text.trim() };
        }
        if (!jsonResponse.ok) {
          throw new Error(jsonPayload?.error ?? `Transcription failed (${jsonResponse.status})`);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (jsonErr: any) {
      if (jsonErr?.name === 'AbortError') {
        throw new Error('Transcription timed out. The server may still be waking up. Please retry.');
      }
      console.warn('Native base64 JSON payload failed:', jsonErr?.message);
      throw jsonErr;
    }
  }

  // 3. Web path: fetch Blob and attempt FormData upload with automatic Base64 JSON fallback
  let audioBlob: Blob;
  try {
    const blobResponse = await fetch(audioUri);
    if (!blobResponse.ok) throw new Error(`recording URL returned ${blobResponse.status}`);
    audioBlob = await blobResponse.blob();
  } catch {
    throw new Error('Could not read the audio recording. Please record again and try once more.');
  }

  const mimeType = audioBlob.type || 'audio/m4a';
  const extension = mimeType.includes('ogg')
    ? 'ogg'
    : mimeType.includes('mp4') || mimeType.includes('m4a')
    ? 'm4a'
    : mimeType.includes('wav')
    ? 'wav'
    : mimeType.includes('mp3')
    ? 'mp3'
    : 'webm';

  const webFilename = options.filename ?? `voicepad-${options.noteId}.${extension}`;

  // 3a. Primary Web Attempt: Multipart FormData
  try {
    const form = new FormData();
    form.append('noteId', options.noteId);
    form.append('mode', 'english');
    form.append('file', audioBlob, webFilename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
          ...authHeaders,
        },
        body: form,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.text && typeof payload.text === 'string') {
        return { text: payload.text.trim() };
      }
      if (!response.ok) {
        throw new Error(payload?.error ?? `Transcription failed (${response.status})`);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (webFormErr: any) {
    console.warn('Web FormData upload failed, attempting Web Base64 fallback:', webFormErr?.message);
    if (webFormErr?.name === 'AbortError') {
      throw new Error('Transcription timed out. The server may still be waking up. Please retry.');
    }
  }

  // 3b. Web Fallback: Convert Blob to Base64 JSON payload
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const commaIndex = result.indexOf(',');
        resolve(commaIndex !== -1 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...authHeaders,
        },
        body: JSON.stringify({
          audio: base64Data,
          filename: webFilename,
          mimeType,
          noteId: options.noteId,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.text && typeof payload.text === 'string') {
        return { text: payload.text.trim() };
      }
      if (!response.ok) {
        throw new Error(payload?.error ?? `Transcription failed (${response.status})`);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (base64Err: any) {
    if (base64Err?.name === 'AbortError') {
      throw new Error('Transcription timed out. The server may still be waking up. Please retry.');
    }
    throw base64Err;
  }

  throw new Error('Server returned an empty transcript.');
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
