export type ThemeId = 'darkNavy' | 'darkBlack' | 'darkPurple' | 'light' | 'cream' | 'oceanBlue';

export interface ColorScheme {
  id: ThemeId;
  nameAr: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentAudio: string;
  accentDanger: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  card: string;
  cardElevated: string;
  overlay: string;
  recordingRed: string;
  waveform: string;
  radius: number;
  tabBar: string;
  canvasBg: string;
  isDark: boolean;
  statusBar: 'light' | 'dark';
}

export const THEMES: Record<ThemeId, ColorScheme> = {
  darkNavy: {
    id: 'darkNavy',
    nameAr: 'أزرق داكن',
    background: '#0A0F1E',
    surface: '#111827',
    surfaceElevated: '#1A2235',
    border: '#1E2D45',
    primary: '#4F8EF7',
    primaryLight: '#6BA3FA',
    accent: '#10B981',
    accentAudio: '#F59E0B',
    accentDanger: '#EF4444',
    foreground: '#F1F5F9',
    muted: '#94A3B8',
    mutedForeground: '#64748B',
    card: '#141D2E',
    cardElevated: '#1A2540',
    overlay: 'rgba(0,0,0,0.75)',
    recordingRed: '#EF4444',
    waveform: '#4F8EF7',
    radius: 14,
    tabBar: '#0D1526',
    canvasBg: '#0D1321',
    isDark: true,
    statusBar: 'light',
  },
  darkBlack: {
    id: 'darkBlack',
    nameAr: 'أسود',
    background: '#000000',
    surface: '#0D0D0D',
    surfaceElevated: '#161616',
    border: '#242424',
    primary: '#60A5FA',
    primaryLight: '#93C5FD',
    accent: '#34D399',
    accentAudio: '#FBBF24',
    accentDanger: '#F87171',
    foreground: '#F1F5F9',
    muted: '#9CA3AF',
    mutedForeground: '#6B7280',
    card: '#111111',
    cardElevated: '#1A1A1A',
    overlay: 'rgba(0,0,0,0.85)',
    recordingRed: '#EF4444',
    waveform: '#60A5FA',
    radius: 14,
    tabBar: '#0A0A0A',
    canvasBg: '#050505',
    isDark: true,
    statusBar: 'light',
  },
  darkPurple: {
    id: 'darkPurple',
    nameAr: 'بنفسجي',
    background: '#0F0A1E',
    surface: '#1A1033',
    surfaceElevated: '#241544',
    border: '#2D1B58',
    primary: '#A78BFA',
    primaryLight: '#C4B5FD',
    accent: '#34D399',
    accentAudio: '#FBBF24',
    accentDanger: '#F87171',
    foreground: '#EDE9FE',
    muted: '#A5B4FC',
    mutedForeground: '#7C6FAC',
    card: '#140D2B',
    cardElevated: '#1E1240',
    overlay: 'rgba(0,0,0,0.75)',
    recordingRed: '#EF4444',
    waveform: '#A78BFA',
    radius: 14,
    tabBar: '#0C0820',
    canvasBg: '#0C0820',
    isDark: true,
    statusBar: 'light',
  },
  light: {
    id: 'light',
    nameAr: 'فاتح',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    border: '#E2E8F0',
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    accent: '#10B981',
    accentAudio: '#F59E0B',
    accentDanger: '#EF4444',
    foreground: '#0F172A',
    muted: '#475569',
    mutedForeground: '#94A3B8',
    card: '#FFFFFF',
    cardElevated: '#F8FAFC',
    overlay: 'rgba(0,0,0,0.5)',
    recordingRed: '#EF4444',
    waveform: '#3B82F6',
    radius: 14,
    tabBar: '#FFFFFF',
    canvasBg: '#FFFFFF',
    isDark: false,
    statusBar: 'dark',
  },
  cream: {
    id: 'cream',
    nameAr: 'كريمي',
    background: '#FDF6E3',
    surface: '#FAF0D0',
    surfaceElevated: '#F5E6C0',
    border: '#E8D5A3',
    primary: '#B45309',
    primaryLight: '#D97706',
    accent: '#059669',
    accentAudio: '#D97706',
    accentDanger: '#DC2626',
    foreground: '#1C1008',
    muted: '#6B5B3E',
    mutedForeground: '#9C8B6E',
    card: '#FDF6E3',
    cardElevated: '#FAF0D0',
    overlay: 'rgba(0,0,0,0.45)',
    recordingRed: '#DC2626',
    waveform: '#B45309',
    radius: 14,
    tabBar: '#FAF0D0',
    canvasBg: '#FEFCE8',
    isDark: false,
    statusBar: 'dark',
  },
  oceanBlue: {
    id: 'oceanBlue',
    nameAr: 'أزرق محيط',
    background: '#001B2E',
    surface: '#012847',
    surfaceElevated: '#023560',
    border: '#054580',
    primary: '#38BDF8',
    primaryLight: '#7DD3FC',
    accent: '#06B6D4',
    accentAudio: '#FBBF24',
    accentDanger: '#F87171',
    foreground: '#E0F2FE',
    muted: '#7DD3FC',
    mutedForeground: '#38708F',
    card: '#011F3A',
    cardElevated: '#022D52',
    overlay: 'rgba(0,0,0,0.75)',
    recordingRed: '#EF4444',
    waveform: '#38BDF8',
    radius: 14,
    tabBar: '#011828',
    canvasBg: '#001020',
    isDark: true,
    statusBar: 'light',
  },
};

export const Colors = {
  dark: THEMES.darkNavy,
};
