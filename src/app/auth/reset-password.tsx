import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { completeOAuthFromUrl } from '@/lib/auth';
import { ThemedText } from '@/components/themed-text';
import { DS } from '@/constants/design';

const EXPIRED_MESSAGE =
  'This reset link has expired or was already used. Request a new one from Profile → Forgot password.';

type LinkState = 'verifying' | 'ready' | 'failed';

/**
 * Landing screen for voicepad://auth/reset-password. The recovery email link
 * carries ?code=… (PKCE) or #access_token=…&refresh_token=…&type=recovery.
 * The recovery session has to exist before updateUser() can change the password,
 * so we complete it from the incoming URL first (shared one-time exchange).
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_code?: string; error_description?: string }>();
  const incomingUrl = Linking.useURL();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>('verifying');
  const [linkMessage, setLinkMessage] = useState('Verifying link…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setLinkState('failed');
        setLinkMessage('Cloud accounts are not configured in this build.');
        return;
      }
      try {
        let url = incomingUrl ?? (await Linking.getInitialURL()) ?? '';
        const urlHasAuth = /[?#&](code|access_token|error|error_description)=/.test(url);
        if (!urlHasAuth && (params.code || params.error || params.error_description)) {
          const qs = new URLSearchParams();
          if (params.code) qs.set('code', String(params.code));
          if (params.error) qs.set('error', String(params.error));
          if (params.error_description) qs.set('error_description', String(params.error_description));
          url = `voicepad://auth/reset-password?${qs.toString()}`;
        }
        const session = await completeOAuthFromUrl(supabase, url);
        if (cancelled) return;
        if (session) {
          setLinkState('ready');
          setLinkMessage('');
          return;
        }
        setLinkState('failed');
        setLinkMessage(EXPIRED_MESSAGE);
      } catch {
        if (cancelled) return;
        setLinkState('failed');
        setLinkMessage(EXPIRED_MESSAGE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incomingUrl, params.code, params.error, params.error_description]);

  async function updatePassword() {
    if (linkState !== 'ready') return;
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    if (password !== confirm) return Alert.alert('Passwords do not match', 'Enter the same password twice.');
    if (!supabase) return Alert.alert('Not configured', 'Cloud accounts are not configured in this build.');
    setSaving(true);
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) {
      setSaving(false);
      setLinkState('failed');
      setLinkMessage(EXPIRED_MESSAGE);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      if (/session missing|expired|invalid/i.test(error.message)) {
        setLinkState('failed');
        setLinkMessage(EXPIRED_MESSAGE);
        return;
      }
      return Alert.alert('Could not update password', error.message);
    }
    Alert.alert('Password updated', 'You can now continue using VoicePad.', [
      { text: 'Continue', onPress: () => router.replace('/(tabs)/profile') },
    ]);
  }

  const canSubmit = linkState === 'ready' && !saving;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.eyebrow}>ACCOUNT RECOVERY</ThemedText>
      <ThemedText style={styles.title}>Create a new password</ThemedText>
      {linkState === 'verifying' && (
        <View style={styles.statusRow}>
          <ActivityIndicator color={DS.colors.primary} />
          <ThemedText style={styles.statusText}>{linkMessage}</ThemedText>
        </View>
      )}
      {linkState === 'failed' && (
        <View style={styles.errorBox}>
          <ThemedText style={styles.errorText}>{linkMessage}</ThemedText>
          <ThemedText style={styles.link} onPress={() => router.replace('/(tabs)/profile')}>
            Back to profile
          </ThemedText>
        </View>
      )}
      {linkState !== 'failed' && (
        <>
          <ThemedText style={styles.subtitle}>Choose a password with at least 6 characters.</ThemedText>
          <TextInput value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry style={styles.input} autoCapitalize="none" editable={linkState === 'ready'} />
          <TextInput value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secureTextEntry style={styles.input} autoCapitalize="none" editable={linkState === 'ready'} />
          <Pressable disabled={!canSubmit} onPress={updatePassword} style={({ pressed }) => [styles.button, !canSubmit && styles.disabled, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>{saving ? 'Saving…' : linkState === 'verifying' ? 'Verifying link…' : 'Update password'}</ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas, padding: 24, justifyContent: 'center' },
  eyebrow: { color: DS.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: DS.colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: DS.colors.inkMuted, fontSize: 15, marginBottom: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  statusText: { color: DS.colors.inkMuted, fontSize: 15 },
  errorBox: { backgroundColor: DS.colors.surface, borderColor: DS.colors.border, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 8 },
  errorText: { color: DS.colors.ink, fontSize: 15, lineHeight: 22 },
  link: { marginTop: 14, color: DS.colors.primary, fontSize: 16, fontWeight: '600' },
  input: { backgroundColor: DS.colors.surface, borderColor: DS.colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, color: DS.colors.ink, marginBottom: 12 },
  button: { backgroundColor: DS.colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
