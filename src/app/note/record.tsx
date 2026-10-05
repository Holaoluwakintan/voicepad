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
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AlertCircle, ArrowLeft, FileAudio, LockKeyhole, Mic, RotateCcw, Square, Upload } from 'lucide-react-native';
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
import { DS, displayType } from '@/constants/design';
import { AuroraBackdrop } from '@/components/premium-ui';
import { generateNoteId, isSupportedAudio, SUPPORTED_AUDIO_EXTENSIONS, toFriendlyErrorMessage } from '@/lib/utils';

type TranscriptState = 'idle' | 'saving' | 'transcribing' | 'uploading' | 'ready' | 'failed';

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
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
      // Idle: a slow, gentle "breathing" halo invites the first tap.
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.16, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withTiming(0.22, { duration: 400 });
    }
  }, [isRecording, pulseOpacity, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Android hardware back: without this, pressing back mid-recording unmounts the
  // screen and silently throws the recording away.
  useEffect(() => {
    if (!isRecording && !isPaused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClosePress();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isPaused]);

  useEffect(() => {
    // Pre-warm the cloud transcription server while the user prepares to record
    wakeUpTranscriptionServer();
    (async () => {
      const result = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(result.granted ? 'granted' : 'denied');
      // allowsBackgroundRecording keeps long recordings (lectures, sermons) running
      // when the screen locks; it needs the expo-audio plugin's enableBackgroundRecording.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
    })();
  }, []);

  // ─── Live recording ────────────────────────────────────────────────────────

  async function start() {
    if (permission !== 'granted') {
      // Ask again instead of dead-ending: the first prompt may have been dismissed.
      const retry = await AudioModule.requestRecordingPermissionsAsync().catch(() => null);
      if (!retry?.granted) {
        Alert.alert(
          'Microphone permission required',
          'Allow microphone access in Settings and try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
          ]
        );
        return;
      }
      setPermission('granted');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true }).catch(() => {});
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

      const noteId = generateNoteId('voice');
      // The picker's copy lives in the cache directory, which Android may purge;
      // keep the audio with the app's documents so playback and retries keep working.
      let uri = asset.uri;
      try {
        if (FileSystem.documentDirectory) {
          const ext = (asset.name ?? '').includes('.') ? asset.name!.slice(asset.name!.lastIndexOf('.')) : '.m4a';
          const dest = `${FileSystem.documentDirectory}${noteId}${ext}`;
          await FileSystem.copyAsync({ from: asset.uri, to: dest });
          uri = dest;
        }
      } catch (copyErr) {
        console.warn('Could not copy picked audio to documents, using cache copy:', copyErr);
      }
      setSavedUri(uri);
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

      transcribeSavedNote(uri, noteId, fileName, asset.mimeType ?? undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open file picker.';
      Alert.alert('File picker error', msg);
      setTranscriptState('idle');
    }
  }

  // ─── Shared transcription ─────────────────────────────────────────────────

  async function transcribeSavedNote(uri: string, noteId: string, filename?: string, mimeType?: string) {
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
      const result = await transcribeAudio(uri, { noteId, filename, mimeType, language: selectedLanguage === 'auto' ? undefined : selectedLanguage });
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
      const isGuestLimit = error instanceof Error && error.message === 'GUEST_LIMIT_REACHED';
      const message = isGuestLimit
        ? 'Your free guest transcriptions are used up for today. Sign in to continue using AI transcription.'
        : isAuthError
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
      <AuroraBackdrop variant={isRecording && !isPaused ? 'coral' : 'violet'} intensity={isRecording && !isPaused ? 1 : 0.75} />
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
              <ArrowLeft size={21} color={DARK_TEXT} strokeWidth={2.4} />
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
                <View style={styles.inlineLabel}><FileAudio size={16} color={DARK_TEXT} strokeWidth={2.2} /><ThemedText style={styles.transcriptLabel}>Transcript</ThemedText></View>
                <Pressable onPress={copyTranscript} style={styles.copyBtn} accessibilityRole="button">
                  <ThemedText style={styles.copyBtnText}>
                    {copied ? 'Copied' : 'Copy'}
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText style={styles.transcriptText} selectable>
                {transcriptText}
              </ThemedText>
            </View>
          ) : transcriptState === 'transcribing' ? (
            <View style={styles.transcribingBox}>
              <View style={styles.progressIcon}><RotateCcw size={19} color={DS.colors.accent} strokeWidth={2.2} /></View><ThemedText style={styles.transcribingText}>
                {transcribingMsg}{'\n'}
                <ThemedText style={styles.transcribingNote}>
                  This usually takes a few seconds. Longer recordings take a little more.
                </ThemedText>
              </ThemedText>
              <Pressable
                onPress={() => router.replace('/(tabs)')}
                style={styles.bgContinueBtn}
                accessibilityRole="button"
                accessibilityLabel="Return to notes feed"
              >
                <ArrowLeft size={15} color={DARK_TEXT} strokeWidth={2.2} /><ThemedText style={styles.bgContinueBtnText}>Return to Notes</ThemedText>
              </Pressable>
            </View>
          ) : transcriptState === 'failed' ? (
            <View style={styles.errorBox}>
              <View style={styles.inlineLabel}><AlertCircle size={17} color={DS.colors.danger} strokeWidth={2.2} /><ThemedText style={styles.errorText}>{transcriptError || 'Transcription failed.'}</ThemedText></View>
              {(transcriptError.includes('Sign in') || transcriptError.includes('sign in')) && (
                <Pressable
                  onPress={() => router.push('/(tabs)/profile')}
                  style={styles.signInToRetryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in to your account"
                >
                  <ThemedText style={styles.signInToRetryBtnText}>Sign in to transcribe</ThemedText>
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
                    <LockKeyhole size={19} color={DS.colors.accent} strokeWidth={2.2} />
                    <View style={styles.authNoticeContent}>
                      <ThemedText style={styles.authNoticeTitle}>Guest Mode</ThemedText>
                      <ThemedText style={styles.authNoticeSub}>
                        Sign in for unlimited transcription and cloud sync. Guests get a few free notes a day.
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
                    <Mic size={34} color={DARK_TEXT} strokeWidth={2.2} />
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
                  <View style={styles.uploadTitle}><Upload size={17} color={DARK_TEXT} strokeWidth={2.2} /><ThemedText style={styles.uploadBtnText}>Upload audio file</ThemedText></View>
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
                    <Square size={26} color={DARK_TEXT} fill={DARK_TEXT} strokeWidth={2} />
                  </Pressable>
                </View>
                <ThemedText style={styles.hint}>
                  {isPaused ? 'Paused · resume when ready' : 'Tap stop when you are done'}
                </ThemedText>

                {/* Pause / Resume button */}
                <Pressable
                  onPress={isPaused ? resume : pause}
                  style={({ pressed }) => [styles.pauseResumeBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  <ThemedText style={styles.pauseResumeBtnText}>
                    {isPaused ? 'Resume recording' : 'Pause recording'}
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
                      <ThemedText style={styles.openNoteBtnText}>Open full note</ThemedText>
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

const DARK_BG = DS.colors.night;
const DARK_TEXT = '#FFFFFF';
const MUTED_TEXT = 'rgba(244,243,239,0.62)';
const GLASS = 'rgba(255,255,255,0.07)';
const GLASS_BORDER = 'rgba(255,255,255,0.10)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 48, flexGrow: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  closeBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: GLASS,
    borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: MUTED_TEXT, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6 },
  spacer: { width: 42 },

  center: { alignItems: 'center', paddingTop: 26, paddingBottom: 8 },
  status: { color: '#EDEBFF', ...displayType(26, true), textAlign: 'center' },
  timer: {
    color: DARK_TEXT,
    fontSize: 64,
    lineHeight: 74,
    fontWeight: '200',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
    marginTop: 6,
    marginBottom: 18,
  },
  timerRecording: { color: '#FFFFFF' },
  timerPaused: { color: MUTED_TEXT },

  previewBox: {
    marginTop: 14, borderRadius: 22, padding: 12,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
  },

  transcriptBox: {
    marginTop: 14, borderRadius: 22, padding: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  inlineLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  transcriptLabel: { color: DS.colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  copyBtn: { backgroundColor: DS.colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  copyBtnText: { color: DS.colors.white, fontSize: 12, fontWeight: '700' },
  transcriptText: { color: DS.colors.ink, fontSize: 16, lineHeight: 25 },

  transcribingBox: {
    marginTop: 14, borderRadius: 22, padding: 18, alignItems: 'center',
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
  },
  progressIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(139,128,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  transcribingText: { color: DARK_TEXT, fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 23 },
  transcribingNote: { color: MUTED_TEXT, fontSize: 13, fontWeight: '500' },
  bgContinueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999,
  },
  bgContinueBtnText: { color: DARK_TEXT, fontSize: 13, fontWeight: '700' },

  errorBox: {
    marginTop: 14, borderRadius: 20, padding: 16,
    backgroundColor: 'rgba(224,71,95,0.14)', borderWidth: 1, borderColor: 'rgba(224,71,95,0.35)',
  },
  errorText: { color: '#FFC2CB', fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  signInToRetryBtn: {
    marginTop: 12, backgroundColor: DS.colors.white, borderRadius: 14, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  signInToRetryBtnText: { color: DS.colors.ink, fontSize: 14, fontWeight: '800' },

  controls: { marginTop: 10 },
  idleControls: { alignItems: 'center' },
  activeRecordingControls: { alignItems: 'center', paddingTop: 6 },

  authNoticeCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 14, marginBottom: 18,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
  },
  authNoticeContent: { flex: 1 },
  authNoticeTitle: { color: DARK_TEXT, fontSize: 14, fontWeight: '700' },
  authNoticeSub: { color: MUTED_TEXT, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  authNoticeBtn: { backgroundColor: DS.colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  authNoticeBtnText: { color: DS.colors.ink, fontSize: 12.5, fontWeight: '800' },

  langSelectorWrapper: { width: '100%', marginBottom: 26 },
  langSelectorLabel: { color: MUTED_TEXT, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' },
  langScrollContainer: { gap: 8, paddingHorizontal: 2 },
  langChip: {
    paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center',
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
  },
  langChipActive: { backgroundColor: DS.colors.white, borderColor: DS.colors.white },
  langChipText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' },
  langChipTextActive: { color: DS.colors.ink, fontWeight: '700' },

  recordButtonWrapper: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute', width: 132, height: 132, borderRadius: 66,
    backgroundColor: DS.colors.orange,
  },
  recordButton: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: DS.colors.orange,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.18)',
    ...DS.shadow.record,
  },
  hint: { color: MUTED_TEXT, fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' },

  dividerRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: GLASS_BORDER },
  dividerText: { color: MUTED_TEXT, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  uploadBtn: {
    width: '100%', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18, alignItems: 'center',
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, borderStyle: 'dashed',
  },
  uploadTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadBtnText: { color: DARK_TEXT, fontSize: 15, fontWeight: '700' },
  uploadBtnSub: { color: MUTED_TEXT, fontSize: 12, marginTop: 4, letterSpacing: 0.4 },

  pauseResumeBtn: {
    marginTop: 18, height: 48, paddingHorizontal: 26, borderRadius: 999, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: GLASS_BORDER,
  },
  pauseResumeBtnText: { color: DARK_TEXT, fontSize: 15, fontWeight: '700' },

  postActions: { marginTop: 18, gap: 10 },
  openNoteBtn: {
    height: 54, borderRadius: 18, backgroundColor: DS.colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  openNoteBtnText: { color: DS.colors.ink, fontSize: 16, fontWeight: '800' },
  discardBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
  discardBtnText: { color: MUTED_TEXT, fontSize: 14, fontWeight: '600' },

  pressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
});
