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
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

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
import { deleteAudioFromCloud, getSignedAudioUrl } from '@/lib/storage';
import { DS, displayType } from '@/constants/design';
import { ChevronLeft, ClipboardCopy, FileText, Share2, Sparkles } from 'lucide-react-native';
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<'markdown' | 'transcript' | 'summary' | null>(null);

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

  function getMarkdownContent() {
    if (!note) return '';
    const noteTitle = title.trim() || note.title || 'Voice Note';
    const noteCat = category || getNoteCategory(note);
    const parts = [`# ${noteTitle}`];
    parts.push(`*Category: ${noteCat} • Date: ${formatNoteDate(note.createdAt)}*`);

    if (note.summary) {
      parts.push(`## ✨ AI Summary & Key Takeaways\n\n${note.summary.trim()}`);
    }

    const mainBody = (content || note.content || '').trim();
    if (mainBody) {
      parts.push(`## 🎙️ Transcript / Content\n\n${mainBody}`);
    }

    return parts.join('\n\n');
  }

  async function handleCopyMarkdown() {
    const md = getMarkdownContent();
    await Clipboard.setStringAsync(md);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setCopiedFormat('markdown');
    setTimeout(() => setCopiedFormat(null), 2500);
  }

  async function handleCopyTranscript() {
    const text = (content || note?.content || '').trim();
    await Clipboard.setStringAsync(text);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setCopiedFormat('transcript');
    setTimeout(() => setCopiedFormat(null), 2500);
  }

  async function handleCopySummary() {
    if (!note?.summary) return;
    await Clipboard.setStringAsync(note.summary.trim());
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setCopiedFormat('summary');
    setTimeout(() => setCopiedFormat(null), 2500);
  }

  async function handleShareNative() {
    if (!note) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const textToShare = getMarkdownContent();
    await Share.share({
      title: title.trim() || note.title,
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
          if (note.audioPath) await deleteAudioFromCloud(note.audioPath);
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
              <ChevronLeft size={22} color={DS.colors.ink} strokeWidth={2.4} />
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
              {note.source === 'voice' ? 'Voice note' : 'Text note'}
            </ThemedText>
            <Pressable
              onPress={togglePin}
              style={[styles.pinButton, note.pinned && styles.pinButtonActive]}
              accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}
            >
              <ThemedText style={[styles.pinText, note.pinned && styles.pinTextActive]}>
                {note.pinned ? 'Pinned' : 'Pin'}
              </ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            multiline
            scrollEnabled={false}
            blurOnSubmit
            accessibilityLabel="Note title"
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
                {isPending ? 'Transcription in progress' : 'Transcription needs attention'}
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
                    {isRetrying ? 'Retrying…' : 'Retry transcription'}
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
                Transcript
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
                AI Summary
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
              accessibilityLabel="Transcript or note content"
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
                    <ThemedText style={styles.summaryBadge}>AI summary & action items</ThemedText>
                  </View>
                  <ThemedText style={styles.summaryContent}>{note.summary}</ThemedText>
                  <Pressable
                    disabled={isSummarizing}
                    onPress={handleGenerateSummary}
                    style={styles.regenerateButton}
                  >
                    <ThemedText style={styles.regenerateText}>
                      {isSummarizing ? 'Regenerating…' : 'Regenerate summary'}
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptySummaryCard}>
                  <View style={styles.sparkleIcon}><Sparkles size={24} color={DS.colors.primary} strokeWidth={2} /></View>
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
                      {isSummarizing ? 'Analyzing transcript…' : 'Generate AI summary'}
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setIsExportOpen(true);
              }}
              style={styles.shareButton}
              accessibilityRole="button"
              accessibilityLabel="Export or share note"
            >
              <ThemedText style={styles.shareText}>Export & share</ThemedText>
            </Pressable>
            <Pressable
              onPress={saveChanges}
              disabled={isSaving}
              style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Save note changes"
            >
              <ThemedText style={styles.saveText}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Export / Share Modal */}
      <Modal
        visible={isExportOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsExportOpen(false)}
      >
        <Pressable
          style={styles.exportModalBackdrop}
          onPress={() => setIsExportOpen(false)}
        >
          <Pressable style={styles.exportSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.exportSheetHandle} />
            <View style={styles.exportSheetHeader}>
              <View>
                <ThemedText style={styles.exportSheetTitle}>Export & Share</ThemedText>
                <ThemedText style={styles.exportSheetSubtitle}>
                  Save or send your note and AI summaries
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setIsExportOpen(false)}
                style={styles.exportCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close export options"
              >
                <ThemedText style={styles.exportCloseText}>×</ThemedText>
              </Pressable>
            </View>

            <View style={styles.exportList}>
              {/* Option 1: Copy as Markdown */}
              <Pressable
                onPress={handleCopyMarkdown}
                style={({ pressed }) => [styles.exportOption, pressed && styles.exportOptionPressed]}
                accessibilityRole="button"
              >
                <View style={styles.exportIconBox}>
                  <ClipboardCopy size={19} color={DS.colors.primary} strokeWidth={2.1} />
                </View>
                <View style={styles.exportOptionInfo}>
                  <ThemedText style={styles.exportOptionTitle}>
                    {copiedFormat === 'markdown' ? 'Copied ✓' : 'Copy formatted Markdown'}
                  </ThemedText>
                  <ThemedText style={styles.exportOptionDesc}>
                    Obsidian, Notion, Bear, GitHub & notes apps
                  </ThemedText>
                </View>
              </Pressable>

              {/* Option 2: Share via Apps */}
              <Pressable
                onPress={handleShareNative}
                style={({ pressed }) => [styles.exportOption, pressed && styles.exportOptionPressed]}
                accessibilityRole="button"
              >
                <View style={[styles.exportIconBox, { backgroundColor: DS.colors.accentLight }]}>
                  <Share2 size={19} color={DS.colors.primary} strokeWidth={2.1} />
                </View>
                <View style={styles.exportOptionInfo}>
                  <ThemedText style={styles.exportOptionTitle}>Share via apps</ThemedText>
                  <ThemedText style={styles.exportOptionDesc}>
                    WhatsApp, Email, Messages, Slack, AirDrop
                  </ThemedText>
                </View>
              </Pressable>

              {/* Option 3: Plain text copy */}
              <Pressable
                onPress={handleCopyTranscript}
                style={({ pressed }) => [styles.exportOption, pressed && styles.exportOptionPressed]}
                accessibilityRole="button"
              >
                <View style={[styles.exportIconBox, { backgroundColor: '#F1F5F9' }]}>
                  <FileText size={19} color={DS.colors.primary} strokeWidth={2.1} />
                </View>
                <View style={styles.exportOptionInfo}>
                  <ThemedText style={styles.exportOptionTitle}>
                    {copiedFormat === 'transcript' ? 'Copied ✓' : 'Copy plain transcript'}
                  </ThemedText>
                  <ThemedText style={styles.exportOptionDesc}>
                    Raw text without markdown headings
                  </ThemedText>
                </View>
              </Pressable>

              {/* Option 4: Summary copy (if summary exists) */}
              {Boolean(note?.summary) && (
                <Pressable
                  onPress={handleCopySummary}
                  style={({ pressed }) => [styles.exportOption, pressed && styles.exportOptionPressed]}
                  accessibilityRole="button"
                >
                  <View style={[styles.exportIconBox, { backgroundColor: DS.colors.primaryLight }]}>
                    <Sparkles size={19} color={DS.colors.primary} strokeWidth={2.1} />
                  </View>
                  <View style={styles.exportOptionInfo}>
                    <ThemedText style={styles.exportOptionTitle}>
                      {copiedFormat === 'summary' ? 'Copied ✓' : 'Copy AI summary only'}
                    </ThemedText>
                    <ThemedText style={styles.exportOptionDesc}>
                      Executive summary, key points & action items
                    </ThemedText>
                  </View>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.colors.canvas },
  muted: { color: DS.colors.muted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border, alignItems: 'center', justifyContent: 'center' },
  backText: { color: DS.colors.ink, fontSize: 38, fontWeight: '300', lineHeight: 40 },
  headerTitle: { color: DS.colors.subtle, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  deleteHeaderButton: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: DS.colors.dangerLight, justifyContent: 'center' },
  deleteHeaderText: { color: DS.colors.danger, fontSize: 13, fontWeight: '700' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eyebrow: { color: DS.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  titleInput: { color: DS.colors.ink, ...displayType(34), paddingVertical: 4, marginTop: 4, textAlignVertical: 'top' },
  date: { color: DS.colors.muted, fontSize: 13, marginTop: 2, marginBottom: 16 },
  categoryLabel: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    fontWeight: '800',
    marginTop: 20,
  },
  categoryRow: { gap: 8, paddingVertical: 10 },
  categoryChip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border },
  categoryText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '600' },
  categoryTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  pinButton: { height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border, justifyContent: 'center' },
  pinButtonActive: { backgroundColor: DS.colors.ink, borderColor: DS.colors.ink },
  pinText: { color: DS.colors.inkSoft, fontSize: 12.5, fontWeight: '700' },
  pinTextActive: { color: DS.colors.white },
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
  segmentContainer: { flexDirection: 'row', backgroundColor: DS.colors.surfaceSoft, borderRadius: 14, padding: 4, gap: 4, marginVertical: 14 },
  segmentTab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentTabActive: { backgroundColor: DS.colors.surface, ...DS.shadow.card },
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
  sparkleIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: DS.colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
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
  generateButton: { height: 52, borderRadius: 16, backgroundColor: DS.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 14, ...DS.shadow.primary },
  generateButtonText: { color: DS.colors.white, fontSize: 15, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  shareButton: { flex: 1, height: 54, borderRadius: 18, backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: DS.colors.ink, fontSize: 15, fontWeight: '700' },
  saveButton: { flex: 1, height: 54, borderRadius: 18, backgroundColor: DS.colors.ink, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: DS.colors.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  exportModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(24, 34, 53, 0.45)',
  },
  exportSheet: {
    backgroundColor: DS.colors.surface,
    borderTopLeftRadius: DS.radius.xl,
    borderTopRightRadius: DS.radius.xl,
    padding: 24,
    paddingBottom: 40,
    ...DS.shadow.floating,
  },
  exportSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: DS.colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  exportSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  exportSheetTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.h2,
    fontWeight: '800',
  },
  exportSheetSubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm,
    marginTop: 3,
  },
  exportCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: DS.radius.full,
    backgroundColor: DS.colors.surfaceDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCloseText: {
    color: DS.colors.muted,
    fontSize: 22,
    lineHeight: 24,
  },
  exportList: {
    gap: 10,
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: DS.radius.md,
    backgroundColor: DS.colors.surfaceDim,
    borderWidth: 1,
    borderColor: DS.colors.border,
  },
  exportOptionPressed: {
    backgroundColor: DS.colors.primaryLight,
    borderColor: DS.colors.primary,
  },
  exportIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: DS.colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  exportIcon: {
    fontSize: 20,
  },
  exportOptionInfo: {
    flex: 1,
  },
  exportOptionTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    fontWeight: '700',
  },
  exportOptionDesc: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    marginTop: 2,
  },
});
