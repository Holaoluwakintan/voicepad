import { Platform } from 'react-native';

const TRANSCRIPTION_API_URL =
  process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL ??
  (Platform.OS === 'web' ? 'http://localhost:8787' : 'http://10.0.2.2:8787');

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
    const extension = audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('file', audioBlob, `voicepad-${options.noteId}.${extension}`);
  } else {
    form.append('file', {
      uri: audioUri,
      name: nativeFilename,
      type: 'audio/m4a',
    } as unknown as Blob);
  }

  let response: Response;
  try {
    response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new Error(`Could not reach the transcription server at ${TRANSCRIPTION_API_URL}. Check that it is running and restart Expo after changing .env.`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Transcription failed (${response.status})`);
  }

  if (!payload?.text || typeof payload.text !== 'string') {
    throw new Error('The transcription server returned no transcript.');
  }

  return payload as TranscriptionResult;
}

export function getTranscriptionApiUrl() {
  return TRANSCRIPTION_API_URL;
}
