/**
 * Legal Document Viewer Modal
 * Displays full, professional Terms of Service and Privacy Policy
 * with segmented switching, section formatting, and clean scroll view.
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
import * as Haptics from 'expo-haptics';

import { ThemedText } from './themed-text';
import { DS } from '@/constants/design';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '@/constants/legal';

interface LegalModalProps {
  visible: boolean;
  initialDoc?: 'terms' | 'privacy';
  onClose: () => void;
}

export function LegalModal({ visible, initialDoc = 'terms', onClose }: LegalModalProps) {
  const [activeDoc, setActiveDoc] = useState<'terms' | 'privacy'>(initialDoc);

  useEffect(() => {
    if (visible && initialDoc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveDoc(initialDoc);
    }
  }, [visible, initialDoc]);

  const docData = activeDoc === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY;

  function switchDoc(doc: 'terms' | 'privacy') {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setActiveDoc(doc);
  }

  function handleClose() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <ThemedText style={styles.eyebrow}>VOICEPAD LEGAL</ThemedText>
              <ThemedText style={styles.headerTitle}>{docData.title}</ThemedText>
              <ThemedText style={styles.updatedDate}>
                Effective: {docData.lastUpdated}
              </ThemedText>
            </View>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityLabel="Close legal documents"
            >
              <ThemedText style={styles.closeButtonText}>✕</ThemedText>
            </Pressable>
          </View>

          {/* Segmented Switcher */}
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => switchDoc('terms')}
              style={[
                styles.segmentTab,
                activeDoc === 'terms' && styles.segmentTabActive,
              ]}
              accessibilityLabel="View Terms of Service"
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  activeDoc === 'terms' && styles.segmentTextActive,
                ]}
              >
                📜 Terms of Service
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => switchDoc('privacy')}
              style={[
                styles.segmentTab,
                activeDoc === 'privacy' && styles.segmentTabActive,
              ]}
              accessibilityLabel="View Privacy Policy"
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  activeDoc === 'privacy' && styles.segmentTextActive,
                ]}
              >
                🔒 Privacy Policy
              </ThemedText>
            </Pressable>
          </View>

          {/* Document Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {docData.sections.map((section) => (
              <View key={section.id} style={styles.sectionCard}>
                <ThemedText style={styles.sectionHeading}>
                  {section.title}
                </ThemedText>
                <ThemedText style={styles.sectionBody}>
                  {section.content}
                </ThemedText>
              </View>
            ))}

            <View style={styles.footerNote}>
              <ThemedText style={styles.footerNoteText}>
                VoicePad is engineered with a local-first commitment. Questions about these terms can be directed to support@voicepad.app.
              </ThemedText>
            </View>
          </ScrollView>

          {/* Bottom Dismiss Bar */}
          <View style={styles.bottomBar}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
            >
              <ThemedText style={styles.dismissButtonText}>
                I Understand & Accept
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.colors.canvas,
  },
  container: {
    flex: 1,
    backgroundColor: DS.colors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerTitleBlock: {
    flex: 1,
    marginRight: 16,
  },
  eyebrow: {
    color: DS.colors.primary,
    fontSize: DS.font.caption,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  headerTitle: {
    color: DS.colors.ink,
    fontSize: DS.font.h1,
    fontWeight: '800',
  },
  updatedDate: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DS.colors.surfaceDim,
    borderWidth: 1,
    borderColor: DS.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: DS.colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surfaceDim,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.colors.border,
    marginHorizontal: 22,
    marginBottom: 12,
    padding: 4,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: DS.radius.sm,
  },
  segmentTabActive: {
    backgroundColor: DS.colors.surface,
    ...DS.shadow.card,
  },
  segmentText: {
    color: DS.colors.muted,
    fontSize: DS.font.xs,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: DS.colors.ink,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  sectionCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    borderWidth: 1,
    borderColor: DS.colors.border,
    padding: 18,
    marginBottom: 12,
    ...DS.shadow.card,
  },
  sectionHeading: {
    color: DS.colors.ink,
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
    marginBottom: 10,
  },
  sectionBody: {
    color: DS.colors.ink,
    fontSize: DS.font.sm,
    lineHeight: 23,
  },
  footerNote: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerNoteText: {
    color: DS.colors.subtle,
    fontSize: DS.font.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: DS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: DS.colors.border,
  },
  dismissButton: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...DS.shadow.primary,
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: DS.font.bodyMd,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
