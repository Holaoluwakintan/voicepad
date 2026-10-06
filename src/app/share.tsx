/**
 * Entry point for audio shared into VoicePad from the Android Share sheet
 * (e.g. WhatsApp: long-press a voice note → Share → VoicePad).
 *
 * MainActivity copies the shared content:// stream into the app cache and opens
 * voicepad://share?file=…&name=…&mime=…&from=… — this route hands that file to
 * the recorder screen, which imports and transcribes it like an uploaded file.
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DS } from '@/constants/design';

export default function ShareScreen() {
  const router = useRouter();
  const { file, name, mime, from, at } = useLocalSearchParams<{
    file?: string;
    name?: string;
    mime?: string;
    from?: string;
    at?: string;
  }>();

  useEffect(() => {
    if (!file) {
      router.replace('/(tabs)');
      return;
    }
    router.replace({
      pathname: '/note/record',
      params: {
        sharedFile: file,
        sharedName: name ?? '',
        sharedMime: mime ?? '',
        sharedFrom: from ?? '',
        sharedAt: at ?? String(Date.now()),
      },
    });
  }, [file, name, mime, from, at, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.colors.night }}>
      <ActivityIndicator color="#ffffff" />
    </View>
  );
}
