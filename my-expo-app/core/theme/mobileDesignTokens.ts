// core/theme/mobileDesignTokens.ts
// Aydın Lab Mobile handoff token sistemi — panel başına accent + paylaşılan tokens.
// Kaynak: /Downloads/App onboarding (1)/design_handoff_aydin_lab_mobile/screens/theme.jsx

export type MobilePanel = 'lab' | 'klinik' | 'exec' | 'teknisyen' | 'doctor';

export interface PanelTheme {
  primary:     string;   // hero/CTA accent
  accentDark:  string;   // strong text / dark surface (near-black)
  bgHero:      string;   // dashboard "canlı üretim" hero card bg — panel-themed dark (not black)
  bgDeep:      string;   // banded section bg
  surface:     string;   // primary card
  bgPage:      string;   // sayfa zemin rengi — desktop PatternsShell.palette.pageBg ile aynı
}

export const MOBILE_PANEL_THEMES: Record<MobilePanel, PanelTheme> = {
  lab:        { primary: '#F5C24B', accentDark: '#0A0A0A', bgHero: '#3A2E10', bgDeep: '#E8DDB5', surface: '#FFFFFF', bgPage: '#F5F1EB' },
  // Klinik (emerald + charcoal) — ClinicDashboard (DS.clinic.primary #32BB78) ile uyumlu
  klinik:     { primary: '#32BB78', accentDark: '#2F313F', bgHero: '#2F313F', bgDeep: '#D3F8E0', surface: '#FFFFFF', bgPage: '#F9FAFB' },
  // Exec/Admin (kobalt mavi + lacivert) — DS.exec.primary #4771AB ile uyumlu
  exec:       { primary: '#4771AB', accentDark: '#172235', bgHero: '#243041', bgDeep: '#E7EEF8', surface: '#FFFFFF', bgPage: '#F7F9FC' },
  teknisyen:  { primary: '#3B82F6', accentDark: '#0F2840', bgHero: '#1E3A6F', bgDeep: '#D2E1F0', surface: '#FFFFFF', bgPage: '#F5F9FD' },
  // Doctor (emerald + charcoal) — klinik ile aynı tonda
  doctor:     { primary: '#32BB78', accentDark: '#2F313F', bgHero: '#2F313F', bgDeep: '#D3F8E0', surface: '#FFFFFF', bgPage: '#F9FAFB' },
};

// ── Dark mode token seti ────────────────────────────────────────────────────
// Yüzey & ink değerleri ters çevriliyor. Status/accent renkler ortak kalıyor
// (rubySoft/jadeSoft vb. zaten dark zemine yeterli kontrast veriyor).
const DARK_OVERRIDES = {
  bg:        '#0E0E0E',           // sayfa zemini
  bgDeep:    '#16140F',           // band / cardSoft eşdeğeri
  card:      '#1B1916',           // elevated kart yüzeyi
  cardSoft:  '#141312',           // sub-card / pill bg

  ink:       '#F7F2E9',           // primary text
  ink2:      'rgba(247,242,233,0.78)', // secondary
  ink3:      'rgba(247,242,233,0.45)', // tertiary / meta
  hairline:  'rgba(255,255,255,0.10)',
  hairline2: 'rgba(255,255,255,0.05)',

  // onDark zaten "açık üzerine koyu" anlamında; dark mod'da
  // "koyu üzerine açık" olduğu için onDark = ink mantığı geçerli.
  onDark:    '#F7F2E9',
  onDark2:   'rgba(247,242,233,0.70)',
  onDark3:   'rgba(247,242,233,0.42)',
} as const;

// ── Paylaşılan tokens (status chips ve genel renkler) ───────────────────────
export const MOBILE_TOKENS = {
  // Sayfa zeminleri (default / operational)
  bg:        '#F2EDE3',   // ivory canvas
  bgDeep:    '#EAE3D5',
  card:      '#FFFFFF',
  cardSoft:  '#FAF6EE',

  // Ink
  ink:       '#0E0E0E',
  ink2:      '#3A3631',
  ink3:      '#8A8278',
  hairline:  'rgba(20,16,12,0.08)',
  hairline2: 'rgba(20,16,12,0.04)',

  // Dark
  dark:      '#141414',
  dark2:     '#1B1916',
  darkLine:  'rgba(255,255,255,0.07)',
  onDark:    '#F7F2E9',
  onDark2:   'rgba(247,242,233,0.62)',
  onDark3:   'rgba(247,242,233,0.38)',

  // Şared accent (operational tier)
  accent:     '#FA7A4C',
  accentDeep: '#E0623A',
  accentSoft: '#FCE3D5',
  sand:       '#F6B07A',
  sandSoft:   '#FBE6CC',
  butter:     '#F0D78F',
  jade:       '#5C8B6E',
  jadeSoft:   '#D8E5DA',
  ruby:       '#C25450',
  rubySoft:   '#F2D9D7',
  navy:       '#243041',

  // Radii — 4pt grid bazlı
  r1: 10,   // chip / inner
  r2: 16,   // input / button
  r3: 22,   // card
  r4: 28,   // hero card

  // Shadow tokens — kaldırıldı (mobile design contract: shadowless / flat).
  // Geriye uyumluluk için 'none' bırakıldı; ileride yeni varyantlar için boş.
  shadowSoft: 'none',
  shadowLift: 'none',
  shadowDark: 'none',
  shadowFab:  'none',

  // Typography
  display: 'Inter Tight, -apple-system, system-ui, sans-serif',
  ui:      'Inter, -apple-system, system-ui, sans-serif',
  mono:    'JetBrains Mono, ui-monospace, "SF Mono", monospace',
} as const;

