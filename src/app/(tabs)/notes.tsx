import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { insertNote } from '@/lib/notes';

const BLUE = '#21499A';
const ACCENT = '#6D5DFB';
const INK = '#182235';
const MUTED = '#687384';
const CANVAS = '#F1F5FB';
const BORDER = '#E1E7F0';

type Mode = 'notepad' | 'photo';

export default function NotesScreen() {
  const [mode, setMode] = useState<Mode>('notepad');

  // Notepad state
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  // Photo OCR state
  const [ocrResult, setOcrResult] = useState('');
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrCopied, setOcrCopied] = useState(false);
  const [notepadCopied, setNotepadCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // nothing to load, but hook keeps screen in sync
    }, [])
  );

  // ── Notepad helpers ──────────────────────────────────────────────────────────
  async function saveNotepadNote() {
    const text = noteText.trim();
    if (!text) {
      Alert.alert('Nothing to save', 'Write something first.');
      return;
    }
    const title = text.split(/[\n.!?]/)[0]?.trim().slice(0, 64) || 'Quick note';
    await insertNote({
      id: `note-${Date.now()}`,
      title,
      content: text,
      source: 'text',
      category: 'Personal',
      createdAt: new Date().toISOString(),
      transcriptionStatus: 'ready',
    });
    setNoteSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => setNoteSaved(false), 2500);
  }

  async function copyNotepad() {
    if (!noteText.trim()) return;
    await Clipboard.setStringAsync(noteText);
    setNotepadCopied(true);
    setTimeout(() => setNotepadCopied(false), 2000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  // ── Photo OCR helpers ────────────────────────────────────────────────────────
  async function pickImage(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera permission required', 'Allow camera access in Settings and try again.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Photo library permission required', 'Allow photo library access in Settings and try again.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          base64: true,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Could not read image', 'The image could not be read. Try again with another photo.');
        return;
      }

      setOcrResult('');
      setOcrTitle('');
      setOcrLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const mimeType = asset.mimeType || 'image/jpeg';
      const ocr = await transcribeImage(asset.base64, mimeType);
      setOcrResult(ocr.text);
      setOcrTitle(ocr.title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image transcription failed.';
      Alert.alert('Photo transcription failed', message);
    } finally {
      setOcrLoading(false);
    }
  }

  async function copyOcrText() {
    await Clipboard.setStringAsync(ocrResult);
    setOcrCopied(true);
    setTimeout(() => setOcrCopied(false), 2000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  async function saveOcrNote() {
    if (!ocrResult.trim()) return;
    await insertNote({
      id: `ocr-${Date.now()}`,
      title: ocrTitle || 'Photo Note',
      content: ocrResult,
      source: 'text',
      category: 'Personal',
      createdAt: new Date().toISOString(),
      transcriptionStatus: 'ready',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Saved!', 'The photo note has been saved to your notes.');
    setOcrResult('');
    setOcrTitle('');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}>

          {/* Header */}
          <View style={styles.headerArea}>
            <ThemedText style={styles.eyebrow}>VOICEPAD TOOLS</ThemedText>
            <ThemedText style={styles.title}>Notes & OCR</ThemedText>

            {/* Mode toggle */}
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setMode('notepad')}
                style={[styles.toggleBtn, mode === 'notepad' && styles.toggleActive]}>
                <ThemedText style={[styles.toggleText, mode === 'notepad' && styles.toggleActiveText]}>
                  ✏️  Notepad
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setMode('photo')}
                style={[styles.toggleBtn, mode === 'photo' && styles.toggleActive]}>
                <ThemedText style={[styles.toggleText, mode === 'photo' && styles.toggleActiveText]}>
                  📷  Photo OCR
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* ── NOTEPAD MODE ── */}
          {mode === 'notepad' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.modeContent}
              keyboardShouldPersistTaps="handled">
              <ThemedText style={styles.modeHint}>
                Write anything — meeting notes, ideas, reminders. Save directly to your notes.
              </ThemedText>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Start typing…"
                placeholderTextColor="#9AA4B2"
                multiline
                style={styles.notepadInput}
                textAlignVertical="top"
                autoFocus={false}
              />
              <View style={styles.actionRow}>
                <Pressable
                  onPress={copyNotepad}
                  disabled={!noteText.trim()}
                  style={[styles.secondaryActionBtn, !noteText.trim() && styles.disabledBtn]}>
                  <ThemedText style={styles.secondaryActionText}>
                    {notepadCopied ? '✓ Copied!' : '📋 Copy'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={saveNotepadNote}
                  disabled={!noteText.trim()}
                  style={[styles.primaryActionBtn, !noteText.trim() && styles.disabledBtn]}>
                  <ThemedText style={styles.primaryActionText}>
                    {noteSaved ? '✓ Saved!' : '💾 Save to Notes'}
                  </ThemedText>
                </Pressable>
              </View>
              {noteSaved && (
                <ThemedText style={styles.savedLabel}>Note saved to your archive ✓</ThemedText>
              )}
            </ScrollView>
          )}

          {/* ── PHOTO OCR MODE ── */}
          {mode === 'photo' && (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.modeContent}
              keyboardShouldPersistTaps="handled">
              <ThemedText style={styles.modeHint}>
                Take a photo or upload an image. AI will extract and transcribe all text from it.
              </ThemedText>

              <View style={styles.photoButtons}>
                <Pressable
                  onPress={() => pickImage(true)}
                  disabled={ocrLoading}
                  style={[styles.photoBtn, ocrLoading && styles.disabledBtn]}>
                  <ThemedText style={styles.photoBtnIcon}>📷</ThemedText>
                  <ThemedText style={styles.photoBtnText}>Take Photo</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => pickImage(false)}
                  disabled={ocrLoading}
                  style={[styles.photoBtn, ocrLoading && styles.disabledBtn]}>
                  <ThemedText style={styles.photoBtnIcon}>🖼️</ThemedText>
                  <ThemedText style={styles.photoBtnText}>Upload Image</ThemedText>
                </Pressable>
              </View>

              {ocrLoading && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={ACCENT} />
                  <ThemedText style={styles.loadingText}>
                    AI is reading your image…{'\n'}
                    <ThemedText style={styles.loadingNote}>This usually takes 5–15 seconds.</ThemedText>
                  </ThemedText>
                </View>
              )}

              {!ocrLoading && ocrResult ? (
                <View style={styles.ocrResultBox}>
                  <View style={styles.ocrResultHeader}>
                    <ThemedText style={styles.ocrResultTitle}>
                      📄 {ocrTitle || 'Extracted Text'}
                    </ThemedText>
                    <Pressable onPress={copyOcrText} style={styles.copyBtn}>
                      <ThemedText style={styles.copyBtnText}>
                        {ocrCopied ? '✓ Copied!' : '📋 Copy'}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <TextInput
                    value={ocrResult}
                    onChangeText={setOcrResult}
                    multiline
                    style={styles.ocrTextEdit}
                    textAlignVertical="top"
                    placeholderTextColor="#9AA4B2"
                  />
                  <Pressable onPress={saveOcrNote} style={styles.saveOcrBtn}>
                    <ThemedText style={styles.saveOcrBtnText}>💾 Save to Notes</ThemedText>
                  </Pressable>
                </View>
              ) : !ocrLoading ? (
                <View style={styles.ocrPlaceholder}>
                  <ThemedText style={styles.ocrPlaceholderIcon}>📸</ThemedText>
                  <ThemedText style={styles.ocrPlaceholderText}>
                    Pick a photo of a document, whiteboard, book, or any text to extract it instantly.
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
  headerArea: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
  eyebrow: { color: BLUE, fontSize: 12, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: INK, fontSize: 28, fontWeight: '800', marginTop: 6, marginBottom: 16 },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E4EAF5',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 13,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  toggleText: { color: MUTED, fontSize: 14, fontWeight: '700' },
  toggleActiveText: { color: INK, fontWeight: '800' },
  modeContent: { paddingHorizontal: 24, paddingBottom: 60 },
  modeHint: { color: MUTED, fontSize: 14, lineHeight: 21, marginBottom: 16, marginTop: 8 },
  // Notepad
  notepadInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    fontSize: 16,
    color: INK,
    minHeight: 260,
    lineHeight: 26,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: ACCENT,
    backgroundColor: '#FFFFFF',
  },
  secondaryActionText: { color: ACCENT, fontWeight: '800', fontSize: 15 },
  primaryActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: ACCENT,
  },
  primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  disabledBtn: { opacity: 0.4 },
  savedLabel: { color: '#16A34A', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  // Photo OCR
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  photoBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  photoBtnIcon: { fontSize: 32 },
  photoBtnText: { color: INK, fontWeight: '800', fontSize: 14 },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: INK, fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  loadingNote: { color: MUTED, fontWeight: '400', fontSize: 13 },
  ocrResultBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  ocrResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ocrResultTitle: { color: INK, fontSize: 16, fontWeight: '800', flex: 1 },
  copyBtn: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  copyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  ocrTextEdit: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    fontSize: 15,
    color: INK,
    minHeight: 160,
    lineHeight: 24,
  },
  saveOcrBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveOcrBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  ocrPlaceholder: { alignItems: 'center', paddingVertical: 60, gap: 14, paddingHorizontal: 24 },
  ocrPlaceholderIcon: { fontSize: 56 },
  ocrPlaceholderText: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 24 },
});
