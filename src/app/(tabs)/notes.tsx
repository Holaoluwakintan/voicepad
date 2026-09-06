import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getNoteCategory, loadNotes as loadStoredNotes, NOTE_CATEGORIES, Note, NoteCategory } from '@/lib/notes';

const BLUE = '#21499A';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';
const CATEGORY_COLORS: Record<NoteCategory, { background: string; text: string }> = {
  Lectures: { background: '#DCEBFF', text: '#315A9A' },
  Sermons: { background: '#D7F7E8', text: '#24835A' },
  Meetings: { background: '#FFF0B2', text: '#B57500' },
  Personal: { background: '#EDE7FF', text: '#6D5DFB' },
};

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | NoteCategory>('All');

  useFocusEffect(useCallback(() => {
    loadNotes();
  }, []));

  async function loadNotes() {
    setNotes(await loadStoredNotes());
  }

  const filtered = useMemo(() => notes.filter((note) => {
    const matchesCategory = category === 'All' || getNoteCategory(note) === category;
    const text = `${note.title} ${note.content}`.toLowerCase();
    return matchesCategory && (!query.trim() || text.includes(query.trim().toLowerCase()));
  }), [category, notes, query]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<>
            <ThemedText style={styles.eyebrow}>VOICEPAD</ThemedText>
            <ThemedText style={styles.title}>All notes</ThemedText>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search your notes…" placeholderTextColor="#9AA4B2" style={styles.search} />
            <FlatList horizontal data={['All', ...NOTE_CATEGORIES]} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} renderItem={({ item }) => <Pressable onPress={() => setCategory(item as 'All' | NoteCategory)} style={[styles.chip, category === item && styles.selectedChip]}><ThemedText style={[styles.chipText, category === item && styles.selectedText]}>{item}</ThemedText></Pressable>} />
            <ThemedText style={styles.count}>{filtered.length} {filtered.length === 1 ? 'note' : 'notes'}</ThemedText>
          </>}
          renderItem={({ item }) => { const noteCategory = getNoteCategory(item); const colors = CATEGORY_COLORS[noteCategory]; return <Pressable onPress={() => router.push(`/note/${item.id}`)} style={styles.card}><ThemedText style={[styles.category, { backgroundColor: colors.background, color: colors.text }]}>{item.pinned ? '★ ' : ''}{noteCategory}</ThemedText><ThemedText style={styles.noteTitle} numberOfLines={1}>{item.title}</ThemedText><ThemedText style={styles.preview} numberOfLines={2}>{item.content || 'Audio voice note'}</ThemedText><ThemedText style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</ThemedText></Pressable>; }}
          ListEmptyComponent={<ThemedText style={styles.empty}>No notes match this filter.</ThemedText>}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CANVAS },
  safeArea: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  eyebrow: { color: BLUE, fontSize: 12, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: INK, fontSize: 32, fontWeight: '800', marginTop: 8 },
  search: { height: 56, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, color: INK, fontSize: 16, marginTop: 24, borderWidth: 1, borderColor: BORDER },
  chips: { gap: 9, paddingVertical: 18 },
  chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 },
  selectedChip: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { color: MUTED },
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  count: { color: MUTED, fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 12 },
  category: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '800' },
  noteTitle: { color: INK, fontSize: 17, fontWeight: '800', marginTop: 10 },
  preview: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 7 },
  date: { color: '#9AA4B2', fontSize: 12, marginTop: 12 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 50 },
});
