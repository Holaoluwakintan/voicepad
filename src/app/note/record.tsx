import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { insertNote, updateNote, Note, loadNotes, NoteCategory } from '@/lib/notes';
import { transcribeAudio } from '@/lib/transcription';

const ACCENT = '#6D5DFB';
const MUTED = '#918DA1';

export default function RecordScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const selectedCategory: NoteCategory = categoryParam && ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(categoryParam)
    ? categoryParam as NoteCategory
    : 'Personal';
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transcriptionStarted, setTranscriptionStarted] = useState(false);
  const player = useAudioPlayer(savedUri);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    (async () => {
      const result = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(result.granted ? 'granted' : 'denied');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  async function start() {
    if (permission !== 'granted') {
      Alert.alert('Microphone permission required', 'Allow microphone access and try again.');
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  }

  async function stop() {
    try {
      setSaving(true);
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Missing recording URI');
      setSavedUri(uri);

      const voiceNote: Note = {
        id: `voice-${Date.now()}`,
        title: `Voice note · ${new Date().toLocaleDateString()}`,
        content: 'Audio recording saved. Transcription is starting…',
        audioUri: uri,
        source: 'voice',
        category: selectedCategory,
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'pending',
      };
      await insertNote(voiceNote);
      setTranscriptionStarted(true);
      void transcribeSavedNote(uri, voiceNote.id);
    } catch {
      Alert.alert('Could not save recording', 'The recording could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function transcribeSavedNote(uri: string, noteId: string) {
    try {
      const result = await transcribeAudio(uri, { noteId });
      const current = (await loadNotes()).find((note) => note.id === noteId);
      await updateNote(noteId, {
        title: result.text.split(/[.!?\n]/)[0]?.trim().slice(0, 64) || current?.title || 'Voice note',
        content: result.text,
        transcript: result.text,
        transcriptionStatus: 'ready',
        transcriptionError: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transcription error';
      await updateNote(noteId, { transcriptionStatus: 'failed', transcriptionError: message });
    }
  }

  function playPause() {
    if (!savedUri) return;
    playerStatus.playing ? player.pause() : player.play();
  }

  const isRecording = recorderState.isRecording;
  const elapsed = recorderState.durationMillis ?? 0;
  const time = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Close recorder">
            <ThemedText style={styles.closeText}>×</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>New voice note</ThemedText>
          <View style={styles.spacer} />
        </View>

        <View style={styles.center}>
          <ThemedText style={styles.status}>
            {isRecording ? 'Recording' : saving ? 'Saving audio…' : transcriptionStarted ? 'Transcription started' : savedUri ? 'Saved to VoicePad' : permission === 'denied' ? 'Microphone unavailable' : 'Ready when you are'}
          </ThemedText>
          <ThemedText style={styles.timer}>{time}</ThemedText>
          <View style={styles.waveform}>
            {[24, 42, 30, 62, 38, 76, 46, 30, 54, 34, 68, 42, 24].map((height, i) => (
              <View key={i} style={[styles.wave, { height: isRecording ? height : 12, opacity: isRecording ? 1 : 0.45 }]} />
            ))}
          </View>
        </View>

        <View style={styles.controls}>
          {savedUri && !isRecording && (
            <Pressable onPress={playPause} style={styles.playButton} accessibilityLabel={playerStatus.playing ? 'Pause recording' : 'Play recording'}>
              <ThemedText style={styles.playText}>{playerStatus.playing ? 'Pause recording' : 'Play recording'}</ThemedText>
            </Pressable>
          )}
          <Pressable
            onPress={isRecording ? stop : start}
            disabled={saving}
            style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording ? <View style={styles.stopSquare} /> : <View style={styles.recordDot} />}
          </Pressable>
          <ThemedText style={styles.hint}>{saving ? 'Saving voice note…' : isRecording ? 'Tap to stop' : savedUri ? 'Transcription is running in the background' : 'Tap to start'}</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141222' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFF', fontSize: 34, fontWeight: '300' },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  spacer: { width: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { color: MUTED, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  timer: { color: '#FFF', fontSize: 62, lineHeight: 74, fontWeight: '800', marginTop: 12 },
  waveform: { height: 100, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 48 },
  wave: { width: 7, borderRadius: 5, backgroundColor: ACCENT },
  controls: { alignItems: 'center' },
  recordButton: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: 'rgba(109,93,251,0.35)' },
  recordDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#EF5472' },
  stopSquare: { width: 27, height: 27, borderRadius: 6, backgroundColor: '#EF5472' },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  playButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 18 },
  playText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  hint: { color: MUTED, fontSize: 13, marginTop: 16, textAlign: 'center' },
});
