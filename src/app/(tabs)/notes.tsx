/**
 * Notes (Notepad) Screen — Write & Saved text notes.
 * Photo to Text is now its own dedicated Scan tab.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loadNotes, insertNote, updateNote, removeNote, Note } from '@/lib/notes';
import { DS } from '@/constants/design';
import { formatNoteDate, generateNoteId } from '@/lib/utils';

type TabMode = 'write' | 'saved';

export default function NotesScreen() {
  const [tabMode, setTabMode] = useState<TabMode>('write');
  const [notepadNotes, setNotepadNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Editor state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const fetchNotepadNotes = useCallback(async () => {
    try {
      const all = await loadNotes();
      const filtered = all.filter((n) => n.source === 'text' || (!n.audioUri && !n.audioPath));
      setNotepadNotes(filtered);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchNotepadNotes(); }, [fetchNotepadNotes]));

  const wordCount = useMemo(() => {
    const trimmed = noteContent.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [noteContent]);

  const charCount = noteContent.length;

  const displayedSavedNotes = useMemo(() => {
    if (!searchQuery.trim()) return notepadNotes;
    const q = searchQuery.trim().toLowerCase();
    return notepadNotes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notepadNotes, searchQuery]);

  // ── Editor actions ──────────────────────────────────────────────────────────

  function handleNewNote() {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setTabMode('write');
  }

  function handleOpenNote(note: Note) {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setTabMode('write');
  }

  async function handleSaveNote() {
    const cleanContent = noteContent.trim();
    const cleanTitle =
      noteTitle.trim() ||
      (cleanContent ? cleanContent.split(/[\n.!?]/)[0]?.trim().slice(0, 50) : 'Untitled note');

    if (!cleanContent && !noteTitle.trim()) {
      Alert.alert('Empty note', 'Please type some text before saving.');
      return;
    }
    setIsSaving(true);
    try {
      if (editingNoteId) {
        await updateNote(editingNoteId, { title: cleanTitle, content: cleanContent });
      } else {
        const newId = generateNoteId('pad');
        await insertNote({
          id: newId,
          title: cleanTitle,
          content: cleanContent,
          source: 'text',
          category: 'Personal',
          createdAt: new Date().toISOString(),
          transcriptionStatus: 'ready',
        });
        setEditingNoteId(newId);
      }
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      await fetchNotepadNotes();
      Alert.alert('Saved!', 'Note saved to your Notepad.');
    } catch {
      Alert.alert('Error', 'Could not save the note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyNote() {
    const text = noteTitle ? `${noteTitle}\n\n${noteContent}` : noteContent;
    if (!text.trim()) return;
    await Clipboard.setStringAsync(text);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }

  async function handleShareNote(note?: Note) {
    const text = note
      ? `${note.title}\n\n${note.content}`
      : noteTitle ? `${noteTitle}\n\n${noteContent}` : noteContent;
    if (!text.trim()) return;
    try { await Share.share({ message: text }); } catch {}
  }

  function handleDeleteNote(id: string, title: string) {
    Alert.alert('Delete note?', `"${title || 'Untitled note'}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          await removeNote(id);
          if (editingNoteId === id) handleNewNote();
          await fetchNotepadNotes();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* ─── Header ─── */}
          <View style={styles.headerArea}>
            <View style={styles.headerTopRow}>
              <View>
                <ThemedText style={styles.eyebrow}>NOTEPAD</ThemedText>
                <ThemedText style={styles.title}>
                  {tabMode === 'write' && editingNoteId ? 'Editing note' : 'Notepad'}
                </ThemedText>
              </View>
              {tabMode === 'write' && (
                <Pressable onPress={handleNewNote} style={styles.newNoteBtn} accessibilityLabel="New note">
                  <ThemedText style={styles.newNoteBtnText}>+ New</ThemedText>
                </Pressable>
              )}
            </View>

            {/* Tab switcher */}
            <View style={styles.tabRow}>
              {(['write', 'saved'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setTabMode(mode)}
                  style={[styles.tabBtn, tabMode === mode && styles.tabBtnActive]}
                  accessibilityLabel={mode === 'write' ? 'Write mode' : 'Saved notes'}
                >
                  <ThemedText style={[styles.tabBtnText, tabMode === mode && styles.tabBtnTextActive]}>
                    {mode === 'write' ? '✏️ Write' : `📚 Saved (${notepadNotes.length})`}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ─── WRITE TAB ─── */}
          {tabMode === 'write' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editorCard}>
                <TextInput
                  value={noteTitle}
                  onChangeText={setNoteTitle}
                  placeholder="Note Title…"
                  placeholderTextColor={DS.colors.subtle}
                  style={styles.titleInput}
                />
                <TextInput
                  value={noteContent}
                  onChangeText={setNoteContent}
                  placeholder="Start typing your note here…"
                  placeholderTextColor={DS.colors.subtle}
                  multiline
                  style={styles.contentInput}
                  textAlignVertical="top"
                />
                <View style={styles.editorFooter}>
                  <ThemedText style={styles.statsText}>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount} chars
                  </ThemedText>
                  {editingNoteId && (
                    <ThemedText style={styles.editingBadge}>● Editing saved note</ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  disabled={isSaving}
                  onPress={handleSaveNote}
                  style={[styles.primaryActionBtn, isSaving && styles.disabledBtn]}
                  accessibilityLabel="Save note"
                >
                  <ThemedText style={styles.primaryActionText}>
                    {isSaving ? 'Saving…' : editingNoteId ? '💾 Update' : '💾 Save'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!noteContent.trim()}
                  onPress={handleCopyNote}
                  style={[styles.secondaryActionBtn, !noteContent.trim() && styles.disabledBtn]}
                  accessibilityLabel="Copy note"
                >
                  <ThemedText style={styles.secondaryActionText}>
                    {copiedMessage ? '✓ Copied' : '📋 Copy'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!noteContent.trim()}
                  onPress={() => handleShareNote()}
                  style={[styles.secondaryActionBtn, !noteContent.trim() && styles.disabledBtn]}
                  accessibilityLabel="Share note"
                >
                  <ThemedText style={styles.secondaryActionText}>↗ Share</ThemedText>
                </Pressable>
              </View>

              {/* Quick access to saved notes */}
              {notepadNotes.length > 0 && (
                <View style={styles.recentSection}>
                  <View style={styles.recentHeader}>
                    <ThemedText style={styles.recentTitle}>Recent Saved Notes</ThemedText>
                    <Pressable onPress={() => setTabMode('saved')}>
                      <ThemedText style={styles.viewAllText}>View All ➔</ThemedText>
                    </Pressable>
                  </View>
                  {notepadNotes.slice(0, 3).map((item, i) => (
                    <Animated.View key={item.id} entering={FadeInDown.duration(250).delay(i * 60)}>
                      <Pressable
                        onPress={() => handleOpenNote(item)}
                        style={[styles.miniCard, editingNoteId === item.id && styles.miniCardActive]}
                      >
                        <View style={styles.miniCardRow}>
                          <ThemedText style={styles.miniCardTitle} numberOfLines={1}>
                            {item.title || 'Untitled note'}
                          </ThemedText>
                          <ThemedText style={styles.miniCardDate}>{formatNoteDate(item.createdAt)}</ThemedText>
                        </View>
                        <ThemedText style={styles.miniCardSnippet} numberOfLines={1}>
                          {item.content || 'Empty note'}
                        </ThemedText>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* ─── SAVED TAB ─── */}
          {tabMode === 'saved' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.searchBox}>
                <ThemedText style={styles.searchIcon}>⌕</ThemedText>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search saved notes…"
                  placeholderTextColor={DS.colors.subtle}
                  style={styles.searchInput}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')}>
                    <ThemedText style={styles.clearSearch}>×</ThemedText>
                  </Pressable>
                )}
              </View>

              {displayedSavedNotes.length === 0 ? (
                <View style={styles.emptySavedState}>
                  <ThemedText style={styles.emptyIcon}>📝</ThemedText>
                  <ThemedText style={styles.emptyTitle}>
                    {searchQuery ? 'No matching notes' : 'Your Notepad is empty'}
                  </ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Try a different keyword.'
                      : 'Write something in the Write tab to save it here.'}
                  </ThemedText>
                  {!searchQuery && (
                    <Pressable onPress={handleNewNote} style={styles.createFirstBtn} accessibilityLabel="Write a note">
                      <ThemedText style={styles.createFirstBtnText}>✏️ Write a Note</ThemedText>
                    </Pressable>
                  )}
                </View>
              ) : (
                displayedSavedNotes.map((note, i) => {
                  const words = note.content?.trim() ? note.content.trim().split(/\s+/).length : 0;
                  return (
                    <Animated.View key={note.id} entering={FadeInDown.duration(240).delay(i * 50)}>
                      <View style={styles.savedNoteCard}>
                        <Pressable onPress={() => handleOpenNote(note)} style={styles.savedNoteClickArea}>
                          <View style={styles.savedNoteTopRow}>
                            <ThemedText style={styles.savedNoteTitle} numberOfLines={1}>
                              {note.title || 'Untitled note'}
                            </ThemedText>
                            <ThemedText style={styles.savedNoteDate}>{formatNoteDate(note.createdAt)}</ThemedText>
                          </View>
                          <ThemedText style={styles.savedNotePreview} numberOfLines={2}>
                            {note.content || 'Empty note'}
                          </ThemedText>
                          <ThemedText style={styles.savedNoteWords}>{words} words</ThemedText>
                        </Pressable>
                        <View style={styles.savedNoteActionsRow}>
                          <Pressable onPress={() => handleOpenNote(note)} style={styles.cardActionBtn} accessibilityLabel="Edit">
                            <ThemedText style={styles.cardActionText}>✏️ Edit</ThemedText>
                          </Pressable>
                          <Pressable onPress={() => handleShareNote(note)} style={styles.cardActionBtn} accessibilityLabel="Share">
                            <ThemedText style={styles.cardActionText}>↗ Share</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteNote(note.id, note.title)}
                            style={[styles.cardActionBtn, styles.cardActionBtnDanger]}
                            accessibilityLabel="Delete"
                          >
                            <ThemedText style={[styles.cardActionText, { color: DS.colors.danger }]}>
                              🗑 Delete
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  flex: { flex: 1 },

  headerArea: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  eyebrow: {
    color: DS.colors.primary,
    fontSize: DS.font.caption, fontWeight: '800', letterSpacing: 2.5,
  },
  title: { color: DS.colors.ink, fontSize: DS.font.display, fontWeight: '800', marginTop: 2 },
  newNoteBtn: {
    backgroundColor: DS.colors.primary,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: DS.radius.sm,
    ...DS.shadow.primary,
  },
  newNoteBtnText: { color: '#FFFFFF', fontSize: DS.font.xs, fontWeight: '800' },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.md,
    borderWidth: 1, borderColor: DS.colors.border,
    padding: 4, gap: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: DS.radius.sm, alignItems: 'center' },
  tabBtnActive: { backgroundColor: DS.colors.surface, ...DS.shadow.card },
  tabBtnText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '700' },
  tabBtnTextActive: { color: DS.colors.ink, fontWeight: '800' },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 60, width: '100%', maxWidth: 760, alignSelf: 'center' },

  // Editor
  editorCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg, borderWidth: 1, borderColor: DS.colors.border,
    padding: 18, marginTop: 8,
    ...DS.shadow.card,
  },
  titleInput: {
    fontSize: DS.font.h3, fontWeight: '800', color: DS.colors.ink,
    borderBottomWidth: 1, borderBottomColor: DS.colors.border,
    paddingVertical: 10, marginBottom: 10,
  },
  contentInput: { fontSize: DS.font.bodyMd, lineHeight: 25, color: DS.colors.ink, minHeight: 220 },
  editorFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: DS.colors.surfaceDim, paddingTop: 10, marginTop: 10,
  },
  statsText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '600' },
  editingBadge: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '800' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryActionBtn: {
    flex: 2, backgroundColor: DS.colors.primary, borderRadius: DS.radius.md,
    paddingVertical: 14, alignItems: 'center', ...DS.shadow.primary,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: DS.font.sm, fontWeight: '800' },
  secondaryActionBtn: {
    flex: 1, backgroundColor: DS.colors.surface, borderRadius: DS.radius.md,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: DS.colors.border,
  },
  secondaryActionText: { color: DS.colors.ink, fontSize: DS.font.xs, fontWeight: '700' },
  disabledBtn: { opacity: 0.4 },

  // Recent section
  recentSection: { marginTop: 24 },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  recentTitle: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '800' },
  viewAllText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '700' },
  miniCard: {
    backgroundColor: DS.colors.surface, borderRadius: DS.radius.md,
    borderWidth: 1, borderColor: DS.colors.border, padding: 14, marginBottom: 8,
    ...DS.shadow.card,
  },
  miniCardActive: { borderColor: DS.colors.primary, borderWidth: 1.5 },
  miniCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniCardTitle: { color: DS.colors.ink, fontSize: DS.font.sm, fontWeight: '700', flex: 1, marginRight: 8 },
  miniCardDate: { color: DS.colors.muted, fontSize: DS.font.caption },
  miniCardSnippet: { color: DS.colors.muted, fontSize: DS.font.xs, marginTop: 4 },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.colors.surface, borderRadius: DS.radius.md,
    borderWidth: 1, borderColor: DS.colors.border,
    paddingHorizontal: 14, height: 48, marginTop: 8, marginBottom: 14,
    ...DS.shadow.card,
  },
  searchIcon: { color: DS.colors.muted, fontSize: DS.font.body, marginRight: 8 },
  searchInput: { flex: 1, color: DS.colors.ink, fontSize: DS.font.bodyMd },
  clearSearch: { color: DS.colors.muted, fontSize: 22, paddingHorizontal: 6 },

  // Saved note cards
  savedNoteCard: {
    backgroundColor: DS.colors.surface, borderRadius: DS.radius.lg,
    borderWidth: 1, borderColor: DS.colors.border,
    padding: 16, marginBottom: 12, ...DS.shadow.card,
  },
  savedNoteClickArea: { paddingBottom: 8 },
  savedNoteTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savedNoteTitle: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '800', flex: 1, marginRight: 8 },
  savedNoteDate: { color: DS.colors.muted, fontSize: DS.font.caption },
  savedNotePreview: { color: DS.colors.muted, fontSize: DS.font.sm, lineHeight: 21, marginTop: 8 },
  savedNoteWords: { color: DS.colors.subtle, fontSize: DS.font.caption, marginTop: 8, fontWeight: '600' },
  savedNoteActionsRow: {
    flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: DS.colors.surfaceDim,
    paddingTop: 10, marginTop: 6,
  },
  cardActionBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: DS.radius.xs,
    borderWidth: 1, borderColor: DS.colors.border,
    backgroundColor: DS.colors.surfaceDim,
  },
  cardActionBtnDanger: { borderColor: '#FCA5A5' },
  cardActionText: { color: DS.colors.ink, fontSize: DS.font.xxs, fontWeight: '700' },

  // Empty state
  emptySavedState: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '800' },
  emptySubtitle: { color: DS.colors.muted, fontSize: DS.font.sm, textAlign: 'center', maxWidth: 280 },
  createFirstBtn: {
    backgroundColor: DS.colors.primary, borderRadius: DS.radius.md,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 12, ...DS.shadow.primary,
  },
  createFirstBtnText: { color: '#FFFFFF', fontSize: DS.font.sm, fontWeight: '800' },
});
