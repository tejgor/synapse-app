export const colors = {
  // Backgrounds — warm dark layers
  background: '#121210',
  surface: '#1A1A17',
  surfaceRaised: '#222220',
  surfaceOverlay: '#2A2A27',

  // Accent — muted lavender
  accent: '#A78BDA',
  accentMuted: '#8B72BA',
  accentSubtle: 'rgba(167,139,218,0.12)',

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
  searchBg: '#1E1E1B',
  border: '#2E2E2A',
  borderSubtle: '#252522',
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
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#A78BDA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
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
