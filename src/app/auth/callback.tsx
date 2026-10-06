import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { completeOAuthFromUrl } from '@/lib/auth';
import { ThemedText } from '@/components/themed-text';
import { DS } from '@/constants/design';

/**
 * Deep-link landing for voicepad://auth/callback. The sign-in button usually
 * finishes the exchange itself from the browser result; this screen covers the
 * case where Android hands the link to the app instead (and never double-spends
 * the one-time code, because both paths share one exchange).
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const initialUrl = Linking.useURL();
  const [message, setMessage] = useState('Completing sign-in…');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setBusy(false);
        setMessage('Cloud accounts are not configured in this build.');
        return;
      }
      try {
        let url = initialUrl ?? '';
        if (!url.includes('code=') && !url.includes('access_token=') && !url.includes('error')) {
          const qs = new URLSearchParams();
          if (params.code) qs.set('code', String(params.code));
          if (params.error) qs.set('error', String(params.error));
          if (params.error_description) qs.set('error_description', String(params.error_description));
          url = `voicepad://auth/callback?${qs.toString()}`;
        }
        const session = await completeOAuthFromUrl(supabase, url);
        if (cancelled) return;
        if (session) {
          router.replace('/(tabs)/profile');
          return;
        }
        setBusy(false);
        setMessage('Sign-in did not finish. Please go back and try again.');
      } catch (err) {
        if (cancelled) return;
        setBusy(false);
        setMessage(`Could not complete sign-in: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [initialUrl, params.code, params.error, params.error_description, router]);

  return (
    <View style={styles.container}>
      {busy && <ActivityIndicator color={DS.colors.primary} size="large" />}
      <ThemedText style={styles.message}>{message}</ThemedText>
      {!busy && (
        <ThemedText style={styles.link} onPress={() => router.replace('/(tabs)/profile')}>
          Back to profile
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 28 },
  message: { marginTop: 18, color: DS.colors.inkMuted, textAlign: 'center', fontSize: 16 },
  link: { marginTop: 20, color: DS.colors.primary, fontSize: 16, fontWeight: '600' },
});
