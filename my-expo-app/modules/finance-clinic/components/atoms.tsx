/**
 * Mali İşlemler (klinik/hekim) — paylaşılan tasarım atom'ları.
 *
 * Kaynak: docs/DESIGN_LANGUAGE.md (16px kuralı + F1/F1c hero patterns)
 * Panel teması dinamik (`usePanelTheme`) — clinic=sage, doctor=sage.
 */

import React from 'react';
import { View, Text, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { rateToBase } from '../../../core/money/rateCache';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import type { CurrencyTotal } from '../../../core/money/aggregations';

export const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export const TRY = (n: number | null | undefined) =>
  baseSymbol() + (Number(n ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtMoneyDec = (n: number | null | undefined) =>
  baseSymbol() + (Number(n ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const nf0 = (n: number) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

/**
 * Çift para birimi gösterimi: "₺22.348 (€420)".
 * `amount` faturanın kendi para biriminde (`currency`); bugünün kuruyla baz paraya
 * çevrilip baz birim ANA, döviz tutarı parantez içinde yazılır. currency yoksa veya
 * baz ile aynıysa sade baz gösterim ("₺22.348").
 */
export const M = (amount: number | null | undefined, currency?: string | null): string => {
  const base = getBaseCurrency();
  const cur  = currency || base;
  const amt  = Number(amount ?? 0);
  const baseStr = (CURRENCY_META[base as Currency]?.symbol ?? '₺') + nf0(amt * rateToBase(cur));
  if (cur === base) return baseStr;
  const fSym = CURRENCY_META[cur as Currency]?.symbol ?? cur;
  return `${baseStr} (${fSym}${nf0(amt)})`;
};

/** Sadece kendi para biriminde gösterim (çevirisiz): "€420". Dar sütunlar için. */
export const Mnat = (amount: number | null | undefined, currency?: string | null): string => {
  const cur = currency || getBaseCurrency();
  const sym = CURRENCY_META[cur as Currency]?.symbol ?? cur;
  return sym + nf0(Number(amount ?? 0));
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

export const MONTH_LABELS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/** Sayfa kenarı padding — Design Language 16px kuralı (her zaman 16). */
export const PAGE_PADDING = 16;

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
  const TH = usePanelTheme();
  const variants = {
    dark:    { bg: DS.ink[900],   fg: '#FFF',       border: DS.ink[900] },
    primary: { bg: TH.primary,    fg: '#FFF',       border: TH.primary },
    light:   { bg: '#FFF',        fg: DS.ink[900],  border: DS.ink[300] },
    ghost:   { bg: 'transparent', fg: DS.ink[900],  border: 'transparent' },
    danger:  { bg: '#D94B4B',     fg: '#FFF',       border: '#D94B4B' },
    success: { bg: '#2D9A6B',     fg: '#FFF',       border: '#2D9A6B' },
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

/* ─────────────────────────────  PercentRing (mini)  ─────────────────── */
/**
 * patterns.tsx › Senaryo 1 ring'inin küçültülmüş ve light tema versiyonu.
 * Outer pill kapsül + inner track + gradient progress arc.
 */
function PercentRing({ value, size = 64, color }: { value: number; size?: number; color: string }) {
  const v = Math.max(0, Math.min(100, value));
  const outerStroke = Math.max(6, Math.round(size * 0.14));
  const innerStroke = outerStroke - 4;
  const r = (size - outerStroke - Math.max(2, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Outer pill kapsül (soluk) */}
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={color + '14'} strokeWidth={outerStroke} fill="none" />
        {/* Inner track */}
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={color + '20'} strokeWidth={innerStroke} fill="none" />
        {/* Progress arc */}
        {v > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={color} strokeWidth={innerStroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{
          ...DISPLAY, fontSize: size * 0.30, lineHeight: size * 0.32,
          letterSpacing: -0.5, color: DS.ink[900],
        }}>
          {Math.round(v)}
          <Text style={{ fontSize: size * 0.16, color: DS.ink[400], fontWeight: '400' }}>%</Text>
        </Text>
      </View>
    </View>
  );
}

/* ─────────────────────────────  KPI Card (Patterns Showcase)  ───────── */
/**
 * patterns.tsx › 11.8 "KPI yatay kart" pattern'i — light tema versiyonu:
 * sol percent ring + sağ uppercase label + büyük display value + trend chip.
 *
 * percent prop'u verilirse soldaki halka çizilir; yoksa accent ikon kapsülü
 * fallback olarak görünür. Trend rozeti success/danger/neutral ton alır.
 */
export function KPI({
  icon: Icon, label, value, slices, sub, accent, onPress, alert,
  percent, trend,
}: {
  icon: any; label: string; value?: string; sub?: string;
  /** Katı per-currency: verilirse value yerine para birimi başına gösterilir. */
  slices?: CurrencyTotal[];
  accent: string; onPress?: () => void; alert?: boolean;
  /** 0-100 — verilirse ring çizilir, yoksa ikon kapsülü gösterilir */
  percent?: number;
  /** Trend rozeti — örn. { text: '%48', tone: 'danger' } */
  trend?: { text: string; tone?: 'success' | 'danger' | 'neutral' };
}) {
  const isAlert = !!alert;
  const effectiveAccent = isAlert ? '#DC2626' : accent;
  const Wrapper: any = onPress ? Pressable : View;

  // Trend chip renkleri (patterns.tsx › Senaryo 1 ile uyumlu)
  const trendCfg = {
    success: { fg: '#1F6B47', bg: 'rgba(45,154,107,0.12)' },
    danger:  { fg: '#9C2E2E', bg: 'rgba(217,75,75,0.12)' },
    neutral: { fg: DS.ink[700], bg: DS.ink[100] },
  }[trend?.tone ?? 'neutral'];

  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        // 4'ü tek satır kalsın: flexBasis 0 ile eşit dağılım, sadece <170px düşerse sarar
        flex: 1, flexBasis: 0, minWidth: 170,
        backgroundColor: '#FFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isAlert ? 'rgba(220,38,38,0.25)' : DS.ink[200],
        padding: 14,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        overflow: 'hidden',
        position: 'relative',
        transform: [{ translateY: hovered && onPress ? -1 : 0 }],
        // @ts-ignore
        boxShadow: hovered && onPress
          ? `0 6px 20px ${effectiveAccent}1A`
          : 'none',
        opacity: onPress && pressed ? 0.92 : 1,
        // @ts-ignore
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        cursor: onPress ? ('pointer' as any) : ('default' as any),
      })}
    >
      {/* SOL: percent ring veya fallback ikon kapsülü */}
      {percent !== undefined ? (
        <PercentRing value={percent} size={52} color={effectiveAccent} />
      ) : (
        <View style={{
          width: 48, height: 48, borderRadius: 14,
          backgroundColor: effectiveAccent + '14',
          borderWidth: 1, borderColor: effectiveAccent + '22',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={effectiveAccent} strokeWidth={1.8} />
        </View>
      )}

      {/* SAĞ: içerik */}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {/* label satırı (chip alta indi) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <Icon size={10} color={isAlert ? '#9C2E2E' : DS.ink[400]} strokeWidth={2} />
          <Text
            style={{
              fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
              color: isAlert ? '#9C2E2E' : DS.ink[500],
              flex: 1,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>

        {/* Display value — slices verilirse katı per-currency */}
        {slices ? (
          slices.length === 0 ? (
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.7, lineHeight: 26, color: DS.ink[400] }}>—</Text>
          ) : (
            <MoneyMultiX slices={slices} variant="inline" colorBySign={false} />
          )
        ) : (
          <Text
            style={{
              ...DISPLAY, fontSize: 22, letterSpacing: -0.7, lineHeight: 26,
              color: isAlert ? '#9C2E2E' : DS.ink[900],
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {value}
          </Text>
        )}

        {/* Sub + trend chip — alt satıra yan yana */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {sub ? (
            <Text
              style={{ fontSize: 10, color: DS.ink[500], fontWeight: '500', flex: 1 }}
              numberOfLines={1}
            >
              {sub}
            </Text>
          ) : <View style={{ flex: 1 }} />}
          {trend ? (
            <View style={{
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
              backgroundColor: trendCfg.bg,
            }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: trendCfg.fg, letterSpacing: 0.2 }} numberOfLines={1}>
                {trend.text}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Wrapper>
  );
}

/* ─────────────────────────────  StatusChip  ─────────────────────────── */
const INVOICE_STATUS_CFG: Record<string, { bg: string; fg: string; label: string }> = {
  taslak:       { bg: 'rgba(107,107,107,0.12)', fg: DS.ink[700], label: 'TASLAK' },
  kesildi:      { bg: 'rgba(29,78,216,0.12)',   fg: '#1D4ED8',   label: 'KESİLDİ' },
  kismi_odendi: { bg: 'rgba(232,155,42,0.15)',  fg: '#9C5E0E',   label: 'KISMİ' },
  odendi:       { bg: 'rgba(45,154,107,0.14)',  fg: '#1F6B47',   label: 'ÖDENDİ' },
  iptal:        { bg: 'rgba(217,75,75,0.12)',   fg: '#9C2E2E',   label: 'İPTAL' },
  pending:      { bg: 'rgba(107,107,107,0.12)', fg: DS.ink[700], label: 'BEKLİYOR' },
  awaiting_3ds: { bg: 'rgba(232,155,42,0.15)',  fg: '#9C5E0E',   label: '3D ONAYI' },
  authorized:   { bg: 'rgba(29,78,216,0.12)',   fg: '#1D4ED8',   label: 'BLOKELİ' },
  paid:         { bg: 'rgba(45,154,107,0.14)',  fg: '#1F6B47',   label: 'ÖDENDİ' },
  succeeded:    { bg: 'rgba(45,154,107,0.14)',  fg: '#1F6B47',   label: 'ÖDENDİ' },
  failed:       { bg: 'rgba(217,75,75,0.12)',   fg: '#9C2E2E',   label: 'BAŞARISIZ' },
  expired:      { bg: 'rgba(107,107,107,0.10)', fg: DS.ink[500], label: 'SÜRESİ DOLDU' },
  cancelled:    { bg: 'rgba(217,75,75,0.10)',   fg: '#9C2E2E',   label: 'İPTAL' },
  refunded:     { bg: 'rgba(107,107,107,0.10)', fg: DS.ink[500], label: 'İADE' },
  partially_refunded: { bg: 'rgba(232,155,42,0.12)', fg: '#9C5E0E', label: 'KISMİ İADE' },
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const c = INVOICE_STATUS_CFG[status] ?? { bg: DS.ink[100], fg: DS.ink[700], label: status };
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: c.fg, letterSpacing: 0.4 }}>{label ?? c.label}</Text>
    </View>
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
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D94B4B' }} />
      <Text style={{ flex: 1, fontSize: 13, color: '#9C2E2E' }}>{message}</Text>
    </View>
  );
}

/* ─────────────────────────────  Loader  ─────────────────────────────── */
export function Loader() {
  const TH = usePanelTheme();
  return (
    <View style={{ padding: 48, alignItems: 'center' }}>
      <ActivityIndicator color={TH.primary} />
    </View>
  );
}

/* ─────────────────────────────  Card  ───────────────────────────────── */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      backgroundColor: '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200],
      padding: 16,
    }, style]}>
      {children}
    </View>
  );
}

