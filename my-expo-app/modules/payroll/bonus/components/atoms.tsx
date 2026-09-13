/**
 * Prim Motoru — paylaşılan tasarım atom'ları.
 *
 * Kaynak: docs/DESIGN_LANGUAGE.md
 *   • Inter Tight Light display
 *   • DS.exec (Yönetim Paneli — Mercan / Coral) teması
 *   • F1 Glassmorphism hero, 18 radius beyaz kart, 28 radius hero
 */

import React, { useContext } from 'react';
import { View, Text, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { DS } from '../../../../core/theme/dsTokens';
import { useInkUI } from '../../../../core/theme/inkScale';
import { useHeroSurface } from '../../../../core/ui/HeroGlow';
import { HubContext } from '../../../../core/ui/HubContext';
import { baseSymbol } from '../../../../core/money/baseCurrency';
import { PAGE_PADDING } from '../../../../core/ui/pageMetrics';
import { useMobileTokens } from '../../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../../core/store/themeModeStore';

// View fonksiyon-stil uygulamaz: onPress yoksa (Wrapper=View) stili düz nesneye çöz.
const resolveStyle = (fn: (st: any) => any, pressable: boolean) => (pressable ? fn : fn({}));


/** Tüm bonus sayfalarında kart-kenar mesafesi 16px (Design Language).
 *  Hub içinde de standalone'da da aynı — kartlar daima ekran kenarından 16px uzakta. */
/** @deprecated Doğrudan `PAGE_PADDING` (core/ui/pageMetrics) kullan. */
export const usePagePadding = (): number => PAGE_PADDING;

export const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export const TH = DS.exec; // Admin = Yönetim Paneli (Kobalt / Mavi)

export const TRY = (n: number | null | undefined) =>
  baseSymbol() + (Number(n ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const MONTH_LABELS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/**
 * 1 diş = 1 üye. Ancak tek işli (gece plağı vb. tek-ölçümlü) hesaplamalarda
 * "1 işlem" daha doğal. Sayı === 1 ise "işlem", aksi halde "üye".
 */
export const unitWord = (n: number): string => (n === 1 ? 'işlem' : 'üye');

/** "5 üye" / "1 işlem" gibi sayısal+kelime birleştirici. */
export const fmtUnit = (n: number): string => `${n} ${unitWord(n)}`;

/* ─────────────────────────────  BigStat  ────────────────────────────── */
export function BigStat({ value, label }: { value: string; label: string }) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 40, color: isDark ? T.ink : U.ink[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, color: isDark ? T.ink3 : U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

/* ─────────────────────────────  PillButton  ─────────────────────────── */
export function PillButton({
  children, variant = 'dark', onPress, leftIcon, rightIcon, disabled, size = 'md',
}: {
  children: React.ReactNode;
  variant?: 'dark' | 'primary' | 'light' | 'ghost' | 'danger' | 'success';
  onPress?: () => void;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const variants = {
    dark:    { bg: U.ink[900],     fg: U.onDarkPill, border: U.ink[900] },
    primary: { bg: TH.primary,      fg: '#FFF',       border: TH.primary },
    light:   { bg: isDark ? T.card : '#FFF', fg: isDark ? T.ink : U.ink[900], border: isDark ? T.hairline : U.ink[300] },
    ghost:   { bg: 'transparent',   fg: isDark ? T.ink : U.ink[900], border: 'transparent' },
    danger:  { bg: DS.exec.danger,  fg: '#FFF',       border: DS.exec.danger },
    success: { bg: DS.exec.success, fg: '#FFF',       border: DS.exec.success },
  } as const;
  const sizes = {
    sm: { px: 12, py: 6,  fs: 12 },
    md: { px: 16, py: 9,  fs: 13 },
    lg: { px: 22, py: 12, fs: 14 },
  } as const;
  const v = variants[variant];
  const s = sizes[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: s.px, paddingVertical: s.py,
        backgroundColor: v.bg, borderRadius: 999,
        borderWidth: 1, borderColor: v.border,
        opacity: disabled ? 0.4 : (pressed ? 0.75 : 1),
      })}
    >
      {leftIcon}
      <Text style={{ fontSize: s.fs, fontWeight: '500', color: v.fg, letterSpacing: -0.13 }}>{children}</Text>
      {rightIcon}
    </Pressable>
  );
}

/* ─────────────────────────────  SecHeader  ──────────────────────────── */
export function SecHeader({ eyebrow, title, desc, action }: {
  eyebrow: string;
  title: string;
  desc?: string;
  action?: { label: string; onPress: () => void };
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ gap: 6, flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: isDark ? T.ink3 : U.ink[500] }}>
          {eyebrow}
        </Text>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: isDark ? T.ink : U.ink[900], lineHeight: 26 }}>
          {title}
        </Text>
        {desc ? (
          <Text style={{ fontSize: 13, color: isDark ? T.ink3 : U.ink[500], lineHeight: 19, maxWidth: 520 }}>{desc}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────  KPI Card  ───────────────────────────── */
export function KPI({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string; sub?: string; accent: string;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      flex: 1, minWidth: 0,
      backgroundColor: isDark ? T.card : '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: isDark ? T.hairline : U.ink[200],
      padding: 18, gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: accent + '18',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={accent} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? T.ink3 : U.ink[500] }}>
          {label}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 30, letterSpacing: -0.9, lineHeight: 32, color: isDark ? T.ink : U.ink[900] }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: isDark ? T.ink3 : U.ink[400] }}>{sub}</Text> : null}
    </View>
  );
}

