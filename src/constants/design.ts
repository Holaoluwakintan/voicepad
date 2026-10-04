/**
 * VoicePad Premium Design System.
 * One visual language for every surface, action, and transition.
 */
export const DS = {
  colors: {
    ink: '#111426',
    inkSoft: '#1B1F38',
    canvas: '#F7F7FB',
    surface: '#FFFFFF',
    surfaceSoft: '#F1F1F8',
    // Compatibility alias for existing screens during the staged redesign.
    surfaceDim: '#F1F1F8',
    surfaceGlass: 'rgba(255,255,255,0.82)',
    border: '#E7E7F0',
    borderStrong: '#D6D7E5',
    primary: '#7165F8',
    primaryDark: '#5146D8',
    primaryLight: '#EFEDFF',
    primaryGlow: 'rgba(113,101,248,0.24)',
    accent: '#9B8CFF',
    accentLight: '#E9E6FF',
    orange: '#FF7657',
    orangeDark: '#E95B3C',
    orangeGlow: 'rgba(255,118,87,0.28)',
    success: '#35B985',
    successLight: '#E3F8EF',
    danger: '#E45B72',
    dangerLight: '#FDECEF',
    warning: '#D99A38',
    warningLight: '#FFF4DF',
    inkMuted: '#74788C',
    muted: '#74788C',
    subtle: '#9B9EAE',
    white: '#FFFFFF',
  },
  shadow: {
    card: {
      shadowColor: '#111426', shadowOpacity: 0.055, shadowRadius: 16,
      shadowOffset: { width: 0, height: 5 }, elevation: 2,
    },
    elevated: {
      shadowColor: '#111426', shadowOpacity: 0.10, shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 }, elevation: 6,
    },
    floating: {
      shadowColor: '#111426', shadowOpacity: 0.18, shadowRadius: 30,
      shadowOffset: { width: 0, height: 12 }, elevation: 12,
    },
    primary: {
      shadowColor: '#7165F8', shadowOpacity: 0.32, shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    // Compatibility alias for existing upgrade/CTA styles.
    orange: {
      shadowColor: '#FF7657', shadowOpacity: 0.30, shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    record: {
      shadowColor: '#FF7657', shadowOpacity: 0.38, shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 }, elevation: 10,
    },
  },
  radius: { xs: 10, sm: 14, md: 20, lg: 26, xl: 34, full: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 40 },
  font: {
    displayLg: 34, display: 30, h1: 25, h2: 21, h3: 18,
    body: 16, bodyMd: 15, sm: 14, xs: 13, xxs: 12, caption: 11,
  },
  motion: { fast: 160, normal: 260, slow: 420 },
  category: {
    Lectures: { badgeBg: '#E8F0FF', badgeText: '#4169C6', border: '#C9D9FF', dot: '#557CE0', icon: '🎓', cardTint: '#F7F9FF', accent: '#557CE0' },
    Sermons: { badgeBg: '#E4F8F0', badgeText: '#258A67', border: '#BDEAD7', dot: '#35B985', icon: '🕊️', cardTint: '#F7FCFA', accent: '#35B985' },
    Meetings: { badgeBg: '#FFF2DF', badgeText: '#B97921', border: '#F6D9A7', dot: '#D99A38', icon: '💼', cardTint: '#FFFCF7', accent: '#D99A38' },
    Personal: { badgeBg: '#EFEDFF', badgeText: '#6658D9', border: '#D9D4FF', dot: '#7165F8', icon: '✨', cardTint: '#FBFAFF', accent: '#7165F8' },
  },
} as const;
