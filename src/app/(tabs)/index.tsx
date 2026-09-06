import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NoteCategory } from '@/lib/notes';

const STORAGE_KEY = '@voicepad/notes';
const ACCENT = '#21499A';
const ORANGE = '#FF7A00';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';

type Category = NoteCategory;
type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  audioUri?: string;
  source?: 'voice' | 'text';
  category?: Category;
  durationSeconds?: number;
  pinned?: boolean;
  transcript?: string;
  transcriptionStatus?: 'pending' | 'ready' | 'failed';
  transcriptionError?: string;
};

const categories: Array<'All' | Category> = ['All', 'Lectures', 'Sermons', 'Meetings', 'Personal'];
const categoryColors: Record<Category, { background: string; text: string; dot: string }> = {
  Lectures: { background: '#DCEBFF', text: '#315A9A', dot: '#254A9E' },
  Sermons: { background: '#D7F7E8', text: '#24835A', dot: '#17A05E' },
  Meetings: { background: '#FFF0B2', text: '#B57500', dot: '#C77C00' },
  Personal: { background: '#EDE7FF', text: '#6D5DFB', dot: '#6D5DFB' },
};

function formatDuration(seconds?: number) {
  if (!seconds) return '00:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function NoteCard({ item, onPress, onLongPress, onDelete }: { item: Note; onPress: () => void; onLongPress: () => void; onDelete: () => void }) {
  const category = item.category ?? 'Personal';
  const colors = categoryColors[category];
  const preview = item.transcriptionStatus === 'pending'
    ? 'Transcribing your voice note…'
    : item.transcriptionStatus === 'failed'
      ? `Transcription failed: ${item.transcriptionError || 'Tap to retry.'}`
      : item.content || 'Audio voice note';
  const wordCount = item.content.trim() ? item.content.trim().split(/\s+/).length : 0;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.noteCard, pressed && styles.pressed]}>
      <View style={styles.noteTopRow}>
        <ThemedText style={[styles.categoryPill, { backgroundColor: colors.background, color: colors.text }]}>{category}</ThemedText>
        <View style={styles.noteMetaTop}>
          <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
          {item.audioUri && <ThemedText style={styles.duration}>◷ {formatDuration(item.durationSeconds)}</ThemedText>}
        </View>
      </View>
      <ThemedText style={styles.noteTitle} numberOfLines={1}>{item.title}</ThemedText>
      <ThemedText style={styles.notePreview} numberOfLines={2}>{preview}</ThemedText>
      <View style={styles.noteBottomRow}>
        <ThemedText style={styles.noteMetadata}>◷ {new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</ThemedText>
        <ThemedText style={styles.noteMetadata}>{wordCount} words</ThemedText>
        {item.pinned && <ThemedText style={styles.star}>★</ThemedText>}
        <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteButton} accessibilityLabel={`Delete ${item.title}`}><ThemedText style={styles.deleteText}>Delete</ThemedText></Pressable>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'All' | Category>('All');
  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      const refreshTimer = setInterval(loadNotes, 2000);
      return () => clearInterval(refreshTimer);
    }, []),
  );

  async function loadNotes() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setNotes(JSON.parse(saved));
    } catch {
      Alert.alert('Could not load notes', 'Please restart VoicePad and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function saveNotes(nextNotes: Note[]) {
    setNotes(nextNotes);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextNotes));
  }

  const filteredNotes = useMemo(() => notes.filter((note) => {
    const matchesCategory = selectedCategory === 'All' || (note.category ?? 'Personal') === selectedCategory;
    const query = search.trim().toLowerCase();
    return matchesCategory && (!query || `${note.title} ${note.content}`.toLowerCase().includes(query));
  }), [notes, search, selectedCategory]);
  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const recentNotes = filteredNotes.filter((note) => !note.pinned);

  function openComposer() {
    setTitle('');
    setContent('');
    setIsComposerOpen(true);
  }

  async function createNote() {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle && !cleanContent) {
      Alert.alert('Write something first', 'Add a title or a few words to create a note.');
      return;
    }
    try {
      await saveNotes([{ id: `${Date.now()}`, title: cleanTitle || 'Untitled note', content: cleanContent, createdAt: new Date().toISOString(), category: 'Personal', source: 'text' }, ...notes]);
      setIsComposerOpen(false);
    } catch {
      Alert.alert('Could not save note', 'Your note could not be saved. Please try again.');
    }
  }

  function selectNote(note: Note) {
    setSelectedNote((current) => current?.id === note.id ? null : note);
  }

  function deleteNote(note: Note) {
    Alert.alert('Delete note?', `“${note.title}” will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await saveNotes(notes.filter((item) => item.id !== note.id)); setSelectedNote(null); } },
    ]);
  }

  function renderNote({ item }: { item: Note }) {
    return <NoteCard item={item} onPress={() => router.push(`/note/${item.id}`)} onLongPress={() => selectNote(item)} onDelete={() => deleteNote(item)} />;
  }

  function sectionHeader(label: string, count: number) {
    return <View style={styles.sectionHeader}><ThemedText style={styles.sectionTitle}>{label}</ThemedText><ThemedText style={styles.countBadge}>{count}</ThemedText></View>;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={pinnedNotes.length ? [...pinnedNotes, ...recentNotes] : recentNotes}
          keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => <>{index === 0 && pinnedNotes.length > 0 && sectionHeader('Pinned', pinnedNotes.length)}{index === pinnedNotes.length && recentNotes.length > 0 && sectionHeader('Recent Notes', filteredNotes.length)}<NoteCard item={item} onPress={() => router.push(`/note/${item.id}`)} onLongPress={() => selectNote(item)} onDelete={() => deleteNote(item)} /></>}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <View style={styles.headerRow}>
                <View style={styles.avatar}><ThemedText style={styles.avatarText}>M</ThemedText></View>
                <View style={styles.greetingBlock}><ThemedText style={styles.greetingSmall}>Good evening</ThemedText><ThemedText style={styles.greetingName}>Michael</ThemedText></View>
                <View style={styles.headerSpacer} />
                <View style={styles.noteCount}><ThemedText style={styles.noteCountText}>☰ {notes.length} notes</ThemedText></View>
                <View style={styles.bell}><ThemedText style={styles.bellText}>♧</ThemedText></View>
              </View>
              <View style={styles.searchBox}><ThemedText style={styles.searchIcon}>⌕</ThemedText><TextInput value={search} onChangeText={setSearch} placeholder="Search your notes…" placeholderTextColor="#9AA4B2" style={styles.searchInput} /></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {categories.map((category) => <Pressable key={category} onPress={() => setSelectedCategory(category)} style={[styles.chip, selectedCategory === category && styles.chipSelected]}><ThemedText style={[styles.chipText, selectedCategory === category && styles.chipTextSelected]}>{category}</ThemedText></Pressable>)}
              </ScrollView>
              {isLoading && <ThemedText style={styles.loading}>Loading your notes…</ThemedText>}
              {!isLoading && filteredNotes.length === 0 && <View style={styles.emptyState}><ThemedText style={styles.emptyTitle}>Your notes start here</ThemedText><ThemedText style={styles.emptySubtitle}>Record a voice note or create a written note.</ThemedText></View>}
            </>
          }
          ListFooterComponent={<View style={{ height: 110 }} />}
        />
        <Pressable onPress={() => router.push({ pathname: '/note/record', params: { category: selectedCategory === 'All' ? 'Personal' : selectedCategory } })} style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]} accessibilityLabel="Record a voice note"><ThemedText style={styles.fabText}>♩</ThemedText></Pressable>
        {selectedNote && <View style={styles.actionTray}><View style={styles.thumbnail}><ThemedText style={styles.thumbnailText}>✦</ThemedText></View><Pressable onPress={() => Alert.alert('Share', 'Sharing will be connected in the next release.')} style={styles.actionButton}><ThemedText style={styles.actionText}>↗ Share</ThemedText></Pressable><Pressable onPress={() => { router.push(`/note/${selectedNote.id}`); setSelectedNote(null); }} style={styles.actionButton}><ThemedText style={styles.actionText}>✎ Edit</ThemedText></Pressable></View>}
      </SafeAreaView>

      <Modal visible={isComposerOpen} animationType="slide" transparent onRequestClose={() => setIsComposerOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.composer}><View style={styles.composerHeader}><ThemedText style={styles.composerTitle}>New note</ThemedText><Pressable onPress={() => setIsComposerOpen(false)}><ThemedText style={styles.closeButton}>×</ThemedText></Pressable></View><TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor="#A8A4B5" style={styles.titleInput} /><TextInput value={content} onChangeText={setContent} placeholder="Write your thought…" placeholderTextColor="#A8A4B5" style={styles.contentInput} multiline textAlignVertical="top" /><Pressable onPress={createNote} style={styles.saveButton}><ThemedText style={styles.saveButtonText}>Save note</ThemedText></Pressable></View></KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CANVAS },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0F8' },
  avatarText: { color: ACCENT, fontSize: 18, fontWeight: '800' },
  greetingBlock: { marginLeft: 14 },
  greetingSmall: { color: '#9AA4B2', fontSize: 14 },
  greetingName: { color: INK, fontSize: 19, fontWeight: '800', marginTop: 2 },
  headerSpacer: { flex: 1 },
  noteCount: { backgroundColor: '#DCE7FA', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10 },
  noteCountText: { color: ACCENT, fontWeight: '800', fontSize: 13 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', marginLeft: 10, alignItems: 'center', justifyContent: 'center' },
  bellText: { color: INK, fontSize: 22 },
  searchBox: { height: 62, backgroundColor: '#FFFFFF', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderWidth: 1, borderColor: BORDER },
  searchIcon: { color: '#8793A4', fontSize: 27, marginRight: 10 },
  searchInput: { flex: 1, color: INK, fontSize: 17 },
  chips: { gap: 10, paddingVertical: 20 },
  chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 22, paddingHorizontal: 19, paddingVertical: 11 },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: '#5F6978', fontSize: 15 },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  loading: { color: MUTED, paddingVertical: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 14, gap: 8 },
  sectionTitle: { color: INK, fontSize: 19, fontWeight: '800' },
  countBadge: { color: ACCENT, backgroundColor: '#DCE7FA', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 3, fontSize: 13, fontWeight: '800' },
  noteCard: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 14 },
  noteTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryPill: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7, fontSize: 13, fontWeight: '800' },
  noteMetaTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  duration: { color: '#7D8795', fontSize: 13 },
  noteTitle: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 16 },
  notePreview: { color: '#647080', fontSize: 15, lineHeight: 23, marginTop: 10 },
  noteBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18 },
  noteMetadata: { color: '#9AA4B2', fontSize: 13 },
  star: { marginLeft: 'auto', color: '#F28B22', fontSize: 18 },
  deleteButton: { marginLeft: 'auto', borderWidth: 1, borderColor: '#F0C4CC', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  deleteText: { color: '#C63E57', fontSize: 12, fontWeight: '800' },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 28, alignItems: 'center' },
  emptyTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  emptySubtitle: { color: MUTED, marginTop: 8 },
  fab: { position: 'absolute', alignSelf: 'center', bottom: 58, width: 70, height: 70, borderRadius: 35, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  fabPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  fabText: { color: '#FFFFFF', fontSize: 34 },
  actionTray: { position: 'absolute', left: 16, right: 16, bottom: 12, backgroundColor: '#FFFFFF', borderRadius: 30, padding: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#213047', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  thumbnail: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#EFF3F8', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  thumbnailText: { color: ACCENT, fontSize: 22 },
  actionButton: { backgroundColor: '#4C6074', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 14, marginLeft: 8 },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,21,42,0.32)' },
  composer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, minHeight: 420 },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  composerTitle: { color: INK, fontSize: 24, fontWeight: '800' },
  closeButton: { color: MUTED, fontSize: 32, lineHeight: 32 },
  titleInput: { color: INK, fontSize: 20, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 12 },
  contentInput: { color: INK, fontSize: 16, lineHeight: 24, minHeight: 150, paddingTop: 18 },
  saveButton: { backgroundColor: ACCENT, borderRadius: 16, alignItems: 'center', paddingVertical: 16, marginTop: 18 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
