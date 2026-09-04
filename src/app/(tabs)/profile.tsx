import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ProfileScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.avatar}><ThemedText style={styles.avatarText}>M</ThemedText></View>
      <ThemedText style={styles.title}>Michael</ThemedText>
      <ThemedText style={styles.subtitle}>Your VoicePad profile</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5FB', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#DCE7FA', borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#21499A', fontSize: 28, fontWeight: '800' },
  title: { color: '#182235', fontSize: 26, fontWeight: '800', marginTop: 18 },
  subtitle: { color: '#687384', fontSize: 15, marginTop: 8 },
});
