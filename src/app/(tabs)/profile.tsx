import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { loadNotes, Note } from '@/lib/notes';
import { syncNotes } from '@/lib/sync';

export default function ProfileScreen() {
  const { user, loading: authLoading, configured, signIn, signUp, signOut } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  useFocusEffect(useCallback(() => { loadNotes().then(setNotes); }, []));
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
    if (!email.trim() || password.length < 6) { Alert.alert('Check your details', 'Enter an email and a password with at least 6 characters.'); return; }
    setBusy(true);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.error) Alert.alert(mode === 'signIn' ? 'Sign in failed' : 'Account creation failed', result.error);
    else if (mode === 'signUp') {
      if ('needsEmailConfirmation' in result && result.needsEmailConfirmation) Alert.alert('Check your email', 'Confirm your email address, then return here to sign in.');
      else setSyncMessage('Account ready. Your notes will sync automatically.');
    } else setSyncMessage('Signed in. Your notes will sync automatically.');
  }
  async function handleSync() {
    if (!user) return;
    setBusy(true); const result = await syncNotes(user.id); setBusy(false);
    setSyncMessage(result.ok ? 'Synced just now.' : result.message ?? 'Sync unavailable.');
    if (result.ok) setNotes(await loadNotes());
  }
  async function handleSignOut() {
    const result = await signOut();
    if (result.error) Alert.alert('Could not sign out', result.error);
    else setSyncMessage('Signed out. Local notes remain on this device.');
  }

  return (
    <ThemedView style={styles.container}><SafeAreaView style={styles.safeArea}><View style={styles.content}>
      <View style={styles.avatar}><ThemedText style={styles.avatarText}>{user?.email?.[0]?.toUpperCase() ?? 'M'}</ThemedText></View>
      <ThemedText style={styles.title}>{user?.email ?? 'Michael'}</ThemedText>
      <ThemedText style={styles.subtitle}>{user ? 'Cloud workspace connected' : 'Your VoicePad workspace'}</ThemedText>
      <View style={styles.stats}><Stat value={String(notes.length)} label="Total notes" /><Stat value={String(ready)} label="Transcribed" /><Stat value={String(pending)} label="In progress" /></View>
      {!configured && <View style={styles.notice}><ThemedText style={styles.noticeTitle}>Cloud accounts are not connected yet</ThemedText><ThemedText style={styles.noticeText}>VoicePad is safely running local-first. Add the Supabase values from .env.example when your project is ready.</ThemedText></View>}
      {configured && !user && !authLoading && <View style={styles.authCard}><ThemedText style={styles.sectionTitle}>Sign in to sync</ThemedText><TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#9AA4B2" autoCapitalize="none" keyboardType="email-address" style={styles.input} /><TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#9AA4B2" secureTextEntry style={styles.input} /><Pressable disabled={busy} onPress={() => handleAuth('signIn')} style={styles.primaryButton}><ThemedText style={styles.primaryText}>{busy ? 'Please wait…' : 'Sign in'}</ThemedText></Pressable><Pressable disabled={busy} onPress={() => handleAuth('signUp')} style={styles.secondaryButton}><ThemedText style={styles.secondaryText}>Create account</ThemedText></Pressable></View>}
      {user && <View style={styles.accountCard}><ThemedText style={styles.sectionTitle}>Cloud sync</ThemedText><ThemedText style={styles.noticeText}>Your notes are stored under your account and protected by database access rules.</ThemedText><View style={styles.accountActions}><Pressable disabled={busy} onPress={handleSync} style={styles.primaryButton}><ThemedText style={styles.primaryText}>{busy ? 'Syncing…' : 'Sync now'}</ThemedText></Pressable><Pressable disabled={busy} onPress={handleSignOut} style={styles.secondaryButton}><ThemedText style={styles.secondaryText}>Sign out</ThemedText></Pressable></View></View>}
      {!!syncMessage && <ThemedText style={styles.syncMessage}>{syncMessage}</ThemedText>}
      <ThemedText style={styles.sectionTitle}>Settings</ThemedText><Pressable onPress={() => Alert.alert('Transcription server', 'The server URL is configured through EXPO_PUBLIC_TRANSCRIPTION_API_URL.')} style={styles.row}><ThemedText style={styles.rowTitle}>Transcription server</ThemedText><ThemedText style={styles.rowAction}>View</ThemedText></Pressable><Pressable onPress={() => Alert.alert('About VoicePad', 'Capture the thought before it gets away.')} style={styles.row}><ThemedText style={styles.rowTitle}>About VoicePad</ThemedText><ThemedText style={styles.rowAction}>View</ThemedText></Pressable>
    </View></SafeAreaView></ThemedView>
  );
}
function Stat({ value, label }: { value: string; label: string }) { return <View style={styles.stat}><ThemedText style={styles.statValue}>{value}</ThemedText><ThemedText style={styles.statLabel}>{label}</ThemedText></View>; }
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5FB' }, safeArea: { flex: 1 }, content: { padding: 24, alignItems: 'center', paddingBottom: 50 }, avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#DCE7FA', borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#21499A', fontSize: 28, fontWeight: '800' }, title: { color: '#182235', fontSize: 21, fontWeight: '800', marginTop: 16, maxWidth: '100%' }, subtitle: { color: '#687384', fontSize: 15, marginTop: 7 }, stats: { flexDirection: 'row', width: '100%', maxWidth: 560, gap: 10, marginTop: 30 }, stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 17, alignItems: 'center', borderWidth: 1, borderColor: '#E1E7F0' }, statValue: { color: '#21499A', fontSize: 22, fontWeight: '800' }, statLabel: { color: '#687384', fontSize: 11, marginTop: 5, textAlign: 'center' }, authCard: { width: '100%', maxWidth: 560, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginTop: 22, borderWidth: 1, borderColor: '#E1E7F0' }, accountCard: { width: '100%', maxWidth: 560, backgroundColor: '#EAF7F0', borderRadius: 18, padding: 18, marginTop: 22 }, notice: { width: '100%', maxWidth: 560, backgroundColor: '#FFF7E5', borderRadius: 18, padding: 18, marginTop: 22 }, noticeTitle: { color: '#8A5A00', fontSize: 15, fontWeight: '800' }, noticeText: { color: '#687384', fontSize: 14, lineHeight: 21, marginTop: 7 }, input: { height: 52, borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 14, paddingHorizontal: 15, color: '#182235', marginTop: 10, backgroundColor: '#FAFBFD' }, primaryButton: { backgroundColor: '#21499A', borderRadius: 13, alignItems: 'center', paddingVertical: 13, marginTop: 12, flex: 1 }, primaryText: { color: '#FFFFFF', fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: '#B9C7DD', borderRadius: 13, alignItems: 'center', paddingVertical: 12, marginTop: 10, flex: 1 }, secondaryText: { color: '#21499A', fontWeight: '800' }, accountActions: { flexDirection: 'row', gap: 10 }, sectionTitle: { alignSelf: 'flex-start', color: '#182235', fontSize: 19, fontWeight: '800', marginTop: 28, marginBottom: 6 }, syncMessage: { color: '#24835A', fontSize: 13, marginTop: 12 }, row: { width: '100%', maxWidth: 560, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E1E7F0' }, rowTitle: { color: '#182235', fontSize: 15, fontWeight: '700' }, rowAction: { color: '#21499A', fontSize: 14, fontWeight: '800' },
});
