import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#17152A',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#6D5DFB',
    accent: '#21499A',
  },
  dark: {
    text: '#ffffff',
    background: '#0D0B18',
    backgroundElement: '#1F1D2E',
    backgroundSelected: '#2B2840',
    textSecondary: '#B0B4BA',
    primary: '#8A7DFD',
    accent: '#3B6EC9',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const CategoryColors = {
  Lectures: {
    name: 'Lectures',
    badgeBg: '#DBEAFE',
    badgeText: '#1D4ED8',
    border: '#BFDBFE',
    dot: '#2563EB',
    icon: '🎓',
  },
  Sermons: {
    name: 'Sermons',
    badgeBg: '#D1FAE5',
    badgeText: '#047857',
    border: '#A7F3D0',
    dot: '#059669',
    icon: '🕊️',
  },
  Meetings: {
    name: 'Meetings',
    badgeBg: '#FEF3C7',
    badgeText: '#B45309',
    border: '#FDE68A',
    dot: '#D97706',
    icon: '💼',
  },
  Personal: {
    name: 'Personal',
    badgeBg: '#EDE9FE',
    badgeText: '#6D28D9',
    border: '#DDD6FE',
    dot: '#7C3AED',
    icon: '✨',
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 40,
  seven: 48,
  eight: 56,
  nine: 64,
  ten: 72,
  eleven: 80,
  twelve: 88,
  thirteen: 96,
};

export const MaxContentWidth = 800;
