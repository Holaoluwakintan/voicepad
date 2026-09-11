import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';

const defaultUrl = 'https://voicepad-transcription.onrender.com';

const TRANSCRIPTION_API_URL =
  process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() || defaultUrl;

export type TranscriptionResult = {
  text: string;
  languages?: Array<{ code: string }>;
};

export async function transcribeAudio(
  audioUri: string,
  options: { noteId: string; filename?: string },
): Promise<TranscriptionResult> {
  const nativeFilename = options.filename ?? `voicepad-${options.noteId}.m4a`;

  // On Native (Android / iOS), first attempt native File.upload for robust background streaming
  if (Platform.OS !== 'web') {
    try {
      const file = new File(audioUri);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 75_000);

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
        throw new Error('Transcription timed out. The server may still be waking up. Your audio is saved; please retry.');
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
      throw new Error('Could not read the browser recording. Please record again and try once more.');
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
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Transcription timed out. The server may still be waking up. Your audio is saved; please retry.');
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach the transcription server at ${TRANSCRIPTION_API_URL} (${detail}). Verify the server is running.`
    );
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
