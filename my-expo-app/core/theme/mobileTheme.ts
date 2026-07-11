/**
 * Mobile theme module — Variant B (Cesur) handoff.
 *
 *   - 3 role themes (lab / clinic / exec) sourced from DS tokens
 *   - useMobileTheme() hook: derives active role from current panel route
 *   - Override store for Profile B7 role-swap (persisted later if needed)
 *   - STATUS_TONES, ROLE_LABEL, FONTS helpers
 */
import { create } from 'zustand';
import { useSegments } from 'expo-router';
import { Platform } from 'react-native';
import { DS } from './dsTokens';
import { useThemeModeStore } from '../store/themeModeStore';

// ─── Role types ──────────────────────────────────────────────────────────────
export type MobileRole = 'lab' | 'clinic' | 'exec';

export type MobileTheme = typeof DS.lab; // shape of any role theme

// ─── Role mapping from panel route ───────────────────────────────────────────
// Current 4 panels → 3 Variant B roles:
//   (admin)  → exec
//   (lab)    → lab
//   (clinic) → clinic
//   (doctor) → clinic
//   (station) → lab
export function panelToRole(segment: string | undefined): MobileRole {
  switch (segment) {
    case '(admin)':   return 'exec';
    case '(lab)':     return 'lab';
    case '(clinic)':  return 'clinic';
    case '(doctor)':  return 'clinic';
    case '(station)': return 'lab';
    default:          return 'lab';
  }
}

// ─── Role override store (B7 profile role-swap) ──────────────────────────────
interface RoleOverrideState {
  override: MobileRole | null;
  setOverride: (role: MobileRole | null) => void;
  clear: () => void;
}

export const useRoleOverrideStore = create<RoleOverrideState>((set) => ({
  override: null,
  setOverride: (role) => set({ override: role }),
  clear: () => set({ override: null }),
}));

// ─── Active theme hook ───────────────────────────────────────────────────────
export function useMobileRole(): MobileRole {
  const segments = useSegments();
  const override = useRoleOverrideStore((s) => s.override);
  if (override) return override;
  return panelToRole(segments[0]);
}

// ─── Dark mode palette overrides (shared across roles, primary stays) ──────
const DARK = {
  bg:     '#0E0E0E',
  bgSoft: '#1A1A1A',
  bgDeep: '#202020',
  surface:'#1A1A1A',
  accent: '#FAFAFA',  // text-on-dark — used as "accent" by components
};

export interface MobileThemeExt {
  role: MobileRole;
  isDark: boolean;
  /** Primary text color (auto inverts in dark) */
  text: string;
  /** Muted text */
  textMuted: string;
  /** Even more dim text */
  textDim: string;
  /** Default border color (auto inverts) */
  border: string;
}

export function useMobileTheme(): MobileTheme & MobileThemeExt {
  const role = useMobileRole();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Cast through `any` — DS[role] readonly literal type union'u TypeScript'in
  // kombinasyon kontrolünü zorlaştırıyor. Runtime'da her iki branch da
  // MobileTheme & MobileThemeExt satisfy ediyor, sadece tip narrowing'in
  // limitleri var.
  if (isDark) {
    return {
      ...DS[role],
      ...DARK,
      role,
      isDark: true,
      text: '#FAFAFA',
      textMuted: '#9A9A9A',
      textDim: '#6B6B6B',
      border: 'rgba(255,255,255,0.08)',
    } as any;
  }
  return {
    ...DS[role],
    role,
    isDark: false,
    text: DS.ink[900],
    textMuted: DS.ink[500],
    textDim: DS.ink[400],
    border: 'rgba(0,0,0,0.06)',
  } as any;
}

// ─── Role labels ─────────────────────────────────────────────────────────────
export const ROLE_LABEL: Record<MobileRole, string> = {
  lab:    'Lab',
  clinic: 'Klinik',
  exec:   'Yönetim',
};

