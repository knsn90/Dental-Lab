/**
 * usePanelTheme — Aktif panel rotasına göre DS theme döndürür.
 *
 *   • /(lab)     → DS.lab    (saffron)
 *   • /(admin)   → DS.exec   (coral)
 *   • /(clinic)  → DS.clinic (sage)
 *   • /(doctor)  → DS.clinic (sage) — doctor panel'i clinic ile aynı palet
 *   • /(station) → DS.tech   (parlak mavi — teknisyen)
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
  return { key: 'lab', ...DS.lab } as PanelTheme;
}

export function usePanelTheme(): PanelTheme {
  const segments = useSegments();
  const seg = String(segments?.[0] ?? '');
  return pickThemeFromSegment(seg);
}
