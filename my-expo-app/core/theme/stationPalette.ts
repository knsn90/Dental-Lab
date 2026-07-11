// core/theme/stationPalette.ts
// Teknisyen istasyon paneli — tech-blue paleti (DS.tech).

import { useThemeModeStore } from '../store/themeModeStore';

export const STATION_PALETTE = {
  // Yüzeyler
  pageBg:     '#F5F9FD',  // tech bg — açık mavi (tüm sayfalar tek renk)
  panelBg:    '#F4F8FC',  // tech bgSoft — çok soluk
  surface:    '#FFFFFF',
  surfaceAlt: '#F4F8FC',

  // Mürekkep
  ink900:     '#0A0A0A',
  ink700:     '#3C3C3C',
  ink500:     '#6B6B6B',
  ink400:     '#9A9A9A',
  ink300:     '#C8C8C8',
  ink100:     '#EFECE5',
  ink50:      '#F8F6F1',

  // Aksan — tech blue
  accent:     '#3B82F6',  // primary — parlak mavi
  accentDeep: '#1E5FBF',  // koyu mavi
  accentSoft: '#BFDBFE',  // pill bg
  accentTint: '#EAF2FA',  // çok soluk

  // High-contrast CTA — koyu denim
  ctaBg:      '#0F2840',
  ctaBgHover: '#1E5FBF',
  ctaInk:     '#FFFFFF',

  // Durum tonları
  warning:    '#B5752A',
  warningBg:  'rgba(217,119,6,0.10)',
  danger:     '#DC2626',
  dangerBg:   'rgba(220,38,38,0.10)',
  success:    '#059669',
  successBg:  'rgba(5,150,105,0.10)',
} as const;

// ── Gece modu (dark) varyantı — STATION_PALETTE ile birebir aynı anahtarlar ──
export const STATION_PALETTE_DARK = {
  // Yüzeyler — koyu denim/lacivert tonlar
  pageBg:     '#0E141C',
  panelBg:    '#141C26',
  surface:    '#18212D',
  surfaceAlt: '#1F2A38',

  // Mürekkep — açık üstüne ters
  ink900:     '#F3F6FA',
  ink700:     '#D2DAE4',
  ink500:     '#9AA6B4',
  ink400:     '#717E8D',
  ink300:     '#4C5868',
  ink100:     'rgba(255,255,255,0.12)',
  ink50:      'rgba(255,255,255,0.05)',

  // Aksan — koyu zeminde biraz daha parlak mavi
  accent:     '#5B9BFF',
  accentDeep: '#3B82F6',
  accentSoft: '#1E3A5F',
  accentTint: '#15233A',

  // High-contrast CTA
  ctaBg:      '#3B82F6',
  ctaBgHover: '#5B9BFF',
  ctaInk:     '#FFFFFF',

  // Durum tonları
  warning:    '#E5A33A',
  warningBg:  'rgba(229,163,58,0.16)',
  danger:     '#F26A6A',
  dangerBg:   'rgba(242,106,106,0.16)',
  success:    '#3FB984',
  successBg:  'rgba(63,185,132,0.16)',
} as const;

export type StationPalette = typeof STATION_PALETTE;

/**
 * Gece moduna duyarlı istasyon paleti. Bileşen içinde çağrılır (Rules of Hooks).
 * resolvedDark true ise koyu varyantı döndürür; aksi halde açık paleti.
 */
export function useStationTheme(): StationPalette {
  const dark = useThemeModeStore((s: any) => s.resolvedDark);
  return (dark ? STATION_PALETTE_DARK : STATION_PALETTE) as StationPalette;
}

/** Hex → rgba helper. */
export function hexA(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
