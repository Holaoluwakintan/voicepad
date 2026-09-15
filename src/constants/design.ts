/**
 * VoicePad Design System — single source of truth for all tokens.
 * Import DS from here instead of declaring colors inline per screen.
 */

export const DS = {
  colors: {
    // Core brand
    primary: '#6D5DFB',        // indigo-purple — main CTAs
    primaryLight: '#EDE9FE',   // tinted bg for primary surfaces
    primaryGlow: 'rgba(109,93,251,0.22)',

    accent: '#21499A',         // deep blue — secondary actions
    accentLight: '#DCE7FA',

    orange: '#FF7A00',         // record FAB
    orangeGlow: 'rgba(255,122,0,0.30)',

    success: '#16A34A',
    successLight: '#DCFCE7',
    danger: '#DC2626',
    dangerLight: '#FEE2E2',
    warning: '#D97706',
    warningLight: '#FEF3C7',

    // Surfaces
    canvas: '#F1F5FB',         // page background
    surface: '#FFFFFF',        // card background
    surfaceGlass: 'rgba(255,255,255,0.72)',  // glassmorphism card
    surfaceDim: '#F8FAFD',

    // Text
    ink: '#182235',            // primary text
    muted: '#687384',          // secondary text
    subtle: '#9AA4B2',         // placeholder / tertiary

    // Borders
    border: '#E1E7F0',
    borderStrong: '#C8D4E8',
  },

  // Shadows (iOS shadow + Android elevation)
  shadow: {
    card: {
      shadowColor: '#182235',
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    elevated: {
      shadowColor: '#182235',
      shadowOpacity: 0.13,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    floating: {
      shadowColor: '#182235',
      shadowOpacity: 0.20,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    orange: {
      shadowColor: '#FF7A00',
      shadowOpacity: 0.38,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    primary: {
      shadowColor: '#6D5DFB',
      shadowOpacity: 0.32,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  },

  // Border radii
  radius: {
    xs: 8,
    sm: 12,
    md: 18,
    lg: 24,
    xl: 32,
    full: 9999,
  },

  // Font sizes
  font: {
    displayLg: 32,
    display: 28,
    h1: 24,
    h2: 20,
    h3: 18,
    body: 16,
    bodyMd: 15,
    sm: 14,
    xs: 13,
    xxs: 12,
    caption: 11,
  },

  // Category palette (used on home cards, detail screen, etc.)
  category: {
    Lectures: {
      badgeBg: '#DBEAFE',
      badgeText: '#1D4ED8',
      border: '#BFDBFE',
      dot: '#2563EB',
      icon: '🎓',
      cardTint: '#F0F7FF',
      accent: '#2563EB',
    },
    Sermons: {
      badgeBg: '#D1FAE5',
      badgeText: '#047857',
      border: '#A7F3D0',
      dot: '#059669',
      icon: '🕊️',
      cardTint: '#F0FDF4',
      accent: '#059669',
    },
    Meetings: {
      badgeBg: '#FEF3C7',
      badgeText: '#B45309',
      border: '#FDE68A',
      dot: '#D97706',
      icon: '💼',
      cardTint: '#FFFBEB',
      accent: '#D97706',
    },
    Personal: {
      badgeBg: '#EDE9FE',
      badgeText: '#6D28D9',
      border: '#DDD6FE',
      dot: '#7C3AED',
      icon: '✨',
      cardTint: '#F9F7FF',
      accent: '#7C3AED',
    },
  },
} as const;
