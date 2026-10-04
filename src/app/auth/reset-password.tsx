import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { DS } from '@/constants/design';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function updatePassword() {
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    if (password !== confirm) return Alert.alert('Passwords do not match', 'Enter the same password twice.');
    if (!supabase) return Alert.alert('Not configured', 'Cloud accounts are not configured in this build.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return Alert.alert('Could not update password', error.message);
    Alert.alert('Password updated', 'You can now continue using VoicePad.', [{ text: 'Continue', onPress: () => router.replace('/(tabs)/profile') }]);
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.eyebrow}>ACCOUNT RECOVERY</ThemedText>
      <ThemedText style={styles.title}>Create a new password</ThemedText>
      <ThemedText style={styles.subtitle}>Choose a password with at least 6 characters.</ThemedText>
      <TextInput value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry style={styles.input} autoCapitalize="none" />
      <TextInput value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secureTextEntry style={styles.input} autoCapitalize="none" />
      <Pressable disabled={saving} onPress={updatePassword} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <ThemedText style={styles.buttonText}>{saving ? 'Saving…' : 'Update password'}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.colors.canvas, padding: 24, justifyContent: 'center' },
  eyebrow: { color: DS.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: DS.colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: DS.colors.inkMuted, fontSize: 15, marginBottom: 24 },
  input: { backgroundColor: DS.colors.surface, borderColor: DS.colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, color: DS.colors.ink, marginBottom: 12 },
  button: { backgroundColor: DS.colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  pressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
