import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { DS } from '@/constants/design';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [message, setMessage] = useState('Completing sign-in…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (params.error) {
        if (!cancelled) setMessage(params.error_description || params.error);
        return;
      }
      if (!params.code) {
        if (!cancelled) setMessage('No sign-in code was returned. Please try again.');
        return;
      }
      if (!supabase) {
        if (!cancelled) setMessage('Cloud accounts are not configured in this build.');
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(String(params.code));
      if (cancelled) return;
      if (error) {
        setMessage(`Could not complete sign-in: ${error.message}`);
        return;
      }
      router.replace('/(tabs)/profile');
    })();
    return () => { cancelled = true; };
  }, [params.code, params.error, params.error_description, router]);

  return (
    <View style={styles.container}>
      {!params.error && !params.code && <ActivityIndicator color={DS.colors.primary} size="large" />}
      {params.code && message === 'Completing sign-in…' && <ActivityIndicator color={DS.colors.primary} size="large" />}
      <ThemedText style={styles.message}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 28 },
  message: { marginTop: 18, color: DS.colors.inkMuted, textAlign: 'center', fontSize: 16 },
});
