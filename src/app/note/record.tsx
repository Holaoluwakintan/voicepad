import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AudioWaveform } from '@/components/audio-waveform';
import { AudioPlayerView } from '@/components/audio-player-view';
import { insertNote, updateNote, Note, loadNotes, NoteCategory, removeNote } from '@/lib/notes';
import { transcribeAudio } from '@/lib/transcription';
import { uploadAudioToCloud } from '@/lib/storage';
import { useAuth } from '@/lib/auth';

const ACCENT = '#6D5DFB';
const MUTED = '#918DA1';
const DANGER = '#EF5472';

export default function RecordScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const selectedCategory: NoteCategory = categoryParam && ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(categoryParam)
    ? (categoryParam as NoteCategory)
    : 'Personal';

  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder);
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transcriptionStarted, setTranscriptionStarted] = useState(false);

  // Pulse animation for recording state
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  const isRecording = recorderState.isRecording;
  const elapsed = recorderState.durationMillis ?? 0;

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.32, { duration: 900, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 900 }),
          withTiming(0.7, { duration: 900 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 250 });
      pulseOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

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
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  }

  async function stop() {
    try {
      setSaving(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const recordedDurationSeconds = Math.max(1, Math.round((recorderState.durationMillis || elapsed) / 1000));
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Missing recording URI');
      setSavedUri(uri);

      const noteId = `voice-${Date.now()}`;
      setSavedNoteId(noteId);

      const voiceNote: Note = {
        id: noteId,
        title: `Voice note · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        content: 'Audio recording saved. Transcription is starting…',
        audioUri: uri,
        source: 'voice',
        category: selectedCategory,
        durationSeconds: recordedDurationSeconds,
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'pending',
      };

      await insertNote(voiceNote);
      setTranscriptionStarted(true);

      // Background audio upload to Supabase Storage if user is signed in
      if (user?.id) {
        uploadAudioToCloud(user.id, noteId, uri)
          .then((uploadedPath) => {
            if (uploadedPath) {
              updateNote(noteId, { audioPath: uploadedPath });
            }
          })
          .catch(() => {});
      }

      // Background transcription
      void transcribeSavedNote(uri, noteId);
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

  async function discardRecording() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}

    if (savedNoteId) {
      await removeNote(savedNoteId);
    }
    router.back();
  }

  function goToSavedNote() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    if (savedNoteId) {
      router.replace(`/note/${savedNoteId}`);
    } else {
      router.back();
    }
  }

  const time = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(
    Math.floor((elapsed % 60000) / 1000)
  ).padStart(2, '0')}`;

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
            {isRecording
              ? 'Recording in progress…'
              : saving
              ? 'Saving audio…'
              : transcriptionStarted
              ? 'Transcribing in background'
              : savedUri
              ? 'Saved to VoicePad'
              : permission === 'denied'
              ? 'Microphone unavailable'
              : 'Ready when you are'}
          </ThemedText>

          <ThemedText style={styles.timer}>{time}</ThemedText>

          {/* Live Reactive Audio Waveform */}
          <AudioWaveform isRecording={isRecording} metering={recorderState.metering} height={90} />
        </View>

        <View style={styles.controls}>
          {savedUri && !isRecording && (
            <View style={styles.postRecordActions}>
              <View style={styles.previewBox}>
                <AudioPlayerView source={savedUri} />
              </View>

              <Pressable onPress={goToSavedNote} style={styles.viewNoteButton}>
                <ThemedText style={styles.viewNoteText}>Open note ➔</ThemedText>
              </Pressable>

              <Pressable onPress={discardRecording} style={styles.discardButton}>
                <ThemedText style={styles.discardText}>Discard recording</ThemedText>
              </Pressable>
            </View>
          )}

          {!savedUri && (
            <View style={styles.recordButtonWrapper}>
              {/* Animated pulse ring */}
              <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />

              <Pressable
                onPress={isRecording ? stop : start}
                disabled={saving}
                style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}>
                {isRecording ? <View style={styles.stopSquare} /> : <View style={styles.recordDot} />}
              </Pressable>
              <ThemedText style={styles.hint}>
                {saving ? 'Saving voice note…' : isRecording ? 'Tap to finish recording' : 'Tap to start recording'}
              </ThemedText>
            </View>
          )}
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
  timer: { color: '#FFF', fontSize: 62, lineHeight: 74, fontWeight: '800', marginTop: 8, marginBottom: 28 },
  controls: { alignItems: 'center' },
  recordButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 140,
    height: 140,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 84, 114, 0.4)',
  },
  recordButton: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: 'rgba(109,93,251,0.35)',
    zIndex: 10,
  },
  recordDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: DANGER },
  stopSquare: { width: 27, height: 27, borderRadius: 6, backgroundColor: DANGER },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  postRecordActions: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  previewBox: {
    width: '100%',
    marginBottom: 8,
  },
  viewNoteButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  viewNoteText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  discardButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  discardText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  hint: { color: MUTED, fontSize: 13, marginTop: 18, textAlign: 'center', position: 'absolute', bottom: -28, width: 200 },
});
