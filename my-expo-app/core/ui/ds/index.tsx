/**
 * core/ui/ds — Paylaşılan tasarım sistemi atomları.
 *
 * KAYNAK: `/dev/patterns` showcase + DESIGN_LANGUAGE.md.
 * Showcase'teki bileşenler o dosyanın içinde YEREL tanımlıydı; ekranlar onları
 * kullanamıyor, her ekran aynı stili elle tekrar yazıyordu. Bu modül onları
 * tek yerde toplar.
 *
 * `modules/payroll/bonus/components/atoms.tsx` neden kullanılmadı: orada
 * `TH = DS.exec` SABİT — lab/klinik/teknisyen panellerinde admin rengini
 * dayatır. Buradaki atomlar `accent` prop'u alır, panelden çözülür.
 *
 * Geometri (DESIGN_LANGUAGE §3): kart radius 18 · 1px ink[200] · gölge yok ·
 * pill 999 · blok ritmi 16.
 * Tipografi (§2): display daima Inter Tight **300** + negatif tracking;
 * semibold yalnız kart başlığında.
 */

import React from 'react';
import { View, Text, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { ChevronLeft, Search, X } from 'lucide-react-native';
import { DS } from '../../theme/dsTokens';

/** §2 — display başlıklar daima light (300) */
export const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

/** hex → rgba (accent'in yumuşak tonları için) */
export function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────────────────────────────  Card  ────────────────────────────── */
/** §3 — beyaz yüzey · radius 18 · 1px ink[200] · gölge YOK */
export const cardStyle: ViewStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: DS.ink[200],
};

export function Card({ children, style, padded = true }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** false → iç padding yok (liste kartları için) */
  padded?: boolean;
}) {
  return (
    <View style={[cardStyle, padded ? { padding: 18 } : { overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

/* ────────────────────────────  SecHeader  ───────────────────────────── */
/** Eyebrow + display başlık + açıklama. Opsiyonel geri butonu ve sağ aksiyon. */
export function SecHeader({ eyebrow, title, desc, onBack, action }: {
  eyebrow: string;
  title: string;
  desc?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => ({
              width: 30, height: 30, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.05)',
              opacity: pressed ? 0.6 : 1, ...webCursor,
            })}
          >
            <ChevronLeft size={16} color={DS.ink[700]} strokeWidth={1.8} />
          </Pressable>
        ) : null}
        <Text style={{
          fontSize: 11, fontWeight: '500', letterSpacing: 1.4,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          {eyebrow}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <Text style={{
          ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26,
          color: DS.ink[900], flex: 1,
        }}>
          {title}
        </Text>
        {action}
      </View>

      {desc ? (
        <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 640 }}>
          {desc}
        </Text>
      ) : null}
    </View>
  );
}

/* ─────────────────────────────  BigStat  ────────────────────────────── */
/** §5 BigStat — hero stat row'ları için 40px display rakam */
export function BigStat({ value, label, color }: {
  value: React.ReactNode; label: string; color?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 44, color: color ?? DS.ink[900] }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
        textTransform: 'uppercase', color: DS.ink[400],
      }}>
        {label}
      </Text>
    </View>
  );
}

/** BigStat'ın liste/özet şeridi için küçültülmüş hâli (20px) */
export function MiniStat({ value, label, color }: {
  value: React.ReactNode; label: string; color?: string;
}) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.6, lineHeight: 24, color: color ?? DS.ink[900] }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
        textTransform: 'uppercase', color: DS.ink[400],
      }}>
        {label}
      </Text>
    </View>
  );
}

/* ──────────────────────────────  Chip  ──────────────────────────────── */
export type ChipTone =
  | 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const CHIP_TONES = (accent: string): Record<ChipTone, { bg: string; fg: string; border: string }> => ({
  neutral: { bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[800], border: 'transparent' },
  primary: { bg: tint(accent, 0.14),      fg: DS.ink[800], border: 'transparent' },
  accent:  { bg: DS.ink[900],             fg: '#FFFFFF',   border: 'transparent' },
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47',   border: 'transparent' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E',   border: 'transparent' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E',   border: 'transparent' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689',   border: 'transparent' },
  outline: { bg: 'transparent',           fg: DS.ink[800], border: DS.ink[300] },
});

/** §5 Chip — etiket çipi. `active` → solid ink[900] (showcase davranışı). */
export function Chip({ children, tone = 'neutral', accent = DS.lab.primary, onPress, active, leftIcon, dot }: {
  children: React.ReactNode;
  tone?: ChipTone;
  accent?: string;
  onPress?: () => void;
  active?: boolean;
  leftIcon?: React.ReactNode;
  dot?: string;
}) {
  const t = active
    ? { bg: DS.ink[900], fg: '#FFFFFF', border: 'transparent' }
    : CHIP_TONES(accent)[tone];
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: t.bg,
        borderWidth: t.border === 'transparent' ? 0 : 1,
        borderColor: t.border,
        opacity: onPress && pressed ? 0.7 : 1,
        ...(onPress ? webCursor : {}),
      })}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dot }} /> : null}
      {leftIcon}
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.fg }}>{children}</Text>
    </Wrapper>
  );
}

/** §5 StatusChip — status mini rozeti */
export function StatusChip({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color }}>{label}</Text>
    </View>
  );
}

