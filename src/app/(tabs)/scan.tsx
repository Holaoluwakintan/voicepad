/**
 * Scan — Photo to Text
 * Full dedicated tab for scanning images and extracting text.
 * Zero jargon: "Scan" and "Photo to Text" — no "OCR" mentioned to the user.
 */
import { useCallback, useEffect, useState } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { BookOpen, Camera, Check, ClipboardCopy, FileText, Image as ImageIcon, Images, NotebookPen, Presentation, Receipt, RefreshCw, Save } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { transcribeImage } from '@/lib/ai';
import { insertNote } from '@/lib/notes';
import { DS, displayType } from '@/constants/design';
import { AuroraBackdrop, PressableScale } from '@/components/premium-ui';
import { generateNoteId, toFriendlyErrorMessage } from '@/lib/utils';

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

const TIPS = [
  { Icon: BookOpen, label: 'Books' },
  { Icon: NotebookPen, label: 'Handwriting' },
  { Icon: FileText, label: 'Documents' },
  { Icon: Presentation, label: 'Slides & boards' },
  { Icon: Receipt, label: 'Receipts' },
  { Icon: Images, label: 'Screenshots' },
] as const;

/** Viewfinder with corner brackets and a sweeping scan line. */
function Viewfinder({ active }: { active: boolean }) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(withRepeat(withTiming(1, { duration: active ? 1400 : 2600, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [active, sweep]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.get() * 128 }], opacity: active ? 1 : 0.55 }));
  return (
    <View style={vf.frame}>
      <View style={[vf.corner, vf.tl]} />
      <View style={[vf.corner, vf.tr]} />
      <View style={[vf.corner, vf.bl]} />
      <View style={[vf.corner, vf.br]} />
      <View style={vf.page}>
        {[0.92, 0.78, 0.86, 0.6, 0.82, 0.7].map((w, k) => (
          <View key={k} style={[vf.textLine, { width: `${w * 100}%` }]} />
        ))}
      </View>
      <Animated.View style={[vf.scanLine, lineStyle]} />
    </View>
  );
}

