/**
 * Upgrade Screen: VoicePad Pro (coming soon).
 *
 * Honest by design (monetization review 2026-10-08):
 *  - No purchase flow exists yet, so nothing here can charge money and the button says so.
 *  - Only features that exist today are listed under "Free"; Pro lists what is planned.
 *  - Prices are the PLANNED naira launch prices and are labelled as such.
 */
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DS, displayType } from '@/constants/design';
import { Sparkles } from 'lucide-react-native';

/** Planned launch prices (Nigeria). Shown as planned; nothing is charged in this version. */
export const PRO_PRICES = {
  monthly: { label: '₦1,500', period: '/mo' },
  yearly: { label: '₦15,000', period: '/yr', note: '2 months free' },
} as const;

/** Fair-use AI transcription allowance planned for Pro, in hours per month. */
export const PRO_FAIR_USE_HOURS = 20;

const FREE_FEATURES = [
  { icon: '🎙️', title: 'AI transcription and summaries', desc: 'Record lectures, sermons and meetings. Fair use applies.' },
  { icon: '📖', title: 'Book scan, up to 20 pages at once', desc: 'Photo-to-text for notes, books and whiteboards.' },
  { icon: '☁️', title: 'Cloud backup when you sign in', desc: 'Your notes sync to your account, encrypted in transit and at rest.' },
  { icon: '📋', title: 'Copy or share as Markdown', desc: 'Formatted notes you can paste anywhere.' },
];

const PRO_FEATURES = [
  { icon: '🚫', title: 'No ads', desc: 'No banner ads anywhere in the app.' },
  { icon: '📄', title: 'PDF export', desc: 'Save study guides and meeting minutes as PDF files.' },
  { icon: '⏱️', title: `Up to ${PRO_FAIR_USE_HOURS} hours of AI transcription a month`, desc: 'A generous fair-use allowance for heavy users.' },
  { icon: '💙', title: 'Support an independent developer', desc: 'Pro keeps VoicePad running and improving.' },
];

