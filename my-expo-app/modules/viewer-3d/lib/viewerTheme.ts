/**
 * viewerTheme — Light/Dark + panel-aware theme tokens for viewer chrome.
 *
 * Dark mode → mevcut koyu glass tema (değişmedi).
 * Light mode → beyaz kart + aktif panel rengi accent olarak.
 */
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme, type PanelThemeKey } from '../../../core/theme/usePanelTheme';
import { MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';

// Panel key → sayfa zemini (bgPage). Shell/PatternsShell ile birebir aynı renk.
// usePanelTheme key'leri (clinic/tech) ↔ MOBILE_PANEL_THEMES key'leri (klinik/teknisyen).
const BG_PAGE_BY_KEY: Record<PanelThemeKey, string> = {
  lab:    MOBILE_PANEL_THEMES.lab.bgPage,
  clinic: MOBILE_PANEL_THEMES.klinik.bgPage,
  exec:   MOBILE_PANEL_THEMES.exec.bgPage,
  tech:   MOBILE_PANEL_THEMES.teknisyen.bgPage,
};
const hexToNum = (hex: string): number => parseInt(hex.replace('#', ''), 16);

export interface ViewerTheme {
  /** Three.js renderer clear color */
  sceneBg: number;
  /** Header / footer bar bg */
  headerBg: string;
  /** Top hint text */
  headerTitle: string;
  headerSub: string;
  /** Close button + icons fg */
  iconFg: string;
  iconBgHover: string;
  /** Divider line */
  divider: string;

  /** Layer panel surface */
  panelBg: string;
  panelBorder: string;
  panelHeaderText: string;
  panelLabel: string;
  panelLabelMuted: string;
  panelRowHover: string;
  panelControlBg: string;
  panelControlBgHover: string;

  /** Toolbar surface (right top floating) */
  toolbarBg: string;
  toolbarBorder: string;
  toolbarHover: string;
  toolbarActive: string;

  /** Panel-accent (coral / saffron / sage) */
  accent: string;
  accentText: string;
  /** Soft accent overlay (e.g., subtle background tint) */
  accentSoft: string;
}

const DARK_THEME = (accent: string): ViewerTheme => ({
  sceneBg: 0x0e0e0e,
  headerBg: '#1A1A1A',
  headerTitle: '#E8D5C4',
  headerSub: 'rgba(255,255,255,0.5)',
  iconFg: '#E8D5C4',
  iconBgHover: 'rgba(255,255,255,0.1)',
  divider: 'rgba(255,255,255,0.06)',

  panelBg: '#141414',
  panelBorder: 'rgba(255,255,255,0.06)',
  panelHeaderText: 'rgba(255,255,255,0.9)',
  panelLabel: 'rgba(255,255,255,0.92)',
  panelLabelMuted: 'rgba(255,255,255,0.4)',
  panelRowHover: 'rgba(255,255,255,0.04)',
  panelControlBg: 'rgba(255,255,255,0.05)',
  panelControlBgHover: 'rgba(255,255,255,0.10)',

  toolbarBg: 'rgba(20,20,20,0.85)',
  toolbarBorder: 'rgba(255,255,255,0.08)',
  toolbarHover: 'rgba(255,255,255,0.08)',
  toolbarActive: accent + '33',

  accent,
  accentText: accent,
  accentSoft: accent + '14',
});

const LIGHT_THEME = (accent: string, sceneBg: number): ViewerTheme => ({
  sceneBg,                                              // aktif panelin bgPage'i (shell ile aynı)
  headerBg: '#FFFFFF',
  headerTitle: '#0A0A0A',
  headerSub: 'rgba(0,0,0,0.55)',
  iconFg: '#0A0A0A',
  iconBgHover: 'rgba(0,0,0,0.06)',
  divider: 'rgba(0,0,0,0.06)',

  panelBg: '#FAFAFA',
  panelBorder: 'rgba(0,0,0,0.06)',
  panelHeaderText: '#0A0A0A',
  panelLabel: '#0A0A0A',
  panelLabelMuted: 'rgba(0,0,0,0.45)',
  panelRowHover: 'rgba(0,0,0,0.03)',
  panelControlBg: 'rgba(0,0,0,0.04)',
  panelControlBgHover: 'rgba(0,0,0,0.08)',

  toolbarBg: 'rgba(255,255,255,0.92)',
  toolbarBorder: 'rgba(0,0,0,0.08)',
  toolbarHover: 'rgba(0,0,0,0.06)',
  toolbarActive: accent + '22',

  accent,
  accentText: accent,
  accentSoft: accent + '14',
});

/** Hook — aktif panel + theme mode'a göre viewer chrome tema'sı. */
export function useViewerTheme(): ViewerTheme {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const panelTheme = usePanelTheme();
  const accent = panelTheme.primary;
  // Light mode: preview zemini = aktif panelin bgPage'i. Dark mode: 3D viewer
  // koyu kalır (panel bgPage açık renk, karanlık sahnede yanlış olur).
  const sceneBg = hexToNum(BG_PAGE_BY_KEY[panelTheme.key] ?? MOBILE_PANEL_THEMES.lab.bgPage);
  return isDark ? DARK_THEME(accent) : LIGHT_THEME(accent, sceneBg);
}
