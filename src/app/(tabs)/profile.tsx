import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NOTES_STORAGE_KEY, Note } from '@/lib/notes';

export default function ProfileScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(NOTES_STORAGE_KEY).then((saved) => setNotes(saved ? JSON.parse(saved) : []));
  }, []));
  const ready = notes.filter((note) => note.transcriptionStatus === 'ready').length;
  const pending = notes.filter((note) => note.transcriptionStatus === 'pending').length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.avatar}><ThemedText style={styles.avatarText}>M</ThemedText></View>
          <ThemedText style={styles.title}>Michael</ThemedText>
          <ThemedText style={styles.subtitle}>Your VoicePad workspace</ThemedText>
          <View style={styles.stats}><Stat value={String(notes.length)} label="Total notes" /><Stat value={String(ready)} label="Transcribed" /><Stat value={String(pending)} label="In progress" /></View>
          <ThemedText style={styles.sectionTitle}>Settings</ThemedText>
          <Pressable onPress={() => Alert.alert('Transcription server', 'The server URL is configured through EXPO_PUBLIC_TRANSCRIPTION_API_URL.')} style={styles.row}><ThemedText style={styles.rowTitle}>Transcription server</ThemedText><ThemedText style={styles.rowAction}>View</ThemedText></Pressable>
          <Pressable onPress={() => Alert.alert('About VoicePad', 'Capture the thought before it gets away.')} style={styles.row}><ThemedText style={styles.rowTitle}>About VoicePad</ThemedText><ThemedText style={styles.rowAction}>View</ThemedText></Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><ThemedText style={styles.statValue}>{value}</ThemedText><ThemedText style={styles.statLabel}>{label}</ThemedText></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5FB' },
  safeArea: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#DCE7FA', borderWidth: 2, borderColor: '#B5C2D8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#21499A', fontSize: 28, fontWeight: '800' },
  title: { color: '#182235', fontSize: 28, fontWeight: '800', marginTop: 16 },
  subtitle: { color: '#687384', fontSize: 15, marginTop: 7 },
  stats: { flexDirection: 'row', width: '100%', maxWidth: 560, gap: 10, marginTop: 30 },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 17, alignItems: 'center', borderWidth: 1, borderColor: '#E1E7F0' },
  statValue: { color: '#21499A', fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#687384', fontSize: 11, marginTop: 5, textAlign: 'center' },
  sectionTitle: { alignSelf: 'flex-start', color: '#182235', fontSize: 19, fontWeight: '800', marginTop: 38, marginBottom: 12 },
  row: { width: '100%', maxWidth: 560, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E1E7F0' },
  rowTitle: { color: '#182235', fontSize: 15, fontWeight: '700' },
  rowAction: { color: '#21499A', fontSize: 14, fontWeight: '800' },
});
