/**
 * VoicePad design system — "Ink & Aurora".
 *
 * Warm paper canvas, ink typography, one confident indigo, a coral record
 * accent, and deep midnight hero surfaces lit by a soft aurora. Every screen
 * pulls from these tokens so the whole app reads as one product.
 */
export const DS = {
  colors: {
    // Ink (text + midnight surfaces)
    ink: '#0F1117',
    inkSoft: '#1B1E29',
    inkMuted: '#666A77',
    muted: '#666A77',
    subtle: '#9A9DA8',

    // Paper
    canvas: '#F6F5F1',
    surface: '#FFFFFF',
    surfaceSoft: '#F0EEE8',
    surfaceDim: '#F0EEE8',
    surfaceGlass: 'rgba(255,255,255,0.86)',
    border: '#E8E5DD',
    borderStrong: '#D8D4CA',

    // Midnight (hero cards, record studio, tab bar)
    night: '#0E1018',
    nightSoft: '#171A26',
    nightRaised: '#20243A',
    nightBorder: 'rgba(255,255,255,0.08)',
    nightText: '#F4F3EF',
    nightMuted: 'rgba(244,243,239,0.62)',

    // Brand
    primary: '#5B4DF5',
    primaryDark: '#4338D6',
    primaryLight: '#ECEAFE',
    primaryGlow: 'rgba(91,77,245,0.30)',
    accent: '#8B80FF',
    accentLight: '#ECEAFE',
    aurora1: '#6C5CFF',
    aurora2: '#FF6B4A',
    aurora3: '#2EC5B6',

    // Record accent
    orange: '#FF5B3A',
    orangeDark: '#E5462A',
    orangeGlow: 'rgba(255,91,58,0.30)',

    // Status
    success: '#1F9D6E',
    successLight: '#E2F5EC',
    danger: '#E0475F',
    dangerLight: '#FCE9EC',
    warning: '#C98A1E',
    warningLight: '#FBF1DC',
    white: '#FFFFFF',
  },
  shadow: {
    card: {
      shadowColor: '#1B1A14', shadowOpacity: 0.05, shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 }, elevation: 1,
    },
    elevated: {
      shadowColor: '#1B1A14', shadowOpacity: 0.09, shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 }, elevation: 4,
    },
    floating: {
      shadowColor: '#0E1018', shadowOpacity: 0.22, shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 }, elevation: 12,
    },
    primary: {
      shadowColor: '#5B4DF5', shadowOpacity: 0.32, shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 }, elevation: 6,
    },
    orange: {
      shadowColor: '#FF5B3A', shadowOpacity: 0.34, shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 }, elevation: 6,
    },
    record: {
      shadowColor: '#FF5B3A', shadowOpacity: 0.45, shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 }, elevation: 10,
    },
  },
  radius: { xs: 10, sm: 14, md: 18, lg: 24, xl: 32, full: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 40 },
  font: {
    displayLg: 40, display: 32, h1: 26, h2: 21, h3: 18,
    body: 16, bodyMd: 15, sm: 14, xs: 13, xxs: 12, caption: 11,
  },
  // Editorial serif for big moments (hero greetings, screen titles, the timer label).
  // Falls back to the system font if it hasn't loaded.
  family: {
    display: 'InstrumentSerif',
    displayItalic: 'InstrumentSerif-Italic',
  },
  motion: { fast: 160, normal: 260, slow: 420 },
  category: {
    Lectures: { badgeBg: '#E9EEFD', badgeText: '#3655C2', border: '#D3DCFA', dot: '#4C6BE0', icon: '🎓', cardTint: '#F7F9FF', accent: '#4C6BE0' },
    Sermons: { badgeBg: '#E2F5EC', badgeText: '#1A7F5A', border: '#C6EAD9', dot: '#1F9D6E', icon: '🕊️', cardTint: '#F6FCF9', accent: '#1F9D6E' },
    Meetings: { badgeBg: '#FBF1DC', badgeText: '#9C6A12', border: '#F1DDB0', dot: '#C98A1E', icon: '💼', cardTint: '#FFFCF6', accent: '#C98A1E' },
    Personal: { badgeBg: '#ECEAFE', badgeText: '#4A3DD8', border: '#DAD5FD', dot: '#5B4DF5', icon: '✨', cardTint: '#FAF9FF', accent: '#5B4DF5' },
  },
} as const;

/** Display-serif text style helper (size in px). */
export function displayType(size: number, italic = false) {
  return {
    fontFamily: italic ? DS.family.displayItalic : DS.family.display,
    fontSize: size,
    lineHeight: Math.round(size * 1.12),
    fontWeight: '400' as const,
    letterSpacing: -0.2,
  };
}
