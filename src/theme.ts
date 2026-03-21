import { StyleSheet } from 'react-native';

export const T = {
  // ── Font ────────────────────────────────────────────────────────────────────
  FONT: 'Avenir' as const,

  // ── Backgrounds ────────────────────────────────────────────────────────────
  BG_DEEP:      '#02060E',
  BG_SURFACE:   '#040d1e',

  // ── Glass surfaces ──────────────────────────────────────────────────────────
  GLASS:        'rgba(2, 6, 14, 0.72)',
  GLASS_LIGHT:  'rgba(4, 13, 30, 0.60)',
  GLASS_BORDER: 'rgba(152, 212, 250, 0.13)',
  GLASS_SHINE:  'rgba(255, 255, 255, 0.04)',

  // ── Accent colours ──────────────────────────────────────────────────────────
  CYAN:         '#98D4FA',               // glow, strokes, glass edges
  NAVY:         '#0929AD',               // button fills & tints
  CYAN_DIM:     'rgba(152, 212, 250, 0.18)',
  CYAN_GLOW:    'rgba(152, 212, 250, 0.28)',
  TEAL:         '#00b4d8',
  DEEP_BLUE:    '#0929AD',

  // ── Semantic colours ────────────────────────────────────────────────────────
  DANGER:       '#e63946',
  DANGER_DIM:   'rgba(230, 57, 70, 0.18)',
  WARNING:      '#f4a261',
  WARNING_DIM:  'rgba(244, 162, 97, 0.15)',
  SUCCESS:      '#06d6a0',
  SUCCESS_DIM:  'rgba(6, 214, 160, 0.15)',

  // ── Text ────────────────────────────────────────────────────────────────────
  TEXT_PRIMARY:   'rgba(224, 242, 254, 0.95)',
  TEXT_SECONDARY: 'rgba(152, 212, 250, 0.65)',
  TEXT_MUTED:     'rgba(152, 212, 250, 0.60)',
  TEXT_DISABLED:  'rgba(100, 160, 185, 0.25)',
};

export const glassCard = {
  backgroundColor: 'rgba(2, 6, 14, 0.72)' as const,
  borderWidth: 1,
  borderColor: 'rgba(152, 212, 250, 0.13)' as const,
  borderRadius: 20,
  shadowColor: '#98D4FA' as const,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 8,
};

export const glassCardLight = {
  backgroundColor: 'rgba(4, 13, 30, 0.60)' as const,
  borderWidth: 1,
  borderColor: 'rgba(152, 212, 250, 0.13)' as const,
  borderRadius: 20,
  shadowColor: '#98D4FA' as const,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};
