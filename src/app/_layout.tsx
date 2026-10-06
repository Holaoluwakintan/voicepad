import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Alert, Platform } from 'react-native';

import { useEffect } from 'react';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ConsentModal } from '@/components/consent-modal';
import { AutoSync } from '@/components/auto-sync';
import { AuthProvider } from '@/lib/auth';
import { wakeUpTranscriptionServer } from '@/lib/transcription';
import { hasStorageRecovery, restoreNotesFromBackup } from '@/lib/notes';
import { DS } from '@/constants/design';
import { initAdMob } from '@/lib/admob-init';

const VoicePadTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: DS.colors.canvas, card: DS.colors.surface, primary: DS.colors.primary, text: DS.colors.ink, border: DS.colors.border },
};

SplashScreen.preventAutoHideAsync();

// Deep links (e.g. audio shared in from WhatsApp) open on top of the tabs, so Back returns to the app.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  // The display serif is a nice-to-have: if it fails to load, text falls back to the system font.
  useFonts({
    InstrumentSerif: require('../../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('../../assets/fonts/InstrumentSerif-Italic.ttf'),
  });

  useEffect(() => {
    // Pre-warm the cloud transcription server immediately on app launch
    wakeUpTranscriptionServer();
    // Initialise AdMob once (moved out of render path for correct lifecycle)
    initAdMob();
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
      <ThemeProvider value={VoicePadTheme}>
        <StatusBar style="dark" />
        <AnimatedSplashOverlay />
        <ConsentModal />
        <AutoSync />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: DS.colors.canvas }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="share" options={{ animation: 'none' }} />
          <Stack.Screen name="note/record" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: DS.colors.night } }} />
          <Stack.Screen name="note/[id]" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="terms" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="auth/reset-password" />
          <Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
