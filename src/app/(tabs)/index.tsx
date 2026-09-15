/**
 * Home Screen — Voice notes feed with premium glass card design.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loadNotes, insertNote, removeNote, Note, NoteCategory, formatDuration } from '@/lib/notes';
import { useAuth } from '@/lib/auth';
import { DS } from '@/constants/design';
import { formatNoteDate, generateNoteId } from '@/lib/utils';

const categories: ('All' | NoteCategory)[] = ['All', 'Lectures', 'Sermons', 'Meetings', 'Personal'];

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  item,
  index,
  onPress,
  onLongPress,
}: {
  item: Note;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const catData = DS.category[item.category ?? 'Personal'] ?? DS.category.Personal;
  const isPending = item.transcriptionStatus === 'pending';
  const isFailed = item.transcriptionStatus === 'failed';
  const hasAudio = Boolean(item.audioUri || item.audioPath);

  const preview = isPending
    ? '⏳ Transcribing your voice note…'
    : isFailed
    ? `⚠️ ${item.transcriptionError || 'Tap to retry transcription.'}`
    : item.summary
    ? item.summary.replace(/^###[^\n]+\n/gm, '').replace(/\*\*/g, '').slice(0, 160)
    : item.content || 'Audio voice note';

  const wordCount = item.content?.trim() ? item.content.trim().split(/\s+/).length : 0;

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index * 40, 220))}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.noteCard, pressed && styles.pressed]}
      >
        {/* Category left accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: catData.accent }]} />

        <View style={styles.cardBody}>
          {/* Top row: category pill + duration */}
          <View style={styles.cardTopRow}>
            <View style={[styles.categoryPill, { backgroundColor: catData.badgeBg, borderColor: catData.border }]}>
              <ThemedText style={styles.categoryIcon}>{catData.icon}</ThemedText>
              <ThemedText style={[styles.categoryPillText, { color: catData.badgeText }]}>
                {item.category ?? 'Personal'}
              </ThemedText>
            </View>
            <View style={styles.cardMeta}>
              {isPending && <View style={[styles.statusDot, { backgroundColor: '#FBBF24' }]} />}
              {isFailed && <View style={[styles.statusDot, { backgroundColor: DS.colors.danger }]} />}
              {!isPending && !isFailed && hasAudio && (
                <View style={styles.durationBadge}>
                  <ThemedText style={styles.durationText}>
                    ⏱ {formatDuration(item.durationSeconds)}
                  </ThemedText>
                </View>
              )}
              {item.pinned && <ThemedText style={styles.pinStar}>★</ThemedText>}
            </View>
          </View>

          {/* Title */}
          <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.title}</ThemedText>

          {/* Preview */}
          <ThemedText
            style={[
              styles.cardPreview,
              isPending && styles.cardPreviewPending,
              isFailed && styles.cardPreviewFailed,
            ]}
            numberOfLines={2}
          >
            {preview}
          </ThemedText>

          {/* Bottom row */}
          <View style={styles.cardBottomRow}>
            <ThemedText style={styles.cardDate}>{formatNoteDate(item.createdAt)}</ThemedText>
            {wordCount > 0 && (
              <ThemedText style={styles.cardWordCount}>{wordCount} words</ThemedText>
            )}
            {item.summary && (
              <View style={styles.aiPill}>
                <ThemedText style={styles.aiPillText}>✨ AI Summary</ThemedText>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'All' | NoteCategory>('All');
  const [filterSource, setFilterSource] = useState<'voice' | 'all'>('voice');
  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const userName =
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'VoicePad User');
  const userInitial = (userName[0] || 'V').toUpperCase();

  const fetchNotes = useCallback(async () => {
    try {
      const items = await loadNotes();
      setNotes(items);
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchNotes(); }, [fetchNotes]));

  const onRefresh = useCallback(() => { setIsRefreshing(true); fetchNotes(); }, [fetchNotes]);

  const voiceCount = useMemo(
    () => notes.filter((n) => n.source === 'voice' || Boolean(n.audioUri || n.audioPath)).length,
    [notes]
  );
  const aiCount = useMemo(() => notes.filter((n) => n.summary).length, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const isVoice = note.source === 'voice' || Boolean(note.audioUri || note.audioPath);
      if (filterSource === 'voice' && !isVoice) return false;
      const matchesCat = selectedCategory === 'All' || (note.category ?? 'Personal') === selectedCategory;
      const q = search.trim().toLowerCase();
      return matchesCat && (!q || `${note.title} ${note.content} ${note.summary || ''}`.toLowerCase().includes(q));
    });
  }, [filterSource, notes, search, selectedCategory]);

  const pinnedNotes = useMemo(() => filteredNotes.filter((n) => n.pinned), [filteredNotes]);
  const recentNotes = useMemo(() => filteredNotes.filter((n) => !n.pinned), [filteredNotes]);

  async function handleCategorySelect(cat: 'All' | NoteCategory) {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedCategory(cat);
  }

  async function createNote() {
    const cleanTitle = newTitle.trim();
    const cleanContent = newContent.trim();
    if (!cleanTitle && !cleanContent) {
      Alert.alert('Write something first', 'Add a title or content to create a note.');
      return;
    }
    try {
      await insertNote({
        id: generateNoteId('text'),
        title: cleanTitle || 'Untitled note',
        content: cleanContent,
        createdAt: new Date().toISOString(),
        category: selectedCategory === 'All' ? 'Personal' : selectedCategory,
        source: 'text',
      });
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setIsComposerOpen(false);
      setNewTitle('');
      setNewContent('');
      await fetchNotes();
    } catch {
      Alert.alert('Could not save note', 'Please try again.');
    }
  }

  function selectNote(note: Note) {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setSelectedNote((cur) => (cur?.id === note.id ? null : note));
  }

  function deleteNote(note: Note) {
    Alert.alert('Delete note?', `"${note.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          await removeNote(note.id);
          setSelectedNote(null);
          await fetchNotes();
        },
      },
    ]);
  }

  function SectionHeader({ label, count }: { label: string; count: number }) {
    return (
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
        <View style={styles.sectionBadge}>
          <ThemedText style={styles.sectionBadgeText}>{count}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={[...pinnedNotes, ...recentNotes]}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={DS.colors.primary} />
          }
          renderItem={({ item, index }) => (
            <>
              {index === 0 && pinnedNotes.length > 0 && (
                <SectionHeader label="Pinned" count={pinnedNotes.length} />
              )}
              {index === pinnedNotes.length && recentNotes.length > 0 && (
                <SectionHeader label="Recent" count={recentNotes.length} />
              )}
              <NoteCard
                item={item}
                index={index}
                onPress={() => router.push(`/note/${item.id}`)}
                onLongPress={() => selectNote(item)}
              />
            </>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* ─── Hero header ─── */}
              <View style={styles.heroCard}>
                <View style={styles.heroRow}>
                  <View style={styles.avatar}>
                    <ThemedText style={styles.avatarText}>{userInitial}</ThemedText>
                  </View>
                  <View style={styles.greetingBlock}>
                    <ThemedText style={styles.greetingSmall}>Welcome back</ThemedText>
                    <ThemedText style={styles.greetingName} numberOfLines={1}>{userName}</ThemedText>
                  </View>
                  <Pressable
                    onPress={() => router.push('/notes')}
                    style={styles.notepadBtn}
                    accessibilityLabel="Open Notepad"
                  >
                    <ThemedText style={styles.notepadBtnText}>✏️ Notepad</ThemedText>
                  </Pressable>
                </View>

                {/* Stats bar */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statValue}>{notes.length}</ThemedText>
                    <ThemedText style={styles.statLabel}>Total</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statValue}>{voiceCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>Voice</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <ThemedText style={styles.statValue}>{aiCount}</ThemedText>
                    <ThemedText style={styles.statLabel}>AI Summaries</ThemedText>
                  </View>
                </View>
              </View>

              {/* Search */}
              <View style={styles.searchBox}>
                <ThemedText style={styles.searchIcon}>⌕</ThemedText>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search notes or AI summaries…"
                  placeholderTextColor={DS.colors.subtle}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')}>
                    <ThemedText style={styles.searchClear}>×</ThemedText>
                  </Pressable>
                )}
              </View>

              {/* Source toggle */}
              <View style={styles.sourceToggle}>
                {(['voice', 'all'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setFilterSource(mode);
                    }}
                    style={[styles.toggleBtn, filterSource === mode && styles.toggleBtnActive]}
                  >
                    <ThemedText
                      style={[styles.toggleBtnText, filterSource === mode && styles.toggleBtnTextActive]}
                    >
                      {mode === 'voice'
                        ? `🎙️ Voice (${voiceCount})`
                        : `📋 All (${notes.length})`}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {categories.map((cat) => {
                  const catData = cat !== 'All' ? DS.category[cat] : null;
                  const isActive = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => handleCategorySelect(cat)}
                      accessibilityLabel={`Filter by ${cat}`}
                      style={[
                        styles.chip,
                        isActive && styles.chipActive,
                        isActive && catData ? { backgroundColor: catData.accent, borderColor: catData.accent } : null,
                      ]}
                    >
                      <ThemedText style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {catData ? `${catData.icon} ` : ''}{cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {isLoading && (
                <ThemedText style={styles.loadingText}>Loading your notes…</ThemedText>
              )}

              {!isLoading && filteredNotes.length === 0 && (
                <View style={styles.emptyState}>
                  <ThemedText style={styles.emptyIcon}>🎙️</ThemedText>
                  <ThemedText style={styles.emptyTitle}>Start your first voice note</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    Tap the mic below to record. VoicePad transcribes your audio and creates AI summaries automatically.
                  </ThemedText>
                  <Pressable
                    onPress={() => router.push({ pathname: '/note/record', params: { category: selectedCategory === 'All' ? 'Personal' : selectedCategory } })}
                    style={styles.emptyCta}
                  >
                    <ThemedText style={styles.emptyCtaText}>🎙️ Record now</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/scan')}
                    style={styles.emptyCtaSecondary}
                  >
                    <ThemedText style={styles.emptyCtaSecondaryText}>📷 Or scan a photo</ThemedText>
                  </Pressable>
                </View>
              )}
            </>
          }
          ListFooterComponent={<View style={{ height: 120 }} />}
        />

        {/* FAB */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push({ pathname: '/note/record', params: { category: selectedCategory === 'All' ? 'Personal' : selectedCategory } });
          }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityLabel="Record a voice note"
        >
          <ThemedText style={styles.fabText}>🎙️</ThemedText>
        </Pressable>

        {/* Action tray (long-press) */}
        {selectedNote && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.actionTray}>
            <View style={styles.trayThumb}>
              <ThemedText style={styles.trayThumbText}>✦</ThemedText>
            </View>
            <Pressable
              onPress={() => {
                router.push(`/note/${selectedNote.id}`);
                setSelectedNote(null);
              }}
              style={styles.trayBtn}
            >
              <ThemedText style={styles.trayBtnText}>✎ Edit</ThemedText>
            </Pressable>
            <Pressable onPress={() => deleteNote(selectedNote)} style={[styles.trayBtn, styles.trayBtnDanger]}>
              <ThemedText style={styles.trayBtnText}>🗑 Delete</ThemedText>
            </Pressable>
            <Pressable onPress={() => setSelectedNote(null)} style={styles.trayBtnClose}>
              <ThemedText style={styles.trayBtnCloseText}>×</ThemedText>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Quick text composer modal */}
      <Modal
        visible={isComposerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsComposerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.composer}>
            <View style={styles.composerHandle} />
            <View style={styles.composerHeader}>
              <ThemedText style={styles.composerTitle}>New text note</ThemedText>
              <Pressable onPress={() => setIsComposerOpen(false)}>
                <ThemedText style={styles.composerClose}>×</ThemedText>
              </Pressable>
            </View>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Title"
              placeholderTextColor={DS.colors.subtle}
              style={styles.composerTitleInput}
            />
            <TextInput
              value={newContent}
              onChangeText={setNewContent}
              placeholder="Write your thought…"
              placeholderTextColor={DS.colors.subtle}
              style={styles.composerContentInput}
              multiline
              textAlignVertical="top"
            />
            <Pressable onPress={createNote} style={styles.composerSaveBtn}>
              <ThemedText style={styles.composerSaveBtnText}>Save note</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  listContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
  },

  // Hero card
  heroCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DS.colors.border,
    ...DS.shadow.card,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: DS.colors.primaryLight,
    borderWidth: 2, borderColor: DS.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: DS.colors.primary, fontSize: DS.font.h2, fontWeight: '800' },
  greetingBlock: { flex: 1, marginLeft: 14 },
  greetingSmall: { color: DS.colors.subtle, fontSize: DS.font.xxs },
  greetingName: { color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '800', marginTop: 1 },
  notepadBtn: {
    backgroundColor: DS.colors.primaryLight,
    borderRadius: DS.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notepadBtnText: { color: DS.colors.primary, fontSize: DS.font.xxs, fontWeight: '800' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: DS.colors.canvas,
    borderRadius: DS.radius.md,
    padding: 14,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: DS.colors.primary, fontSize: DS.font.h1, fontWeight: '800' },
  statLabel: { color: DS.colors.muted, fontSize: DS.font.caption, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 30, backgroundColor: DS.colors.border },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 12,
    ...DS.shadow.card,
  },
  searchIcon: { color: DS.colors.subtle, fontSize: 22, marginRight: 10 },
  searchInput: { flex: 1, color: DS.colors.ink, fontSize: DS.font.bodyMd },
  searchClear: { color: DS.colors.muted, fontSize: 22, paddingHorizontal: 4 },

  // Source toggle
  sourceToggle: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9,
    borderRadius: DS.radius.sm,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: DS.colors.surface,
    ...DS.shadow.card,
  },
  toggleBtnText: { color: DS.colors.muted, fontSize: DS.font.xs, fontWeight: '700' },
  toggleBtnTextActive: { color: DS.colors.ink, fontWeight: '800' },

  // Category chips
  chipsRow: { gap: 10, paddingVertical: 12 },
  chip: {
    backgroundColor: DS.colors.surface,
    borderWidth: 1,
    borderColor: DS.colors.border,
    borderRadius: DS.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: DS.colors.primary, borderColor: DS.colors.primary },
  chipText: { color: DS.colors.muted, fontSize: DS.font.sm, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },

  // Loading
  loadingText: { color: DS.colors.muted, paddingVertical: 24 },

  // Empty state
  emptyState: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 32,
    alignItems: 'center',
    marginTop: 14,
    ...DS.shadow.card,
  },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { color: DS.colors.ink, fontSize: DS.font.h2, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm, lineHeight: 22,
    textAlign: 'center', maxWidth: 320,
    marginTop: 10,
  },
  emptyCta: {
    backgroundColor: DS.colors.orange,
    borderRadius: DS.radius.md,
    paddingHorizontal: 24, paddingVertical: 14,
    marginTop: 20,
    ...DS.shadow.orange,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: DS.font.bodyMd, fontWeight: '800' },
  emptyCtaSecondary: {
    marginTop: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyCtaSecondaryText: { color: DS.colors.muted, fontSize: DS.font.sm, fontWeight: '700' },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, marginBottom: 10, gap: 8,
  },
  sectionTitle: { color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '800' },
  sectionBadge: {
    backgroundColor: DS.colors.primaryLight,
    borderRadius: DS.radius.full,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  sectionBadgeText: { color: DS.colors.primary, fontSize: DS.font.xxs, fontWeight: '800' },

  // Note cards (glass-style)
  noteCard: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surfaceGlass,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    marginBottom: 12,
    overflow: 'hidden',
    ...DS.shadow.card,
  },
  pressed: { opacity: 0.80, transform: [{ scale: 0.985 }] },
  cardAccent: { width: 4, borderTopLeftRadius: DS.radius.lg, borderBottomLeftRadius: DS.radius.lg },
  cardBody: { flex: 1, padding: 16 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryPill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: DS.radius.xs, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 4, gap: 4,
  },
  categoryIcon: { fontSize: DS.font.caption },
  categoryPillText: { fontSize: DS.font.caption, fontWeight: '800' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  durationBadge: {
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.xs,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  durationText: { color: DS.colors.muted, fontSize: DS.font.caption, fontWeight: '700' },
  pinStar: { color: '#F59E0B', fontSize: DS.font.body },
  cardTitle: {
    color: DS.colors.ink, fontSize: DS.font.bodyMd,
    fontWeight: '800', marginTop: 12,
  },
  cardPreview: {
    color: DS.colors.muted, fontSize: DS.font.sm,
    lineHeight: 20, marginTop: 6,
  },
  cardPreviewPending: { color: '#B45309' },
  cardPreviewFailed: { color: DS.colors.danger },
  cardBottomRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginTop: 14,
  },
  cardDate: { color: DS.colors.subtle, fontSize: DS.font.caption },
  cardWordCount: { color: DS.colors.subtle, fontSize: DS.font.caption },
  aiPill: {
    backgroundColor: DS.colors.primaryLight,
    borderRadius: DS.radius.xs,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  aiPillText: { color: DS.colors.primary, fontSize: DS.font.caption, fontWeight: '800' },

  // FAB
  fab: {
    position: 'absolute', alignSelf: 'center', bottom: 44,
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: DS.colors.orange,
    alignItems: 'center', justifyContent: 'center',
    ...DS.shadow.orange,
  },
  fabPressed: { transform: [{ scale: 0.93 }], opacity: 0.9 },
  fabText: { fontSize: 30 },

  // Action tray
  actionTray: {
    position: 'absolute', left: 16, right: 16, bottom: 14,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    padding: 12,
    flexDirection: 'row', alignItems: 'center',
    ...DS.shadow.elevated,
  },
  trayThumb: {
    width: 42, height: 42, borderRadius: DS.radius.sm,
    backgroundColor: DS.colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6,
  },
  trayThumbText: { color: DS.colors.primary, fontSize: DS.font.body },
  trayBtn: {
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.sm,
    paddingHorizontal: 14, paddingVertical: 10,
    marginLeft: 6,
  },
  trayBtnDanger: { backgroundColor: DS.colors.dangerLight },
  trayBtnText: { color: DS.colors.ink, fontSize: DS.font.sm, fontWeight: '800' },
  trayBtnClose: {
    marginLeft: 'auto' as any,
    width: 34, height: 34,
    borderRadius: DS.radius.full,
    backgroundColor: DS.colors.surfaceDim,
    alignItems: 'center', justifyContent: 'center',
  },
  trayBtnCloseText: { color: DS.colors.muted, fontSize: 22, lineHeight: 24 },

  // Composer modal
  modalBackdrop: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(23,21,42,0.38)',
  },
  composer: {
    backgroundColor: DS.colors.surface,
    borderTopLeftRadius: DS.radius.xl, borderTopRightRadius: DS.radius.xl,
    padding: 24, minHeight: 400,
  },
  composerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: DS.colors.border,
    alignSelf: 'center', marginBottom: 18,
  },
  composerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 18,
  },
  composerTitle: { color: DS.colors.ink, fontSize: DS.font.h2, fontWeight: '800' },
  composerClose: { color: DS.colors.muted, fontSize: 30, lineHeight: 30 },
  composerTitleInput: {
    color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: DS.colors.border, paddingVertical: 10,
  },
  composerContentInput: {
    color: DS.colors.ink, fontSize: DS.font.bodyMd, lineHeight: 24,
    minHeight: 140, paddingTop: 14,
  },
  composerSaveBtn: {
    backgroundColor: DS.colors.primary, borderRadius: DS.radius.md,
    alignItems: 'center', paddingVertical: 15, marginTop: 18,
    ...DS.shadow.primary,
  },
  composerSaveBtnText: { color: '#FFFFFF', fontSize: DS.font.bodyMd, fontWeight: '800' },
});
