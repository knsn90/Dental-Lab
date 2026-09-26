/**
 * usePanelTheme — Aktif panel rotasına göre DS theme döndürür.
 *
 *   • /(lab)     → DS.lab    (saffron)
 *   • /(admin)   → DS.exec   (coral)
 *   • /(clinic)  → DS.clinic (sage)
 *   • /(doctor)  → DS.clinic (sage) — doctor panel'i clinic ile aynı palet
 *   • /(station) → DS.tech   (parlak mavi — teknisyen)
 *   • /(courier) → DS.tech   (parlak mavi — kurye; kendi paneli de mavi)
 *   • diğer      → DS.lab    (fallback)
 *
 * Hero kartlarda hardcoded DS.lab.bg yerine bu hook'tan dönen theme'i kullan.
 */
import { useSegments } from 'expo-router';
import { DS } from './dsTokens';

export type PanelThemeKey = 'lab' | 'clinic' | 'exec' | 'tech';

export interface PanelTheme {
  key: PanelThemeKey;
  bg: string;
  bgSoft: string;
  bgDeep: string;
  surface: string;
  primary: string;
  primaryDeep: string;
  accent: string;
}

function pickThemeFromSegment(seg: string): PanelTheme {
  if (seg === '(admin)')   return { key: 'exec',   ...DS.exec   } as PanelTheme;
  if (seg === '(platform)') return { key: 'exec',  ...DS.exec   } as PanelTheme; // süper-admin konsolu — Kobalt

  if (seg === '(clinic)')  return { key: 'clinic', ...DS.clinic } as PanelTheme;
  if (seg === '(doctor)')  return { key: 'clinic', ...DS.clinic } as PanelTheme;
  if (seg === '(station)') return { key: 'tech',   ...DS.tech   } as PanelTheme;
  // Kurye paneli de mavi (app/(courier)/_layout.tsx accent'i DS.tech.primary).
  // Haritası olmadığı için lab'a düşüyordu: paylaşılan ekranlar (Destek, Mesajlar,
  // Kurye Takip…) kurye panelinde SAFRAN çıkıyordu. PanelLoader'daki
  // '(courier)' → 'teknisyen' eşlemesiyle aynı karar.
  if (seg === '(courier)') return { key: 'tech',   ...DS.tech   } as PanelTheme;
  return { key: 'lab', ...DS.lab } as PanelTheme;
}

export function usePanelTheme(): PanelTheme {
  const segments = useSegments();
  const seg = String(segments?.[0] ?? '');
  return pickThemeFromSegment(seg);
}

/**
 * Bir accent zemin üzerine gelecek metin/ikon rengi — luminance ile seçilir.
 * Safran (#F5C24B) gibi açık accent'lerde beyaz okunmaz; koyu ink döner.
 */
export function onAccentInk(accent: string): string {
  const h = (accent || '#000000').replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF';
}
