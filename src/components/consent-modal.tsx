/**
 * First-Time User Consent & Legal Onboarding Gate
 * Ensures strict compliance with Apple Store Guidelines (5.1.1), GDPR,
 * and audio wiretapping / multi-party consent regulations.
 */
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { ThemedText } from './themed-text';
import { LegalModal } from './legal-modal';
import { DS } from '@/constants/design';
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/constants/legal';

// Earlier consent keys: a user who accepted one of these sees an "updated policy" title.
const PREVIOUS_CONSENT_KEYS = Array.from({ length: CONSENT_VERSION - 1 }, (_, i) => `@voicepad/terms_accepted_v${i + 1}`);

export function ConsentModal() {
  const [visible, setVisible] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [isUpdate, setIsUpdate] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_STORAGE_KEY).then(async (value) => {
      if (value !== 'true') {
        try {
          const previous = await AsyncStorage.multiGet(PREVIOUS_CONSENT_KEYS);
          setIsUpdate(previous.some(([, v]) => v === 'true'));
        } catch {}
        setVisible(true);
      }
    }).catch(() => setVisible(true));
  }, []);

  async function handleAccept() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    await AsyncStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.card}>
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>🎙️ PRIVACY & CONSENT</ThemedText>
            </View>

            <ThemedText style={styles.title}>{isUpdate ? 'We updated our Privacy Policy' : 'Welcome to VoicePad'}</ThemedText>
            <ThemedText style={styles.subtitle}>
              {isUpdate
                ? 'Your recordings now stay only on your phone, and only text syncs. Please review how VoicePad works with your data.'
                : 'Your voice notes companion. Before you start, here is how VoicePad works with your data.'}
            </ThemedText>

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.itemRow}>
                <ThemedText style={styles.itemIcon}>🔒</ThemedText>
                <View style={styles.itemTextCol}>
                  <ThemedText style={styles.itemTitle}>Your Data</ThemedText>
                  <ThemedText style={styles.itemDesc}>
                    Recordings stay on your device. Your audio is never stored on our servers or cloud. If you sign in, only your text (notes, transcripts, summaries) is backed up to your private account. We never sell your data.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.itemRow}>
                <ThemedText style={styles.itemIcon}>⚖️</ThemedText>
                <View style={styles.itemTextCol}>
                  <ThemedText style={styles.itemTitle}>Recording Consent</ThemedText>
                  <ThemedText style={styles.itemDesc}>
                    You agree to get permission from the people you record and to follow the recording laws where you are.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.itemRow}>
                <ThemedText style={styles.itemIcon}>✨</ThemedText>
                <View style={styles.itemTextCol}>
                  <ThemedText style={styles.itemTitle}>AI-Assisted Features</ThemedText>
                  <ThemedText style={styles.itemDesc}>
                    To transcribe, audio is sent securely (HTTPS) to our server and AI providers, processed, then deleted straight away. Free with Google AdMob banner ads.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.legalLinksRow}>
                <Pressable onPress={() => setLegalDoc('terms')}>
                  <ThemedText style={styles.legalLink}>Read Terms of Service</ThemedText>
                </Pressable>
                <ThemedText style={styles.legalDot}>•</ThemedText>
                <Pressable onPress={() => setLegalDoc('privacy')}>
                  <ThemedText style={styles.legalLink}>Read Privacy Policy</ThemedText>
                </Pressable>
              </View>
            </ScrollView>

            <Pressable
              onPress={handleAccept}
              style={({ pressed }) => [styles.acceptButton, pressed && styles.pressed]}
              accessibilityLabel="Agree and continue"
            >
              <ThemedText style={styles.acceptButtonText}>Agree & Continue</ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      {/* Sub-modal to inspect full terms/privacy if tapped */}
      <LegalModal
        visible={legalDoc !== null}
        initialDoc={legalDoc ?? 'terms'}
        onClose={() => setLegalDoc(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 34, 53, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  safeArea: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    padding: 24,
    ...DS.shadow.floating,
    maxHeight: '90%',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: DS.colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DS.radius.xs,
    marginBottom: 12,
  },
  badgeText: {
    color: DS.colors.primary,
    fontSize: DS.font.caption,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: DS.colors.ink,
    fontSize: DS.font.h1,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: DS.colors.muted,
    fontSize: DS.font.sm,
    lineHeight: 21,
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 260,
    marginVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  itemIcon: {
    fontSize: 22,
    marginRight: 12,
    marginTop: 2,
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    fontWeight: '800',
    marginBottom: 2,
  },
  itemDesc: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    lineHeight: 18,
  },
  legalLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  legalLink: {
    color: DS.colors.primary,
    fontSize: DS.font.xs,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: DS.colors.subtle,
    fontSize: DS.font.xs,
  },
  acceptButton: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
    ...DS.shadow.primary,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
});