export default function UpgradeScreen() {
  const router = useRouter();

  async function handleComingSoon() {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    Alert.alert(
      'Pro is not on sale yet',
      'There is no way to pay in this version, so you cannot be charged. Everything you use today stays free.',
      [{ text: 'Got it' }]
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <ThemedText style={styles.closeBtnText}>×</ThemedText>
            </Pressable>
            <ThemedText style={styles.headerBadge}>VOICEPAD PRO</ThemedText>
            <View style={{ width: 44 }} />
          </View>

          {/* Hero */}
          <View style={styles.heroBlock}>
            <View style={styles.heroEmoji}><Sparkles size={30} color={DS.colors.primary} strokeWidth={2} /></View>
            <ThemedText style={styles.heroTitle}>VoicePad Pro is coming soon</ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              Pro will remove ads and add PDF export. Everything you use today stays free.
            </ThemedText>
          </View>

          {/* Free today */}
          <View style={styles.featuresCard}>
            <ThemedText style={styles.featuresTitle}>Free for everyone, today</ThemedText>
            {FREE_FEATURES.map((item) => (
              <View key={item.title} style={styles.featureRow}>
                <ThemedText style={styles.featureIcon}>{item.icon}</ThemedText>
                <View style={styles.featureTextBlock}>
                  <ThemedText style={styles.featureItemTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.featureItemDesc}>{item.desc}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          {/* Pro, planned */}
          <View style={[styles.featuresCard, styles.proCard]}>
            <View style={styles.proTitleRow}>
              <ThemedText style={styles.featuresTitle}>Pro adds</ThemedText>
              <View style={styles.soonPill}><ThemedText style={styles.soonPillText}>COMING SOON</ThemedText></View>
            </View>
            {PRO_FEATURES.map((item) => (
              <View key={item.title} style={styles.featureRow}>
                <ThemedText style={styles.featureIcon}>{item.icon}</ThemedText>
                <View style={styles.featureTextBlock}>
                  <ThemedText style={styles.featureItemTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.featureItemDesc}>{item.desc}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          {/* Planned prices */}
          <ThemedText style={styles.sectionLabel}>PLANNED LAUNCH PRICES</ThemedText>
          <View style={styles.plansContainer}>
            <View style={styles.planCard}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.planName}>Monthly</ThemedText>
                <ThemedText style={styles.planBilledText}>Cancel any time</ThemedText>
              </View>
              <View style={styles.priceCol}>
                <ThemedText style={styles.planPrice} numberOfLines={1}>{PRO_PRICES.monthly.label}</ThemedText>
                <ThemedText style={styles.planPeriod} numberOfLines={1}>{PRO_PRICES.monthly.period}</ThemedText>
              </View>
            </View>
            <View style={styles.planCard}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.planName}>Yearly</ThemedText>
                <ThemedText style={styles.planBilledText}>{PRO_PRICES.yearly.note}</ThemedText>
              </View>
              <View style={styles.priceCol}>
                <ThemedText style={styles.planPrice} numberOfLines={1}>{PRO_PRICES.yearly.label}</ThemedText>
                <ThemedText style={styles.planPeriod} numberOfLines={1}>{PRO_PRICES.yearly.period}</ThemedText>
              </View>
            </View>
          </View>

          {/* Not on sale: the button never looks like it charges */}
          <Pressable
            onPress={handleComingSoon}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="VoicePad Pro is coming soon. No payment is taken."
          >
            <ThemedText style={styles.ctaText}>Coming soon · no payment taken</ThemedText>
          </Pressable>

          <ThemedText style={styles.guaranteeText}>
            Pro is not on sale yet, so nothing can be charged. When it launches, prices will be in naira, the plan will renew automatically until you cancel, and you will be able to cancel any time.
          </ThemedText>

          {/* Footer links */}
          <View style={styles.footerRow}>
            <Pressable onPress={() => router.push('/terms')} accessibilityRole="button">
              <ThemedText style={styles.footerLink}>Terms</ThemedText>
            </Pressable>
            <ThemedText style={styles.footerDivider}>•</ThemedText>
            <Pressable onPress={() => router.push('/privacy')} accessibilityRole="button">
              <ThemedText style={styles.footerLink}>Privacy Policy</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DS.radius.full,
    backgroundColor: DS.colors.surfaceDim,
  },
  closeBtnText: {
    color: DS.colors.ink,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
  },
  headerBadge: {
    color: DS.colors.primary,
    fontSize: DS.font.caption,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },

  heroBlock: {
    alignItems: 'center',
    marginBottom: 22,
  },
  heroEmoji: { width: 64, height: 64, borderRadius: 32, backgroundColor: DS.colors.primaryLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  // Explicit lineHeight: ThemedText's default (24) is smaller than this font and clipped the first line.
  heroTitle: {
    ...displayType(32),
    lineHeight: 40,
    paddingTop: 2,
    color: DS.colors.ink,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 380,
  },

  featuresCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 20,
    marginBottom: 16,
    gap: 14,
    ...DS.shadow.card,
  },
  proCard: {
    borderColor: DS.colors.primary,
    backgroundColor: DS.colors.primaryLight,
  },
  proTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soonPill: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  soonPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  featuresTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    lineHeight: 22,
    fontWeight: '800',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    fontSize: 20,
    lineHeight: 26,
  },
  featureTextBlock: {
    flex: 1,
  },
  featureItemTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  featureItemDesc: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    lineHeight: 18,
    marginTop: 2,
  },

  sectionLabel: {
    color: DS.colors.muted,
    fontSize: DS.font.caption,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 10,
  },
  plansContainer: {
    gap: 12,
    marginBottom: 22,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  planName: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    lineHeight: 22,
    fontWeight: '800',
  },
  planBilledText: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    lineHeight: 18,
  },
  priceCol: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
    marginLeft: 12,
  },
  planPrice: {
    color: DS.colors.primary,
    fontSize: DS.font.h2,
    lineHeight: 28,
    fontWeight: '800',
  },
  planPeriod: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    lineHeight: 28,
    fontWeight: '700',
    marginLeft: 2,
  },

  ctaButton: {
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    lineHeight: 22,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  guaranteeText: {
    color: DS.colors.muted,
    fontSize: DS.font.xxs,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  footerLink: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    lineHeight: 20,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerDivider: {
    color: DS.colors.subtle,
    fontSize: DS.font.xs,
    lineHeight: 20,
  },
});