/* ───────────────────────────  PillButton  ───────────────────────────── */
/** §5 PillButton — dark · primary · light · ghost · radius 999 */
export function PillButton({
  children, onPress, variant = 'dark', accent = DS.lab.primary,
  disabled, loading, leftIcon, size = 'md',
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'dark' | 'primary' | 'light' | 'ghost';
  accent?: string;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm'
    ? { paddingHorizontal: 14, paddingVertical: 7, fontSize: 12 }
    : { paddingHorizontal: 20, paddingVertical: 10, fontSize: 13 };
  const skin = {
    dark:    { bg: DS.ink[900],   fg: '#FFFFFF',   border: 'transparent' },
    primary: { bg: accent,        fg: DS.ink[900], border: 'transparent' },
    light:   { bg: '#FFFFFF',     fg: DS.ink[800], border: DS.ink[300] },
    ghost:   { bg: 'transparent', fg: DS.ink[700], border: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: pad.paddingHorizontal, paddingVertical: pad.paddingVertical,
        borderRadius: 999,
        backgroundColor: skin.bg,
        borderWidth: skin.border === 'transparent' ? 0 : 1,
        borderColor: skin.border,
        opacity: disabled ? 0.35 : loading ? 0.6 : pressed ? 0.85 : 1,
        ...(Platform.OS === 'web'
          ? ({ cursor: disabled ? 'not-allowed' : 'pointer' } as any)
          : {}),
      })}
    >
      {loading ? <ActivityIndicator size="small" color={skin.fg} /> : leftIcon}
      <Text style={{ fontSize: pad.fontSize, fontWeight: '600', color: skin.fg }}>
        {children}
      </Text>
    </Pressable>
  );
}

/* ─────────────────────────────  TabPill  ────────────────────────────── */
/** §6 Pill variant — üst nav / sayfa içi sekme. Aktif = solid ink[900]. */
export function TabPill<T extends string>({ items, value, onChange }: {
  items: { key: T; label: string; count?: number; icon?: React.ComponentType<any> }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {items.map(it => {
        const on = value === it.key;
        const Icon = it.icon;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
              backgroundColor: on ? DS.ink[900] : 'rgba(0,0,0,0.05)',
              opacity: pressed ? 0.7 : 1, ...webCursor,
            })}
          >
            {Icon ? <Icon size={13} color={on ? '#FFFFFF' : DS.ink[700]} strokeWidth={1.8} /> : null}
            <Text style={{ fontSize: 12, fontWeight: '500', color: on ? '#FFFFFF' : DS.ink[800] }}>
              {it.label}
            </Text>
            {it.count != null ? (
              <Text style={{ fontSize: 11, color: on ? 'rgba(255,255,255,0.6)' : DS.ink[400] }}>
                {it.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ────────────────────────────  SearchField  ─────────────────────────── */
/** §7 Arama — pill köşeli, ikonlu, temizle butonlu */
export function SearchField({ value, onChange, placeholder = 'Ara...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, height: 36, borderRadius: 999,
      backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: DS.ink[200],
      flexGrow: 1, flexBasis: 220, minWidth: 0,
    }}>
      <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={DS.ink[400]}
        style={{
          flex: 1, fontSize: 13, color: DS.ink[900],
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
        }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} style={webCursor}>
          <X size={13} color={DS.ink[400]} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ──────────────────────────  ProgressRail  ──────────────────────────── */
/** İnce ilerleme rayı — kart değil, tek çizgi */
export function ProgressRail({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 3, borderRadius: 999, backgroundColor: DS.ink[100], overflow: 'hidden' }}>
      <View style={{
        height: '100%', borderRadius: 999,
        width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color,
      }} />
    </View>
  );
}

/* ────────────────────────────  ListHeader  ──────────────────────────── */
/** §7 tablo başlığı — 10px uppercase tracking, ink[50] zemin */
export function ListHeader({ columns }: {
  columns: { label: string; width?: number; flex?: number; align?: 'left' | 'right' }[];
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 18, paddingVertical: 10,
      backgroundColor: DS.ink[50],
      borderBottomWidth: 1, borderBottomColor: DS.ink[100],
    }}>
      {columns.map((c, i) => (
        <Text
          key={i}
          style={{
            width: c.width, flex: c.flex,
            textAlign: c.align === 'right' ? 'right' : 'left',
            fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
            textTransform: 'uppercase', color: DS.ink[400],
          }}
        >
          {c.label}
        </Text>
      ))}
    </View>
  );
}

/* ────────────────────────────  EmptyCard  ───────────────────────────── */
export function EmptyCard({ icon: Icon, title, description, cta }: {
  icon: React.ComponentType<any>;
  title: string;
  description?: string;
  cta?: React.ReactNode;
}) {
  return (
    <View style={[cardStyle, { paddingVertical: 48, alignItems: 'center', gap: 10 }]}>
      <View style={{
        width: 44, height: 44, borderRadius: 999, alignItems: 'center',
        justifyContent: 'center', backgroundColor: DS.ink[100],
      }}>
        <Icon size={19} color={DS.ink[400]} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{title}</Text>
      {description ? (
        <Text style={{ fontSize: 13, color: DS.ink[500], textAlign: 'center', maxWidth: 380, lineHeight: 19 }}>
          {description}
        </Text>
      ) : null}
      {cta}
    </View>
  );
}

/* ─────────────────────────────  LoadMore  ───────────────────────────── */
export function LoadMore({ remaining, onPress }: { remaining: number; onPress: () => void }) {
  if (remaining <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 14, alignItems: 'center',
        borderTopWidth: 1, borderTopColor: DS.ink[100],
        opacity: pressed ? 0.6 : 1, ...webCursor,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>
        {remaining} kalem daha göster
      </Text>
    </Pressable>
  );
}

/* ──────────────────────────────  Loader  ────────────────────────────── */
export function Loader({ color }: { color?: string }) {
  return (
    <View style={{ paddingVertical: 96, alignItems: 'center' }}>
      <ActivityIndicator color={color ?? DS.lab.primary} />
    </View>
  );
}
