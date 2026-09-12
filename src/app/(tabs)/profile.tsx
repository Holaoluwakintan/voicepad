import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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
import { useAuth } from '@/lib/auth';
import { loadNotes, Note } from '@/lib/notes';
import { syncNotes } from '@/lib/sync';

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

  // Password Reset Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Edit Name Modal State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadNotes().then(setNotes);
    }, [])
  );

  const ready = notes.filter((note) => note.transcriptionStatus === 'ready').length;
  const pending = notes.filter((note) => note.transcriptionStatus === 'pending').length;

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
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setAuthAction(null);

    if (result.error) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      Alert.alert(mode === 'signIn' ? 'Sign in failed' : 'Account creation failed', result.error);
    } else if (mode === 'signUp') {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      if ('needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        setUnconfirmedEmail(email.trim());
        Alert.alert(
          'Confirm your email',
          `A verification link has been sent to ${email.trim()}.\n\nPlease check your Inbox and Spam/Junk folder, verify your address, and sign in.\n\nDid not get the email? You can resend it below.`
        );
      } else {
        setSyncMessage('Account ready. Your notes will sync automatically.');
      }
    } else {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setSyncMessage('Signed in. Your notes will sync automatically.');
    }
  }

  async function handleResendConfirmation() {
    const target = unconfirmedEmail || email.trim();
    if (!target) {
      Alert.alert('Email required', 'Enter your email address to resend the verification link.');
      return;
    }
    setAuthAction('resend');
    const res = await resendConfirmation(target);
    setAuthAction(null);
    if (res.error) {
      Alert.alert('Resend failed', res.error);
    } else {
      Alert.alert(
        'Confirmation Resent',
        `A new confirmation email was sent to ${target}.\n\nPlease check your Spam, Junk, or Promotions tab.`
      );
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setAuthAction(provider);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await signInWithOAuth(provider);
    setAuthAction(null);

    if (result.error) {
      Alert.alert(
        `${provider === 'google' ? 'Google' : 'Apple'} Sign-In`,
        `${result.error}\n\nPlease sign in or create an account using your email and password below!`
      );
    }
  }

  async function handlePasswordReset() {
    if (!resetEmail.trim()) {
      Alert.alert('Email required', 'Please enter your account email.');
      return;
    }
    try {
      setIsResetting(true);
      const result = await resetPassword(resetEmail);
      if (result.error) {
        Alert.alert('Reset failed', result.error);
      } else {
        Alert.alert('Check your email', 'A password reset link has been sent to your email.');
        setIsResetModalOpen(false);
      }
    } finally {
      setIsResetting(false);
    }
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) return;
    try {
      setIsUpdatingProfile(true);
      const result = await updateProfile(fullName);
      if (result.error) {
        Alert.alert('Update failed', result.error);
      } else {
        setIsEditProfileOpen(false);
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  async function handleSync() {
    if (!user) return;
    setAuthAction('sync');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const result = await syncNotes(user.id);
    setAuthAction(null);
    setSyncMessage(result.ok ? 'Synced just now.' : result.message ?? 'Sync unavailable.');
    if (result.ok) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setNotes(await loadNotes());
    }
  }

  async function handleSignOut() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    const result = await signOut();
    if (result.error) {
      Alert.alert('Could not sign out', result.error);
    } else {
      setSyncMessage('Signed out. Local notes remain on this device.');
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account?',
      'This will permanently delete your VoicePad account and cloud data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setAuthAction('sync');
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch {}
            const res = await deleteAccount();
            setAuthAction(null);
            if (res.error) {
              Alert.alert('Could not delete account', res.error);
            } else {
              Alert.alert('Account Deleted', 'Your account has been deleted.');
            }
          },
        },
      ]
    );
  }

  const userDisplayName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'VoicePad User';
  const avatarLetter = (userDisplayName[0] || 'V').toUpperCase();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>{avatarLetter}</ThemedText>
          </View>
          <ThemedText style={styles.title}>{userDisplayName}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {user ? (user.email ?? 'Cloud workspace connected') : 'Your local VoicePad workspace'}
          </ThemedText>

          {user && (
            <Pressable
              onPress={() => {
                setFullName(user.user_metadata?.full_name || '');
                setIsEditProfileOpen(true);
              }}
              style={styles.editProfileButton}>
              <ThemedText style={styles.editProfileText}>✎ Edit display name</ThemedText>
            </Pressable>
          )}

          <View style={styles.stats}>
            <Stat value={String(notes.length)} label="Total notes" />
            <Stat value={String(ready)} label="Transcribed" />
            <Stat value={String(pending)} label="In progress" />
          </View>

          {!configured && (
            <View style={styles.notice}>
              <ThemedText style={styles.noticeTitle}>Cloud accounts are not connected yet</ThemedText>
              <ThemedText style={styles.noticeText}>
                VoicePad is safely running local-first. Add your Supabase keys to .env to enable multi-device sync and cloud voice storage.
              </ThemedText>
            </View>
          )}

          {configured && !user && !authLoading && (
            <View style={styles.authCard}>
              <ThemedText style={styles.sectionTitle}>Sign in to sync your voices</ThemedText>

              {/* 1-Tap OAuth Providers */}
              <View style={styles.oauthRow}>
                <Pressable
                  disabled={Boolean(authAction)}
                  onPress={() => handleOAuth('google')}
                  style={({ pressed }) => [
                    styles.googleButton,
                    pressed && styles.oauthPressed,
                    authAction === 'google' && { opacity: 0.7 },
                  ]}>
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
                  style={({ pressed }) => [
                    styles.appleButton,
                    pressed && styles.oauthPressed,
                    authAction === 'apple' && { opacity: 0.7 },
                  ]}>
                  <ThemedText style={styles.appleText}>  Apple</ThemedText>
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
                placeholderTextColor="#9AA4B2"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#9AA4B2"
                secureTextEntry
                style={styles.input}
              />

              <Pressable
                onPress={() => {
                  setResetEmail(email);
                  setIsResetModalOpen(true);
                }}
                style={styles.forgotButton}>
                <ThemedText style={styles.forgotText}>Forgot password?</ThemedText>
              </Pressable>

              <Pressable
                disabled={Boolean(authAction)}
                onPress={() => handleAuth('signIn')}
                style={[
                  styles.primaryButton,
                  authAction && authAction !== 'signIn' && styles.buttonDimmed,
                ]}>
                {authAction === 'signIn' ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.primaryText}>  Signing in…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>✉️  Sign In with Email</Text>
                )}
              </Pressable>

              <Pressable
                disabled={Boolean(authAction)}
                onPress={() => handleAuth('signUp')}
                style={[
                  styles.secondaryButton,
                  authAction && authAction !== 'signUp' && styles.buttonDimmed,
                ]}>
                {authAction === 'signUp' ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.secondaryText}>  Creating account…</Text>
                  </View>
                ) : (
                  <Text style={styles.secondaryText}>✨  Create Account</Text>
                )}
              </Pressable>

              {unconfirmedEmail && (
                <View style={styles.unconfirmedCard}>
                  <ThemedText style={styles.unconfirmedTitle}>📩 Verification Email Sent</ThemedText>
                  <ThemedText style={styles.unconfirmedBody}>
                    A verification link was sent to{' '}
                    <ThemedText style={{ fontWeight: '800' }}>{unconfirmedEmail}</ThemedText>.
                    Please check your Inbox and Spam/Junk folder.
                  </ThemedText>
                  <Pressable
                    disabled={authAction === 'resend'}
                    onPress={handleResendConfirmation}
                    style={styles.resendButton}>
                    <Text style={styles.resendButtonText}>
                      {authAction === 'resend' ? 'Sending link…' : '🔄 Resend confirmation link'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {user && (
            <View style={styles.accountCard}>
              <ThemedText style={styles.sectionTitle}>Cloud sync & voice backup</ThemedText>
              <ThemedText style={styles.noticeText}>
                Your voice notes and audio recordings are securely synced to your private Supabase cloud workspace.
              </ThemedText>
              <View style={styles.accountActions}>
                <Pressable disabled={Boolean(authAction)} onPress={handleSync} style={styles.syncBtn}>
                  <Text style={styles.primaryText}>{authAction === 'sync' ? 'Syncing…' : 'Sync now'}</Text>
                </Pressable>
                <Pressable disabled={Boolean(authAction)} onPress={handleSignOut} style={styles.signOutBtn}>
                  <Text style={styles.secondaryText}>Sign out</Text>
                </Pressable>
              </View>
              <Pressable disabled={Boolean(authAction)} onPress={confirmDeleteAccount} style={styles.deleteAccountButton}>
                <ThemedText style={styles.deleteAccountText}>Delete Account & Data</ThemedText>
              </Pressable>
            </View>
          )}

          {!!syncMessage && <ThemedText style={styles.syncMessage}>{syncMessage}</ThemedText>}

          <ThemedText style={styles.sectionTitle}>App Info & Legal</ThemedText>
          <Pressable
            onPress={() =>
              Alert.alert('Transcription & AI Server', 'Configured through EXPO_PUBLIC_TRANSCRIPTION_API_URL. Proxying to Groq Whisper & Llama 3.3.')
            }
            style={styles.row}>
            <ThemedText style={styles.rowTitle}>Transcription & AI server</ThemedText>
            <ThemedText style={styles.rowAction}>Connected</ThemedText>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Privacy Policy',
                'VoicePad respects your privacy. Voice recordings and transcripts are encrypted in transit and stored in your private cloud bucket. We do not sell your personal data or use your private voice notes to train public AI models.'
              )
            }
            style={styles.row}>
            <ThemedText style={styles.rowTitle}>Privacy Policy</ThemedText>
            <ThemedText style={styles.rowAction}>View</ThemedText>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Terms of Service',
                'By using VoicePad, you agree to record only audio that you have permission to capture. All audio transcription and AI summaries are provided as-is for personal and professional productivity.'
              )
            }
            style={styles.row}>
            <ThemedText style={styles.rowTitle}>Terms of Service</ThemedText>
            <ThemedText style={styles.rowAction}>View</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('VoicePad v1.0', 'Capture your lectures, sermons, and meetings in high fidelity.')}
            style={styles.row}>
            <ThemedText style={styles.rowTitle}>About VoicePad</ThemedText>
            <ThemedText style={styles.rowAction}>v1.0.0</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Forgot Password Modal */}
      <Modal visible={isResetModalOpen} animationType="slide" transparent onRequestClose={() => setIsResetModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Reset password</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              Enter your email address and we will send you a password reset link.
            </ThemedText>
            <TextInput
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="Email address"
              placeholderTextColor="#9AA4B2"
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

      {/* Edit Profile Modal */}
      <Modal visible={isEditProfileOpen} animationType="slide" transparent onRequestClose={() => setIsEditProfileOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Edit Profile</ThemedText>
            <ThemedText style={styles.modalSubtitle}>Update your display name.</ThemedText>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              placeholderTextColor="#9AA4B2"
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5FB' },
  safeArea: { flex: 1 },
  content: { padding: 24, alignItems: 'center', paddingBottom: 50 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#DCE7FA', borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#21499A', fontSize: 32, fontWeight: '800' },
  title: { color: '#182235', fontSize: 20, fontWeight: '800', marginTop: 14, maxWidth: '100%' },
  subtitle: { color: '#687384', fontSize: 14, marginTop: 4 },
  editProfileButton: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editProfileText: { color: '#21499A', fontSize: 13, fontWeight: '700' },
  stats: { flexDirection: 'row', width: '100%', maxWidth: 560, gap: 10, marginTop: 26 },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E1E7F0' },
  statValue: { color: '#21499A', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#687384', fontSize: 11, marginTop: 4, textAlign: 'center' },
  authCard: { width: '100%', maxWidth: 560, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginTop: 22, borderWidth: 1, borderColor: '#E1E7F0' },
  oauthRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  googleButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D8DEEB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  googleBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  googleGContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: '#E1E7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGLogo: { fontSize: 13, fontWeight: '900', color: '#4285F4' },
  googleBrandText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  appleButton: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  oauthPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E1E7F0' },
  dividerText: { color: '#9AA4B2', fontSize: 12, marginHorizontal: 10 },
  accountCard: { width: '100%', maxWidth: 560, backgroundColor: '#EAF7F0', borderRadius: 20, padding: 20, marginTop: 22 },
  notice: { width: '100%', maxWidth: 560, backgroundColor: '#FFF7E5', borderRadius: 20, padding: 20, marginTop: 22 },
  noticeTitle: { color: '#8A5A00', fontSize: 15, fontWeight: '800' },
  noticeText: { color: '#687384', fontSize: 14, lineHeight: 21, marginTop: 6 },
  input: { height: 52, borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 14, paddingHorizontal: 16, color: '#182235', marginTop: 10, backgroundColor: '#FAFBFD' },
  forgotButton: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { color: '#21499A', fontSize: 13, fontWeight: '600' },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 14,
    width: '100%',
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  secondaryButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 10,
    width: '100%',
    elevation: 2,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  secondaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  buttonDimmed: { opacity: 0.6 },
  buttonLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  unconfirmedCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
    gap: 6,
  },
  unconfirmedTitle: { color: '#1D4ED8', fontSize: 15, fontWeight: '800' },
  unconfirmedBody: { color: '#3B82F6', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  resendButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
  },
  resendButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  flexAction: { flex: 1, width: 'auto' as any, marginTop: 0 },
  deleteAccountButton: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  deleteAccountText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  accountActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  syncBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  signOutBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    elevation: 2,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sectionTitle: { alignSelf: 'flex-start', color: '#182235', fontSize: 18, fontWeight: '800', marginTop: 26, marginBottom: 8 },
  syncMessage: { color: '#24835A', fontSize: 13, marginTop: 12, fontWeight: '700' },
  row: { width: '100%', maxWidth: 560, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E1E7F0' },
  rowTitle: { color: '#182235', fontSize: 15, fontWeight: '700' },
  rowAction: { color: '#21499A', fontSize: 14, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(23,21,42,0.45)', padding: 20 },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24 },
  modalTitle: { color: '#182235', fontSize: 20, fontWeight: '800' },
  modalSubtitle: { color: '#687384', fontSize: 14, marginTop: 6, marginBottom: 8 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E1E7F0' },
  modalCancelText: { color: '#687384', fontSize: 15, fontWeight: '700' },
  modalConfirmButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#21499A' },
  modalConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
