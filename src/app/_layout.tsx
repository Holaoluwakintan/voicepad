import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { useEffect } from 'react';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ConsentModal } from '@/components/consent-modal';
import { AuthProvider } from '@/lib/auth';
import { wakeUpTranscriptionServer } from '@/lib/transcription';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Pre-warm the cloud transcription server immediately on app launch
    wakeUpTranscriptionServer();
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
