/**
 * Home — the VoicePad studio: a midnight hero with quick capture, search,
 * filters and the live feed of voice notes.
 */
import { ReactNode, useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  AlertTriangle,
  Camera,
  Clock3,
  Mic,
  PenLine,
  Pencil,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AuroraBackdrop, PressableScale } from '@/components/premium-ui';
import { loadNotes, insertNote, removeNote, Note, NoteCategory, formatDuration } from '@/lib/notes';
import { deleteAudioFromCloud } from '@/lib/storage';
import { AdMobBanner } from '@/components/admob-banner';
import { useAuth } from '@/lib/auth';
import { DS, displayType } from '@/constants/design';
import { formatNoteDate, generateNoteId } from '@/lib/utils';

const categories: ('All' | NoteCategory)[] = ['All', 'Lectures', 'Sermons', 'Meetings', 'Personal'];

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function cleanPreview(item: Note) {
  if (item.summary) {
    return item.summary
      .replace(/^#+[^\n]*\n/gm, '')
      .replace(/[*_`#>]|\[ \]|\[x\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 170);
  }
  return item.content?.trim() || 'Voice note';
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({
  item,
  index,
  onPress,
  onLongPress,
  onRetry,
}: {
  item: Note;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  onRetry: () => void;
}) {
  const catData = DS.category[item.category ?? 'Personal'] ?? DS.category.Personal;
  const isPending = item.transcriptionStatus === 'pending';
  const isFailed = item.transcriptionStatus === 'failed';
  const hasAudio = Boolean(item.audioUri || item.audioPath);
  const wordCount = item.content?.trim() ? item.content.trim().split(/\s+/).length : 0;

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index * 35, 210))}>
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.noteCard}
        accessibilityRole="button"
        accessibilityLabel={`Note: ${item.title || 'Untitled'}. Category: ${item.category ?? 'Personal'}. ${isFailed ? 'Transcription failed' : isPending ? 'Transcribing' : 'Ready'}`}
        accessibilityHint="Double tap to open note details, press and hold for actions"
      >
        <View style={styles.cardTopRow}>
          <View style={[styles.categoryDot, { backgroundColor: catData.accent }]} />
          <ThemedText style={[styles.categoryLabel, { color: catData.badgeText }]}>
            {item.category ?? 'Personal'}
          </ThemedText>
          <ThemedText style={styles.cardDate}>· {formatNoteDate(item.createdAt)}</ThemedText>
          <View style={{ flex: 1 }} />
          {item.pinned && <Pin size={13} color={DS.colors.primary} strokeWidth={2.4} />}
        </View>

        <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.title || 'Untitled note'}</ThemedText>

        {isPending ? (
          <View style={styles.statusRow}>
            <View style={styles.pulseDot} />
            <ThemedText style={styles.cardPending}>Transcribing your voice note…</ThemedText>
          </View>
        ) : isFailed ? (
          <View style={styles.failBox}>
            <AlertTriangle size={15} color={DS.colors.danger} strokeWidth={2.2} />
            <ThemedText style={styles.cardFailed} numberOfLines={2}>
              {item.transcriptionError || 'Transcription failed.'}
            </ThemedText>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onRetry(); }}
              style={styles.retryChip}
              accessibilityLabel="Retry transcription"
              accessibilityRole="button"
              hitSlop={8}
            >
              <RotateCcw size={13} color={DS.colors.white} strokeWidth={2.6} />
              <ThemedText style={styles.retryChipText}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ThemedText style={styles.cardPreview} numberOfLines={2}>{cleanPreview(item)}</ThemedText>
        )}

        <View style={styles.cardBottomRow}>
          {hasAudio && (
            <View style={styles.metaChip}>
              <Clock3 size={12} color={DS.colors.muted} strokeWidth={2.2} />
              <ThemedText style={styles.metaChipText}>{formatDuration(item.durationSeconds)}</ThemedText>
            </View>
          )}
          {wordCount > 0 && (
            <View style={styles.metaChip}>
              <ThemedText style={styles.metaChipText}>{wordCount.toLocaleString()} words</ThemedText>
            </View>
          )}
          {item.summary && (
            <View style={[styles.metaChip, styles.aiChip]}>
              <Sparkles size={12} color={DS.colors.primary} strokeWidth={2.4} />
              <ThemedText style={[styles.metaChipText, { color: DS.colors.primary }]}>AI summary</ThemedText>
            </View>
          )}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionTitle}>{label}</ThemedText>
      <ThemedText style={styles.sectionCount}>{count}</ThemedText>
      <View style={styles.sectionRule} />
    </View>
  );
}

function QuickAction({ icon, label, tone, onPress }: { icon: ReactNode; label: string; tone: 'record' | 'glass'; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }}
      style={[styles.quickAction, tone === 'record' ? styles.quickRecord : styles.quickGlass]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <ThemedText style={styles.quickLabel}>{label}</ThemedText>
    </PressableScale>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    (user?.email ? user.email.split('@')[0] : '');
  const firstName = userName ? String(userName).split(' ')[0] : '';
  const userInitial = ((userName || 'V')[0] || 'V').toUpperCase();
  const greeting = greetingFor(new Date());
  const recordCategory = selectedCategory === 'All' ? 'Personal' : selectedCategory;

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
          if (note.audioPath) await deleteAudioFromCloud(note.audioPath);
          setSelectedNote(null);
          await fetchNotes();
        },
      },
    ]);
  }

  async function retryNote(note: Note) {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    router.push(`/note/${note.id}`);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FlatList
          data={[...pinnedNotes, ...recentNotes]}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={DS.colors.primary} colors={[DS.colors.primary]} />
          }
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
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
                onRetry={() => retryNote(item)}
              />
            </>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* ─── Top bar ─── */}
              <View style={styles.topBar}>
                <View style={styles.brandMark}>
                  <View style={styles.brandDot} />
                  <ThemedText style={styles.brandText}>VoicePad</ThemedText>
                </View>
                <Pressable
                  onPress={() => router.push('/profile')}
                  style={styles.avatar}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  <ThemedText style={styles.avatarText}>{userInitial}</ThemedText>
                </Pressable>
              </View>

              {/* ─── Hero ─── */}
              <Animated.View entering={FadeIn.duration(420)} style={styles.heroCard}>
                <AuroraBackdrop />
                <ThemedText style={styles.heroEyebrow}>{greeting}{firstName ? ',' : ''}</ThemedText>
                <ThemedText style={styles.heroTitle} numberOfLines={2}>
                  {firstName ? firstName : 'What will you'}
                  {firstName ? '' : ' '}
                  {firstName ? null : <ThemedText style={styles.heroTitleItalic}>capture?</ThemedText>}
                </ThemedText>
                <ThemedText style={styles.heroSub}>
                  {notes.length === 0
                    ? 'Record a lecture, sermon or meeting. VoicePad writes it down and sums it up.'
                    : `${notes.length} note${notes.length === 1 ? '' : 's'} · ${voiceCount} voice · ${aiCount} AI summar${aiCount === 1 ? 'y' : 'ies'}`}
                </ThemedText>

                <View style={styles.quickRow}>
                  <QuickAction
                    tone="record"
                    label="Record"
                    icon={<Mic size={20} color={DS.colors.white} strokeWidth={2.4} />}
                    onPress={() => router.push({ pathname: '/note/record', params: { category: recordCategory } })}
                  />
                  <QuickAction
                    tone="glass"
                    label="Scan"
                    icon={<Camera size={20} color={DS.colors.white} strokeWidth={2.2} />}
                    onPress={() => router.push('/scan')}
                  />
                  <QuickAction
                    tone="glass"
                    label="Write"
                    icon={<PenLine size={20} color={DS.colors.white} strokeWidth={2.2} />}
                    onPress={() => setIsComposerOpen(true)}
                  />
                </View>
              </Animated.View>

              <AdMobBanner />

              {/* Search */}
              <View style={styles.searchBox}>
                <Search size={18} color={DS.colors.subtle} strokeWidth={2.2} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search notes and summaries"
                  placeholderTextColor={DS.colors.subtle}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                    <X size={17} color={DS.colors.muted} strokeWidth={2.2} />
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: filterSource === mode }}
                    accessibilityLabel={mode === 'voice' ? `Show only voice notes, ${voiceCount} total` : `Show all notes, ${notes.length} total`}
                    style={[styles.toggleBtn, filterSource === mode && styles.toggleBtnActive]}
                  >
                    <ThemedText style={[styles.toggleBtnText, filterSource === mode && styles.toggleBtnTextActive]}>
                      {mode === 'voice' ? `Voice notes · ${voiceCount}` : `Everything · ${notes.length}`}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsScroll}>
                {categories.map((cat) => {
                  const catData = cat !== 'All' ? DS.category[cat] : null;
                  const isActive = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => handleCategorySelect(cat)}
                      accessibilityLabel={`Filter notes by ${cat}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={[styles.chip, isActive && styles.chipActive]}
                    >
                      {catData && <View style={[styles.chipDot, { backgroundColor: catData.accent }]} />}
                      <ThemedText style={[styles.chipText, isActive && styles.chipTextActive]}>{cat}</ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {isLoading && (
                <View style={styles.skeletonWrap}>
                  {[0, 1, 2].map((k) => <View key={k} style={styles.skeletonCard} />)}
                </View>
              )}

              {!isLoading && filteredNotes.length === 0 && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Mic size={28} color={DS.colors.orange} strokeWidth={2.2} /></View>
                  <ThemedText style={styles.emptyTitle}>{search || selectedCategory !== 'All' ? 'Nothing matches yet' : 'Your first note starts here'}</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    {search || selectedCategory !== 'All'
                      ? 'Try another search or category.'
                      : 'Tap Record and talk. VoicePad transcribes it and writes an AI summary for you.'}
                  </ThemedText>
                  <PressableScale
                    onPress={() => router.push({ pathname: '/note/record', params: { category: recordCategory } })}
                    style={styles.emptyCta}
                    accessibilityRole="button"
                  >
                    <Mic size={17} color={DS.colors.white} strokeWidth={2.5} />
                    <ThemedText style={styles.emptyCtaText}>Start recording</ThemedText>
                  </PressableScale>
                  <Pressable onPress={() => router.push('/scan')} style={styles.emptyCtaSecondary} accessibilityRole="button">
                    <Camera size={15} color={DS.colors.muted} strokeWidth={2.2} />
                    <ThemedText style={styles.emptyCtaSecondaryText}>or scan a page</ThemedText>
                  </Pressable>
                </Animated.View>
              )}
            </>
          }
          ListFooterComponent={<View style={{ height: 28 }} />}
        />

        {/* Action tray (long-press) */}
        {selectedNote && (
          <Animated.View entering={FadeInDown.duration(200)} style={[styles.actionTray, { bottom: 12 }]}>
            <ThemedText style={styles.trayTitle} numberOfLines={1}>{selectedNote.title || 'Note'}</ThemedText>
            <Pressable
              onPress={() => {
                router.push(`/note/${selectedNote.id}`);
                setSelectedNote(null);
              }}
              style={styles.trayBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit note"
            >
              <Pencil size={15} color={DS.colors.white} strokeWidth={2.2} />
              <ThemedText style={styles.trayBtnText}>Edit</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => deleteNote(selectedNote)}
              style={[styles.trayBtn, styles.trayBtnDanger]}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <Trash2 size={15} color="#FF8A9B" strokeWidth={2.2} />
              <ThemedText style={[styles.trayBtnText, { color: '#FF8A9B' }]}>Delete</ThemedText>
            </Pressable>
            <Pressable onPress={() => setSelectedNote(null)} style={styles.trayBtnClose} accessibilityRole="button" accessibilityLabel="Close actions" hitSlop={8}>
              <X size={17} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Quick text composer */}
      <Modal visible={isComposerOpen} animationType="slide" transparent onRequestClose={() => setIsComposerOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.composerHandle} />
            <View style={styles.composerHeader}>
              <ThemedText style={styles.composerTitle}>New note</ThemedText>
              <Pressable onPress={() => setIsComposerOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <X size={20} color={DS.colors.muted} strokeWidth={2.2} />
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
            <PressableScale onPress={createNote} style={styles.composerSaveBtn}>
              <ThemedText style={styles.composerSaveBtnText}>Save note</ThemedText>
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: DS.colors.orange },
  brandText: { color: DS.colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: DS.colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: DS.colors.white, fontSize: 15, fontWeight: '700' },

  heroCard: {
    borderRadius: DS.radius.xl,
    padding: 22,
    paddingTop: 24,
    marginBottom: 18,
    overflow: 'hidden',
    backgroundColor: DS.colors.night,
    ...DS.shadow.floating,
  },
  heroEyebrow: { color: DS.colors.nightMuted, fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  heroTitle: { color: DS.colors.nightText, ...displayType(42), marginTop: 2 },
  heroTitleItalic: { color: '#C9C2FF', ...displayType(42, true) },
  heroSub: { color: DS.colors.nightMuted, fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 320 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  quickAction: {
    flex: 1, height: 74, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  quickRecord: { backgroundColor: DS.colors.orange, ...DS.shadow.orange },
  quickGlass: { backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  quickLabel: { color: DS.colors.white, fontSize: 13, fontWeight: '700', lineHeight: 16 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: DS.colors.border,
    paddingHorizontal: 15, height: 50, marginBottom: 12,
  },
  searchInput: { flex: 1, color: DS.colors.ink, fontSize: DS.font.bodyMd, paddingVertical: 0 },

  sourceToggle: {
    flexDirection: 'row', backgroundColor: DS.colors.surfaceSoft, borderRadius: 14,
    padding: 4, marginBottom: 12, gap: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: DS.colors.surface, ...DS.shadow.card },
  toggleBtnText: { color: DS.colors.muted, fontSize: 13, fontWeight: '600' },
  toggleBtnTextActive: { color: DS.colors.ink, fontWeight: '700' },

  chipsScroll: { marginHorizontal: -20, marginBottom: 14 },
  chipsRow: { gap: 8, paddingHorizontal: 20 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, height: 36, borderRadius: 18,
    backgroundColor: DS.colors.surface, borderWidth: 1, borderColor: DS.colors.border,
  },
  chipActive: { backgroundColor: DS.colors.ink, borderColor: DS.colors.ink },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { color: DS.colors.inkSoft, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: DS.colors.white },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10 },
  sectionTitle: { color: DS.colors.ink, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  sectionCount: { color: DS.colors.subtle, fontSize: 12, fontWeight: '700' },
  sectionRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: DS.colors.borderStrong },

  noteCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: DS.colors.border,
    ...DS.shadow.card,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  cardDate: { color: DS.colors.subtle, fontSize: 12, fontWeight: '500' },
  cardTitle: { color: DS.colors.ink, fontSize: 17, fontWeight: '700', letterSpacing: -0.2, marginBottom: 4 },
  cardPreview: { color: DS.colors.muted, fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DS.colors.warning },
  cardPending: { color: DS.colors.warning, fontSize: 14, fontWeight: '600' },
  failBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.colors.dangerLight, borderRadius: 12, padding: 10, marginTop: 2,
  },
  cardFailed: { flex: 1, color: DS.colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  retryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.colors.danger, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
  },
  retryChipText: { color: DS.colors.white, fontSize: 12, fontWeight: '700' },
  cardBottomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: DS.colors.surfaceSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  aiChip: { backgroundColor: DS.colors.primaryLight },
  metaChipText: { color: DS.colors.muted, fontSize: 11.5, fontWeight: '600' },

  skeletonWrap: { gap: 10 },
  skeletonCard: { height: 108, borderRadius: 22, backgroundColor: DS.colors.surfaceSoft },

  emptyState: {
    alignItems: 'center', paddingVertical: 34, paddingHorizontal: 24,
    backgroundColor: DS.colors.surface, borderRadius: 26, borderWidth: 1, borderColor: DS.colors.border,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFEDE8',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { color: DS.colors.ink, ...displayType(28), textAlign: 'center' },
  emptySubtitle: { color: DS.colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20,
    backgroundColor: DS.colors.ink, borderRadius: 999, paddingHorizontal: 22, height: 48,
  },
  emptyCtaText: { color: DS.colors.white, fontSize: 15, fontWeight: '700' },
  emptyCtaSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, padding: 6 },
  emptyCtaSecondaryText: { color: DS.colors.muted, fontSize: 13, fontWeight: '600' },

  actionTray: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.colors.night, borderRadius: 22, padding: 10, paddingLeft: 16,
    ...DS.shadow.floating,
  },
  trayTitle: { flex: 1, color: DS.colors.white, fontSize: 14, fontWeight: '700' },
  trayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingHorizontal: 12, height: 38,
  },
  trayBtnDanger: { backgroundColor: 'rgba(224,71,95,0.16)' },
  trayBtnText: { color: DS.colors.white, fontSize: 13, fontWeight: '700' },
  trayBtnClose: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,16,24,0.45)' },
  composer: {
    backgroundColor: DS.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 10,
  },
  composerHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: DS.colors.borderStrong, marginBottom: 14 },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  composerTitle: { color: DS.colors.ink, ...displayType(28) },
  composerTitleInput: {
    color: DS.colors.ink, fontSize: 18, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: DS.colors.border, paddingVertical: 10, marginBottom: 10,
  },
  composerContentInput: { color: DS.colors.ink, fontSize: 16, lineHeight: 23, minHeight: 150, paddingVertical: 6 },
  composerSaveBtn: {
    marginTop: 14, backgroundColor: DS.colors.ink, borderRadius: 16, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  composerSaveBtnText: { color: DS.colors.white, fontSize: 16, fontWeight: '700' },
});
