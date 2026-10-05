import { Colors } from '@/constants/theme';

/**
 * VoicePad is designed as a light, paper-and-ink app with its own midnight
 * surfaces. Following the phone's dark mode made ThemedText turn white on the
 * light cards (unreadable on many Android phones), so the palette is fixed.
 */
export function useTheme() {
  return Colors.light;
}
