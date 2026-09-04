import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { transcribeAudio } from '@/lib/transcription';

const STORAGE_KEY = '@voicepad/notes';
const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#79768A';
const BORDER = '#E8E5F0';

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  audioUri?: string;
  source?: 'voice' | 'text';
  transcript?: string;
  transcriptionStatus?: 'pending' | 'ready' | 'failed';
  transcriptionError?: string;
};

export default function NoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const player = useAudioPlayer(note?.audioUri ?? null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    loadNote();
  }, [id]);

  async function loadNote() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    const notes: Note[] = saved ? JSON.parse(saved) : [];
    const found = notes.find((item) => item.id === id) ?? null;
    setNote(found);
    setTitle(found?.title ?? '');
    setContent(found?.content ?? '');
  }

  async function saveChanges() {
    if (!note) return;
    try {
      setIsSaving(true);
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const notes: Note[] = saved ? JSON.parse(saved) : [];
      const updated = notes.map((item) =>
        item.id === note.id ? { ...item, title: title.trim() || 'Untitled note', content: content.trim() } : item,
      );
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setNote((current) => current ? { ...current, title: title.trim() || 'Untitled note', content: content.trim() } : current);
      Alert.alert('Saved', 'Your note was updated.');
    } catch {
      Alert.alert('Could not save changes', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function retryTranscription() {
    if (!note?.audioUri) return;
    try {
      setIsRetrying(true);
      const result = await transcribeAudio(note.audioUri, { noteId: note.id });
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const notes: Note[] = saved ? JSON.parse(saved) : [];
      const updated = notes.map((item) => item.id === note.id
        ? {
            ...item,
            title: result.text.split(/[.!?\n]/)[0]?.trim().slice(0, 64) || item.title,
            content: result.text,
            transcript: result.text,
            transcriptionStatus: 'ready' as const,
            transcriptionError: undefined,
          }
        : item,
      );
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      await loadNote();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      setNote((current) => current ? { ...current, transcriptionStatus: 'failed', transcriptionError: message } : current);
      Alert.alert('Transcription failed', message);
    } finally {
      setIsRetrying(false);
    }
  }

  if (!note) {
    return <ThemedView style={styles.center}><ThemedText style={styles.muted}>Note not found.</ThemedText></ThemedView>;
  }

  const isPending = note.transcriptionStatus === 'pending';
  const isFailed = note.transcriptionStatus === 'failed';

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
            <ThemedText style={styles.backText}>‹</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Note detail</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ThemedText style={styles.eyebrow}>{note.source === 'voice' ? 'VOICE NOTE' : 'TEXT NOTE'}</ThemedText>
        <TextInput value={title} onChangeText={setTitle} style={styles.titleInput} placeholder="Note title" placeholderTextColor="#A8A4B5" />
        <ThemedText style={styles.date}>{new Date(note.createdAt).toLocaleString()}</ThemedText>

        {note.audioUri && (
          <Pressable onPress={() => playerStatus.playing ? player.pause() : player.play()} style={styles.playButton}>
            <ThemedText style={styles.playButtonText}>{playerStatus.playing ? 'Pause recording' : 'Play recording'}</ThemedText>
          </Pressable>
        )}

        <View style={[styles.statusCard, isFailed && styles.failedCard]}>
          <ThemedText style={styles.statusTitle}>{isPending ? 'Transcription in progress' : isFailed ? 'Transcription needs attention' : 'English transcript'}</ThemedText>
          <ThemedText style={styles.statusText}>
            {isPending ? 'Your recording is saved. The English transcript will appear here.' : isFailed ? note.transcriptionError || 'The recording is saved, but transcription failed.' : 'Edit the transcript below if you want to refine it.'}
          </ThemedText>
          {isFailed && <Pressable onPress={retryTranscription} disabled={isRetrying} style={styles.retryButton}><ThemedText style={styles.retryText}>{isRetrying ? 'Retrying…' : 'Retry transcription'}</ThemedText></Pressable>}
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          placeholder="Transcript or note content"
          placeholderTextColor="#A8A4B5"
          style={styles.contentInput}
        />

        <Pressable onPress={saveChanges} disabled={isSaving} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
          <ThemedText style={styles.saveText}>{isSaving ? 'Saving…' : 'Save changes'}</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEFF' },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFEFF' },
  muted: { color: MUTED },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 42 },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: INK, fontSize: 40, fontWeight: '300', lineHeight: 44 },
  headerTitle: { color: INK, fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  headerSpacer: { width: 44 },
  eyebrow: { color: ACCENT, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  titleInput: { color: INK, fontSize: 30, lineHeight: 38, fontWeight: '800', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 10 },
  date: { color: MUTED, fontSize: 13, marginTop: 10 },
  playButton: { alignSelf: 'flex-start', marginTop: 24, backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  playButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  statusCard: { backgroundColor: '#F5F3FA', borderRadius: 20, padding: 18, marginTop: 28 },
  failedCard: { backgroundColor: '#FFF2F4' },
  statusTitle: { color: INK, fontSize: 16, fontWeight: '800' },
  statusText: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 6 },
  retryButton: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0B8C1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: '#C63E57', fontWeight: '800', fontSize: 13 },
  contentInput: { minHeight: 260, color: INK, fontSize: 17, lineHeight: 27, marginTop: 22, borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 18 },
  saveButton: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
