import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Alert, useColorScheme } from 'react-native';

import { useEffect } from 'react';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ConsentModal } from '@/components/consent-modal';
import { AuthProvider } from '@/lib/auth';
import { wakeUpTranscriptionServer } from '@/lib/transcription';
import { hasStorageRecovery, restoreNotesFromBackup } from '@/lib/notes';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Pre-warm the cloud transcription server immediately on app launch
    wakeUpTranscriptionServer();
    hasStorageRecovery().then((needsRecovery) => {
      if (!needsRecovery) return;
      Alert.alert(
        'Notes need recovery',
        'VoicePad could not read the local notes file. Your last backup may still be available.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restore backup',
            onPress: async () => {
              const restored = await restoreNotesFromBackup();
              Alert.alert(restored ? 'Notes restored' : 'No backup available', restored ? 'Your previous notes are available again.' : 'Please export or contact support before clearing app data.');
            },
          },
        ]
      );
    }).catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <ConsentModal />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="note/record" />
          <Stack.Screen name="note/[id]" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="terms" />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
