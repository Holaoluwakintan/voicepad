/**
 * Public Privacy Policy Route (/privacy)
 * Renders the full official Privacy Policy for web visitors, deep links,
 * and App Store / Play Store review submissions.
 */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DS } from '@/constants/design';
import { PRIVACY_POLICY } from '@/constants/legal';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
              <ThemedText style={styles.backText}>‹</ThemedText>
            </Pressable>
            <View style={styles.titleBlock}>
              <ThemedText style={styles.eyebrow}>VOICEPAD LEGAL</ThemedText>
              <ThemedText style={styles.title}>{PRIVACY_POLICY.title}</ThemedText>
              <ThemedText style={styles.subtitle}>Effective Date: {PRIVACY_POLICY.lastUpdated}</ThemedText>
            </View>
          </View>

          {/* Sections */}
          {PRIVACY_POLICY.sections.map((section) => (
            <View key={section.id} style={styles.card}>
              <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
              <ThemedText style={styles.sectionBody}>{section.content}</ThemedText>
            </View>
          ))}

          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>
              VoicePad is engineered with a local-first commitment. Direct inquiries to privacy@voicepad.app.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 60,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginRight: 12 },
  backText: { color: DS.colors.ink, fontSize: 36, fontWeight: '300', lineHeight: 36 },
  titleBlock: { flex: 1 },
  eyebrow: { color: DS.colors.primary, fontSize: DS.font.caption, fontWeight: '800', letterSpacing: 2 },
  title: { color: DS.colors.ink, fontSize: DS.font.display, fontWeight: '800', marginTop: 2 },
  subtitle: { color: DS.colors.muted, fontSize: DS.font.xs, marginTop: 4 },
  card: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 20,
    marginBottom: 14,
    ...DS.shadow.card,
  },
  sectionTitle: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '800', marginBottom: 8 },
  sectionBody: { color: DS.colors.ink, fontSize: DS.font.sm, lineHeight: 23 },
  footer: { paddingVertical: 20, alignItems: 'center' },
  footerText: { color: DS.colors.subtle, fontSize: DS.font.caption, textAlign: 'center' },
});
