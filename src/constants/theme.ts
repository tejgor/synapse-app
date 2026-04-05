export const colors = {
  // Backgrounds — warm dark layers (high contrast between levels)
  background: '#0A0A08',
  surface: '#1C1B18',
  surfaceRaised: '#282724',
  surfaceOverlay: '#333230',

  // Accent — brighter lavender
  accent: '#B49AE8',
  accentMuted: '#9580CC',
  accentSubtle: 'rgba(180,154,232,0.18)',

  // Secondary — sage green
  secondary: '#8BAF8B',
  secondarySubtle: 'rgba(139,175,139,0.12)',

  // Text hierarchy — warm grays
  text: '#EDEDEC',
  textSecondary: '#A8A8A3',
  textTertiary: '#7A7A74',
  textPlaceholder: '#55554F',

  // Status
  error: '#D4736C',
  errorSubtle: 'rgba(212,115,108,0.12)',
  success: '#6EAF7A',
  successSubtle: 'rgba(110,175,122,0.12)',
  warning: '#C9A85C',
  warningSubtle: 'rgba(201,168,92,0.12)',

  // Semantic
  searchBg: '#161614',
  border: '#3A3935',
  borderSubtle: '#302F2B',
  separator: '#2A2A26',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
};

/** SpaceMono — used for metadata, labels, counts, stats */
export const fontMono = 'SpaceMono';

export const typography = {
  display: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
  },
  /** Monospace — dates, counts, stats, platform labels */
  mono: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  /** Section label — uppercase, monospace */
  label: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.36,
    shadowRadius: 20,
    elevation: 10,
  },
  glow: {
    shadowColor: '#B49AE8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
};

export const animation = {
  duration: {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
  },
  spring: {
    default: { damping: 15, stiffness: 150, mass: 1 },
    gentle: { damping: 20, stiffness: 120, mass: 1 },
    snappy: { damping: 12, stiffness: 200, mass: 1 },
  },
};

export const platformColors: Record<string, string> = {
  tiktok: '#ff0050',
  instagram: '#E1306C',
  youtube: '#FF0000',
};

// Deterministic category → accent hue. Returns an HSL color string.
const CATEGORY_HUES = [
  '#A78BDA', '#8BAF8B', '#C9A85C', '#6EAFAF', '#DA8BA7',
  '#8B9FDA', '#AF8B6E', '#8BDAAF', '#DA8B8B', '#8BBFDA',
];

export function categoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_HUES[Math.abs(hash) % CATEGORY_HUES.length];
}

/** Returns a faint category-colored background tint for cards (8% opacity). */
export function categoryTint(category: string): string {
  return `${categoryColor(category)}14`;
}
