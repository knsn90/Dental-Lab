import { Platform } from 'react-native';
import { C } from './colors';

/**
 * Outfit font families (geometric sans-serif).
 * - On web: tek string yeterli, CSS weight axis tüm varyantları sağlıyor (Google Fonts CDN).
 * - On native: her weight ayrı yüklenmiş font dosyası (@expo-google-fonts/outfit).
 */
export const F = {
  light:    Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_300Light',
  regular:  Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_400Regular',
  medium:   Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_500Medium',
  semibold: Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_600SemiBold',
  bold:     Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_700Bold',
};

// ─── Font size scale ──────────────────────────────────────────────────────────
export const FS = {
  xs:   11,
  sm:   12,
  md:   14,
  base: 15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
} as const;

export const T = {
  // ── Existing (keep for backward compat) ────────────────────────────────────
  pageTitle:    { fontSize: 20, fontWeight: '600' as const, fontFamily: F.semibold, color: C.textPrimary, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 13, fontWeight: '600' as const, fontFamily: F.semibold, color: C.textPrimary, letterSpacing: -0.1 },
  body:         { fontSize: 14, fontWeight: '400' as const, fontFamily: F.regular,  color: C.textSecondary },
  bodyBold:     { fontSize: 14, fontWeight: '500' as const, fontFamily: F.medium,   color: C.textPrimary },
  small:        { fontSize: 12, fontWeight: '400' as const, fontFamily: F.regular,  color: C.textMuted },
  label:        { fontSize: 11, fontWeight: '500' as const, fontFamily: F.medium,   color: C.textSecondary, letterSpacing: 0.3 },
  number:       { fontSize: 26, fontWeight: '600' as const, fontFamily: F.semibold, color: C.textPrimary },

  // ── Extended scale ─────────────────────────────────────────────────────────
  heroTitle:    { fontSize: FS['3xl'], fontWeight: '800' as const, fontFamily: F.bold, color: C.textPrimary, letterSpacing: -0.5, lineHeight: 36 },
  cardTitle:    { fontSize: FS.base,  fontWeight: '600' as const, fontFamily: F.semibold, color: C.textPrimary },
  cardLabel:    { fontSize: FS.sm,    fontWeight: '500' as const, fontFamily: F.medium,   color: C.textSecondary },
  caption:      { fontSize: FS.xs,    fontWeight: '400' as const, fontFamily: F.regular,  color: C.textMuted },
  metric:       { fontSize: FS['2xl'],fontWeight: '700' as const, fontFamily: F.bold,    color: C.textPrimary, letterSpacing: -0.5 },
  metricSm:     { fontSize: FS.xl,    fontWeight: '700' as const, fontFamily: F.bold,    color: C.textPrimary, letterSpacing: -0.4 },
  modalTitle:   { fontSize: FS.xl,    fontWeight: '700' as const, fontFamily: F.bold,    color: C.textPrimary, letterSpacing: -0.3 },
  inputLabel:   { fontSize: FS.md,    fontWeight: '600' as const, fontFamily: F.semibold, color: C.textPrimary },
  inputError:   { fontSize: FS.sm,    fontWeight: '400' as const, fontFamily: F.regular,  color: C.danger },
  inputHint:    { fontSize: FS.sm,    fontWeight: '400' as const, fontFamily: F.regular,  color: C.textMuted },
  pill:         { fontSize: FS.sm,    fontWeight: '600' as const, fontFamily: F.semibold },
  badge:        { fontSize: FS.xs,    fontWeight: '600' as const, fontFamily: F.semibold },
  navLabel:     { fontSize: 13,       fontWeight: '500' as const, fontFamily: F.medium,   color: C.textSecondary },
};