/* ─────────────────────────────  SecHeader  ──────────────────────────── */
export function SecHeader({ eyebrow, title, desc, action }: {
  eyebrow: string;
  title: string;
  desc?: string;
  action?: { label: string; onPress: () => void };
}) {
  const TH = usePanelTheme();
  return (
    <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ gap: 6, flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
          {eyebrow}
        </Text>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900], lineHeight: 26 }}>
          {title}
        </Text>
        {desc ? <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 520 }}>{desc}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────  HeroF1 (Glass)  ─────────────────────── */
export function HeroF1({ kicker, title, description, stats, actions }: {
  kicker: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  stats?: { value: string; label: string; tone?: 'default' | 'warn' | 'danger' }[];
  actions?: React.ReactNode;
}) {
  const TH = usePanelTheme();
  return (
    <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: TH.bg, padding: 14, marginBottom: 16 }}>
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderRadius: 22, padding: 22,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>
              {kicker}
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -1, lineHeight: 40, color: DS.ink[900] }}>
              {title}
            </Text>
            {description ? (
              <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 8, maxWidth: 520, lineHeight: 19 }}>
                {description}
              </Text>
            ) : null}
          </View>
          {stats && stats.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 22 }}>
              {stats.map(s => (
                <View key={s.label} style={{ alignItems: 'flex-end' }}>
                  <Text style={{
                    ...DISPLAY, fontSize: 30, letterSpacing: -1, lineHeight: 32,
                    color: s.tone === 'danger' ? '#9C2E2E' : s.tone === 'warn' ? '#9C5E0E' : DS.ink[900],
                  }}>{s.value}</Text>
                  <Text style={{ fontSize: 10, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2 }}>{s.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {actions ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>{actions}</View>
        ) : null}
      </View>
    </View>
  );
}

/* ─────────────────────────────  EmptyCard  ──────────────────────────── */
export function EmptyCard({ icon: Icon, title, description, cta }: {
  icon: any; title: string; description?: string;
  cta?: { label: string; onPress: () => void };
}) {
  const TH = usePanelTheme();
  return (
    <View style={{
      backgroundColor: '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200],
      padding: 28, alignItems: 'center', gap: 10,
    }}>
      <View style={{
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={TH.primary} strokeWidth={1.8} />
      </View>
      <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.3 }}>{title}</Text>
      {description ? (
        <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center', maxWidth: 360, lineHeight: 18 }}>
          {description}
        </Text>
      ) : null}
      {cta ? (
        <View style={{ marginTop: 4 }}>
          <PillButton variant="dark" onPress={cta.onPress}>{cta.label}</PillButton>
        </View>
      ) : null}
    </View>
  );
}