// ── Status pill tonları (panel-agnostic) ────────────────────────────────────
export const MOBILE_STATUS = {
  prod:  { label: 'Üretimde',   bg: MOBILE_TOKENS.accentSoft, fg: MOBILE_TOKENS.accentDeep, dot: MOBILE_TOKENS.accent },
  wait:  { label: 'Bekliyor',   bg: '#EFE9DA',                 fg: '#5A5246',                 dot: '#A89B82' },
  qc:    { label: 'QC Sorunu',  bg: MOBILE_TOKENS.rubySoft,   fg: MOBILE_TOKENS.ruby,       dot: MOBILE_TOKENS.ruby },
  delay: { label: 'Geciken',    bg: MOBILE_TOKENS.rubySoft,   fg: MOBILE_TOKENS.ruby,       dot: MOBILE_TOKENS.ruby },
  done:  { label: 'Tamamlandı', bg: MOBILE_TOKENS.jadeSoft,   fg: MOBILE_TOKENS.jade,       dot: MOBILE_TOKENS.jade },
  ready: { label: 'Hazır',      bg: MOBILE_TOKENS.jadeSoft,   fg: MOBILE_TOKENS.jade,       dot: MOBILE_TOKENS.jade },
  ship:  { label: 'Sevkiyat',   bg: '#E5E1D6',                 fg: '#3A3631',                 dot: '#3A3631' },
} as const;

export type StatusKind = keyof typeof MOBILE_STATUS;

// ── Dark variant — light tokens'ın aynısı, sadece yüzey/ink override ────────
export const MOBILE_TOKENS_DARK = {
  ...MOBILE_TOKENS,
  ...DARK_OVERRIDES,
} as const;

// ── Hook — runtime dark mode + panel-aware bg resolver ────────────────────
// Kullanım: `const T = useMobileTokens();` → ekran light/dark'a göre tokens döner.
// Light mode'da T.bg aktif panel'in bgPage'i (desktop PatternsShell ile aynı renk).
// Dark mode'da ink #0E0E0E.
import { useThemeModeStore } from '../store/themeModeStore';
import { useSegments } from 'expo-router';

const SEGMENT_TO_PANEL: Record<string, MobilePanel> = {
  '(lab)':     'lab',
  '(station)': 'teknisyen',
  '(admin)':   'exec',
  '(doctor)':  'doctor',
  '(clinic)':  'klinik',
};

export function useMobileTokens(): typeof MOBILE_TOKENS {
  const dark = useThemeModeStore(s => s.resolvedDark);
  let segments: string[] = [];
  try { segments = (useSegments() as unknown as string[]) ?? []; } catch { /* route context dışında */ }
  const panel = SEGMENT_TO_PANEL[segments?.[0] ?? ''] ?? null;
  const base = dark ? MOBILE_TOKENS_DARK : MOBILE_TOKENS;
  // Light mode'da sayfa zemini panel'e göre değişir
  const bg = dark
    ? base.bg
    : (panel ? MOBILE_PANEL_THEMES[panel].bgPage : base.bg);
  // Yeşil panellerde (klinik/hekim) krem (#FAF6EE) yerine yumuşak adaçayı,
  // admin/exec'te yumuşak kobalt — sub-card / pill / soft yüzeyler panelle uyumlu olsun.
  const isGreen = panel === 'klinik' || panel === 'doctor';
  const cardSoft = (!dark && isGreen) ? '#D3F8E0'
    : (!dark && panel === 'exec') ? '#EAF2FB'
    : base.cardSoft;
  return { ...base, bg, cardSoft } as typeof MOBILE_TOKENS;
}

// Status pill — dark mod'da bg tonları biraz indirgenir, fg/dot korunur.
export function useStatusTokens(): Record<StatusKind, { label: string; bg: string; fg: string; dot: string }> {
  const dark = useThemeModeStore(s => s.resolvedDark);
  if (!dark) return MOBILE_STATUS;
  // Dark zeminde solid soft renkler okunmuyor → semi-transparent fg30 ile değiştir.
  const mk = (s: { fg: string; dot: string; label: string }) => ({
    label: s.label,
    bg: `${s.fg}26`, // ~%15 fg overlay
    fg: s.dot,
    dot: s.dot,
  });
  return {
    prod:  mk(MOBILE_STATUS.prod),
    wait:  { ...MOBILE_STATUS.wait, bg: 'rgba(255,255,255,0.06)', fg: 'rgba(247,242,233,0.72)' },
    qc:    mk(MOBILE_STATUS.qc),
    delay: mk(MOBILE_STATUS.delay),
    done:  mk(MOBILE_STATUS.done),
    ready: mk(MOBILE_STATUS.ready),
    ship:  { ...MOBILE_STATUS.ship, bg: 'rgba(255,255,255,0.06)', fg: 'rgba(247,242,233,0.72)' },
  };
}
