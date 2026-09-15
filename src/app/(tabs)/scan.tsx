/**
 * Scan — Photo to Text
 * Full dedicated tab for scanning images and extracting text.
 * Zero jargon: "Scan" and "Photo to Text" — no "OCR" mentioned to the user.
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { transcribeImage } from '@/lib/ai';
import { insertNote } from '@/lib/notes';
import { DS } from '@/constants/design';
import { generateNoteId } from '@/lib/utils';

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

export default function ScanScreen() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [extractedTitle, setExtractedTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);

  const reset = useCallback(() => {
    setScanState('idle');
    setExtractedText('');
    setExtractedTitle('');
    setErrorMessage('');
    setCopied(false);
    setSavedToNotes(false);
  }, []);

  async function pickImage(fromCamera: boolean) {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Camera permission needed',
            'Please enable camera access in Settings to scan photos.',
            [{ text: 'OK' }]
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Photo library access needed',
            'Please enable photo library access in Settings.',
            [{ text: 'OK' }]
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: true,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (!asset.base64) {
        Alert.alert('Could not read image', 'Please try a different photo.');
        return;
      }

      setExtractedText('');
      setExtractedTitle('');
      setSavedToNotes(false);
      setScanState('scanning');
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      const mimeType = asset.mimeType || 'image/jpeg';
      const ocr = await transcribeImage(asset.base64, mimeType);

      setExtractedText(ocr.text);
      setExtractedTitle(ocr.title || 'Scanned Note');
      setScanState('done');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read text from image.';
      setErrorMessage(message);
      setScanState('error');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    }
  }

  async function copyText() {
    if (!extractedText.trim()) return;
    await Clipboard.setStringAsync(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  }

  async function saveToNotes() {
    if (!extractedText.trim()) return;
    try {
      await insertNote({
        id: generateNoteId('ocr'),
        title: extractedTitle || 'Scanned Note',
        content: extractedText,
        source: 'text',
        category: 'Personal',
        createdAt: new Date().toISOString(),
        transcriptionStatus: 'ready',
      });
      setSavedToNotes(true);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.headerBlock}>
            <ThemedText style={styles.eyebrow}>PHOTO TO TEXT</ThemedText>
            <ThemedText style={styles.heroTitle}>Scan anything,{'\n'}read it instantly</ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              Point your camera at books, whiteboards, handwritten notes, or any document — VoicePad reads the text for you.
            </ThemedText>
          </Animated.View>

          {/* ─── IDLE: action cards ─── */}
          {scanState === 'idle' && (
            <Animated.View entering={FadeInUp.duration(400).delay(120)} style={styles.actionGrid}>
              <Pressable
                onPress={() => pickImage(true)}
                style={({ pressed }) => [styles.actionCard, styles.actionCardCamera, pressed && styles.pressed]}
              >
                <ThemedText style={styles.actionCardEmoji}>📷</ThemedText>
                <ThemedText style={styles.actionCardTitle}>Take a Photo</ThemedText>
                <ThemedText style={styles.actionCardSub}>Use your camera now</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => pickImage(false)}
                style={({ pressed }) => [styles.actionCard, styles.actionCardGallery, pressed && styles.pressed]}
              >
                <ThemedText style={styles.actionCardEmoji}>🖼️</ThemedText>
                <ThemedText style={styles.actionCardTitle}>Upload Image</ThemedText>
                <ThemedText style={styles.actionCardSub}>From your photo library</ThemedText>
              </Pressable>
            </Animated.View>
          )}

          {/* ─── SCANNING: loading state ─── */}
          {scanState === 'scanning' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.scanningBox}>
              <ActivityIndicator size="large" color={DS.colors.primary} />
              <ThemedText style={styles.scanningTitle}>Reading your image…</ThemedText>
              <ThemedText style={styles.scanningSubtitle}>
                AI is extracting all the text from your photo.{'\n'}This usually takes 5–15 seconds.
              </ThemedText>
              {/* Animated scanning line */}
              <View style={styles.scanLineContainer}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.scanLineDot, { opacity: 0.3 + i * 0.2 }]} />
                ))}
              </View>
            </Animated.View>
          )}

          {/* ─── DONE: results ─── */}
          {scanState === 'done' && (
            <Animated.View entering={FadeInUp.duration(350)} style={styles.resultsContainer}>
              {/* Result header */}
              <View style={styles.resultHeaderRow}>
                <View style={styles.resultTitleBlock}>
                  <ThemedText style={styles.resultLabel}>✅ Text extracted</ThemedText>
                  <ThemedText style={styles.resultTitle} numberOfLines={1}>{extractedTitle}</ThemedText>
                </View>
                <Pressable onPress={reset} style={styles.scanAgainBtn}>
                  <ThemedText style={styles.scanAgainText}>🔄 Scan again</ThemedText>
                </Pressable>
              </View>

              {/* Editable text result */}
              <View style={styles.textResultCard}>
                <TextInput
                  value={extractedText}
                  onChangeText={setExtractedText}
                  multiline
                  style={styles.textResultInput}
                  textAlignVertical="top"
                  placeholderTextColor={DS.colors.subtle}
                  placeholder="Extracted text will appear here…"
                />
              </View>

              {/* Action buttons */}
              <View style={styles.resultActions}>
                <Pressable
                  onPress={copyText}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                  <ThemedText style={styles.secondaryBtnText}>
                    {copied ? '✓ Copied!' : '📋 Copy text'}
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={saveToNotes}
                  disabled={savedToNotes}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    savedToNotes && styles.savedBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText style={styles.primaryBtnText}>
                    {savedToNotes ? '✅ Saved to Notes!' : '💾 Save to Notes'}
                  </ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* ─── ERROR: friendly error ─── */}
          {scanState === 'error' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.errorBox}>
              <ThemedText style={styles.errorEmoji}>😕</ThemedText>
              <ThemedText style={styles.errorTitle}>{"Couldn't read the image"}</ThemedText>
              <ThemedText style={styles.errorMessage}>{errorMessage}</ThemedText>
              <Pressable onPress={reset} style={styles.retryBtn}>
                <ThemedText style={styles.retryBtnText}>Try again</ThemedText>
              </Pressable>
            </Animated.View>
          )}

          {/* ─── Tips (shown in idle) ─── */}
          {scanState === 'idle' && (
            <Animated.View entering={FadeInUp.duration(400).delay(240)} style={styles.tipsSection}>
              <ThemedText style={styles.tipsTitle}>Works great with</ThemedText>
              <View style={styles.tipsGrid}>
                {[
                  { icon: '📚', label: 'Books & textbooks' },
                  { icon: '🗒️', label: 'Handwritten notes' },
                  { icon: '📋', label: 'Documents & forms' },
                  { icon: '🖊️', label: 'Whiteboards' },
                  { icon: '🎓', label: 'Lecture slides' },
                  { icon: '🧾', label: 'Receipts & menus' },
                ].map((tip) => (
                  <View key={tip.label} style={styles.tipPill}>
                    <ThemedText style={styles.tipIcon}>{tip.icon}</ThemedText>
                    <ThemedText style={styles.tipLabel}>{tip.label}</ThemedText>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 60,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },

  // Header
  headerBlock: { marginBottom: 28 },
  eyebrow: {
    color: DS.colors.primary,
    fontSize: DS.font.caption,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  heroTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.display,
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 12,
  },
  heroSubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.bodyMd,
    lineHeight: 23,
  },

  // Action cards
  actionGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 32,
  },
  actionCard: {
    flex: 1,
    borderRadius: DS.radius.lg,
    padding: 22,
    alignItems: 'center',
    ...DS.shadow.card,
  },
  actionCardCamera: {
    backgroundColor: DS.colors.primary,
  },
  actionCardGallery: {
    backgroundColor: DS.colors.surface,
    borderWidth: 1,
    borderColor: DS.colors.border,
  },
  actionCardEmoji: { fontSize: 36, marginBottom: 12 },
  actionCardTitle: {
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
    color: DS.colors.surface,
    textAlign: 'center',
    marginBottom: 4,
  },
  actionCardSub: {
    fontSize: DS.font.xxs,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  // Scanning
  scanningBox: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    padding: 36,
    alignItems: 'center',
    marginBottom: 24,
    ...DS.shadow.card,
  },
  scanningTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.h3,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 8,
  },
  scanningSubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  scanLineContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  scanLineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DS.colors.primary,
  },

  // Results
  resultsContainer: { gap: 14 },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  resultTitleBlock: { flex: 1, marginRight: 12 },
  resultLabel: {
    color: DS.colors.success,
    fontSize: DS.font.xs,
    fontWeight: '800',
    marginBottom: 4,
  },
  resultTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.h2,
    fontWeight: '800',
  },
  scanAgainBtn: {
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.sm,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  scanAgainText: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    fontWeight: '700',
  },
  textResultCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 18,
    minHeight: 220,
    ...DS.shadow.card,
  },
  textResultInput: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    lineHeight: 25,
    minHeight: 200,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 2,
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...DS.shadow.primary,
  },
  savedBtn: {
    backgroundColor: DS.colors.success,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    fontWeight: '700',
  },

  // Error
  errorBox: {
    backgroundColor: DS.colors.dangerLight,
    borderRadius: DS.radius.xl,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  errorEmoji: { fontSize: 44 },
  errorTitle: {
    color: DS.colors.danger,
    fontSize: DS.font.h3,
    fontWeight: '800',
  },
  errorMessage: {
    color: DS.colors.danger,
    fontSize: DS.font.sm,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: DS.colors.danger,
    borderRadius: DS.radius.md,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  retryBtnText: { color: '#FFFFFF', fontSize: DS.font.bodyMd, fontWeight: '800' },

  // Tips
  tipsSection: { gap: 14 },
  tipsTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
  },
  tipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.full,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...DS.shadow.card,
  },
  tipIcon: { fontSize: 15 },
  tipLabel: { color: DS.colors.muted, fontSize: DS.font.sm, fontWeight: '600' },

  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
