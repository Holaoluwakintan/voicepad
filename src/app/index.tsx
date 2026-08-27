import { useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const ACCENT = '#6D5DFB';
const INK = '#17152A';
const MUTED = '#79768A';
const SURFACE = '#F5F3FA';
const BORDER = '#E8E5F0';

export default function HomeScreen() {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const handleRecordPress = () => {
    Alert.alert(
      'Voice capture is next',
      'The Home screen is ready. We will connect this button to the recorder in the next milestone.',
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View>
              <ThemedText style={styles.eyebrow}>VOICEPAD</ThemedText>
              <ThemedText style={styles.greeting}>{greeting}, Michael</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => Alert.alert('Profile', 'Profile settings are coming next.')}
              style={({ pressed }) => [
                styles.avatar,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.avatarText}>M</ThemedText>
            </Pressable>
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
            onPress={handleRecordPress}
            style={({ pressed }) => [
              styles.recordCard,
              pressed && styles.recordCardPressed,
            ]}
          >
            <View style={styles.recordIconOuter}>
              <View style={styles.recordIconInner}>
                <ThemedText style={styles.micSymbol}>●</ThemedText>
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
            <ThemedText style={styles.sectionMeta}>0 notes</ThemedText>
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <ThemedText style={styles.emptyIconText}>✦</ThemedText>
            </View>
            <ThemedText style={styles.emptyTitle}>Your ideas start here</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Record your first thought and VoicePad will help you turn it into something useful.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create your first note"
              onPress={handleRecordPress}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.secondaryButtonText}>Create first note</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFEFF',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  greeting: {
    color: INK,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    marginTop: 6,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E9E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '800',
  },
  heroBlock: {
    marginTop: 48,
    marginBottom: 24,
  },
  heroTitle: {
    color: INK,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    maxWidth: 560,
  },
  heroSubtitle: {
    color: MUTED,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  recordCard: {
    minHeight: 116,
    borderRadius: 28,
    backgroundColor: ACCENT,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  recordCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  recordIconOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIconInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micSymbol: {
    color: ACCENT,
    fontSize: 16,
  },
  recordCopy: {
    flex: 1,
    marginLeft: 16,
  },
  recordTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
  },
  recordSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  arrow: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    marginLeft: 12,
  },
  sectionHeader: {
    marginTop: 42,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: INK,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionMeta: {
    color: MUTED,
    fontSize: 13,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    backgroundColor: SURFACE,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#E9E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    color: ACCENT,
    fontSize: 24,
  },
  emptyTitle: {
    color: INK,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 420,
    marginTop: 8,
  },
  secondaryButton: {
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
});
