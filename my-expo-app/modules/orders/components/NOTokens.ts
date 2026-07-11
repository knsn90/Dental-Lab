/**
 * NOTokens — Yeni Sipariş (Variation C) tasarım token'ları
 * ─────────────────────────────────────────────────────────
 * Handoff'a özel renkler ve tipografi — dsTokens.ts'i extend eder.
 */
import { DS } from '../../../core/theme/dsTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

// ── Renkler ────────────────────────────────────────────────────────
export const NO = {
  /** Sayfa dış zemin */
  bgPage:    '#E8E5DD',
  /** Krem form alanı / stepper zemin */
  bgStage:   '#F5F2EA',
  /** Input field bg — beyaz, sayfa cream bg'den ayrışsın */
  bgInput:   '#FFFFFF',
  /** Saffron soft badge bg */
  saffronSoft: '#FFF6D9',

  /** Border nüansları */
  borderSoft:   'rgba(0,0,0,0.05)',
  borderMedium: 'rgba(0,0,0,0.10)',
  borderDashed: 'rgba(0,0,0,0.12)',
  borderStrong: DS.ink[900],

  /** Saffron (primary accent) */
  saffron:     DS.lab.primary,   // #F5C24B
  saffronTint: 'rgba(245,194,75,0.2)',

  /** Semantic */
  success: DS.lab.success,       // #2D9A6B
  error:   '#9C2E2E',

  /** Ink shortcuts */
  inkStrong: DS.ink[900],        // #0A0A0A
  inkMedium: '#3C3C3C',
  inkSoft:   DS.ink[500],        // #6B6B6B
  inkMute:   DS.ink[400],        // #9A9A9A
};

// ── Tipografi ──────────────────────────────────────────────────────
export const NOType = {
  displayXl: {
    fontSize: 32,
    fontWeight: '300' as const,
    letterSpacing: -0.96, // -0.03em × 32
    lineHeight: 35,
    fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  },
  headingMd: {
    fontSize: 18,
    fontWeight: '500' as const,
    letterSpacing: -0.36, // -0.02em × 18
  },
  headingSm: {
    fontSize: 16,
    fontWeight: '500' as const,
    letterSpacing: -0.16, // -0.01em × 16
  },
  bodyMd: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  bodySm: {
    fontSize: 13,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  micro: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 1.1, // ~0.1em
    textTransform: 'uppercase' as const,
    color: NO.inkMute,
  },
  nano: {
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.0,
    textTransform: 'uppercase' as const,
  },
};

// ── Dark variant ───────────────────────────────────────────────────
export const NO_DARK = {
  ...NO,
  bgPage:    '#0E0E0E',
  bgStage:   '#16140F',
  bgInput:   '#1B1916',
  saffronSoft: 'rgba(245,194,75,0.18)',

  borderSoft:   'rgba(255,255,255,0.05)',
  borderMedium: 'rgba(255,255,255,0.10)',
  borderDashed: 'rgba(255,255,255,0.14)',
  borderStrong: '#F7F2E9',

  inkStrong: '#F7F2E9',
  inkMedium: 'rgba(247,242,233,0.78)',
  inkSoft:   'rgba(247,242,233,0.55)',
  inkMute:   'rgba(247,242,233,0.45)',
};

export function useNOTokens() {
  const dark = useThemeModeStore(s => s.resolvedDark);
  return dark ? NO_DARK : NO;
}

// ── Radius ─────────────────────────────────────────────────────────
export const NORadius = {
  sm: 7,
  md: 12,
  lg: 18,
  xl: 22,
  pill: 999,
};