/* ─────────────────────────────  StatusChip  ─────────────────────────── */
const STATUS_CFG: Record<string, { bg: string; fg: string; label: string }> = {
  draft:    { bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[700], label: 'TASLAK' },
  approved: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E',   label: 'ONAYLI' },
  posted:   { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47',   label: 'YANSITILDI' },
  voided:   { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E',   label: 'İPTAL' },
  active:   { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47',   label: 'AKTİF' },
  archived: { bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[500], label: 'ARŞİV' },
};

// Koyu temada açık-tema fg'leri (#1F6B47 vb.) koyu zeminde okunmaz → chipTones.
const STATUS_DARK_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral', approved: 'warning', posted: 'success', voided: 'danger', active: 'success', archived: 'neutral',
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const U = useInkUI();
  const base = STATUS_CFG[status] ?? STATUS_CFG.draft;
  const c = U.isDark ? { ...base, ...U.chipTones[STATUS_DARK_TONE[status] ?? 'neutral'] } : base;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: c.fg, letterSpacing: 0.4 }}>{label ?? c.label}</Text>
    </View>
  );
}

/* ─────────────────────────────  Chip  ───────────────────────────────── */
export function Chip({
  children, tone = 'neutral', onPress, active, leftIcon,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  onPress?: () => void;
  active?: boolean;
  leftIcon?: React.ReactNode;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const tones = {
    neutral: { bg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', fg: isDark ? T.ink : U.ink[800], border: 'transparent' },
    primary: { bg: TH.primary + '22',       fg: TH.primary,  border: 'transparent' },
    accent:  { bg: U.ink[900],             fg: U.onDarkPill, border: 'transparent' },
    success: { ...U.chipTones.success, border: 'transparent' },
    warning: { ...U.chipTones.warning, border: 'transparent' },
    danger:  { ...U.chipTones.danger,  border: 'transparent' },
    info:    { ...U.chipTones.info,    border: 'transparent' },
    outline: { bg: 'transparent',           fg: isDark ? T.ink : U.ink[800], border: isDark ? T.hairline : U.ink[300] },
  };
  // active variant — solid dark
  const t = active ? { bg: U.ink[900], fg: U.onDarkPill, border: 'transparent' } : tones[tone];
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={resolveStyle(({ pressed }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: t.bg, borderWidth: t.border === 'transparent' ? 0 : 1, borderColor: t.border,
        opacity: onPress && pressed ? 0.7 : 1,
      }), !!onPress)}
    >
      {leftIcon}
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.fg }}>{children}</Text>
    </Wrapper>
  );
}

/* ─────────────────────────────  Card  ───────────────────────────────── */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={[{
      backgroundColor: isDark ? T.card : '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: isDark ? T.hairline : U.ink[200],
      padding: 18,
    }, style]}>
      {children}
    </View>
  );
}

