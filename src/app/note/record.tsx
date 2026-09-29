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
import { transcribeAudio, wakeUpTranscriptionServer } from '@/lib/transcription';
import { uploadAudioToCloud } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { DS } from '@/constants/design';
import { generateNoteId, isSupportedAudio, SUPPORTED_AUDIO_EXTENSIONS, toFriendlyErrorMessage } from '@/lib/utils';

type TranscriptState = 'idle' | 'saving' | 'transcribing' | 'uploading' | 'ready' | 'failed';

const LANGUAGES = [
  { code: 'auto', label: '🌐 Auto-detect' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'pt', label: '🇧🇷 Portuguese' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'yo', label: '🇳🇬 Yoruba' },
  { code: 'ha', label: '🇳🇬 Hausa' },
  { code: 'ig', label: '🇳🇬 Igbo' },
] as const;
type LangCode = typeof LANGUAGES[number]['code'];

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
  const [selectedLanguage, setSelectedLanguage] = useState<LangCode>('auto');
  const [transcribingMsg, setTranscribingMsg] = useState('Sending to AI…');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

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
    // Pre-warm the cloud transcription server while the user prepares to record
    wakeUpTranscriptionServer();
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
      setIsPaused(false);
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  }

  async function pause() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (recorder.pause) {
        await recorder.pause();
      }
      setIsPaused(true);
    } catch (err) {
      console.warn('Could not pause recording:', err);
    }
  }

  async function resume() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (recorder.record) {
        await recorder.record();
      }
      setIsPaused(false);
    } catch (err) {
      console.warn('Could not resume recording:', err);
    }
  }

  function handleClosePress() {
    if (isRecording || isPaused) {
      Alert.alert(
        'Discard Recording?',
        'You have a recording in progress. If you leave now, this recording will be discarded.',
        [
          { text: 'Keep Recording', style: 'cancel' },
          {
            text: 'Discard & Exit',
            style: 'destructive',
            onPress: async () => {
              try { await recorder.stop(); } catch {}
              setIsPaused(false);
              router.back();
            },
          },
        ]
      );
      return;
    }
    if (transcriptState === 'transcribing') {
      Alert.alert(
        'Transcription in Progress',
        'Your recording has been saved safely. VoicePad will continue transcribing in the background.',
        [
          { text: 'Keep Waiting', style: 'cancel' },
          { text: 'Return to Notes', onPress: () => router.replace('/(tabs)') },
        ]
      );
      return;
    }
    router.back();
  }

  async function stop() {
    setIsPaused(false);
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
          .then((path) => updateNote(noteId, path ? { audioPath: path, audioUploadStatus: 'uploaded' } : { audioUploadStatus: 'failed' }))
          .catch(() => updateNote(noteId, { audioUploadStatus: 'failed' }));
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
          .then((path) => updateNote(noteId, path ? { audioPath: path, audioUploadStatus: 'uploaded' } : { audioUploadStatus: 'failed' }))
          .catch(() => updateNote(noteId, { audioUploadStatus: 'failed' }));
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
    // Cycle through reassuring progress messages so users don't think it's frozen
    setTranscribingMsg('Sending to AI…');
    const msgTimer = setInterval(() => {
      setTranscribingMsg((prev) =>
        prev === 'Sending to AI…' ? 'Processing audio…' :
        prev === 'Processing audio…' ? 'Almost ready…' :
        'Still working…'
      );
    }, 8000);
    try {
      const result = await transcribeAudio(uri, { noteId, filename, language: selectedLanguage === 'auto' ? undefined : selectedLanguage });
      clearInterval(msgTimer);
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
      clearInterval(msgTimer);
      const isAuthError = error instanceof Error && error.message === 'AUTH_REQUIRED';
      const message = isAuthError
        ? 'Sign in required. Go to Profile → Sign In to use AI transcription.'
        : toFriendlyErrorMessage(error, 'Transcription could not be completed. Please try again.');
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
    isPaused ? 'Recording paused ⏸'
    : isRecording ? 'Recording in progress…'
    : transcriptState === 'saving' ? 'Saving audio…'
    : transcriptState === 'transcribing' ? transcribingMsg
    : transcriptState === 'ready' ? 'Transcription complete ✓'
    : transcriptState === 'failed' ? 'Transcription failed'
    : permission === 'denied' ? 'Microphone unavailable'
    : 'Ready when you are';

  const isIdle = transcriptState === 'idle' && !savedUri && !isRecording && !isPaused;
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
              onPress={handleClosePress}
              style={styles.closeBtn}
              accessibilityLabel="Close recorder"
              accessibilityRole="button"
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
            <ThemedText style={[styles.timer, isRecording && styles.timerRecording, isPaused && styles.timerPaused]}>
              {time}
            </ThemedText>
            <AudioWaveform
              isRecording={isRecording && !isPaused}
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
                <Pressable onPress={copyTranscript} style={styles.copyBtn} accessibilityRole="button">
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
                ⏳  {transcribingMsg}{'\n'}
                <ThemedText style={styles.transcribingNote}>
                  Connecting to AI service. (If the server is waking up, this may take ~30s).
                </ThemedText>
              </ThemedText>
              <Pressable
                onPress={() => router.replace('/(tabs)')}
                style={styles.bgContinueBtn}
                accessibilityRole="button"
                accessibilityLabel="Return to notes feed"
              >
                <ThemedText style={styles.bgContinueBtnText}>➔ Return to Notes (transcribes in background)</ThemedText>
              </Pressable>
            </View>
          ) : transcriptState === 'failed' ? (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>⚠️ {transcriptError || 'Transcription failed.'}</ThemedText>
              {transcriptError.includes('Sign in') && (
                <Pressable
                  onPress={() => router.push('/(tabs)/profile')}
                  style={styles.signInToRetryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in to your account"
                >
                  <ThemedText style={styles.signInToRetryBtnText}>🔑  Sign In to Transcribe</ThemedText>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Controls */}
          <View style={styles.controls}>
            {/* Idle: Record button + Upload button */}
            {isIdle && (
              <View style={styles.idleControls}>
                {/* Guest Mode notice banner */}
                {!user && (
                  <View style={styles.authNoticeCard}>
                    <ThemedText style={styles.authNoticeIcon}>🔒</ThemedText>
                    <View style={styles.authNoticeContent}>
                      <ThemedText style={styles.authNoticeTitle}>Guest Mode</ThemedText>
                      <ThemedText style={styles.authNoticeSub}>
                        Sign in to enable AI cloud transcription & sync. Audio will be saved locally.
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => router.push('/(tabs)/profile')}
                      style={styles.authNoticeBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Sign in"
                    >
                      <ThemedText style={styles.authNoticeBtnText}>Sign In</ThemedText>
                    </Pressable>
                  </View>
                )}

                {/* Language selection pills */}
                <View style={styles.langSelectorWrapper}>
                  <ThemedText style={styles.langSelectorLabel}>Spoken Language</ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.langScrollContainer}
                  >
                    {LANGUAGES.map((lang) => {
                      const isSelected = selectedLanguage === lang.code;
                      return (
                        <Pressable
                          key={lang.code}
                          onPress={() => setSelectedLanguage(lang.code)}
                          style={[styles.langChip, isSelected && styles.langChipActive]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <ThemedText style={[styles.langChipText, isSelected && styles.langChipTextActive]}>
                            {lang.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Big record button */}
                <View style={styles.recordButtonWrapper}>
                  <Animated.View style={[styles.pulseRing, pulseStyle]} pointerEvents="none" />
                  <Pressable
                    onPress={start}
                    style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                    accessibilityLabel="Start recording"
                    accessibilityRole="button"
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
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.uploadBtnText}>📁  Upload Audio File</ThemedText>
                  <ThemedText style={styles.uploadBtnSub}>
                    MP3, M4A, WAV, OGG, AAC, FLAC
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Active recording controls with Pause & Resume */}
            {(isRecording || isPaused) && (
              <View style={styles.activeRecordingControls}>
                <View style={styles.recordButtonWrapper}>
                  <Animated.View style={[styles.pulseRing, pulseStyle, isPaused && { opacity: 0 }]} pointerEvents="none" />
                  <Pressable
                    onPress={stop}
                    style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
                    accessibilityLabel="Stop recording"
                    accessibilityRole="button"
                  >
                    <View style={styles.stopSquare} />
                  </Pressable>
                </View>
                <ThemedText style={styles.hint}>
                  {isPaused ? 'Paused · Tap Stop to save or Resume' : 'Tap Stop to save recording'}
                </ThemedText>

                {/* Pause / Resume button */}
                <Pressable
                  onPress={isPaused ? resume : pause}
                  style={({ pressed }) => [styles.pauseResumeBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  <ThemedText style={styles.pauseResumeBtnText}>
                    {isPaused ? '▶  Resume Recording' : '⏸  Pause Recording'}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Post-recording actions */}
            {savedUri && !isRecording && !isPaused && transcriptState !== 'idle' && (
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
  timerPaused: {
    color: '#FBBF24',
    textShadowColor: 'rgba(251,191,36,0.45)',
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
  langSelectorWrapper: {
    width: '100%',
    marginBottom: 24,
  },
  langSelectorLabel: {
    color: MUTED_TEXT,
    fontSize: DS.font.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  langScrollContainer: {
    gap: 8,
    paddingHorizontal: 4,
  },
  langChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: DS.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  langChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  langChipText: {
    color: MUTED_TEXT,
    fontSize: DS.font.xs,
    fontWeight: '600',
  },
  langChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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

  activeRecordingControls: {
    width: '100%',
    alignItems: 'center',
  },
  pauseResumeBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: DS.radius.full,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  pauseResumeBtnText: {
    color: '#FFFFFF',
    fontSize: DS.font.sm,
    fontWeight: '800',
  },

  authNoticeCard: {
    width: '100%',
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: DS.radius.md,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  authNoticeIcon: { fontSize: 22 },
  authNoticeContent: { flex: 1 },
  authNoticeTitle: { color: '#FDE68A', fontSize: DS.font.xs, fontWeight: '800' },
  authNoticeSub: { color: '#E2E8F0', fontSize: DS.font.xxs, marginTop: 2, lineHeight: 15 },
  authNoticeBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: DS.radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  authNoticeBtnText: { color: '#000000', fontSize: DS.font.xs, fontWeight: '800' },

  signInToRetryBtn: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 10,
    ...DS.shadow.primary,
  },
  signInToRetryBtnText: {
    color: '#FFFFFF',
    fontSize: DS.font.sm,
    fontWeight: '800',
  },

  bgContinueBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: DS.radius.full,
  },
  bgContinueBtnText: {
    color: '#E0DEFF',
    fontSize: DS.font.xs,
    fontWeight: '700',
  },

  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
});