const vf = StyleSheet.create({
  frame: { width: 190, height: 150, alignSelf: 'center', padding: 14, marginVertical: 6 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#FFFFFF' },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  page: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, gap: 9, justifyContent: 'center' },
  textLine: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' },
  scanLine: {
    position: 'absolute', left: 8, right: 8, top: 10, height: 2, borderRadius: 1,
    backgroundColor: '#8B80FF', shadowColor: '#8B80FF', shadowOpacity: 0.9, shadowRadius: 8, elevation: 4,
  },
});

export default function ScanScreen() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [extractedTitle, setExtractedTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);

  const reset = useCallback(() => {
    setScanState('idle');
    setScanProgress(null);
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
        // Support picking multiple pages or books simultaneously (up to 20 at once)
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          allowsMultipleSelection: true,
          selectionLimit: 20,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      // Images are read one page at a time below. Asking the picker for base64 of
      // up to 20 full-resolution photos at once holds them all in JS memory and
      // crashes low-RAM Android phones.
      const validAssets = result.assets.filter((a) => Boolean(a.uri));
      if (validAssets.length === 0) {
        Alert.alert('Could not read image', 'Please select a valid image file.');
        return;
      }

      setExtractedText('');
      setExtractedTitle('');
      setSavedToNotes(false);
      setScanState('scanning');
      setScanProgress({ current: 1, total: validAssets.length });
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      const pageTexts: { page: number; text: string }[] = [];
      const failedPages: number[] = [];
      for (let i = 0; i < validAssets.length; i++) {
        setScanProgress({ current: i + 1, total: validAssets.length });
        const asset = validAssets[i];
        const mimeType = asset.mimeType || 'image/jpeg';
        try {
          const base64 = asset.base64 ?? await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const ocr = await transcribeImage(base64, mimeType);
          if (ocr.text.trim()) {
            pageTexts.push({ page: i + 1, text: ocr.text.trim() });
          }
        } catch (pageErr) {
          failedPages.push(i + 1);
          console.warn(`Error transcribing page ${i + 1}`, pageErr);
        }
      }

      if (pageTexts.length === 0) {
        throw new Error('No readable text could be extracted from the selected images. Please ensure the photos are clear.');
      }

      let finalTitle = '';
      let combinedContent = '';

      if (pageTexts.length === 1) {
        finalTitle = pageTexts[0].text.split('\n')[0]?.trim().slice(0, 50) || 'Scanned Note';
        combinedContent = pageTexts[0].text;
      } else {
        finalTitle = `Book / Multi-Page Scan (${pageTexts.length} pages)`;
        combinedContent = pageTexts
          .map((p) => `### 📖 Page ${p.page}\n\n${p.text}`)
          .join('\n\n---\n\n');
      }

      if (failedPages.length > 0) {
        combinedContent += `\n\n[Pages not read: ${failedPages.join(', ')}. Retry those pages with clearer photos.]`;
      }
      setExtractedText(combinedContent);
      setExtractedTitle(finalTitle);
      setScanState('done');
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    } catch (err) {
      const message = toFriendlyErrorMessage(err, 'Could not read text from the selected image(s). Please try again.');
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

  const progressPct = scanProgress && scanProgress.total > 0 ? Math.round(((scanProgress.current - 1) / scanProgress.total) * 100) : 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(360)} style={styles.headerBlock}>
            <ThemedText style={styles.eyebrow}>Photo to text</ThemedText>
            <ThemedText style={styles.heroTitle}>Scan</ThemedText>
            <ThemedText style={styles.heroSubtitle}>Books, handwriting, whiteboards, slides. Snap it and VoicePad types it out.</ThemedText>
          </Animated.View>

          {/* ─── IDLE / SCANNING: studio card ─── */}
          {(scanState === 'idle' || scanState === 'scanning') && (
            <Animated.View entering={FadeInUp.duration(380).delay(80)} style={styles.studioCard}>
              <AuroraBackdrop variant="teal" intensity={0.8} />
              <Viewfinder active={scanState === 'scanning'} />

              {scanState === 'idle' ? (
                <>
                  <PressableScale onPress={() => pickImage(true)} style={styles.primaryCta} accessibilityRole="button" accessibilityLabel="Take a photo">
                    <Camera size={19} color={DS.colors.ink} strokeWidth={2.3} />
                    <ThemedText style={styles.primaryCtaText}>Take a photo</ThemedText>
                  </PressableScale>
                  <PressableScale onPress={() => pickImage(false)} style={styles.glassCta} accessibilityRole="button" accessibilityLabel="Choose photos from gallery">
                    <Images size={18} color={DS.colors.white} strokeWidth={2.2} />
                    <ThemedText style={styles.glassCtaText}>Choose from gallery</ThemedText>
                    <View style={styles.ctaBadge}><ThemedText style={styles.ctaBadgeText}>up to 20 pages</ThemedText></View>
                  </PressableScale>
                </>
              ) : (
                <View style={styles.scanningBox}>
                  <ThemedText style={styles.scanningTitle}>
                    {scanProgress && scanProgress.total > 1
                      ? `Reading page ${scanProgress.current} of ${scanProgress.total}`
                      : 'Reading your page'}
                  </ThemedText>
                  <ThemedText style={styles.scanningSubtitle}>
                    {scanProgress && scanProgress.total > 1 ? 'Keep the app open while the pages are read.' : 'Usually just a few seconds.'}
                  </ThemedText>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.max(8, progressPct)}%` }]} />
                  </View>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 12 }} />
                </View>
              )}
            </Animated.View>
          )}

          {/* ─── DONE: results ─── */}
          {scanState === 'done' && (
            <Animated.View entering={FadeInUp.duration(320)} style={styles.resultsContainer}>
              <View style={styles.resultHeaderRow}>
                <View style={styles.resultTitleBlock}>
                  <View style={styles.inlineRow}>
                    <View style={styles.checkBadge}><Check size={12} color={DS.colors.white} strokeWidth={3} /></View>
                    <ThemedText style={styles.resultLabel}>Text ready · edit before saving</ThemedText>
                  </View>
                  <ThemedText style={styles.resultTitle} numberOfLines={2}>{extractedTitle}</ThemedText>
                </View>
                <Pressable onPress={reset} style={styles.scanAgainBtn} accessibilityRole="button" hitSlop={6}>
                  <RefreshCw size={14} color={DS.colors.ink} strokeWidth={2.3} />
                  <ThemedText style={styles.scanAgainText}>New scan</ThemedText>
                </Pressable>
              </View>

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

              <View style={styles.resultActions}>
                <PressableScale onPress={copyText} style={styles.secondaryBtn} accessibilityRole="button">
                  <ClipboardCopy size={17} color={DS.colors.ink} strokeWidth={2.2} />
                  <ThemedText style={styles.secondaryBtnText}>{copied ? 'Copied' : 'Copy'}</ThemedText>
                </PressableScale>
                <PressableScale
                  onPress={saveToNotes}
                  disabled={savedToNotes}
                  style={[styles.primaryBtn, savedToNotes && styles.savedBtn]}
                  accessibilityRole="button"
                >
                  {savedToNotes ? <Check size={17} color={DS.colors.white} strokeWidth={2.6} /> : <Save size={17} color={DS.colors.white} strokeWidth={2.2} />}
                  <ThemedText style={styles.primaryBtnText}>{savedToNotes ? 'Saved to Notes' : 'Save to Notes'}</ThemedText>
                </PressableScale>
              </View>
            </Animated.View>
          )}

          {/* ─── ERROR ─── */}
          {scanState === 'error' && (
            <Animated.View entering={FadeIn.duration(280)} style={styles.errorBox}>
              <View style={styles.errorEmoji}><ImageIcon size={24} color={DS.colors.danger} strokeWidth={2.1} /></View>
              <ThemedText style={styles.errorTitle}>{"Couldn't read that one"}</ThemedText>
              <ThemedText style={styles.errorMessage}>{errorMessage}</ThemedText>
              <PressableScale onPress={reset} style={styles.retryBtn} accessibilityRole="button">
                <ThemedText style={styles.retryBtnText}>Try again</ThemedText>
              </PressableScale>
            </Animated.View>
          )}

          {/* ─── Tips ─── */}
          {scanState === 'idle' && (
            <Animated.View entering={FadeInUp.duration(380).delay(180)} style={styles.tipsSection}>
              <ThemedText style={styles.tipsTitle}>Works great with</ThemedText>
              <View style={styles.tipsGrid}>
                {TIPS.map(({ Icon, label }) => (
                  <View key={label} style={styles.tipPill}>
                    <Icon size={16} color={DS.colors.primary} strokeWidth={2} />
                    <ThemedText style={styles.tipLabel}>{label}</ThemedText>
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
  scroll: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  headerBlock: { marginBottom: 18 },
  eyebrow: { color: DS.colors.subtle, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  heroTitle: { color: DS.colors.ink, ...displayType(46), marginTop: 2 },
  heroSubtitle: { color: DS.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 4, maxWidth: 340 },

  studioCard: {
    borderRadius: 30, padding: 20, paddingTop: 26, overflow: 'hidden',
    backgroundColor: DS.colors.night, ...DS.shadow.floating,
  },
  primaryCta: {
    marginTop: 22, height: 54, borderRadius: 18, backgroundColor: DS.colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  primaryCtaText: { color: DS.colors.ink, fontSize: 16, fontWeight: '800' },
  glassCta: {
    marginTop: 10, height: 54, borderRadius: 18, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  glassCtaText: { color: DS.colors.white, fontSize: 15, fontWeight: '700' },
  ctaBadge: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  ctaBadgeText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' },

  scanningBox: { alignItems: 'center', marginTop: 18, paddingBottom: 4 },
  scanningTitle: { color: DS.colors.white, ...displayType(28), textAlign: 'center' },
  scanningSubtitle: { color: DS.colors.nightMuted, fontSize: 14, marginTop: 4, textAlign: 'center' },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 16, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#8B80FF' },

  resultsContainer: { gap: 12 },
  resultHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  resultTitleBlock: { flex: 1 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  checkBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: DS.colors.success, alignItems: 'center', justifyContent: 'center' },
  resultLabel: { color: DS.colors.success, fontSize: 12.5, fontWeight: '700' },
  resultTitle: { color: DS.colors.ink, ...displayType(30), marginTop: 6 },
  scanAgainBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.colors.surface,
    borderWidth: 1, borderColor: DS.colors.border, borderRadius: 999, paddingHorizontal: 12, height: 36,
  },
  scanAgainText: { color: DS.colors.ink, fontSize: 13, fontWeight: '700' },
  textResultCard: {
    backgroundColor: DS.colors.surface, borderRadius: 22, borderWidth: 1, borderColor: DS.colors.border,
    padding: 16, ...DS.shadow.card,
  },
  textResultInput: { color: DS.colors.ink, fontSize: 16, lineHeight: 24, minHeight: 260, padding: 0 },
  resultActions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, height: 54, borderRadius: 18, backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryBtnText: { color: DS.colors.ink, fontSize: 15, fontWeight: '700' },
  primaryBtn: {
    flex: 1.6, height: 54, borderRadius: 18, backgroundColor: DS.colors.ink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  savedBtn: { backgroundColor: DS.colors.success },
  primaryBtnText: { color: DS.colors.white, fontSize: 15, fontWeight: '800' },

  errorBox: {
    alignItems: 'center', backgroundColor: DS.colors.surface, borderRadius: 26, padding: 26,
    borderWidth: 1, borderColor: DS.colors.border,
  },
  errorEmoji: { width: 56, height: 56, borderRadius: 28, backgroundColor: DS.colors.dangerLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  errorTitle: { color: DS.colors.ink, ...displayType(28), textAlign: 'center' },
  errorMessage: { color: DS.colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  retryBtn: { marginTop: 18, backgroundColor: DS.colors.ink, borderRadius: 999, paddingHorizontal: 26, height: 48, justifyContent: 'center' },
  retryBtnText: { color: DS.colors.white, fontSize: 15, fontWeight: '700' },

  tipsSection: { marginTop: 22 },
  tipsTitle: { color: DS.colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 12 },
  tipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DS.colors.surface,
    borderWidth: 1, borderColor: DS.colors.border, borderRadius: 999, paddingHorizontal: 13, height: 38,
  },
  tipLabel: { color: DS.colors.inkSoft, fontSize: 13, fontWeight: '600' },
});