/* ─────────────────────────────  EmptyCard  ──────────────────────────── */
export function EmptyCard({ icon: Icon, title, description, cta }: {
  icon: any; title: string; description?: string;
  cta?: { label: string; onPress: () => void };
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      backgroundColor: isDark ? T.card : '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: isDark ? T.hairline : U.ink[200],
      padding: 36, alignItems: 'center', gap: 12,
    }}>
      <View style={{
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: isDark ? TH.primary + '26' : TH.bgSoft, alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={TH.primary} strokeWidth={1.8} />
      </View>
      <Text style={{ ...DISPLAY, fontSize: 20, color: isDark ? T.ink : U.ink[900], letterSpacing: -0.4 }}>{title}</Text>
      {description ? (
        <Text style={{ fontSize: 13, color: isDark ? T.ink3 : U.ink[500], textAlign: 'center', maxWidth: 360, lineHeight: 20 }}>
          {description}
        </Text>
      ) : null}
      {cta ? (
        <View style={{ marginTop: 6 }}>
          <PillButton variant="dark" onPress={cta.onPress}>{cta.label}</PillButton>
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────  HeroF1  ─────────────────────────────── */
export function HeroF1({
  kicker, title, description, stats, actions, children,
}: {
  kicker: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  stats?: { value: string; label: string }[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const U = useInkUI();
  const heroSurface = useHeroSurface(TH.primary);
  return (
    <View style={{ borderRadius: 28, overflow: 'hidden', ...(U.isDark ? heroSurface : { backgroundColor: TH.bg }), padding: 14, marginBottom: 16 }}>
      <View style={{
        backgroundColor: U.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
        borderRadius: 22, padding: 26,
        borderWidth: 1, borderColor: U.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flex: 1, minWidth: 260 }}>
            <Text style={{
              fontSize: 11, fontWeight: '500', letterSpacing: 1.1,
              textTransform: 'uppercase', color: U.ink[500], marginBottom: 12,
            }}>
              {kicker}
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 44, letterSpacing: -1.5, lineHeight: 48, color: U.ink[900] }}>
              {title}
            </Text>
            {description ? (
              <Text style={{ fontSize: 14, color: U.ink[500], marginTop: 12, maxWidth: 520, lineHeight: 21 }}>
                {description}
              </Text>
            ) : null}
          </View>
          {stats && stats.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 28 }}>
              {stats.map(s => <BigStat key={s.label} value={s.value} label={s.label} />)}
            </View>
          ) : null}
        </View>
        {actions ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {actions}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/* ─────────────────────────────  HeroCompact (F1 mini)  ─────────────── */
export function HeroCompact({
  kicker, value, label, sub, icon: Icon, miniStats,
}: {
  kicker: string;
  value: string;
  label?: string;
  sub?: string;
  icon?: any;
  miniStats?: { label: string; value: string }[];
}) {
  const heroSurface = useHeroSurface(TH.primary);
  return (
    <View style={{
      borderRadius: 20, ...heroSurface, padding: 22,
      position: 'relative', overflow: 'hidden', marginBottom: 16,
    }}>
      <View style={{ position: 'absolute', top: -40, end: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
      <View style={{ position: 'absolute', bottom: -50, start: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.05)' }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
            {kicker}
          </Text>
          <Text
            style={{ ...DISPLAY, fontSize: 32, color: '#FFFFFF', letterSpacing: -1, lineHeight: 38 }}
            numberOfLines={1}
          >
            {value}
          </Text>
          {label ? (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{label}</Text>
          ) : null}
          {sub ? (
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{sub}</Text>
          ) : null}
        </View>
        {Icon ? (
          <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Icon size={20} color="#FFFFFF" strokeWidth={1.6} />
          </View>
        ) : null}
      </View>

      {miniStats && miniStats.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {miniStats.map(s => (
            <View key={s.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                {s.label}
              </Text>
              <Text style={{ ...DISPLAY, fontWeight: '300', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 22 }} numberOfLines={1}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────  ListRow  ────────────────────────────── */
export function ListRow({
  icon: Icon, iconBg, iconColor, title, sub, error, value, valueSub, onPress, leftAccent,
}: {
  icon?: any;
  iconBg?: string;
  iconColor?: string;
  title: string;
  sub?: string;
  error?: string;
  value?: string;
  valueSub?: string;
  onPress?: () => void;
  leftAccent?: React.ReactNode; // medal, number badge etc.
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={resolveStyle(({ pressed }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16,
        opacity: onPress && pressed ? 0.85 : 1,
      }), !!onPress)}
    >
      {leftAccent}
      {Icon ? (
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: iconBg ?? (isDark ? TH.primary + '26' : TH.bgSoft), alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={iconColor ?? TH.primary} strokeWidth={1.8} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? T.ink : U.ink[900], letterSpacing: -0.2 }} numberOfLines={1}>
          {title}
        </Text>
        {sub ? <Text style={{ fontSize: 12, color: isDark ? T.ink3 : U.ink[500], marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
        {error ? <Text style={{ fontSize: 11, color: TH.danger, marginTop: 4 }}>{error}</Text> : null}
      </View>
      {value ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ ...DISPLAY, fontSize: 22, color: isDark ? T.ink : U.ink[900], letterSpacing: -0.7 }}>{value}</Text>
          {valueSub ? (
            <Text style={{ fontSize: 10, color: isDark ? T.ink3 : U.ink[400], textTransform: 'uppercase', letterSpacing: 0.5 }}>{valueSub}</Text>
          ) : null}
        </View>
      ) : null}
    </Wrapper>
  );
}

/* ─────────────────────────────  ErrorBar  ───────────────────────────── */
export function ErrorBar({ message }: { message: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: 'rgba(217,75,75,0.08)', borderColor: 'rgba(217,75,75,0.25)',
      borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TH.danger }} />
      <Text style={{ flex: 1, fontSize: 13, color: '#9C2E2E' }}>{message}</Text>
    </View>
  );
}

/* ─────────────────────────────  Loader  ─────────────────────────────── */
export function Loader() {
  return (
    <View style={{ padding: 64, alignItems: 'center' }}>
      <ActivityIndicator color={TH.primary} />
    </View>
  );
}
