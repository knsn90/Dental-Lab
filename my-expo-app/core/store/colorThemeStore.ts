import { Platform } from 'react-native';
import { create } from 'zustand';

// ── Theme definition ──────────────────────────────────────────────────
export interface ColorTheme {
  key: string;
  name: string;
  description: string;
  primary: string;    // main accent
  dark: string;       // deep/dark swatch
  muted: string;      // neutral swatch
}

export const COLOR_THEMES: ColorTheme[] = [
  { key: 'saffron', name: 'Saffron',   description: 'Patterns lab — sıcak sarı',    primary: '#F5C24B', dark: '#E0A82E', muted: '#9A9A9A' },
  { key: 'sage',    name: 'Sage',      description: 'Patterns clinic — yumuşak yeşil', primary: '#6BA888', dark: '#4D8A6B', muted: '#9A9A9A' },
  { key: 'coral',   name: 'Coral',     description: 'Patterns exec — sıcak mercan', primary: '#E97757', dark: '#D15A3A', muted: '#9A9A9A' },
  { key: 'blue',    name: 'Mavi',      description: 'Profesyonel mavi',             primary: '#2563EB', dark: '#1E40AF', muted: '#94A3B8' },
  { key: 'teal',    name: 'Teal',      description: 'Medikal yeşil-mavi',           primary: '#0891B2', dark: '#0E7490', muted: '#94A3B8' },
  { key: 'green',   name: 'Yeşil',     description: 'Sağlık ve doğa teması',        primary: '#059669', dark: '#047857', muted: '#94A3B8' },
  { key: 'purple',  name: 'Mor',       description: 'Zarif ve özgün',               primary: '#7C3AED', dark: '#6D28D9', muted: '#94A3B8' },
  { key: 'rose',    name: 'Kırmızı',   description: 'Enerjik ve dikkat çekici',     primary: '#E11D48', dark: '#BE123C', muted: '#94A3B8' },
  { key: 'slate',   name: 'Antrasit',  description: 'Premium, minimal gri',         primary: '#475569', dark: '#334155', muted: '#94A3B8' },
];

// Default per panel — patterns dili
export const PANEL_DEFAULTS: Record<string, string> = {
  lab:          'saffron',
  admin:        'coral',
  doctor:       'sage',
  clinic_admin: 'sage',
};

// ── Storage keys per panel ────────────────────────────────────────────
function storageKey(panelType: string) {
  // v2: patterns dili default (saffron/sage/coral) — eski v1 'blue' kayıtları otomatik reset
  return `dental_app_theme_${panelType}_v2`;
}

export function getThemeByKey(key: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.key === key) ?? COLOR_THEMES[0];
}

// ── Web CSS injection ─────────────────────────────────────────────────
// Apply via CSS custom properties.
// The attribute selectors target RN-Web inline styles for the DEFAULT
// panel accent colors (#2563EB lab-blue, #0F172A admin-black, etc.)
// so that changing theme also updates components with baked-in colors.
export function applyColorThemeWeb(theme: ColorTheme, defaultAccent: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  let style = document.getElementById('app-color-override') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'app-color-override';
    document.head.appendChild(style);
  }

  // Convert default hex to rgb for attribute selector matching
  const dr = parseInt(defaultAccent.slice(1, 3), 16);
  const dg = parseInt(defaultAccent.slice(3, 5), 16);
  const db = parseInt(defaultAccent.slice(5, 7), 16);
  const defaultRgb = `rgb(${dr}, ${dg}, ${db})`;

  // New color values
  const nr = parseInt(theme.primary.slice(1, 3), 16);
  const ng = parseInt(theme.primary.slice(3, 5), 16);
  const nb = parseInt(theme.primary.slice(5, 7), 16);

  style.textContent = `
    :root {
      --color-primary:      ${theme.primary};
      --color-primary-dark: ${theme.dark};
    }

    /* Text color override */
    [style*="color: ${defaultRgb}"] { color: rgb(${nr},${ng},${nb}) !important; }

    /* Background color override */
    [style*="background-color: ${defaultRgb}"] { background-color: rgb(${nr},${ng},${nb}) !important; }

    /* Border color override */
    [style*="border-color: ${defaultRgb}"] { border-color: rgb(${nr},${ng},${nb}) !important; }

    /* Outline color override */
    [style*="outline-color: ${defaultRgb}"] { outline-color: rgb(${nr},${ng},${nb}) !important; }
  `;
}

// ── Per-panel state ───────────────────────────────────────────────────
interface ColorThemeState {
  themes: Record<string, ColorTheme>; // panelType → chosen theme
  getTheme:    (panelType: string) => ColorTheme;
  setTheme:    (panelType: string, theme: ColorTheme, defaultAccent: string) => void;
  loadTheme:   (panelType: string) => ColorTheme;
}

export const useColorThemeStore = create<ColorThemeState>((set, get) => ({
  themes: {},

  getTheme: (panelType) => {
    return get().themes[panelType] ?? getThemeByKey(PANEL_DEFAULTS[panelType] ?? 'blue');
  },

  loadTheme: (panelType) => {
    const key = storageKey(panelType);
    let theme = getThemeByKey(PANEL_DEFAULTS[panelType] ?? 'blue');
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(key);
      if (saved) theme = getThemeByKey(saved);
    }
    set((s) => ({ themes: { ...s.themes, [panelType]: theme } }));
    return theme;
  },

  setTheme: (panelType, theme, defaultAccent) => {
    set((s) => ({ themes: { ...s.themes, [panelType]: theme } }));
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey(panelType), theme.key);
    }
    applyColorThemeWeb(theme, defaultAccent);
  },
}));
