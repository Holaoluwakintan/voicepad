import { setAudioModeAsync } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AudioPlayerView } from '@/components/audio-player-view';
import { transcribeAudio } from '@/lib/transcription';
import { generateAISummary } from '@/lib/ai';
import { getNoteCategory, loadNotes, updateNote, removeNote, NOTE_CATEGORIES, Note, NoteCategory } from '@/lib/notes';
import { getSignedAudioUrl } from '@/lib/storage';

const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#79768A';
const BORDER = '#E8E5F0';
const DANGER = '#DC2626';
const PURPLE_LIGHT = '#F4F2FF';

export default function NoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary'>('transcript');
  const [category, setCategory] = useState<NoteCategory>('Personal');
  const [resolvedAudioSource, setResolvedAudioSource] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    loadNote();
  }, [id]);

  async function loadNote() {
    const notes = await loadNotes();
    const found = notes.find((item) => item.id === id) ?? null;
    setNote(found);
    setTitle(found?.title ?? '');
    setContent(found?.content ?? '');
    setCategory(found ? getNoteCategory(found) : 'Personal');

    // Resolve audio source: local URI first, or signed URL from cloud storage
    if (found?.audioUri) {
      setResolvedAudioSource(found.audioUri);
    } else if (found?.audioPath) {
      const signedUrl = await getSignedAudioUrl(found.audioPath);
      if (signedUrl) {
        setResolvedAudioSource(signedUrl);
      }
    }
  }

  async function selectCategory(item: NoteCategory) {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setCategory(item);
  }

  async function saveChanges() {
    if (!note) return;
    try {
      setIsSaving(true);
      const updated = await updateNote(note.id, {
        title: title.trim() || 'Untitled note',
        content: content.trim(),
        category,
      });
      if (updated) setNote(updated);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      Alert.alert('Saved', 'Your note was updated.');
    } catch {
      Alert.alert('Could not save changes', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateSummary() {
    const textToSummarize = note?.transcript || content || note?.content;
    if (!note || !textToSummarize?.trim()) {
      Alert.alert('Empty note', 'A transcript or note text is needed to generate an AI summary.');
      return;
    }

    try {
      setIsSummarizing(true);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      const result = await generateAISummary(textToSummarize);
      const updated = await updateNote(note.id, { summary: result.summary });
      if (updated) setNote(updated);

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate summary';
      Alert.alert('AI Summary', message);
    } finally {
      setIsSummarizing(false);
    }
  }

  async function retryTranscription() {
    const audioTarget = note?.audioUri || resolvedAudioSource;
    if (!note || !audioTarget) {
      Alert.alert('Audio unavailable', 'Cannot find audio file for transcription.');
      return;
    }
    try {
      setIsRetrying(true);
      const result = await transcribeAudio(audioTarget, { noteId: note.id });
      await updateNote(note.id, {
        content: result.text,
        transcript: result.text,
        transcriptionStatus: 'ready',
        transcriptionError: undefined,
      });
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      await loadNote();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      setNote((current) => (current ? { ...current, transcriptionStatus: 'failed', transcriptionError: message } : current));
      Alert.alert('Transcription failed', message);
    } finally {
      setIsRetrying(false);
    }
  }

  async function shareNote() {
    if (!note) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const textToShare = activeTab === 'summary' && note.summary
      ? `${note.title} (AI Summary)\n\n${note.summary}`
      : `${note.title}\n\n${note.content}\n\nCategory: ${getNoteCategory(note)}`;

    await Share.share({
      title: note.title,
      message: textToShare,
    });
  }

  async function togglePin() {
    if (!note) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const updated = await updateNote(note.id, { pinned: !note.pinned });
    if (updated) setNote(updated);
  }

  function confirmDelete() {
    if (!note) return;
    Alert.alert(
      'Delete note?',
      `“${note.title}” will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch {}
            await removeNote(note.id);
            router.back();
          },
        },
      ]
    );
  }

  if (!note) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.muted}>Note not found.</ThemedText>
      </ThemedView>
    );
  }

  const isPending = note.transcriptionStatus === 'pending';
  const isFailed = note.transcriptionStatus === 'failed';
  const audioSource = note.audioUri || resolvedAudioSource;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
            <ThemedText style={styles.backText}>‹</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Note detail</ThemedText>
          <Pressable onPress={confirmDelete} accessibilityLabel="Delete note" style={styles.deleteHeaderButton}>
            <ThemedText style={styles.deleteHeaderText}>Delete</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.eyebrow}>{note.source === 'voice' ? 'VOICE NOTE' : 'TEXT NOTE'}</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.titleInput}
          placeholder="Note title"
          placeholderTextColor="#A8A4B5"
        />
        <ThemedText style={styles.date}>{new Date(note.createdAt).toLocaleString()}</ThemedText>

        <ThemedText style={styles.categoryLabel}>Category</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {NOTE_CATEGORIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => selectCategory(item)}
              style={[styles.categoryChip, category === item && styles.categoryChipSelected]}>
              <ThemedText style={[styles.categoryText, category === item && styles.categoryTextSelected]}>
                {item}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={togglePin}
          style={[styles.pinButton, note.pinned && styles.pinButtonActive]}
          accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}>
          <ThemedText style={[styles.pinText, note.pinned && styles.pinTextActive]}>
            {note.pinned ? '★ Pinned note' : '☆ Pin this note'}
          </ThemedText>
        </Pressable>

        {/* Audio Player */}
        {audioSource && <AudioPlayerView source={audioSource} />}

        {/* Transcription Banner (if pending or failed) */}
        {(isPending || isFailed) && (
          <View style={[styles.statusCard, isFailed && styles.failedCard]}>
            <ThemedText style={styles.statusTitle}>
              {isPending ? 'Transcription in progress' : 'Transcription needs attention'}
            </ThemedText>
            <ThemedText style={styles.statusText}>
              {isPending
                ? 'Your recording is saved. The transcript will appear shortly.'
                : note.transcriptionError || 'Transcription failed.'}
            </ThemedText>
            {isFailed && (
              <Pressable onPress={retryTranscription} disabled={isRetrying} style={styles.retryButton}>
                <ThemedText style={styles.retryText}>{isRetrying ? 'Retrying…' : 'Retry transcription'}</ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {/* Segmented Switcher: Transcript vs AI Summary */}
        <View style={styles.segmentContainer}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveTab('transcript');
            }}
            style={[styles.segmentTab, activeTab === 'transcript' && styles.segmentTabActive]}>
            <ThemedText style={[styles.segmentText, activeTab === 'transcript' && styles.segmentTextActive]}>
              📝 Transcript
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveTab('summary');
            }}
            style={[styles.segmentTab, activeTab === 'summary' && styles.segmentTabActive]}>
            <ThemedText style={[styles.segmentText, activeTab === 'summary' && styles.segmentTextActive]}>
              ✨ AI Summary
            </ThemedText>
          </Pressable>
        </View>

        {/* Tab Content: Transcript View */}
        {activeTab === 'transcript' && (
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            placeholder="Transcript or note content"
            placeholderTextColor="#A8A4B5"
            style={styles.contentInput}
          />
        )}

        {/* Tab Content: AI Summary View */}
        {activeTab === 'summary' && (
          <View style={styles.summaryContainer}>
            {note.summary ? (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryContent}>{note.summary}</ThemedText>
                <Pressable
                  disabled={isSummarizing}
                  onPress={handleGenerateSummary}
                  style={styles.regenerateButton}>
                  <ThemedText style={styles.regenerateText}>
                    {isSummarizing ? '✨ Regenerating…' : '🔄 Regenerate Summary'}
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptySummaryCard}>
                <ThemedText style={styles.sparkleIcon}>✨</ThemedText>
                <ThemedText style={styles.emptySummaryTitle}>Generate AI Summary & Action Items</ThemedText>
                <ThemedText style={styles.emptySummarySubtitle}>
                  Turn your transcript into an executive summary, key takeaways, and action items with Groq Llama 3.3.
                </ThemedText>
                <Pressable
                  disabled={isSummarizing}
                  onPress={handleGenerateSummary}
                  style={styles.generateButton}>
                  <ThemedText style={styles.generateButtonText}>
                    {isSummarizing ? '✨ Analyzing transcript…' : '✨ Generate AI Summary'}
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable onPress={shareNote} style={styles.shareButton}>
            <ThemedText style={styles.shareText}>Share note</ThemedText>
          </Pressable>
          <Pressable
            onPress={saveChanges}
            disabled={isSaving}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <ThemedText style={styles.saveText}>{isSaving ? 'Saving…' : 'Save changes'}</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEFF' },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFEFF' },
  muted: { color: MUTED },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: INK, fontSize: 40, fontWeight: '300', lineHeight: 44 },
  headerTitle: { color: INK, fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  deleteHeaderButton: { paddingHorizontal: 12, paddingVertical: 8 },
  deleteHeaderText: { color: DANGER, fontSize: 14, fontWeight: '700' },
  eyebrow: { color: ACCENT, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  titleInput: { color: INK, fontSize: 28, lineHeight: 36, fontWeight: '800', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 10 },
  date: { color: MUTED, fontSize: 13, marginTop: 10 },
  categoryLabel: { color: INK, fontSize: 14, fontWeight: '800', marginTop: 24 },
  categoryRow: { gap: 8, paddingVertical: 10 },
  categoryChip: { borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#FFFFFF' },
  categoryChipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  categoryText: { color: MUTED, fontSize: 13 },
  categoryTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  pinButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8, backgroundColor: '#FFFFFF' },
  pinButtonActive: { backgroundColor: '#FFF4CE', borderColor: '#F0C75E' },
  pinText: { color: MUTED, fontSize: 13, fontWeight: '800' },
  pinTextActive: { color: '#A86A00' },
  statusCard: { backgroundColor: '#F5F3FA', borderRadius: 20, padding: 18, marginTop: 24 },
  failedCard: { backgroundColor: '#FFF2F4' },
  statusTitle: { color: INK, fontSize: 16, fontWeight: '800' },
  statusText: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 6 },
  retryButton: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0B8C1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: '#C63E57', fontWeight: '800', fontSize: 13 },
  segmentContainer: { flexDirection: 'row', backgroundColor: '#EFF2F8', borderRadius: 16, padding: 4, marginTop: 26 },
  segmentTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  segmentTabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  segmentText: { color: MUTED, fontSize: 14, fontWeight: '700' },
  segmentTextActive: { color: INK, fontWeight: '800' },
  contentInput: { minHeight: 240, color: INK, fontSize: 16, lineHeight: 26, marginTop: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 18 },
  summaryContainer: { marginTop: 16 },
  summaryCard: { backgroundColor: PURPLE_LIGHT, borderRadius: 20, borderWidth: 1, borderColor: '#DDD7FA', padding: 20 },
  summaryContent: { color: INK, fontSize: 15, lineHeight: 25 },
  regenerateButton: { alignSelf: 'flex-start', marginTop: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD7FA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  regenerateText: { color: ACCENT, fontSize: 13, fontWeight: '800' },
  emptySummaryCard: { backgroundColor: '#F9FAFC', borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 28, alignItems: 'center' },
  sparkleIcon: { fontSize: 36, marginBottom: 10 },
  emptySummaryTitle: { color: INK, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptySummarySubtitle: { color: MUTED, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 6, maxWidth: 400 },
  generateButton: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14, marginTop: 20 },
  generateButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  shareButton: { flex: 1, backgroundColor: '#4C6074', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  shareText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  saveButton: { flex: 1, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
