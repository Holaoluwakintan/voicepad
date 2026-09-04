import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

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

const STORAGE_KEY = '@voicepad/notes';
const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#79768A';
const SURFACE = '#F5F3FA';
const BORDER = '#E8E5F0';

function VoiceNoteCard({
  item,
  onLongPress,
  onPress,
  formatDate,
}: {
  item: Note;
  onLongPress: () => void;
  onPress: () => void;
  formatDate: (dateString: string) => string;
}) {
  const isVoice = Boolean(item.audioUri);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isVoice ? `Open voice note ${item.title}` : `Open note ${item.title}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
    >
      <View style={styles.noteAccent} />
      <View style={styles.noteBody}>
        <View style={styles.noteTitleRow}>
          <ThemedText style={styles.noteTitle} numberOfLines={1}>{item.title}</ThemedText>
          {isVoice && <ThemedText style={styles.playBadge}>Open</ThemedText>}
        </View>
        <ThemedText style={styles.notePreview} numberOfLines={2}>
          {item.transcriptionStatus === 'pending'
            ? 'Transcribing your voice note…'
            : item.transcriptionStatus === 'failed'
              ? `Transcription failed: ${item.transcriptionError || 'Audio is still saved.'}`
              : item.content || 'Audio voice note'}
        </ThemedText>
        <ThemedText style={styles.noteDate}>{formatDate(item.createdAt)}</ThemedText>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      const refreshTimer = setInterval(loadNotes, 2000);
      return () => clearInterval(refreshTimer);
    }, []),
  );

  async function loadNotes() {
    try {
      const savedNotes = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedNotes) setNotes(JSON.parse(savedNotes));
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

    const note: Note = {
      id: `${Date.now()}`,
      title: cleanTitle || 'Untitled note',
      content: cleanContent,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveNotes([note, ...notes]);
      setIsComposerOpen(false);
    } catch {
      Alert.alert('Could not save note', 'Your note could not be saved. Please try again.');
    }
  }

  function deleteNote(note: Note) {
    Alert.alert('Delete note?', `“${note.title}” will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await saveNotes(notes.filter((item) => item.id !== note.id));
          } catch {
            Alert.alert('Could not delete note', 'Please try again.');
          }
        },
      },
    ]);
  }

  function formatDate(dateString: string) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  }

  function renderNote({ item }: { item: Note }) {
    return <VoiceNoteCard item={item} onPress={() => router.push(`/note/${item.id}`)} onLongPress={() => deleteNote(item)} formatDate={formatDate} />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNote}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <View style={styles.headerRow}>
                <View>
                  <ThemedText style={styles.eyebrow}>VOICEPAD</ThemedText>
                  <ThemedText style={styles.greeting}>{greeting}, Michael</ThemedText>
                </View>
                <View style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>M</ThemedText>
                </View>
              </View>

              <View style={styles.heroBlock}>
                <ThemedText style={styles.heroTitle}>
                  What would you like to remember?
                </ThemedText>
                <ThemedText style={styles.heroSubtitle}>
                  Capture the thought before it gets away.
                </ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tap to speak and create a voice note"
                onPress={() => router.push('/note/record')}
                style={({ pressed }) => [
                  styles.recordCard,
                  pressed && styles.recordCardPressed,
                ]}
              >
                <View style={styles.recordIconOuter}>
                  <View style={styles.recordIconInner}>
                    <ThemedText style={styles.plus}>＋</ThemedText>
                  </View>
                </View>
                <View style={styles.recordCopy}>
                  <ThemedText style={styles.recordTitle}>Tap to speak</ThemedText>
                  <ThemedText style={styles.recordSubtitle}>
                    Turn your voice into an organized note
                  </ThemedText>
                </View>
                <ThemedText style={styles.arrow}>›</ThemedText>
              </Pressable>

              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Recent notes</ThemedText>
                <ThemedText style={styles.sectionMeta}>
                  {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </ThemedText>
              </View>

              {isLoading && (
                <ThemedText style={styles.statusText}>Loading your notes…</ThemedText>
              )}

              {!isLoading && notes.length === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <ThemedText style={styles.emptyIconText}>✦</ThemedText>
                  </View>
                  <ThemedText style={styles.emptyTitle}>Your ideas start here</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    Create your first text note, or use the purple card above to record your voice.
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create your first note"
                    onPress={openComposer}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  >
                    <ThemedText style={styles.secondaryButtonText}>Create first note</ThemedText>
                  </Pressable>
                </View>
              )}
            </>
          }
          ListFooterComponent={
            notes.length > 0 ? (
              <ThemedText style={styles.footerHint}>Long-press a note to delete it.</ThemedText>
            ) : null
          }
        />
      </SafeAreaView>

      <Modal visible={isComposerOpen} animationType="slide" transparent onRequestClose={() => setIsComposerOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.composer}>
            <View style={styles.composerHeader}>
              <ThemedText style={styles.composerTitle}>New note</ThemedText>
              <Pressable onPress={() => setIsComposerOpen(false)} accessibilityLabel="Close note composer">
                <ThemedText style={styles.closeButton}>×</ThemedText>
              </Pressable>
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor="#A8A4B5"
              style={styles.titleInput}
              autoFocus
              maxLength={120}
            />
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Write your thought…"
              placeholderTextColor="#A8A4B5"
              style={styles.contentInput}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save note"
              onPress={createNote}
              style={({ pressed }) => [styles.saveButton, pressed && styles.recordCardPressed]}
            >
              <ThemedText style={styles.saveButtonText}>Save note</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEFF' },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: ACCENT, fontSize: 12, fontWeight: '800', letterSpacing: 2.4 },
  greeting: { color: INK, fontSize: 26, lineHeight: 34, fontWeight: '800', marginTop: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E9E5FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: ACCENT, fontSize: 16, fontWeight: '800' },
  heroBlock: { marginTop: 48, marginBottom: 24 },
  heroTitle: { color: INK, fontSize: 34, lineHeight: 42, fontWeight: '800', maxWidth: 560 },
  heroSubtitle: { color: MUTED, fontSize: 16, lineHeight: 24, marginTop: 10 },
  recordCard: { minHeight: 116, borderRadius: 28, backgroundColor: ACCENT, padding: 20, flexDirection: 'row', alignItems: 'center', shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  recordCardPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  recordIconOuter: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  recordIconInner: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  plus: { color: ACCENT, fontSize: 28, lineHeight: 30 },
  recordCopy: { flex: 1, marginLeft: 16 },
  recordTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontWeight: '800' },
  recordSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 4 },
  arrow: { color: '#FFFFFF', fontSize: 34, fontWeight: '300', marginLeft: 12 },
  sectionHeader: { marginTop: 42, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { color: INK, fontSize: 20, fontWeight: '800' },
  sectionMeta: { color: MUTED, fontSize: 13 },
  statusText: { color: MUTED, paddingVertical: 24, textAlign: 'center' },
  emptyState: { borderWidth: 1, borderColor: BORDER, borderRadius: 24, backgroundColor: SURFACE, paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center' },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#E9E5FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIconText: { color: ACCENT, fontSize: 24 },
  emptyTitle: { color: INK, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: { color: MUTED, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 420, marginTop: 8 },
  secondaryButton: { marginTop: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  secondaryButtonText: { color: ACCENT, fontSize: 14, fontWeight: '800' },
  noteCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, borderRadius: 20, marginBottom: 12, overflow: 'hidden' },
  noteCardPressed: { opacity: 0.72 },
  noteAccent: { width: 5, backgroundColor: ACCENT },
  noteBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 15 },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteTitle: { color: INK, fontSize: 16, fontWeight: '800', flex: 1 },
  playBadge: { color: ACCENT, fontSize: 12, fontWeight: '800' },
  notePreview: { color: MUTED, fontSize: 14, lineHeight: 20, marginTop: 5 },
  noteDate: { color: '#9B97AA', fontSize: 12, marginTop: 9 },
  footerHint: { color: '#9B97AA', fontSize: 12, textAlign: 'center', marginTop: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23,21,42,0.32)' },
  composer: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, minHeight: 420 },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  composerTitle: { color: INK, fontSize: 24, fontWeight: '800' },
  closeButton: { color: MUTED, fontSize: 32, lineHeight: 32 },
  titleInput: { color: INK, fontSize: 20, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 12 },
  contentInput: { color: INK, fontSize: 16, lineHeight: 24, minHeight: 150, paddingTop: 18 },
  saveButton: { backgroundColor: ACCENT, borderRadius: 16, alignItems: 'center', paddingVertical: 16, marginTop: 18 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});

