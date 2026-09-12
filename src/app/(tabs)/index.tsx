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
  Share,
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
import { CategoryColors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

const ACCENT = '#21499A';
const ORANGE = '#FF7A00';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';
const DANGER = '#DC2626';

const categories: Array<'All' | NoteCategory> = ['All', 'Lectures', 'Sermons', 'Meetings', 'Personal'];

function formatNoteDate(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
  } catch {
    return dateString;
  }
}

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
  const category = item.category ?? 'Personal';
  const colors = CategoryColors[category] ?? CategoryColors.Personal;
  const preview =
    item.transcriptionStatus === 'pending'
      ? 'Transcribing your voice note…'
      : item.transcriptionStatus === 'failed'
      ? `Transcription failed: ${item.transcriptionError || 'Tap to retry.'}`
      : item.summary
      ? `✨ ${item.summary.replace(/^###[^\n]+\n/g, '').slice(0, 140)}…`
      : item.content || 'Audio voice note';
  const wordCount = item.content?.trim() ? item.content.trim().split(/\s+/).length : 0;
  const hasAudio = Boolean(item.audioUri || item.audioPath);

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index * 35, 200))}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.noteCard, pressed && styles.pressed]}>
        <View style={styles.noteTopRow}>
          <View
            style={[
              styles.categoryPill,
              { backgroundColor: colors.badgeBg, borderColor: colors.border },
            ]}>
            <ThemedText style={[styles.categoryIcon]}>{colors.icon}</ThemedText>
            <ThemedText style={[styles.categoryPillText, { color: colors.badgeText }]}>
              {category}
            </ThemedText>
          </View>
          <View style={styles.noteMetaTop}>
            <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
            {hasAudio && (
              <View style={styles.durationBadge}>
                <ThemedText style={styles.durationText}>
                  ⏱ {formatDuration(item.durationSeconds)}
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        <ThemedText style={styles.noteTitle} numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedText style={styles.notePreview} numberOfLines={2}>
          {preview}
        </ThemedText>

        <View style={styles.noteBottomRow}>
          <ThemedText style={styles.noteMetadata}>
            {formatNoteDate(item.createdAt)}
          </ThemedText>
          {wordCount > 0 && (
            <ThemedText style={styles.noteMetadata}>{wordCount} words</ThemedText>
          )}
          {item.summary && <ThemedText style={styles.aiPill}>✨ AI Summary</ThemedText>}
          {item.pinned && <ThemedText style={styles.star}>★</ThemedText>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

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
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

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

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes]),
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchNotes();
  }, [fetchNotes]);

  const voiceNotesCount = useMemo(
    () => notes.filter((n) => n.source === 'voice' || Boolean(n.audioUri || n.audioPath)).length,
    [notes]
  );

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const isVoice = note.source === 'voice' || Boolean(note.audioUri || note.audioPath);
      if (filterSource === 'voice' && !isVoice) return false;
      const matchesCategory =
        selectedCategory === 'All' || (note.category ?? 'Personal') === selectedCategory;
      const query = search.trim().toLowerCase();
      return (
        matchesCategory &&
        (!query || `${note.title} ${note.content} ${note.summary || ''}`.toLowerCase().includes(query))
      );
    });
  }, [filterSource, notes, search, selectedCategory]);

  const pinnedNotes = useMemo(() => filteredNotes.filter((note) => note.pinned), [filteredNotes]);
  const recentNotes = useMemo(() => filteredNotes.filter((note) => !note.pinned), [filteredNotes]);

  async function handleCategorySelect(cat: 'All' | NoteCategory) {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSelectedCategory(cat);
  }

  async function createNote() {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle && !cleanContent) {
      Alert.alert('Write something first', 'Add a title or a few words to create a note.');
      return;
    }
    try {
      const targetCategory = selectedCategory === 'All' ? 'Personal' : selectedCategory;
      await insertNote({
        id: `text-${Date.now()}`,
        title: cleanTitle || 'Untitled note',
        content: cleanContent,
        createdAt: new Date().toISOString(),
        category: targetCategory,
        source: 'text',
      });
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setIsComposerOpen(false);
      setTitle('');
      setContent('');
      await fetchNotes();
    } catch {
      Alert.alert('Could not save note', 'Your note could not be saved. Please try again.');
    }
  }

  function selectNote(note: Note) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setSelectedNote((current) => (current?.id === note.id ? null : note));
  }

  function deleteNote(note: Note) {
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
          setSelectedNote(null);
          await fetchNotes();
        },
      },
    ]);
  }

  async function shareSelectedNote() {
    if (!selectedNote) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await Share.share({
      title: selectedNote.title,
      message: `${selectedNote.title}\n\n${selectedNote.content}`,
    });
  }

  function sectionHeader(label: string, count: number) {
    return (
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
        <ThemedText style={styles.countBadge}>{count}</ThemedText>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={pinnedNotes.length ? [...pinnedNotes, ...recentNotes] : recentNotes}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          renderItem={({ item, index }) => (
            <>
              {index === 0 && pinnedNotes.length > 0 && sectionHeader('Pinned', pinnedNotes.length)}
              {index === pinnedNotes.length &&
                recentNotes.length > 0 &&
                sectionHeader('Recent Notes', recentNotes.length)}
              <NoteCard
                item={item}
                index={index}
                onPress={() => router.push(`/note/${item.id}`)}
                onLongPress={() => selectNote(item)}
              />
            </>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <View style={styles.headerRow}>
                <View style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>{userInitial}</ThemedText>
                </View>
                <View style={styles.greetingBlock}>
                  <ThemedText style={styles.greetingSmall}>Welcome back</ThemedText>
                  <ThemedText style={styles.greetingName}>{userName}</ThemedText>
                </View>
                <View style={styles.headerSpacer} />
                <Pressable onPress={() => router.push('/notes')} style={styles.noteCount}>
                  <ThemedText style={styles.noteCountText}>☰ {notes.length} notes</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    router.push('/notes');
                  }}
                  style={styles.bell}
                  accessibilityLabel="Open Notepad">
                  <ThemedText style={styles.bellText}>✏️</ThemedText>
                </Pressable>
              </View>

              <View style={styles.searchBox}>
                <ThemedText style={styles.searchIcon}>⌕</ThemedText>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search notes or AI summaries…"
                  placeholderTextColor="#9AA4B2"
                  style={styles.searchInput}
                />
              </View>

              <View style={styles.sourceToggleRow}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFilterSource('voice');
                  }}
                  style={[
                    styles.sourceToggleBtn,
                    filterSource === 'voice' && styles.sourceToggleActive,
                  ]}>
                  <ThemedText
                    style={[
                      styles.sourceToggleText,
                      filterSource === 'voice' && styles.sourceToggleActiveText,
                    ]}>
                    🎙️ Voice Notes ({voiceNotesCount})
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFilterSource('all');
                  }}
                  style={[
                    styles.sourceToggleBtn,
                    filterSource === 'all' && styles.sourceToggleActive,
                  ]}>
                  <ThemedText
                    style={[
                      styles.sourceToggleText,
                      filterSource === 'all' && styles.sourceToggleActiveText,
                    ]}>
                    📋 All Notes ({notes.length})
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {categories.map((category) => {
                  const catColor = category !== 'All' ? CategoryColors[category] : null;
                  return (
                    <Pressable
                      key={category}
                      onPress={() => handleCategorySelect(category)}
                      style={[
                        styles.chip,
                        selectedCategory === category && styles.chipSelected,
                        selectedCategory === category && catColor ? { backgroundColor: catColor.badgeText, borderColor: catColor.badgeText } : null,
                      ]}>
                      <ThemedText
                        style={[
                          styles.chipText,
                          selectedCategory === category && styles.chipTextSelected,
                        ]}>
                        {catColor ? `${catColor.icon} ` : ''}
                        {category}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {isLoading && <ThemedText style={styles.loading}>Loading your notes…</ThemedText>}

              {!isLoading && filteredNotes.length === 0 && (
                <View style={styles.emptyState}>
                  <ThemedText style={styles.emptyIcon}>🎙️</ThemedText>
                  <ThemedText style={styles.emptyTitle}>Capture your first voice note</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    Speak your lecture, sermon, meeting, or idea. VoicePad saves the audio, transcribes it, and generates AI summaries.
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      router.push({
                        pathname: '/note/record',
                        params: { category: selectedCategory === 'All' ? 'Personal' : selectedCategory },
                      });
                    }}
                    style={styles.emptyCta}>
                    <ThemedText style={styles.emptyCtaText}>Start recording now</ThemedText>
                  </Pressable>
                </View>
              )}
            </>
          }
          ListFooterComponent={<View style={{ height: 110 }} />}
        />

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push({
              pathname: '/note/record',
              params: { category: selectedCategory === 'All' ? 'Personal' : selectedCategory },
            });
          }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityLabel="Record a voice note">
          <ThemedText style={styles.fabText}>🎙️</ThemedText>
        </Pressable>

        {selectedNote && (
          <View style={styles.actionTray}>
            <View style={styles.thumbnail}>
              <ThemedText style={styles.thumbnailText}>✦</ThemedText>
            </View>
            <Pressable onPress={shareSelectedNote} style={styles.actionButton}>
              <ThemedText style={styles.actionText}>↗ Share</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(`/note/${selectedNote.id}`);
                setSelectedNote(null);
              }}
              style={styles.actionButton}>
              <ThemedText style={styles.actionText}>✎ Edit</ThemedText>
            </Pressable>
            <Pressable onPress={() => deleteNote(selectedNote)} style={[styles.actionButton, styles.deleteButton]}>
              <ThemedText style={styles.actionText}>🗑 Delete</ThemedText>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <Modal visible={isComposerOpen} animationType="slide" transparent onRequestClose={() => setIsComposerOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.composer}>
            <View style={styles.composerHeader}>
              <ThemedText style={styles.composerTitle}>New text note</ThemedText>
              <Pressable onPress={() => setIsComposerOpen(false)}>
                <ThemedText style={styles.closeButton}>×</ThemedText>
              </Pressable>
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor="#A8A4B5"
              style={styles.titleInput}
            />
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Write your thought…"
              placeholderTextColor="#A8A4B5"
              style={styles.contentInput}
              multiline
              textAlignVertical="top"
            />
            <Pressable onPress={createNote} style={styles.saveButton}>
              <ThemedText style={styles.saveButtonText}>Save note</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CANVAS },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0F8' },
  avatarText: { color: ACCENT, fontSize: 18, fontWeight: '800' },
  greetingBlock: { marginLeft: 14 },
  greetingSmall: { color: '#9AA4B2', fontSize: 13 },
  greetingName: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 1 },
  headerSpacer: { flex: 1 },
  noteCount: { backgroundColor: '#DCE7FA', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  noteCountText: { color: ACCENT, fontWeight: '800', fontSize: 13 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', marginLeft: 8, alignItems: 'center', justifyContent: 'center' },
  bellText: { color: INK, fontSize: 18 },
  searchBox: { height: 58, backgroundColor: '#FFFFFF', borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderWidth: 1, borderColor: BORDER },
  searchIcon: { color: '#8793A4', fontSize: 24, marginRight: 10 },
  searchInput: { flex: 1, color: INK, fontSize: 16 },
  sourceToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E4EAF5',
    borderRadius: 16,
    padding: 4,
    marginTop: 14,
    gap: 4,
  },
  sourceToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  sourceToggleActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  sourceToggleText: { color: MUTED, fontSize: 13, fontWeight: '700' },
  sourceToggleActiveText: { color: INK, fontWeight: '800' },
  chips: { gap: 10, paddingVertical: 18 },
  chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: '#5F6978', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  loading: { color: MUTED, paddingVertical: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 14, gap: 8 },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  countBadge: { color: ACCENT, backgroundColor: '#DCE7FA', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 3, fontSize: 12, fontWeight: '800' },
  noteCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 14 },
  noteTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, gap: 5 },
  categoryIcon: { fontSize: 12 },
  categoryPillText: { fontSize: 12, fontWeight: '800' },
  noteMetaTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  durationBadge: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  durationText: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  noteTitle: { color: INK, fontSize: 17, fontWeight: '800', marginTop: 14 },
  notePreview: { color: '#647080', fontSize: 14, lineHeight: 21, marginTop: 8 },
  noteBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  noteMetadata: { color: '#9AA4B2', fontSize: 12 },
  aiPill: { color: '#7C3AED', backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '800' },
  star: { marginLeft: 'auto', color: '#F28B22', fontSize: 16 },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: BORDER, padding: 32, alignItems: 'center', marginTop: 14 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: INK, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: { color: MUTED, marginTop: 8, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  emptyCta: { backgroundColor: ACCENT, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, marginTop: 22 },
  emptyCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  fab: { position: 'absolute', alignSelf: 'center', bottom: 48, width: 68, height: 68, borderRadius: 34, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  fabPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  fabText: { fontSize: 28 },
  actionTray: { position: 'absolute', left: 16, right: 16, bottom: 12, backgroundColor: '#FFFFFF', borderRadius: 26, padding: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#213047', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  thumbnail: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EFF3F8', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  thumbnailText: { color: ACCENT, fontSize: 18 },
  actionButton: { backgroundColor: '#4C6074', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, marginLeft: 6 },
  deleteButton: { backgroundColor: DANGER },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,21,42,0.32)' },
  composer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, minHeight: 400 },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  composerTitle: { color: INK, fontSize: 22, fontWeight: '800' },
  closeButton: { color: MUTED, fontSize: 30, lineHeight: 30 },
  titleInput: { color: INK, fontSize: 18, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 10 },
  contentInput: { color: INK, fontSize: 15, lineHeight: 22, minHeight: 140, paddingTop: 16 },
  saveButton: { backgroundColor: ACCENT, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 18 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
