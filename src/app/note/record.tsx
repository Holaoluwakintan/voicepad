import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#918DA1';

export default function RecordScreen() {
  const router = useRouter();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const player = useAudioPlayer(savedUri);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    requestMicrophonePermission();
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  }, []);

  async function requestMicrophonePermission() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    setPermissionState(permission.granted ? 'granted' : 'denied');
  }

  async function startRecording() {
    if (permissionState !== 'granted') {
      Alert.alert('Microphone permission required', 'Allow VoicePad to use your microphone, then try again.');
      return;
    }

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  }

  async function stopRecording() {
    try {
      setIsSaving(true);
      await recorder.stop();
      setSavedUri(recorder.uri ?? null);
    } catch {
      Alert.alert('Could not save recording', 'Please try recording again.');
    } finally {
      setIsSaving(false);
    }
  }

  function togglePlayback() {
    if (!savedUri) return;
    if (playerStatus.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function cancel() {
    router.back();
  }

  const isRecording = recorderState.isRecording;
  const hasRecording = Boolean(savedUri);
  const minutes = Math.floor((recorderState.durationMillis ?? 0) / 60000);
  const seconds = Math.floor(((recorderState.durationMillis ?? 0) % 60000) / 1000);
  const duration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={cancel} accessibilityLabel="Close recorder" style={styles.closeButton}>
            <ThemedText style={styles.closeText}>×</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>New voice note</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.center}>
          <ThemedText style={styles.statusLabel}>
            {isRecording ? 'Recording' : hasRecording ? 'Recording saved' : 'Ready when you are'}
          </ThemedText>
          <ThemedText style={styles.timer}>{duration}</ThemedText>

          <View style={styles.waveform} accessibilityLabel="Audio level visualization">
            {[24, 42, 30, 62, 38, 76, 46, 30, 54, 34, 68, 42, 24].map((height, index) => (
              <View
                key={index}
                style={[
                  styles.wave,
                  { height: isRecording ? height : 12, opacity: isRecording ? 1 : 0.45 },
                ]}
              />
            ))}
          </View>

          {permissionState === 'denied' && (
            <Pressable onPress={requestMicrophonePermission} style={styles.permissionNotice}>
              <ThemedText style={styles.permissionText}>Microphone permission denied. Tap to try again.</ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.controls}>
          {hasRecording && !isRecording ? (
            <>
              <Pressable onPress={togglePlayback} style={styles.secondaryControl} accessibilityLabel="Play or pause recording">
                <ThemedText style={styles.secondaryControlText}>{playerStatus.playing ? 'Pause' : 'Play recording'}</ThemedText>
              </Pressable>
              <Pressable onPress={startRecording} style={styles.recordButton} accessibilityLabel="Record again">
                <View style={styles.recordDot} />
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isSaving}
              style={({ pressed }) => [styles.recordButton, pressed && styles.recordButtonPressed]}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <View style={styles.stopSquare} /> : <View style={styles.recordDot} />}
            </Pressable>
          )}
          <ThemedText style={styles.controlHint}>
            {isSaving ? 'Saving…' : isRecording ? 'Tap to stop' : hasRecording ? 'Listen or record again' : 'Tap to start'}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141222' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: 34, lineHeight: 36, fontWeight: '300' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  headerSpacer: { width: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { color: MUTED, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  timer: { color: '#FFFFFF', fontSize: 62, lineHeight: 74, fontWeight: '800', marginTop: 12, fontVariant: ['tabular-nums'] },
  waveform: { height: 100, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 48 },
  wave: { width: 7, borderRadius: 5, backgroundColor: ACCENT },
  permissionNotice: { marginTop: 38, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  permissionText: { color: '#F4B5C1', fontSize: 13, textAlign: 'center' },
  controls: { alignItems: 'center' },
  recordButton: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: 'rgba(109,93,251,0.35)' },
  recordButtonPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  recordDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#EF5472' },
  stopSquare: { width: 27, height: 27, borderRadius: 6, backgroundColor: '#EF5472' },
  secondaryControl: { minWidth: 150, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', marginBottom: 18 },
  secondaryControlText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  controlHint: { color: MUTED, fontSize: 13, marginTop: 16 },
});
