/**
 * Profile Screen — Account, sync, and settings.
 * Fixed: wrapped in ScrollView (was overflowing on small screens).
 * Premium: glass-effect stat cards, gradient avatar ring, polished auth card.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LegalModal } from '@/components/legal-modal';
import { useAuth } from '@/lib/auth';
import { loadNotes, Note } from '@/lib/notes';
import { syncNotes } from '@/lib/sync';
import { DS } from '@/constants/design';

export default function ProfileScreen() {
  const {
    user,
    loading: authLoading,
    configured,
    signIn,
    signUp,
    resendConfirmation,
    signInWithOAuth,
    resetPassword,
    updateProfile,
    deleteAccount,
    signOut,
  } = useAuth();

  const [notes, setNotes] = useState<Note[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authAction, setAuthAction] = useState<
    'signIn' | 'signUp' | 'google' | 'apple' | 'sync' | 'resend' | null
  >(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState<'terms' | 'privacy' | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadNotes().then(setNotes);
    }, [])
  );

  const ready = notes.filter((n) => n.transcriptionStatus === 'ready').length;
  const pending = notes.filter((n) => n.transcriptionStatus === 'pending').length;

  useEffect(() => {
    if (!user) return;
    syncNotes(user.id).then(async (result) => {
      setSyncMessage(result.ok ? 'Synced just now.' : result.message ?? 'Sync unavailable.');
      if (result.ok) setNotes(await loadNotes());
    });
  }, [user]);

  async function handleAuth(mode: 'signIn' | 'signUp') {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Check your details', 'Enter an email and a password with at least 6 characters.');
      return;
    }
    setAuthAction(mode);
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setAuthAction(null);

    if (result.error) {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Alert.alert(mode === 'signIn' ? 'Sign in failed' : 'Account creation failed', result.error);
    } else if (mode === 'signUp') {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      if ('needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        setUnconfirmedEmail(email.trim());
        Alert.alert(
          'Confirm your email',
          `A verification link was sent to ${email.trim()}.\n\nCheck your Inbox and Spam folder, verify, then sign in.`
        );
      }
    } else {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  }

  async function handleResendConfirmation() {
    const target = unconfirmedEmail || email.trim();
    if (!target) {
      Alert.alert('Email required', 'Enter your email to resend the verification link.');
      return;
    }
    setAuthAction('resend');
    const res = await resendConfirmation(target);
    setAuthAction(null);
    if (res.error) Alert.alert('Resend failed', res.error);
    else Alert.alert('Sent!', `A new link was sent to ${target}. Check Spam too.`);
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setAuthAction(provider);
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const result = await signInWithOAuth(provider);
    setAuthAction(null);
    if (result.error) {
      Alert.alert(
        `${provider === 'google' ? 'Google' : 'Apple'} Sign-In`,
        `${result.error}\n\nPlease use email and password below.`
      );
    }
  }

  async function handlePasswordReset() {
    if (!resetEmail.trim()) { Alert.alert('Email required', 'Please enter your email.'); return; }
    setIsResetting(true);
    try {
      const result = await resetPassword(resetEmail);
      if (result.error) Alert.alert('Reset failed', result.error);
      else { Alert.alert('Check your email', 'A password reset link has been sent.'); setIsResetModalOpen(false); }
    } finally { setIsResetting(false); }
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) return;
    setIsUpdatingProfile(true);
    try {
      const result = await updateProfile(fullName);
      if (result.error) Alert.alert('Update failed', result.error);
      else {
        setIsEditProfileOpen(false);
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    } finally { setIsUpdatingProfile(false); }
  }

  async function handleSync() {
    if (!user) return;
    setAuthAction('sync');
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const result = await syncNotes(user.id);
    setAuthAction(null);
    setSyncMessage(result.ok ? 'Synced just now.' : result.message ?? 'Sync unavailable.');
    if (result.ok) {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setNotes(await loadNotes());
    }
  }

  async function handleSignOut() {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const result = await signOut();
    if (result.error) Alert.alert('Could not sign out', result.error);
    else setSyncMessage('Signed out. Local notes remain on this device.');
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account?',
      'This will permanently delete your VoicePad account and cloud data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account', style: 'destructive',
          onPress: async () => {
            setAuthAction('sync');
            try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
            const res = await deleteAccount();
            setAuthAction(null);
            if (res.error) Alert.alert('Could not delete account', res.error);
            else Alert.alert('Account Deleted', 'Your account has been deleted.');
          },
        },
      ]
    );
  }

  const userDisplayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'VoicePad User';
  const avatarLetter = (userDisplayName[0] || 'V').toUpperCase();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* ← ScrollView wraps everything (bug fix for small screens) */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ─── Avatar + name ─── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <ThemedText style={styles.avatarText}>{avatarLetter}</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.displayName}>{userDisplayName}</ThemedText>
            <ThemedText style={styles.emailLabel}>
              {user ? (user.email ?? 'Cloud workspace connected') : 'Local workspace · no account'}
            </ThemedText>
            {user && (
              <Pressable
                onPress={() => { setFullName(user.user_metadata?.full_name || ''); setIsEditProfileOpen(true); }}
                style={styles.editNameBtn}
                accessibilityLabel="Edit display name"
              >
                <ThemedText style={styles.editNameBtnText}>✎ Edit display name</ThemedText>
              </Pressable>
            )}
          </View>

          {/* ─── Stats ─── */}
          <View style={styles.statsRow}>
            <StatCard value={String(notes.length)} label="Total notes" icon="📋" />
            <StatCard value={String(ready)} label="Transcribed" icon="✅" />
            <StatCard value={String(pending)} label="In progress" icon="⏳" />
          </View>

          {/* ─── Cloud not configured notice ─── */}
          {!configured && (
            <View style={styles.noticeCard}>
              <ThemedText style={styles.noticeIcon}>☁️</ThemedText>
              <ThemedText style={styles.noticeTitle}>Cloud sync not connected</ThemedText>
              <ThemedText style={styles.noticeBody}>
                VoicePad works fully offline. Add your Supabase keys to .env to enable multi-device sync and cloud backups.
              </ThemedText>
            </View>
          )}

          {/* ─── Sign-in form (not logged in) ─── */}
          {configured && !user && !authLoading && (
            <View style={styles.authCard}>
              <ThemedText style={styles.authCardTitle}>Sign in to sync your notes</ThemedText>
              <ThemedText style={styles.authCardSubtitle}>
                Your notes will automatically sync across all your devices.
              </ThemedText>

              {/* OAuth buttons */}
              <View style={styles.oauthRow}>
                <Pressable
                  disabled={Boolean(authAction)}
                  onPress={() => handleOAuth('google')}
                  style={({ pressed }) => [styles.googleButton, pressed && styles.oauthPressed, authAction === 'google' && { opacity: 0.7 }]}
                  accessibilityLabel="Sign in with Google"
                >
                  <View style={styles.googleBrandRow}>
                    <View style={styles.googleGContainer}>
                      <Text style={styles.googleGLogo}>G</Text>
                    </View>
                    <Text style={styles.googleBrandText}>
                      <Text style={{ color: '#4285F4' }}>G</Text>
                      <Text style={{ color: '#EA4335' }}>o</Text>
                      <Text style={{ color: '#FBBC05' }}>o</Text>
                      <Text style={{ color: '#4285F4' }}>g</Text>
                      <Text style={{ color: '#34A853' }}>l</Text>
                      <Text style={{ color: '#EA4335' }}>e</Text>
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  disabled={Boolean(authAction)}
                  onPress={() => handleOAuth('apple')}
                  style={({ pressed }) => [styles.appleButton, pressed && styles.oauthPressed]}
                  accessibilityLabel="Sign in with Apple"
                >
                  <ThemedText style={styles.appleText}> Apple</ThemedText>
                </Pressable>
              </View>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <ThemedText style={styles.dividerText}>or email</ThemedText>
                <View style={styles.dividerLine} />
              </View>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={DS.colors.subtle}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                accessibilityLabel="Email address"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={DS.colors.subtle}
                secureTextEntry
                style={styles.input}
                accessibilityLabel="Password"
              />

              <Pressable
                onPress={() => { setResetEmail(email); setIsResetModalOpen(true); }}
                style={styles.forgotBtn}
                accessibilityLabel="Forgot password"
              >
                <ThemedText style={styles.forgotBtnText}>Forgot password?</ThemedText>
              </Pressable>

              <Pressable
                disabled={Boolean(authAction)}
                onPress={() => handleAuth('signIn')}
                style={[styles.primaryButton, authAction && authAction !== 'signIn' && styles.buttonDimmed]}
                accessibilityLabel="Sign in with email"
              >
                {authAction === 'signIn' ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.primaryText}> Signing in…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>✉️  Sign In with Email</Text>
                )}
              </Pressable>

              <Pressable
                disabled={Boolean(authAction)}
                onPress={() => handleAuth('signUp')}
                style={[styles.secondaryButton, authAction && authAction !== 'signUp' && styles.buttonDimmed]}
                accessibilityLabel="Create account"
              >
                {authAction === 'signUp' ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.secondaryText}> Creating account…</Text>
                  </View>
                ) : (
                  <Text style={styles.secondaryText}>✨  Create Account</Text>
                )}
              </Pressable>

              {unconfirmedEmail && (
                <View style={styles.unconfirmedCard}>
                  <ThemedText style={styles.unconfirmedTitle}>📩 Verification Email Sent</ThemedText>
                  <ThemedText style={styles.unconfirmedBody}>
                    A link was sent to <ThemedText style={{ fontWeight: '800' }}>{unconfirmedEmail}</ThemedText>.{' '}
                    Check Inbox and Spam.
                  </ThemedText>
                  <Pressable
                    disabled={authAction === 'resend'}
                    onPress={handleResendConfirmation}
                    style={styles.resendButton}
                    accessibilityLabel="Resend confirmation email"
                  >
                    <Text style={styles.resendButtonText}>
                      {authAction === 'resend' ? 'Sending…' : '🔄 Resend link'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* ─── Logged-in cloud sync section ─── */}
          {user && (
            <View style={styles.accountCard}>
              <ThemedText style={styles.accountCardTitle}>☁️ Cloud sync & backup</ThemedText>
              <ThemedText style={styles.accountCardBody}>
                Voice notes and transcripts are securely backed up to your private cloud workspace.
              </ThemedText>
              {!!syncMessage && (
                <ThemedText style={styles.syncMessage}>🟢 {syncMessage}</ThemedText>
              )}
              <View style={styles.accountActions}>
                <Pressable
                  disabled={Boolean(authAction)}
                  onPress={handleSync}
                  style={styles.syncBtn}
                  accessibilityLabel="Sync now"
                >
                  <Text style={styles.primaryText}>
                    {authAction === 'sync' ? 'Syncing…' : 'Sync now'}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={Boolean(authAction)}
                  onPress={handleSignOut}
                  style={styles.signOutBtn}
                  accessibilityLabel="Sign out"
                >
                  <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>
              </View>
              <Pressable
                disabled={Boolean(authAction)}
                onPress={confirmDeleteAccount}
                style={styles.deleteAccountBtn}
                accessibilityLabel="Delete account"
              >
                <ThemedText style={styles.deleteAccountText}>Delete Account & Data</ThemedText>
              </Pressable>
            </View>
          )}

          {/* ─── App info ─── */}
          <ThemedText style={styles.sectionTitle}>App Info & Legal</ThemedText>
          {[
            {
              title: 'Transcription & AI server',
              action: 'Connected',
              onPress: () => Alert.alert('Transcription & AI Server', 'Powered by Groq Whisper & Llama. Configured via EXPO_PUBLIC_TRANSCRIPTION_API_URL.'),
            },
            {
              title: 'Privacy Policy',
              action: 'Read',
              onPress: () => setLegalModalDoc('privacy'),
            },
            {
              title: 'Terms of Service',
              action: 'Read',
              onPress: () => setLegalModalDoc('terms'),
            },
            {
              title: 'About VoicePad',
              action: 'v1.0.0',
              onPress: () => Alert.alert('VoicePad v1.0', 'Capture lectures, sermons, meetings, and ideas in high fidelity.'),
            },
          ].map((row) => (
            <Pressable
              key={row.title}
              onPress={row.onPress}
              style={styles.infoRow}
              accessibilityLabel={row.title}
            >
              <ThemedText style={styles.infoRowTitle}>{row.title}</ThemedText>
              <ThemedText style={styles.infoRowAction}>{row.action}</ThemedText>
            </Pressable>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ─── Legal Documents Modal ─── */}
      <LegalModal
        visible={legalModalDoc !== null}
        initialDoc={legalModalDoc ?? 'terms'}
        onClose={() => setLegalModalDoc(null)}
      />

      {/* ─── Forgot Password Modal ─── */}
      <Modal visible={isResetModalOpen} animationType="slide" transparent onRequestClose={() => setIsResetModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Reset password</ThemedText>
            <ThemedText style={styles.modalSubtitle}>{"We'll send a reset link to your email."}</ThemedText>
            <TextInput
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="Email address"
              placeholderTextColor={DS.colors.subtle}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setIsResetModalOpen(false)} style={styles.modalCancelButton}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable disabled={isResetting} onPress={handlePasswordReset} style={styles.modalConfirmButton}>
                <ThemedText style={styles.modalConfirmText}>{isResetting ? 'Sending…' : 'Send link'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Edit Profile Modal ─── */}
      <Modal visible={isEditProfileOpen} animationType="slide" transparent onRequestClose={() => setIsEditProfileOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Edit Profile</ThemedText>
            <ThemedText style={styles.modalSubtitle}>Update your display name.</ThemedText>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              placeholderTextColor={DS.colors.subtle}
              style={styles.input}
            />
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setIsEditProfileOpen(false)} style={styles.modalCancelButton}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable disabled={isUpdatingProfile} onPress={handleSaveProfile} style={styles.modalConfirmButton}>
                <ThemedText style={styles.modalConfirmText}>{isUpdatingProfile ? 'Saving…' : 'Save'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <View style={styles.statCard}>
      <ThemedText style={styles.statIcon}>{icon}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 20,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },

  // Avatar section
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: DS.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.colors.primaryLight,
    marginBottom: 14,
    shadowColor: DS.colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: DS.colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: DS.colors.primary, fontSize: DS.font.display, fontWeight: '800' },
  displayName: { color: DS.colors.ink, fontSize: DS.font.h2, fontWeight: '800' },
  emailLabel: { color: DS.colors.muted, fontSize: DS.font.sm, marginTop: 4 },
  editNameBtn: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 6 },
  editNameBtnText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DS.colors.border,
    ...DS.shadow.card,
    gap: 4,
  },
  statIcon: { fontSize: 20 },
  statValue: { color: DS.colors.primary, fontSize: DS.font.h2, fontWeight: '800' },
  statLabel: { color: DS.colors.muted, fontSize: DS.font.caption, textAlign: 'center' },

  // Notice card
  noticeCard: {
    backgroundColor: DS.colors.warningLight,
    borderRadius: DS.radius.lg,
    padding: 20, marginBottom: 22,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  noticeIcon: { fontSize: 32 },
  noticeTitle: { color: DS.colors.warning, fontSize: DS.font.bodyMd, fontWeight: '800' },
  noticeBody: { color: DS.colors.muted, fontSize: DS.font.sm, lineHeight: 21, textAlign: 'center' },

  // Auth card
  authCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.xl,
    padding: 22, marginBottom: 22,
    borderWidth: 1, borderColor: DS.colors.border,
    ...DS.shadow.card,
  },
  authCardTitle: { color: DS.colors.ink, fontSize: DS.font.h3, fontWeight: '800', marginBottom: 6 },
  authCardSubtitle: { color: DS.colors.muted, fontSize: DS.font.sm, marginBottom: 18, lineHeight: 20 },

  oauthRow: { flexDirection: 'row', gap: 10 },
  googleButton: {
    flex: 1, backgroundColor: DS.colors.surface,
    borderWidth: 1.5, borderColor: DS.colors.borderStrong,
    borderRadius: DS.radius.md, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
    ...DS.shadow.card,
  },
  googleBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  googleGContainer: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: DS.colors.surfaceDim,
    borderWidth: 1, borderColor: DS.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  googleGLogo: { fontSize: 13, fontWeight: '900', color: '#4285F4' },
  googleBrandText: { fontSize: DS.font.bodyMd, fontWeight: '800', letterSpacing: 0.5 },
  appleButton: {
    flex: 1, backgroundColor: '#000',
    borderRadius: DS.radius.md, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  appleText: { color: '#FFF', fontSize: DS.font.bodyMd, fontWeight: '700' },
  oauthPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: DS.colors.border },
  dividerText: { color: DS.colors.subtle, fontSize: DS.font.xxs, marginHorizontal: 10 },

  input: {
    height: 52, borderWidth: 1, borderColor: DS.colors.border,
    borderRadius: DS.radius.md, paddingHorizontal: 16,
    color: DS.colors.ink, marginTop: 10,
    backgroundColor: DS.colors.surfaceDim,
    fontSize: DS.font.bodyMd,
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 4 },
  forgotBtnText: { color: DS.colors.primary, fontSize: DS.font.xs, fontWeight: '600' },

  primaryButton: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, marginTop: 14, width: '100%',
    ...DS.shadow.primary,
  },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: DS.font.bodyMd, textAlign: 'center' },
  secondaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: DS.radius.md, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, marginTop: 10, width: '100%',
  },
  secondaryText: { color: '#FFF', fontWeight: '800', fontSize: DS.font.bodyMd, textAlign: 'center' },
  buttonDimmed: { opacity: 0.6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  unconfirmedCard: {
    backgroundColor: '#EFF6FF', borderRadius: DS.radius.md,
    borderWidth: 1, borderColor: '#BFDBFE',
    padding: 16, marginTop: 16, alignItems: 'center', gap: 6,
  },
  unconfirmedTitle: { color: '#1D4ED8', fontSize: DS.font.sm, fontWeight: '800' },
  unconfirmedBody: { color: '#3B82F6', fontSize: DS.font.xs, textAlign: 'center', lineHeight: 19 },
  resendButton: {
    backgroundColor: DS.colors.primary, borderRadius: DS.radius.sm,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 6,
  },
  resendButtonText: { color: '#FFF', fontSize: DS.font.xs, fontWeight: '800' },

  // Account card (logged in)
  accountCard: {
    backgroundColor: DS.colors.successLight,
    borderRadius: DS.radius.xl, padding: 20, marginBottom: 22,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  accountCardTitle: { color: DS.colors.success, fontSize: DS.font.h3, fontWeight: '800', marginBottom: 6 },
  accountCardBody: { color: DS.colors.muted, fontSize: DS.font.sm, lineHeight: 20 },
  syncMessage: { color: DS.colors.success, fontSize: DS.font.xs, fontWeight: '700', marginTop: 10 },
  accountActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  syncBtn: {
    flex: 1, backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, ...DS.shadow.primary,
  },
  signOutBtn: {
    flex: 1, backgroundColor: DS.colors.danger,
    borderRadius: DS.radius.md, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
  },
  signOutText: { color: '#FFF', fontWeight: '800', fontSize: DS.font.bodyMd, textAlign: 'center' },
  deleteAccountBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  deleteAccountText: { color: DS.colors.danger, fontSize: DS.font.xs, fontWeight: '700' },

  // App info section
  sectionTitle: {
    color: DS.colors.ink, fontSize: DS.font.h3,
    fontWeight: '800', marginBottom: 10,
  },
  infoRow: {
    backgroundColor: DS.colors.surface, borderRadius: DS.radius.md, padding: 18,
    marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: DS.colors.border, ...DS.shadow.card,
  },
  infoRowTitle: { color: DS.colors.ink, fontSize: DS.font.bodyMd, fontWeight: '700' },
  infoRowAction: { color: DS.colors.primary, fontSize: DS.font.sm, fontWeight: '800' },

  // Modals
  modalBackdrop: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(23,21,42,0.45)',
  },
  modalCard: {
    backgroundColor: DS.colors.surface,
    borderTopLeftRadius: DS.radius.xl, borderTopRightRadius: DS.radius.xl,
    padding: 24,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: DS.colors.border, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { color: DS.colors.ink, fontSize: DS.font.h2, fontWeight: '800' },
  modalSubtitle: { color: DS.colors.muted, fontSize: DS.font.sm, marginTop: 6, marginBottom: 4 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelButton: {
    flex: 1, paddingVertical: 14, borderRadius: DS.radius.md,
    alignItems: 'center', borderWidth: 1, borderColor: DS.colors.border,
  },
  modalCancelText: { color: DS.colors.muted, fontSize: DS.font.bodyMd, fontWeight: '700' },
  modalConfirmButton: {
    flex: 1, paddingVertical: 14, borderRadius: DS.radius.md,
    alignItems: 'center', backgroundColor: DS.colors.primary,
    ...DS.shadow.primary,
  },
  modalConfirmText: { color: '#FFF', fontSize: DS.font.bodyMd, fontWeight: '800' },
});
