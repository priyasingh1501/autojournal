import { StyleSheet } from 'react-native';

export const T = {
  // ── Font ────────────────────────────────────────────────────────────────────
  FONT: 'Avenir' as const,

  // ── Backgrounds ────────────────────────────────────────────────────────────
  BG_DEEP:      '#010c1a',
  BG_SURFACE:   '#020e20',

  // ── Glass surfaces ──────────────────────────────────────────────────────────
  GLASS:        'rgba(3, 18, 40, 0.72)',
  GLASS_LIGHT:  'rgba(6, 26, 55, 0.55)',
  GLASS_BORDER: 'rgba(72, 202, 228, 0.13)',
  GLASS_SHINE:  'rgba(255, 255, 255, 0.04)',

  // ── Accent colours ──────────────────────────────────────────────────────────
  CYAN:         '#48cae4',               // visible glass edges & glows
  NAVY:         '#002366',               // background fills & tints
  CYAN_DIM:     'rgba(72, 202, 228, 0.18)',
  CYAN_GLOW:    'rgba(72, 202, 228, 0.28)',
  TEAL:         '#00b4d8',
  DEEP_BLUE:    '#0077b6',

  // ── Semantic colours ────────────────────────────────────────────────────────
  DANGER:       '#e63946',
  DANGER_DIM:   'rgba(230, 57, 70, 0.18)',
  WARNING:      '#f4a261',
  WARNING_DIM:  'rgba(244, 162, 97, 0.15)',
  SUCCESS:      '#06d6a0',
  SUCCESS_DIM:  'rgba(6, 214, 160, 0.15)',

  // ── Text ────────────────────────────────────────────────────────────────────
  TEXT_PRIMARY:   'rgba(224, 242, 254, 0.95)',
  TEXT_SECONDARY: 'rgba(147, 210, 232, 0.65)',
  TEXT_MUTED:     'rgba(147, 210, 232, 0.60)',
  TEXT_DISABLED:  'rgba(100, 160, 185, 0.25)',
};

export const glassCard = {
  backgroundColor: 'rgba(3, 18, 40, 0.72)' as const,
  borderWidth: 1,
  borderColor: 'rgba(72, 202, 228, 0.13)' as const,
  borderRadius: 20,
  shadowColor: '#48cae4' as const,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 8,
};

export const glassCardLight = {
  backgroundColor: 'rgba(6, 26, 55, 0.55)' as const,
  borderWidth: 1,
  borderColor: 'rgba(72, 202, 228, 0.13)' as const,
  borderRadius: 20,
  shadowColor: '#48cae4' as const,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};