// ─── Status tones (mirrors mobile-shared.jsx STATUS_TONES) ───────────────────
// Each status maps to { label, fg, bg } for chip rendering.
export interface StatusTone { label: string; fg: string; bg: string }

export const STATUS_TONES: Record<string, StatusTone> = {
  yeni:        { label: 'Yeni',        fg: '#1F5689', bg: 'rgba(74,143,201,0.14)' },
  cad:         { label: 'CAD',         fg: '#1F5689', bg: 'rgba(74,143,201,0.14)' },
  uretim:      { label: 'Üretim',      fg: '#9C5E0E', bg: 'rgba(232,155,42,0.18)' },
  qa:          { label: 'Kalite',      fg: '#1F5689', bg: 'rgba(74,143,201,0.14)' },
  teslimat:    { label: 'Teslimat',    fg: '#1F6B47', bg: 'rgba(45,154,107,0.16)' },
  tamamlandi:  { label: 'Tamamlandı',  fg: DS.ink[500], bg: 'rgba(0,0,0,0.06)' },
  bekleyen:    { label: 'Bekliyor',    fg: '#9C5E0E', bg: 'rgba(232,155,42,0.18)' },
  // Backwards-compat aliases for existing work_orders status keys
  alindi:          { label: 'Alındı',          fg: DS.ink[500], bg: 'rgba(0,0,0,0.06)' },
  uretimde:        { label: 'Üretimde',        fg: '#9C5E0E', bg: 'rgba(232,155,42,0.18)' },
  kalite_kontrol:  { label: 'Kalite',          fg: '#1F5689', bg: 'rgba(74,143,201,0.14)' },
  teslimata_hazir: { label: 'Kuryeye Teslim Edildi', fg: '#1F6B47', bg: 'rgba(45,154,107,0.16)' },
  teslim_edildi:   { label: 'Teslim Edildi',   fg: DS.ink[500], bg: 'rgba(0,0,0,0.06)' },
};

// ─── Font helpers (Variant B) ────────────────────────────────────────────────
// Inter Tight for UI/display, Instrument Serif for hero italic accents.
export const MFONT = {
  // Inter Tight weights (RN: explicit family per weight, web: single + fontWeight)
  uiThin:    Platform.OS === 'web' ? "'Inter Tight', system-ui, sans-serif" : 'InterTight_200ExtraLight',
  uiLight:   Platform.OS === 'web' ? "'Inter Tight', system-ui, sans-serif" : 'InterTight_300Light',
  uiRegular: Platform.OS === 'web' ? "'Inter Tight', system-ui, sans-serif" : 'InterTight_400Regular',
  uiMedium:  Platform.OS === 'web' ? "'Inter Tight', system-ui, sans-serif" : 'InterTight_500Medium',
  uiSemibold:Platform.OS === 'web' ? "'Inter Tight', system-ui, sans-serif" : 'InterTight_600SemiBold',
  serif:     Platform.OS === 'web' ? "'Instrument Serif', Georgia, serif"   : 'InstrumentSerif_400Regular',
  serifItalic: Platform.OS === 'web' ? "'Instrument Serif', Georgia, serif" : 'InstrumentSerif_400Regular_Italic',
};

// ─── Type scale (Variant B mobile) ──────────────────────────────────────────
export const MSIZE = {
  eyebrow: 11,   // uppercase pill labels
  meta:    12,   // dates, sub-info
  bodySm:  13,   // small body
  body:    14,   // default body
  button:  15,
  subhead: 18,
  h3:      24,
  h2:      32,
  display: 38,   // hero headline
  displayLg: 48, // dark hero ring number
};

// ─── Shadows (token mirror) ──────────────────────────────────────────────────
export const MSHADOW = {
  soft: Platform.OS === 'web'
    ? { boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' } as any
    : { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  md: Platform.OS === 'web'
    ? { boxShadow: '0 2px 4px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.06)' } as any
    : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  lg: Platform.OS === 'web'
    ? { boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 24px 64px rgba(0,0,0,0.10)' } as any
    : { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
};
