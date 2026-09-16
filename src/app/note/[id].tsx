/**
 * Note Detail Screen — View, edit, summarize and play voice notes.
 * Fixed: Wrapped in SafeAreaView (fixes notch/island overlap).
 * Premium: Uses centralized DS design tokens, glass cards, and smooth interactions.
 */
import { setAudioModeAsync } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AudioPlayerView } from '@/components/audio-player-view';
import { transcribeAudio } from '@/lib/transcription';
import { generateAISummary } from '@/lib/ai';
import {
  getNoteCategory,
  loadNotes,
  updateNote,
  removeNote,
  NOTE_CATEGORIES,
  Note,
  NoteCategory,
} from '@/lib/notes';
import { getSignedAudioUrl } from '@/lib/storage';
import { DS } from '@/constants/design';
import { formatNoteDate, toFriendlyErrorMessage } from '@/lib/utils';

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

  const loadNote = useCallback(async () => {
    if (!id) return;
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
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNote();
  }, [loadNote]);

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
      const message = toFriendlyErrorMessage(error, 'Could not generate summary. Please retry.');
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
      const message = toFriendlyErrorMessage(error, 'Transcription failed. Please retry.');
      setNote((current) =>
        current
          ? { ...current, transcriptionStatus: 'failed', transcriptionError: message }
          : current
      );
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

    const textToShare =
      activeTab === 'summary' && note.summary
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
    Alert.alert('Delete note?', `“${note.title}” will be removed.`, [
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
    ]);
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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <ThemedText style={styles.backText}>‹</ThemedText>
            </Pressable>
            <ThemedText style={styles.headerTitle}>Note detail</ThemedText>
            <Pressable
              onPress={confirmDelete}
              accessibilityLabel="Delete note"
              style={styles.deleteHeaderButton}
            >
              <ThemedText style={styles.deleteHeaderText}>Delete</ThemedText>
            </Pressable>
          </View>

          {/* Eyebrow & Title */}
          <View style={styles.metaRow}>
            <ThemedText style={styles.eyebrow}>
              {note.source === 'voice' ? '🎙️ VOICE NOTE' : '📝 TEXT NOTE'}
            </ThemedText>
            <Pressable
              onPress={togglePin}
              style={[styles.pinButton, note.pinned && styles.pinButtonActive]}
              accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}
            >
              <ThemedText style={[styles.pinText, note.pinned && styles.pinTextActive]}>
                {note.pinned ? '★ Pinned' : '☆ Pin'}
              </ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholder="Note title"
            placeholderTextColor={DS.colors.subtle}
          />
          <ThemedText style={styles.date}>{formatNoteDate(note.createdAt)}</ThemedText>

          {/* Category Selector */}
          <ThemedText style={styles.categoryLabel}>Category</ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {NOTE_CATEGORIES.map((item) => {
              const itemData = DS.category[item];
              const isSelected = category === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => selectCategory(item)}
                  style={[
                    styles.categoryChip,
                    isSelected && {
                      backgroundColor: itemData.accent,
                      borderColor: itemData.accent,
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.categoryText,
                      isSelected && styles.categoryTextSelected,
                    ]}
                  >
                    {itemData ? `${itemData.icon} ` : ''}
                    {item}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Audio Player */}
          {audioSource && <AudioPlayerView source={audioSource} />}

          {/* Transcription Banner (if pending or failed) */}
          {(isPending || isFailed) && (
            <View style={[styles.statusCard, isFailed && styles.failedCard]}>
              <ThemedText style={styles.statusTitle}>
                {isPending ? '⏳ Transcription in progress' : '⚠️ Transcription needs attention'}
              </ThemedText>
              <ThemedText style={styles.statusText}>
                {isPending
                  ? 'Your recording is saved. The transcript will appear shortly.'
                  : note.transcriptionError || 'Transcription failed.'}
              </ThemedText>
              {isFailed && (
                <Pressable
                  onPress={retryTranscription}
                  disabled={isRetrying}
                  style={styles.retryButton}
                >
                  <ThemedText style={styles.retryText}>
                    {isRetrying ? 'Retrying…' : '🔄 Retry transcription'}
                  </ThemedText>
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
              style={[styles.segmentTab, activeTab === 'transcript' && styles.segmentTabActive]}
            >
              <ThemedText
                style={[styles.segmentText, activeTab === 'transcript' && styles.segmentTextActive]}
              >
                📝 Transcript
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setActiveTab('summary');
              }}
              style={[styles.segmentTab, activeTab === 'summary' && styles.segmentTabActive]}
            >
              <ThemedText
                style={[styles.segmentText, activeTab === 'summary' && styles.segmentTextActive]}
              >
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
              placeholder="Transcript or note content…"
              placeholderTextColor={DS.colors.subtle}
              style={styles.contentInput}
            />
          )}

          {/* Tab Content: AI Summary View */}
          {activeTab === 'summary' && (
            <View style={styles.summaryContainer}>
              {note.summary ? (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <ThemedText style={styles.summaryBadge}>✨ AI Summary & Action Items</ThemedText>
                  </View>
                  <ThemedText style={styles.summaryContent}>{note.summary}</ThemedText>
                  <Pressable
                    disabled={isSummarizing}
                    onPress={handleGenerateSummary}
                    style={styles.regenerateButton}
                  >
                    <ThemedText style={styles.regenerateText}>
                      {isSummarizing ? '✨ Regenerating…' : '🔄 Regenerate Summary'}
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptySummaryCard}>
                  <ThemedText style={styles.sparkleIcon}>✨</ThemedText>
                  <ThemedText style={styles.emptySummaryTitle}>
                    Generate AI Summary & Action Items
                  </ThemedText>
                  <ThemedText style={styles.emptySummarySubtitle}>
                    Turn your transcript into an executive summary, key takeaways, and action items with Groq Llama 3.3.
                  </ThemedText>
                  <Pressable
                    disabled={isSummarizing}
                    onPress={handleGenerateSummary}
                    style={styles.generateButton}
                  >
                    <ThemedText style={styles.generateButtonText}>
                      {isSummarizing ? '✨ Analyzing transcript…' : '✨ Generate AI Summary'}
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable onPress={shareNote} style={styles.shareButton}>
              <ThemedText style={styles.shareText}>↗ Share</ThemedText>
            </Pressable>
            <Pressable
              onPress={saveChanges}
              disabled={isSaving}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            >
              <ThemedText style={styles.saveText}>
                {isSaving ? 'Saving…' : '💾 Save changes'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 50,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.colors.canvas },
  muted: { color: DS.colors.muted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: DS.colors.ink, fontSize: 38, fontWeight: '300', lineHeight: 40 },
  headerTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  deleteHeaderButton: { paddingHorizontal: 12, paddingVertical: 8 },
  deleteHeaderText: { color: DS.colors.danger, fontSize: DS.font.sm, fontWeight: '700' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eyebrow: {
    color: DS.colors.primary,
    fontSize: DS.font.caption,
    fontWeight: '800',
    letterSpacing: 2,
  },
  titleInput: {
    color: DS.colors.ink,
    fontSize: DS.font.display,
    lineHeight: 36,
    fontWeight: '800',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DS.colors.border,
    marginTop: 4,
  },
  date: { color: DS.colors.muted, fontSize: DS.font.xs, marginTop: 8 },
  categoryLabel: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    fontWeight: '800',
    marginTop: 20,
  },
  categoryRow: { gap: 8, paddingVertical: 10 },
  categoryChip: {
    borderWidth: 1,
    borderColor: DS.colors.border,
    borderRadius: DS.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: DS.colors.surface,
  },
  categoryText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  pinButton: {
    borderWidth: 1,
    borderColor: DS.colors.border,
    borderRadius: DS.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: DS.colors.surface,
  },
  pinButtonActive: { backgroundColor: '#FFF4CE', borderColor: '#F0C75E' },
  pinText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '800' },
  pinTextActive: { color: '#A86A00' },
  statusCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: DS.colors.border,
    ...DS.shadow.card,
  },
  failedCard: {
    backgroundColor: DS.colors.dangerLight,
    borderColor: '#FCA5A5',
  },
  statusTitle: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '800' },
  statusText: { color: DS.colors.muted, fontSize: DS.font.sm, lineHeight: 21, marginTop: 6 },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: DS.colors.surface,
    borderWidth: 1,
    borderColor: '#F0B8C1',
    borderRadius: DS.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: { color: DS.colors.danger, fontWeight: '800', fontSize: DS.font.xs },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 4,
    marginTop: 22,
  },
  segmentTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: DS.radius.sm },
  segmentTabActive: {
    backgroundColor: DS.colors.surface,
    ...DS.shadow.card,
  },
  segmentText: { color: DS.colors.muted, fontSize: DS.font.sm, fontWeight: '700' },
  segmentTextActive: { color: DS.colors.ink, fontWeight: '800' },
  contentInput: {
    minHeight: 220,
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    lineHeight: 26,
    marginTop: 14,
    borderWidth: 1,
    borderColor: DS.colors.border,
    borderRadius: DS.radius.lg,
    padding: 18,
    backgroundColor: DS.colors.surface,
    ...DS.shadow.card,
  },
  summaryContainer: { marginTop: 14 },
  summaryCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 20,
    ...DS.shadow.card,
  },
  summaryHeader: { marginBottom: 12 },
  summaryBadge: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '800' },
  summaryContent: { color: DS.colors.ink, fontSize: DS.font.bodyMd, lineHeight: 25 },
  regenerateButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    backgroundColor: DS.colors.primaryLight,
    borderRadius: DS.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  regenerateText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '800' },
  emptySummaryCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 28,
    alignItems: 'center',
    ...DS.shadow.card,
  },
  sparkleIcon: { fontSize: 36, marginBottom: 10 },
  emptySummaryTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.h3,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySummarySubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 400,
  },
  generateButton: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingHorizontal: 22,
    paddingVertical: 14,
    marginTop: 20,
    ...DS.shadow.primary,
  },
  generateButtonText: { color: '#FFFFFF', fontSize: DS.font.bodyMd, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  shareButton: {
    flex: 1,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DS.colors.border,
  },
  shareText: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '700' },
  saveButton: {
    flex: 2,
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...DS.shadow.primary,
  },
  saveText: { color: '#FFFFFF', fontSize: DS.font.bodyMd, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
