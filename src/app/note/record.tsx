/**
 * Record Screen — Voice Notes + Audio Upload
 * Users can either record live or pick an existing audio file to transcribe.
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
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
import { DS } from '@/constants/design';
import { generateNoteId, isSupportedAudio, SUPPORTED_AUDIO_EXTENSIONS } from '@/lib/utils';

type TranscriptState = 'idle' | 'saving' | 'transcribing' | 'ready' | 'failed';

export default function RecordScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const selectedCategory: NoteCategory =
    categoryParam && ['Lectures', 'Sermons', 'Meetings', 'Personal'].includes(categoryParam)
      ? (categoryParam as NoteCategory)
      : 'Personal';

  // Optimized for clear voice speech while compressing file size 4x
  // (allows up to ~100 minutes of recording within the 25MB boundary)
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 48000,
    sampleRate: 32000,
    directory: 'document',
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder);

  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>('idle');
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [copied, setCopied] = useState(false);

  // Pulse animation
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  const isRecording = recorderState.isRecording;
  const elapsed = recorderState.durationMillis ?? 0;

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.38, { duration: 900, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.18, { duration: 900 }),
          withTiming(0.65, { duration: 900 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 250 });
      pulseOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [isRecording, pulseOpacity, pulseScale]);

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

  // ─── Live recording ────────────────────────────────────────────────────────

  async function start() {
    if (permission !== 'granted') {
      Alert.alert(
        'Microphone permission required',
        'Allow microphone access in Settings and try again.'
      );
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
      const durationSeconds = Math.max(1, Math.round((recorderState.durationMillis || elapsed) / 1000));
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Missing recording URI');
      setSavedUri(uri);

      const noteId = generateNoteId('voice');
      setSavedNoteId(noteId);

      const voiceNote: Note = {
        id: noteId,
        title: `Voice note · ${new Date().toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}`,
        content: 'Audio recording saved. Transcription starting…',
        audioUri: uri,
        source: 'voice',
        category: selectedCategory,
        durationSeconds,
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'pending',
      };

      await insertNote(voiceNote);
      setTranscriptState('transcribing');

      if (user?.id) {
        uploadAudioToCloud(user.id, noteId, uri)
          .then((path) => { if (path) updateNote(noteId, { audioPath: path }); })
          .catch(() => {});
      }

      transcribeSavedNote(uri, noteId);
    } catch {
      Alert.alert('Could not save recording', 'The recording could not be saved. Please try again.');
      setTranscriptState('idle');
    }
  }

  // ─── Upload audio file ────────────────────────────────────────────────────

  async function pickAudioFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/*',
          'video/mp4',   // some devices store m4a as video/mp4
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (!isSupportedAudio(asset.name ?? '', asset.mimeType ?? '')) {
        Alert.alert(
          'Unsupported format',
          `Please choose a supported audio file:\n${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`
        );
        return;
      }

      const uri = asset.uri;
      setSavedUri(uri);
      const noteId = generateNoteId('voice');
      setSavedNoteId(noteId);
      setTranscriptState('saving');

      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      const fileName = asset.name || 'uploaded-audio.m4a';
      const voiceNote: Note = {
        id: noteId,
        title: `Uploaded · ${fileName.slice(0, 40)}`,
        content: 'Audio file uploaded. Transcription starting…',
        audioUri: uri,
        source: 'voice',
        category: selectedCategory,
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'pending',
      };

      await insertNote(voiceNote);
      setTranscriptState('transcribing');

      if (user?.id) {
        uploadAudioToCloud(user.id, noteId, uri)
          .then((path) => { if (path) updateNote(noteId, { audioPath: path }); })
          .catch(() => {});
      }

      transcribeSavedNote(uri, noteId, fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open file picker.';
      Alert.alert('File picker error', msg);
      setTranscriptState('idle');
    }
  }

  // ─── Shared transcription ─────────────────────────────────────────────────

  async function transcribeSavedNote(uri: string, noteId: string, filename?: string) {
    try {
      const result = await transcribeAudio(uri, { noteId, filename });
      const notes = await loadNotes();
      const current = notes.find((n) => n.id === noteId);
      const title =
        result.text.split(/[.!?\n]/)[0]?.trim().slice(0, 64) ||
        current?.title ||
        'Voice note';

      await updateNote(noteId, {
        title,
        content: result.text,
        transcript: result.text,
        transcriptionStatus: 'ready',
        transcriptionError: undefined,
      });

      setTranscriptText(result.text);
      setTranscriptState('ready');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
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
    setTimeout(() => setCopied(false), 2500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  async function goToNote() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (savedNoteId) router.replace(`/note/${savedNoteId}`);
    else router.back();
  }

  async function discardRecording() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (savedNoteId) await removeNote(savedNoteId);
    router.back();
  }

  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const statusLabel =
    isRecording ? 'Recording in progress…'
    : transcriptState === 'saving' ? 'Saving audio…'
    : transcriptState === 'transcribing' ? 'Transcribing… please wait'
    : transcriptState === 'ready' ? 'Transcription complete ✓'
    : transcriptState === 'failed' ? 'Transcription failed'
    : permission === 'denied' ? 'Microphone unavailable'
    : 'Ready when you are';

  const isIdle = transcriptState === 'idle' && !savedUri && !isRecording;
  const isDone = transcriptState === 'ready' || transcriptState === 'failed';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.closeBtn}
              accessibilityLabel="Close recorder"
            >
              <ThemedText style={styles.closeBtnText}>×</ThemedText>
            </Pressable>
            <ThemedText style={styles.headerTitle}>
              {savedUri && !isRecording ? 'Your recording' : 'New voice note'}
            </ThemedText>
            <View style={styles.spacer} />
          </View>

          {/* Status + Timer */}
          <View style={styles.center}>
            <ThemedText style={styles.status}>{statusLabel}</ThemedText>
            <ThemedText style={[styles.timer, isRecording && styles.timerRecording]}>
              {time}
            </ThemedText>
            <AudioWaveform
              isRecording={isRecording}
              metering={recorderState.metering}
              height={90}
            />
          </View>

          {/* Audio preview after recording/upload */}
          {savedUri && !isRecording && (
            <View style={styles.previewBox}>
              <AudioPlayerView source={savedUri} />
            </View>
          )}

          {/* Transcript result */}
          {transcriptState === 'ready' && transcriptText ? (
            <View style={styles.transcriptBox}>
              <View style={styles.transcriptHeader}>
                <ThemedText style={styles.transcriptLabel}>📝 Transcript</ThemedText>
                <Pressable onPress={copyTranscript} style={styles.copyBtn}>
                  <ThemedText style={styles.copyBtnText}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText style={styles.transcriptText} selectable>
                {transcriptText}
              </ThemedText>
            </View>
          ) : transcriptState === 'transcribing' ? (
            <View style={styles.transcribingBox}>
              <ThemedText style={styles.transcribingText}>
                ⏳  Transcribing your audio…{'\n'}
                <ThemedText style={styles.transcribingNote}>
                  This takes 5–20 seconds. Stay on this screen.
                </ThemedText>
              </ThemedText>
            </View>
          ) : transcriptState === 'failed' ? (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>⚠️ {transcriptError || 'Transcription failed.'}</ThemedText>
            </View>
          ) : null}

          {/* Controls */}
          <View style={styles.controls}>
            {/* Idle: Record button + Upload button */}
            {isIdle && (
              <View style={styles.idleControls}>
                {/* Big record button */}
                <View style={styles.recordButtonWrapper}>
                  <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />
                  <Pressable
                    onPress={start}
                    style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                    accessibilityLabel="Start recording"
                  >
                    <View style={styles.recordDot} />
                  </Pressable>
                </View>
                <ThemedText style={styles.hint}>Tap to start recording</ThemedText>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <ThemedText style={styles.dividerText}>or</ThemedText>
                  <View style={styles.dividerLine} />
                </View>

                {/* Upload audio button */}
                <Pressable
                  onPress={pickAudioFile}
                  style={({ pressed }) => [styles.uploadBtn, pressed && styles.pressed]}
                  accessibilityLabel="Upload audio file to transcribe"
                >
                  <ThemedText style={styles.uploadBtnText}>📁  Upload Audio File</ThemedText>
                  <ThemedText style={styles.uploadBtnSub}>
                    MP3, M4A, WAV, OGG, AAC, FLAC
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Stop button while recording */}
            {isRecording && (
              <View style={styles.recordButtonWrapper}>
                <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />
                <Pressable
                  onPress={stop}
                  style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                  accessibilityLabel="Stop recording"
                >
                  <View style={styles.stopSquare} />
                </Pressable>
                <ThemedText style={styles.hint}>Tap to stop recording</ThemedText>
              </View>
            )}

            {/* Post-recording actions */}
            {savedUri && !isRecording && transcriptState !== 'idle' && (
              <View style={styles.postActions}>
                {isDone && (
                  <>
                    <Pressable
                      onPress={goToNote}
                      style={({ pressed }) => [styles.openNoteBtn, pressed && styles.pressed]}
                    >
                      <ThemedText style={styles.openNoteBtnText}>Open full note ➔</ThemedText>
                    </Pressable>
                    <Pressable onPress={discardRecording} style={styles.discardBtn}>
                      <ThemedText style={styles.discardBtnText}>Discard recording</ThemedText>
                    </Pressable>
                  </>
                )}
                {(transcriptState === 'saving' || transcriptState === 'transcribing') && (
                  <Pressable onPress={discardRecording} style={styles.discardBtn}>
                    <ThemedText style={styles.discardBtnText}>Cancel</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const DARK_BG = '#141222';
const DARK_TEXT = '#FFFFFF';
const MUTED_TEXT = '#918DA1';
const ACCENT = DS.colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 60 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: DARK_TEXT, fontSize: 34, fontWeight: '300' },
  headerTitle: {
    color: DARK_TEXT,
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  spacer: { width: 44 },

  center: { alignItems: 'center', paddingVertical: 20 },
  status: { color: MUTED_TEXT, fontSize: DS.font.bodyMd, fontWeight: '700', textAlign: 'center' },
  timer: {
    color: DARK_TEXT,
    fontSize: 62,
    lineHeight: 74,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 28,
  },
  timerRecording: {
    color: '#FF7A8A',
    textShadowColor: 'rgba(239,84,114,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },

  previewBox: { width: '100%', marginBottom: 16 },

  // Transcript
  transcriptBox: {
    backgroundColor: 'rgba(109,93,251,0.14)',
    borderRadius: DS.radius.lg,
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
  transcriptLabel: { color: DARK_TEXT, fontSize: DS.font.sm, fontWeight: '800' },
  copyBtn: {
    backgroundColor: ACCENT,
    borderRadius: DS.radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  copyBtnText: { color: '#FFF', fontSize: DS.font.xs, fontWeight: '800' },
  transcriptText: { color: '#E0DEFF', fontSize: DS.font.bodyMd, lineHeight: 26 },

  transcribingBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: DS.radius.lg,
    padding: 22,
    marginBottom: 16,
    alignItems: 'center',
  },
  transcribingText: {
    color: DARK_TEXT,
    fontSize: DS.font.bodyMd,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  transcribingNote: { color: MUTED_TEXT, fontSize: DS.font.xs, fontWeight: '400' },

  errorBox: {
    backgroundColor: 'rgba(239,84,114,0.12)',
    borderRadius: DS.radius.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,84,114,0.3)',
  },
  errorText: { color: '#EF5472', fontSize: DS.font.sm, lineHeight: 22 },

  // Controls
  controls: { alignItems: 'center', marginTop: 8 },

  idleControls: { alignItems: 'center', width: '100%' },

  recordButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 140,
    height: 140,
    marginBottom: 10,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 84, 114, 0.38)',
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
  recordDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#EF5472' },
  stopSquare: { width: 27, height: 27, borderRadius: 6, backgroundColor: '#EF5472' },
  hint: {
    color: MUTED_TEXT,
    fontSize: DS.font.xs,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 8,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 22,
    width: '100%',
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  dividerText: { color: MUTED_TEXT, fontSize: DS.font.xs, fontWeight: '600' },

  uploadBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  uploadBtnText: {
    color: DARK_TEXT,
    fontSize: DS.font.h3,
    fontWeight: '800',
  },
  uploadBtnSub: {
    color: MUTED_TEXT,
    fontSize: DS.font.xxs,
  },

  postActions: { width: '100%', alignItems: 'center', gap: 12 },
  openNoteBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: DS.radius.md,
    backgroundColor: ACCENT,
    alignItems: 'center',
    ...DS.shadow.primary,
  },
  openNoteBtnText: { color: '#FFF', fontSize: DS.font.h3, fontWeight: '800' },
  discardBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  discardBtnText: { color: MUTED_TEXT, fontSize: DS.font.sm, fontWeight: '600' },

  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
});
