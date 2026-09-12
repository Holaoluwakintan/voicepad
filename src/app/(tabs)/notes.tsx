import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { transcribeImage } from '@/lib/ai';
import { loadNotes, insertNote, updateNote, removeNote, Note } from '@/lib/notes';

const BLUE = '#21499A';
const ACCENT = '#6D5DFB';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';
const DANGER = '#DC2626';

type TabMode = 'write' | 'saved' | 'photo';

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
  const [tabMode, setTabMode] = useState<TabMode>('write');

  // Saved notepad notes list
  const [notepadNotes, setNotepadNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Active editor state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Photo OCR state
  const [ocrText, setOcrText] = useState('');
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrCopied, setOcrCopied] = useState(false);

  const fetchNotepadNotes = useCallback(async () => {
    try {
      const all = await loadNotes();
      // Filter notes created from Notepad or text/OCR source
      const filtered = all.filter((n) => n.source === 'text' || (!n.audioUri && !n.audioPath));
      setNotepadNotes(filtered);
    } catch {
      // Graceful fallback
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotepadNotes();
    }, [fetchNotepadNotes])
  );

  // Word & character stats for active note
  const wordCount = useMemo(() => {
    const trimmed = noteContent.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [noteContent]);

  const charCount = noteContent.length;

  // Filtered saved notes
  const displayedSavedNotes = useMemo(() => {
    if (!searchQuery.trim()) return notepadNotes;
    const q = searchQuery.trim().toLowerCase();
    return notepadNotes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notepadNotes, searchQuery]);

  // ── Editor Actions ──────────────────────────────────────────────────────────

  function handleNewNote() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setTabMode('write');
  }

  function handleOpenNote(note: Note) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
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
        // Update existing note
        await updateNote(editingNoteId, {
          title: cleanTitle,
          content: cleanContent,
        });
      } else {
        // Create new note
        const newId = `pad-${Date.now()}`;
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
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      await fetchNotepadNotes();
      Alert.alert('Saved!', 'Note saved to your Notepad archive.');
    } catch {
      Alert.alert('Error', 'Could not save the note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyNote() {
    const fullText = noteTitle ? `${noteTitle}\n\n${noteContent}` : noteContent;
    if (!fullText.trim()) return;
    await Clipboard.setStringAsync(fullText);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  async function handleShareNote(note?: Note) {
    const textToShare = note
      ? `${note.title}\n\n${note.content}`
      : noteTitle
      ? `${noteTitle}\n\n${noteContent}`
      : noteContent;
    if (!textToShare.trim()) return;
    try {
      await Share.share({ message: textToShare });
    } catch {}
  }

  function handleDeleteNote(id: string, title: string) {
    Alert.alert('Delete note?', `“${title || 'Untitled note'}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch {}
          await removeNote(id);
          if (editingNoteId === id) {
            handleNewNote();
          }
          await fetchNotepadNotes();
        },
      },
    ]);
  }

  // ── Photo OCR Actions ───────────────────────────────────────────────────────

  async function pickImage(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera permission required', 'Please enable camera access in Settings and try again.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Photo library permission required', 'Please enable photo library access in Settings and try again.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Could not read image', 'Unable to load photo data. Please try another image.');
        return;
      }

      setOcrText('');
      setOcrTitle('');
      setOcrLoading(true);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      const mimeType = asset.mimeType || 'image/jpeg';
      const ocr = await transcribeImage(asset.base64, mimeType);
      setOcrText(ocr.text);
      setOcrTitle(ocr.title);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Photo transcription failed.';
      Alert.alert('Photo transcription error', message);
    } finally {
      setOcrLoading(false);
    }
  }

  async function copyOcrText() {
    if (!ocrText.trim()) return;
    await Clipboard.setStringAsync(ocrText);
    setOcrCopied(true);
    setTimeout(() => setOcrCopied(false), 2000);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  async function saveOcrToNotepad() {
    if (!ocrText.trim()) return;
    const cleanTitle = ocrTitle || 'Photo Note';
    const newId = `ocr-${Date.now()}`;
    await insertNote({
      id: newId,
      title: cleanTitle,
      content: ocrText,
      source: 'text',
      category: 'Personal',
      createdAt: new Date().toISOString(),
      transcriptionStatus: 'ready',
    });
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    await fetchNotepadNotes();
    Alert.alert('Saved to Notepad!', 'This text is now saved in your Notepad collection.');
    // Transfer to editor
    setEditingNoteId(newId);
    setNoteTitle(cleanTitle);
    setNoteContent(ocrText);
    setTabMode('write');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          {/* Header */}
          <View style={styles.headerArea}>
            <View style={styles.headerTopRow}>
              <View>
                <ThemedText style={styles.eyebrow}>NOTEPAD WORKSPACE</ThemedText>
                <ThemedText style={styles.title}>Notepad</ThemedText>
              </View>
              {tabMode === 'write' && (
                <Pressable onPress={handleNewNote} style={styles.newNoteBtn}>
                  <ThemedText style={styles.newNoteBtnText}>+ New Note</ThemedText>
                </Pressable>
              )}
            </View>

            {/* Mode Switcher */}
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setTabMode('write')}
                style={[styles.toggleBtn, tabMode === 'write' && styles.toggleActive]}>
                <ThemedText style={[styles.toggleText, tabMode === 'write' && styles.toggleActiveText]}>
                  ✏️ Write
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setTabMode('saved')}
                style={[styles.toggleBtn, tabMode === 'saved' && styles.toggleActive]}>
                <ThemedText style={[styles.toggleText, tabMode === 'saved' && styles.toggleActiveText]}>
                  📚 Saved ({notepadNotes.length})
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setTabMode('photo')}
                style={[styles.toggleBtn, tabMode === 'photo' && styles.toggleActive]}>
                <ThemedText style={[styles.toggleText, tabMode === 'photo' && styles.toggleActiveText]}>
                  📷 Photo OCR
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* ══════════════ TAB 1: WRITE MODE ══════════════ */}
          {tabMode === 'write' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.editorCard}>
                <TextInput
                  value={noteTitle}
                  onChangeText={setNoteTitle}
                  placeholder="Note Title…"
                  placeholderTextColor="#9AA4B2"
                  style={styles.titleInput}
                />
                <TextInput
                  value={noteContent}
                  onChangeText={setNoteContent}
                  placeholder="Start typing your note here…"
                  placeholderTextColor="#9AA4B2"
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

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  disabled={isSaving}
                  onPress={handleSaveNote}
                  style={[styles.primaryActionBtn, isSaving && { opacity: 0.6 }]}>
                  <ThemedText style={styles.primaryActionText}>
                    {isSaving ? 'Saving…' : editingNoteId ? '💾 Update Note' : '💾 Save to Notepad'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!noteContent.trim()}
                  onPress={handleCopyNote}
                  style={[styles.secondaryActionBtn, !noteContent.trim() && styles.disabledBtn]}>
                  <ThemedText style={styles.secondaryActionText}>
                    {copiedMessage ? '✓ Copied!' : '📋 Copy'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!noteContent.trim()}
                  onPress={() => handleShareNote()}
                  style={[styles.secondaryActionBtn, !noteContent.trim() && styles.disabledBtn]}>
                  <ThemedText style={styles.secondaryActionText}>↗ Share</ThemedText>
                </Pressable>
              </View>

              {/* Quick Jump: Recent Saved Notes Preview */}
              {notepadNotes.length > 0 && (
                <View style={styles.recentSection}>
                  <View style={styles.recentHeader}>
                    <ThemedText style={styles.recentTitle}>Your Saved Notepad Notes</ThemedText>
                    <Pressable onPress={() => setTabMode('saved')}>
                      <ThemedText style={styles.viewAllText}>View All ({notepadNotes.length}) ➔</ThemedText>
                    </Pressable>
                  </View>
                  {notepadNotes.slice(0, 3).map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handleOpenNote(item)}
                      style={[
                        styles.miniCard,
                        editingNoteId === item.id && styles.miniCardActive,
                      ]}>
                      <View style={styles.miniCardRow}>
                        <ThemedText style={styles.miniCardTitle} numberOfLines={1}>
                          {item.title || 'Untitled note'}
                        </ThemedText>
                        <ThemedText style={styles.miniCardDate}>
                          {formatNoteDate(item.createdAt)}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.miniCardSnippet} numberOfLines={1}>
                        {item.content || 'Empty note'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* ══════════════ TAB 2: SAVED NOTES LIST ══════════════ */}
          {tabMode === 'saved' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.searchBox}>
                <ThemedText style={styles.searchIcon}>⌕</ThemedText>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search saved notepad notes…"
                  placeholderTextColor="#9AA4B2"
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
                      ? 'Try another search keyword.'
                      : 'Type writeups or extract text with Photo OCR to save notes here.'}
                  </ThemedText>
                  {!searchQuery && (
                    <Pressable onPress={handleNewNote} style={styles.createFirstBtn}>
                      <ThemedText style={styles.createFirstBtnText}>✏️ Write a Note</ThemedText>
                    </Pressable>
                  )}
                </View>
              ) : (
                displayedSavedNotes.map((note) => {
                  const words = note.content?.trim() ? note.content.trim().split(/\s+/).length : 0;
                  return (
                    <View key={note.id} style={styles.savedNoteCard}>
                      <Pressable onPress={() => handleOpenNote(note)} style={styles.savedNoteClickArea}>
                        <View style={styles.savedNoteTopRow}>
                          <ThemedText style={styles.savedNoteTitle} numberOfLines={1}>
                            {note.title || 'Untitled note'}
                          </ThemedText>
                          <ThemedText style={styles.savedNoteDate}>
                            {formatNoteDate(note.createdAt)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.savedNotePreview} numberOfLines={3}>
                          {note.content || 'Empty note'}
                        </ThemedText>
                        <ThemedText style={styles.savedNoteWords}>{words} words</ThemedText>
                      </Pressable>
                      <View style={styles.savedNoteActionsRow}>
                        <Pressable onPress={() => handleOpenNote(note)} style={styles.cardActionBtn}>
                          <ThemedText style={styles.cardActionText}>✏️ Edit</ThemedText>
                        </Pressable>
                        <Pressable onPress={() => handleShareNote(note)} style={styles.cardActionBtn}>
                          <ThemedText style={styles.cardActionText}>↗ Share</ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteNote(note.id, note.title)}
                          style={[styles.cardActionBtn, { borderColor: '#FCA5A5' }]}>
                          <ThemedText style={[styles.cardActionText, { color: DANGER }]}>
                            🗑 Delete
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* ══════════════ TAB 3: PHOTO OCR MODE ══════════════ */}
          {tabMode === 'photo' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <ThemedText style={styles.ocrInstruction}>
                Take a photo of notes, books, whiteboards, or documents. VoicePad AI will instantly
                extract and transcribe all readable text.
              </ThemedText>

              <View style={styles.photoButtonsRow}>
                <Pressable
                  disabled={ocrLoading}
                  onPress={() => pickImage(true)}
                  style={[styles.photoActionCard, ocrLoading && styles.disabledBtn]}>
                  <ThemedText style={styles.photoActionIcon}>📷</ThemedText>
                  <ThemedText style={styles.photoActionTitle}>Take Photo</ThemedText>
                  <ThemedText style={styles.photoActionSub}>Use phone camera</ThemedText>
                </Pressable>
                <Pressable
                  disabled={ocrLoading}
                  onPress={() => pickImage(false)}
                  style={[styles.photoActionCard, ocrLoading && styles.disabledBtn]}>
                  <ThemedText style={styles.photoActionIcon}>🖼️</ThemedText>
                  <ThemedText style={styles.photoActionTitle}>Upload Image</ThemedText>
                  <ThemedText style={styles.photoActionSub}>From your gallery</ThemedText>
                </Pressable>
              </View>

              {ocrLoading && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={ACCENT} />
                  <ThemedText style={styles.loadingText}>
                    Transcribing image with AI…{'\n'}
                    <ThemedText style={styles.loadingSub}>
                      Extracting text from document or photo
                    </ThemedText>
                  </ThemedText>
                </View>
              )}

              {!ocrLoading && ocrText ? (
                <View style={styles.ocrResultBox}>
                  <View style={styles.ocrResultHeader}>
                    <ThemedText style={styles.ocrResultTitle} numberOfLines={1}>
                      📄 {ocrTitle || 'Extracted Text'}
                    </ThemedText>
                    <Pressable onPress={copyOcrText} style={styles.miniCopyBtn}>
                      <ThemedText style={styles.miniCopyBtnText}>
                        {ocrCopied ? '✓ Copied!' : '📋 Copy'}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <TextInput
                    value={ocrText}
                    onChangeText={setOcrText}
                    multiline
                    style={styles.ocrTextInput}
                    textAlignVertical="top"
                    placeholderTextColor="#9AA4B2"
                  />
                  <View style={styles.ocrButtonsRow}>
                    <Pressable onPress={saveOcrToNotepad} style={styles.saveOcrBtn}>
                      <ThemedText style={styles.saveOcrBtnText}>💾 Save to Notepad</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : !ocrLoading ? (
                <View style={styles.ocrPlaceholder}>
                  <ThemedText style={styles.ocrPlaceholderIcon}>📸</ThemedText>
                  <ThemedText style={styles.ocrPlaceholderText}>
                    Snap or upload a photo to transcribe text directly into your notes.
                  </ThemedText>
                </View>
              ) : null}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CANVAS },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  headerArea: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  eyebrow: { color: BLUE, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: INK, fontSize: 28, fontWeight: '800', marginTop: 2 },
  newNoteBtn: {
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  newNoteBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E4EAF5',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  toggleText: { color: MUTED, fontSize: 13, fontWeight: '700' },
  toggleActiveText: { color: INK, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },

  // Editor Card
  editorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginTop: 8,
    shadowColor: '#182235',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '800',
    color: INK,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 10,
    marginBottom: 10,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 25,
    color: INK,
    minHeight: 220,
  },
  editorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5FB',
    paddingTop: 10,
    marginTop: 10,
  },
  statsText: { color: MUTED, fontSize: 12, fontWeight: '600' },
  editingBadge: { color: ACCENT, fontSize: 12, fontWeight: '800' },

  // Action Row
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryActionBtn: {
    flex: 2,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryActionText: { color: INK, fontSize: 13, fontWeight: '700' },
  disabledBtn: { opacity: 0.4 },

  // Recent Section in Write Tab
  recentSection: { marginTop: 24 },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentTitle: { color: INK, fontSize: 15, fontWeight: '800' },
  viewAllText: { color: BLUE, fontSize: 13, fontWeight: '700' },
  miniCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 8,
  },
  miniCardActive: { borderColor: ACCENT, borderWidth: 1.5, backgroundColor: '#F9F8FF' },
  miniCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniCardTitle: { color: INK, fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  miniCardDate: { color: MUTED, fontSize: 11 },
  miniCardSnippet: { color: MUTED, fontSize: 13, marginTop: 4 },

  // Saved Notes Tab
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    height: 48,
    marginTop: 8,
    marginBottom: 14,
  },
  searchIcon: { color: MUTED, fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: INK, fontSize: 15 },
  clearSearch: { color: MUTED, fontSize: 20, paddingHorizontal: 6 },
  savedNoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#182235',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  savedNoteClickArea: { paddingBottom: 8 },
  savedNoteTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savedNoteTitle: { color: INK, fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  savedNoteDate: { color: MUTED, fontSize: 12 },
  savedNotePreview: { color: '#4B5563', fontSize: 14, lineHeight: 21, marginTop: 8 },
  savedNoteWords: { color: MUTED, fontSize: 11, marginTop: 8, fontWeight: '600' },
  savedNoteActionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 6,
  },
  cardActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
  },
  cardActionText: { color: INK, fontSize: 12, fontWeight: '700' },
  emptySavedState: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  emptySubtitle: { color: MUTED, fontSize: 14, textAlign: 'center', maxWidth: 280 },
  createFirstBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 12,
  },
  createFirstBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Photo OCR Tab
  ocrInstruction: { color: MUTED, fontSize: 14, lineHeight: 22, marginTop: 8, marginBottom: 16 },
  photoButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  photoActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#182235',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  photoActionIcon: { fontSize: 32 },
  photoActionTitle: { color: INK, fontSize: 15, fontWeight: '800' },
  photoActionSub: { color: MUTED, fontSize: 12 },
  loadingBox: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  loadingText: { color: INK, fontSize: 16, fontWeight: '800', textAlign: 'center', lineHeight: 24 },
  loadingSub: { color: MUTED, fontSize: 13, fontWeight: '400' },
  ocrResultBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  ocrResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ocrResultTitle: { color: INK, fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  miniCopyBtn: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  miniCopyBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  ocrTextInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    fontSize: 15,
    color: INK,
    minHeight: 180,
    lineHeight: 23,
  },
  ocrButtonsRow: { flexDirection: 'row', gap: 10 },
  saveOcrBtn: {
    flex: 1,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveOcrBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  ocrPlaceholder: { alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 20 },
  ocrPlaceholderIcon: { fontSize: 52 },
  ocrPlaceholderText: { color: MUTED, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
