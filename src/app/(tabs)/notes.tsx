import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getNoteCategory, loadNotes as loadStoredNotes, NOTE_CATEGORIES, Note, NoteCategory, formatDuration } from '@/lib/notes';
import { CategoryColors } from '@/constants/theme';

const BLUE = '#21499A';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';

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

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | NoteCategory>('All');

  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [])
  );

  async function loadNotes() {
    setNotes(await loadStoredNotes());
  }

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      const matchesCategory = category === 'All' || getNoteCategory(note) === category;
      const text = `${note.title} ${note.content} ${note.summary || ''}`.toLowerCase();
      return matchesCategory && (!query.trim() || text.includes(query.trim().toLowerCase()));
    });
  }, [category, notes, query]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <ThemedText style={styles.eyebrow}>VOICEPAD ARCHIVE</ThemedText>
              <ThemedText style={styles.title}>All Notes</ThemedText>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search notes, audio, or summaries…"
                placeholderTextColor="#9AA4B2"
                style={styles.search}
              />
              <FlatList
                horizontal
                data={['All', ...NOTE_CATEGORIES]}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                renderItem={({ item }) => {
                  const catColor = item !== 'All' ? CategoryColors[item as NoteCategory] : null;
                  const isSelected = category === item;
                  return (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setCategory(item as 'All' | NoteCategory);
                      }}
                      style={[
                        styles.chip,
                        isSelected && styles.selectedChip,
                        isSelected && catColor ? { backgroundColor: catColor.badgeText, borderColor: catColor.badgeText } : null,
                      ]}>
                      <ThemedText style={[styles.chipText, isSelected && styles.selectedText]}>
                        {catColor ? `${catColor.icon} ` : ''}
                        {item}
                      </ThemedText>
                    </Pressable>
                  );
                }}
              />
              <ThemedText style={styles.count}>
                {filtered.length} {filtered.length === 1 ? 'note' : 'notes'}
              </ThemedText>
            </>
          }
          renderItem={({ item, index }) => {
            const noteCategory = getNoteCategory(item);
            const colors = CategoryColors[noteCategory] ?? CategoryColors.Personal;
            const hasAudio = Boolean(item.audioUri || item.audioPath);

            return (
              <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index * 30, 180))}>
                <Pressable
                  onPress={() => router.push(`/note/${item.id}`)}
                  style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.categoryBadge, { backgroundColor: colors.badgeBg, borderColor: colors.border }]}>
                      <ThemedText style={styles.categoryIcon}>{colors.icon}</ThemedText>
                      <ThemedText style={[styles.categoryText, { color: colors.badgeText }]}>
                        {item.pinned ? '★ ' : ''}
                        {noteCategory}
                      </ThemedText>
                    </View>
                    {hasAudio && (
                      <ThemedText style={styles.duration}>
                        ⏱ {formatDuration(item.durationSeconds)}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.noteTitle} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.preview} numberOfLines={2}>
                    {item.summary ? `✨ ${item.summary.replace(/^###[^\n]+\n/g, '').slice(0, 120)}…` : item.content || 'Audio voice note'}
                  </ThemedText>
                  <ThemedText style={styles.date}>{formatNoteDate(item.createdAt)}</ThemedText>
                </Pressable>
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyText}>No notes match this search filter.</ThemedText>
            </View>
          }
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
  title: { color: INK, fontSize: 30, fontWeight: '800', marginTop: 8 },
  search: { height: 56, backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, color: INK, fontSize: 16, marginTop: 22, borderWidth: 1, borderColor: BORDER },
  chips: { gap: 9, paddingVertical: 18 },
  chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  selectedChip: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  count: { color: MUTED, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 18, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  categoryIcon: { fontSize: 11 },
  categoryText: { fontSize: 12, fontWeight: '800' },
  duration: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  noteTitle: { color: INK, fontSize: 17, fontWeight: '800', marginTop: 12 },
  preview: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 7 },
  date: { color: '#9AA4B2', fontSize: 12, marginTop: 12 },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { color: MUTED, fontSize: 15 },
});
