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
  const filename = options.filename ?? `voicepad-${options.noteId}.m4a`;

  if (Platform.OS === 'web') {
    const audioBlob = await fetch(audioUri).then((result) => result.blob());
    form.append('file', audioBlob, filename);
  } else {
    form.append('file', {
      uri: audioUri,
      name: filename,
      type: 'audio/m4a',
    } as unknown as Blob);
  }

  const response = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
    method: 'POST',
    body: form,
  });

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
