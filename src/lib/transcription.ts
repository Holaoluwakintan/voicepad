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
  const form = new FormData();
  form.append('noteId', options.noteId);
  form.append('mode', 'english');
  const nativeFilename = options.filename ?? `voicepad-${options.noteId}.m4a`;

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
  // 75 seconds timeout to accommodate Render / free tier cold start times
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Transcription timed out. The server may still be waking up. Your audio is saved; please retry.');
    }
    throw new Error(
      `Could not reach the transcription server at ${TRANSCRIPTION_API_URL}. Verify the server is running or set EXPO_PUBLIC_TRANSCRIPTION_API_URL in your .env.`
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
