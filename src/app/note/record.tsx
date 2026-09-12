import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
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
const SUCCESS = '#16A34A';

type TranscriptState =
  | 'idle'
  | 'saving'
  | 'transcribing'
  | 'ready'
  | 'failed';

export default function RecordScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const selectedCategory: NoteCategory =
    categoryParam && ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(categoryParam)
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
  const [transcriptState, setTranscriptState] = useState<TranscriptState>('idle');
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcriptError, setTranscriptError] = useState<string>('');
  const [copied, setCopied] = useState(false);

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
      setTranscriptState('saving');
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
        content: 'Audio recording saved. Transcription starting…',
        audioUri: uri,
        source: 'voice',
        category: selectedCategory,
        durationSeconds: recordedDurationSeconds,
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'pending',
      };

      await insertNote(voiceNote);
      setTranscriptState('transcribing');

      // Background audio upload to Supabase Storage if user is signed in
      if (user?.id) {
        uploadAudioToCloud(user.id, noteId, uri)
          .then((uploadedPath) => {
            if (uploadedPath) updateNote(noteId, { audioPath: uploadedPath });
          })
          .catch(() => {});
      }

      // Transcription — update UI inline
      transcribeSavedNote(uri, noteId);
    } catch {
      Alert.alert('Could not save recording', 'The recording could not be saved. Please try again.');
      setTranscriptState('idle');
    }
  }

  async function transcribeSavedNote(uri: string, noteId: string) {
    try {
      const result = await transcribeAudio(uri, { noteId });
      const current = (await loadNotes()).find((note) => note.id === noteId);
      const title =
        result.text.split(/[.!?\n]/)[0]?.trim().slice(0, 64) || current?.title || 'Voice note';
      await updateNote(noteId, {
        title,
        content: result.text,
        transcript: result.text,
        transcriptionStatus: 'ready',
        transcriptionError: undefined,
      });
      setTranscriptText(result.text);
      setTranscriptState('ready');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transcription error';
      await updateNote(noteId, { transcriptionStatus: 'failed', transcriptionError: message });
      setTranscriptError(message);
      setTranscriptState('failed');
    }
  }

  async function copyTranscript() {
    await Clipboard.setStringAsync(transcriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  async function goToNote() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (savedNoteId) {
      router.replace(`/note/${savedNoteId}`);
    } else {
      router.back();
    }
  }

  async function discardRecording() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (savedNoteId) await removeNote(savedNoteId);
    router.back();
  }

  const time = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(
    Math.floor((elapsed % 60000) / 1000)
  ).padStart(2, '0')}`;

  const statusLabel =
    isRecording
      ? 'Recording in progress…'
      : transcriptState === 'saving'
      ? 'Saving audio…'
      : transcriptState === 'transcribing'
      ? 'Transcribing… please wait'
      : transcriptState === 'ready'
      ? 'Transcription complete ✓'
      : transcriptState === 'failed'
      ? 'Transcription failed'
      : permission === 'denied'
      ? 'Microphone unavailable'
      : 'Ready when you are';

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Close recorder">
            <ThemedText style={styles.closeText}>×</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>New voice note</ThemedText>
          <View style={styles.spacer} />
        </View>

        <View style={styles.center}>
          <ThemedText style={styles.status}>{statusLabel}</ThemedText>
          <ThemedText style={styles.timer}>{time}</ThemedText>
          <AudioWaveform isRecording={isRecording} metering={recorderState.metering} height={90} />
        </View>

        {/* Audio player preview after recording */}
        {savedUri && !isRecording && (
          <View style={styles.previewBox}>
            <AudioPlayerView source={savedUri} />
          </View>
        )}

        {/* Inline transcript result */}
        {transcriptState === 'ready' && transcriptText ? (
          <View style={styles.transcriptBox}>
            <View style={styles.transcriptHeader}>
              <ThemedText style={styles.transcriptLabel}>📝 Transcription</ThemedText>
              <Pressable onPress={copyTranscript} style={styles.copyBtn}>
                <ThemedText style={styles.copyBtnText}>{copied ? '✓ Copied!' : '📋 Copy'}</ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.transcriptText} selectable>
              {transcriptText}
            </ThemedText>
          </View>
        ) : transcriptState === 'transcribing' ? (
          <View style={styles.transcribingBox}>
            <ThemedText style={styles.transcribingText}>
              ⏳  Groq Whisper is transcribing your audio…{'\n'}
              <ThemedText style={styles.transcribingNote}>
                This usually takes 5–20 seconds. Stay on this screen.
              </ThemedText>
            </ThemedText>
          </View>
        ) : transcriptState === 'failed' ? (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorText}>⚠️ {transcriptError || 'Transcription failed.'}</ThemedText>
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={styles.controls}>
          {!savedUri && !isRecording && transcriptState === 'idle' && (
            <View style={styles.recordButtonWrapper}>
              <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />
              <Pressable
                onPress={start}
                style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                accessibilityLabel="Start recording">
                <View style={styles.recordDot} />
              </Pressable>
              <ThemedText style={styles.hint}>Tap to start recording</ThemedText>
            </View>
          )}

          {isRecording && (
            <View style={styles.recordButtonWrapper}>
              <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />
              <Pressable
                onPress={stop}
                style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                accessibilityLabel="Stop recording">
                <View style={styles.stopSquare} />
              </Pressable>
              <ThemedText style={styles.hint}>Tap to finish recording</ThemedText>
            </View>
          )}

          {savedUri && !isRecording && transcriptState !== 'idle' && (
            <View style={styles.postActions}>
              {(transcriptState === 'ready' || transcriptState === 'failed') && (
                <>
                  <Pressable onPress={goToNote} style={styles.openNoteBtn}>
                    <ThemedText style={styles.openNoteBtnText}>Open full note ➔</ThemedText>
                  </Pressable>
                  <Pressable onPress={discardRecording} style={styles.discardBtn}>
                    <ThemedText style={styles.discardBtnText}>Discard recording</ThemedText>
                  </Pressable>
                </>
              )}
              {transcriptState === 'saving' && (
                <ThemedText style={styles.waitText}>Saving audio…</ThemedText>
              )}
              {transcriptState === 'transcribing' && (
                <Pressable onPress={discardRecording} style={styles.discardBtn}>
                  <ThemedText style={styles.discardBtnText}>Discard recording</ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141222' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFF', fontSize: 34, fontWeight: '300' },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  spacer: { width: 44 },
  center: { alignItems: 'center', paddingVertical: 20 },
  status: { color: MUTED, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  timer: { color: '#FFF', fontSize: 62, lineHeight: 74, fontWeight: '800', marginTop: 8, marginBottom: 28 },
  previewBox: { width: '100%', marginBottom: 16 },
  // Transcript box
  transcriptBox: {
    backgroundColor: 'rgba(109,93,251,0.12)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(109,93,251,0.35)',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  transcriptLabel: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  copyBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  copyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  transcriptText: { color: '#E0DEFF', fontSize: 15, lineHeight: 24 },
  // Transcribing placeholder
  transcribingBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  transcribingText: { color: '#FFF', fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  transcribingNote: { color: MUTED, fontSize: 13, fontWeight: '400' },
  // Error
  errorBox: {
    backgroundColor: 'rgba(239,84,114,0.12)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,84,114,0.3)',
  },
  errorText: { color: '#EF5472', fontSize: 14, lineHeight: 22 },
  // Controls
  controls: { alignItems: 'center', marginTop: 8 },
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
  postActions: { width: '100%', alignItems: 'center', gap: 12 },
  openNoteBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  openNoteBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  discardBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  discardBtnText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  waitText: { color: MUTED, fontSize: 15, fontWeight: '700' },
  hint: { color: MUTED, fontSize: 13, marginTop: 18, textAlign: 'center', position: 'absolute', bottom: -28, width: 200 },
});
