import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
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
    signInWithOAuth,
    resetPassword,
    updateProfile,
    deleteAccount,
    signOut,
  } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

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
        Alert.alert('Check your email', 'Confirm your email address, then return here to sign in.');
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

  async function handleOAuth(provider: 'google' | 'apple') {
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await signInWithOAuth(provider);
    setBusy(false);

    if (result.error) {
      const isUnsupported =
        result.error.toLowerCase().includes('unsupported') ||
        result.error.toLowerCase().includes('disabled');
      if (isUnsupported) {
        Alert.alert(
          `${provider === 'google' ? 'Google' : 'Apple'} Sign-In`,
          `${provider === 'google' ? 'Google' : 'Apple'} login is not enabled in your Supabase dashboard yet.\n\nPlease sign in or create an account using your email and password below!`
        );
      } else {
        Alert.alert(
          `${provider === 'google' ? 'Google' : 'Apple'} Sign In`,
          result.error
        );
      }
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
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const result = await syncNotes(user.id);
    setBusy(false);
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
            setBusy(true);
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch {}
            const res = await deleteAccount();
            setBusy(false);
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
                  disabled={busy}
                  onPress={() => handleOAuth('google')}
                  style={styles.googleButton}>
                  <ThemedText style={styles.oauthText}>🌐 Google</ThemedText>
                </Pressable>

                <Pressable
                  disabled={busy}
                  onPress={() => handleOAuth('apple')}
                  style={styles.appleButton}>
                  <ThemedText style={styles.appleText}> Apple</ThemedText>
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

              <Pressable disabled={busy} onPress={() => handleAuth('signIn')} style={styles.primaryButton}>
                <Text style={styles.primaryText}>{busy ? 'Signing in…' : '✉️  Sign In with Email'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => handleAuth('signUp')} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>{busy ? 'Please wait…' : '✨  Create Account'}</Text>
              </Pressable>
            </View>
          )}

          {user && (
            <View style={styles.accountCard}>
              <ThemedText style={styles.sectionTitle}>Cloud sync & voice backup</ThemedText>
              <ThemedText style={styles.noticeText}>
                Your voice notes and audio recordings are securely synced to your private Supabase cloud workspace.
              </ThemedText>
              <View style={styles.accountActions}>
                <Pressable disabled={busy} onPress={handleSync} style={[styles.primaryButton, styles.flexAction]}>
                  <Text style={styles.primaryText}>{busy ? 'Syncing…' : 'Sync now'}</Text>
                </Pressable>
                <Pressable disabled={busy} onPress={handleSignOut} style={[styles.secondaryButton, styles.flexAction, { backgroundColor: '#DC2626' }]}>
                  <Text style={styles.secondaryText}>Sign out</Text>
                </Pressable>
              </View>
              <Pressable disabled={busy} onPress={confirmDeleteAccount} style={styles.deleteAccountButton}>
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
  googleButton: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8DEEB', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  appleButton: { flex: 1, backgroundColor: '#000000', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  oauthText: { color: '#182235', fontSize: 14, fontWeight: '700' },
  appleText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
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
  flexAction: { flex: 1, width: 'auto' as any, marginTop: 0 },
  deleteAccountButton: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  deleteAccountText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  accountActions: { flexDirection: 'row', gap: 10 },
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
