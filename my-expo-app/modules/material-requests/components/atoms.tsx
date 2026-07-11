/**
 * Malzeme Talepleri — paylaşılan tasarım atom'ları.
 *
 * Design Language Doc § 5: SecHeader · StatusChip · KPI Card · PillButton patternleri.
 * 16px sayfa-kenar kuralı: tüm ekranlar PAGE_PADDING kullanır.
 */

import React from 'react';
import { View, Text, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import {
  Clock, Hourglass, ShieldCheck, CheckCircle2, XCircle, Truck, PackageCheck,
  AlertOctagon, Slash, ArrowUp, Equal, ArrowDown, Flame,
} from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import type { RequestStatus, RequestUrgency } from '../api';

export const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export const PAGE_PADDING = 16;

export const TRY = (n: number | null | undefined) =>
  '₺' + (Number(n ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtMoneyDec = (n: number | null | undefined) =>
  '₺' + (Number(n ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

/* ─────────────────────────────  StatusChip  ─────────────────────────── */

export const makeStatusCfg = (t: ReturnType<typeof useMobileTokens>): Record<RequestStatus, { label: string; fg: string; bg: string; icon: any }> => ({
  draft:            { label: 'Taslak',           fg: t.ink2,      bg: t.cardSoft,              icon: Clock        },
  submitted:        { label: 'Müdür Onayında',   fg: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)', icon: Hourglass    },
  forwarded_admin:  { label: 'Admin Onayında',   fg: '#1D4ED8',   bg: 'rgba(29,78,216,0.12)',  icon: ShieldCheck  },
  rejected_manager: { label: 'Müdür Reddetti',   fg: '#9C2E2E',   bg: 'rgba(217,75,75,0.12)',  icon: XCircle      },
  rejected_admin:   { label: 'Admin Reddetti',   fg: '#9C2E2E',   bg: 'rgba(217,75,75,0.12)',  icon: XCircle      },
  approved:         { label: 'Onaylandı',        fg: '#1F6B47',   bg: 'rgba(45,154,107,0.14)', icon: CheckCircle2 },
  ordered:          { label: 'Sipariş Verildi',  fg: '#7C3AED',   bg: 'rgba(124,58,237,0.12)', icon: Truck        },
  received:         { label: 'Teslim Alındı',    fg: '#0EA5E9',   bg: 'rgba(14,165,233,0.12)', icon: PackageCheck },
  cancelled:        { label: 'İptal',            fg: t.ink3,      bg: t.cardSoft,              icon: Slash        },
  closed:           { label: 'Kapandı',          fg: t.ink2,      bg: t.cardSoft,              icon: CheckCircle2 },
});

export function StatusChip({ status, size = 'md' }: { status: RequestStatus; size?: 'sm' | 'md' }) {
  const T = useMobileTokens();
  const STATUS_CFG = makeStatusCfg(T);
  const c = STATUS_CFG[status] ?? STATUS_CFG.submitted;
  const Icon = c.icon;
  const fz = size === 'sm' ? 9 : 10;
  const px = size === 'sm' ? 6 : 8;
  const py = size === 'sm' ? 2 : 3;
  const ic = size === 'sm' ? 9 : 11;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: px, paddingVertical: py, borderRadius: 999,
      backgroundColor: c.bg,
    }}>
      <Icon size={ic} color={c.fg} strokeWidth={2} />
      <Text style={{ fontSize: fz, fontWeight: '700', color: c.fg, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {c.label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────  UrgencyChip  ────────────────────────── */

export const makeUrgencyCfg = (t: ReturnType<typeof useMobileTokens>): Record<RequestUrgency, { label: string; fg: string; bg: string; icon: any }> => ({
  low:      { label: 'Düşük',  fg: t.ink3,      bg: t.cardSoft,               icon: ArrowDown   },
  normal:   { label: 'Normal', fg: '#1D4ED8',   bg: 'rgba(29,78,216,0.10)',   icon: Equal       },
  high:     { label: 'Yüksek', fg: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)',  icon: ArrowUp     },
  critical: { label: 'Kritik', fg: '#9C2E2E',   bg: 'rgba(217,75,75,0.12)',   icon: Flame       },
});

export function UrgencyChip({ urgency, size = 'md' }: { urgency: RequestUrgency; size?: 'sm' | 'md' }) {
  const T = useMobileTokens();
  const URGENCY_CFG = makeUrgencyCfg(T);
  const c = URGENCY_CFG[urgency] ?? URGENCY_CFG.normal;
  const Icon = c.icon;
  const fz = size === 'sm' ? 9 : 10;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
      backgroundColor: c.bg,
    }}>
      <Icon size={size === 'sm' ? 9 : 10} color={c.fg} strokeWidth={2.4} />
      <Text style={{ fontSize: fz, fontWeight: '700', color: c.fg, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {c.label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────  Category label  ─────────────────────── */

export const CATEGORY_LABEL: Record<string, string> = {
  sarf:     'Sarf',
  alet:     'Alet',
  el_aleti: 'El Aleti',
  kimyasal: 'Kimyasal',
  muhtelif: 'Muhtelif',
};

export const ALL_CATEGORIES = ['sarf', 'alet', 'el_aleti', 'kimyasal', 'muhtelif'] as const;

/* ─────────────────────────────  Unit options  ───────────────────────── */

export const UNIT_OPTIONS = ['adet', 'paket', 'kutu', 'gr', 'kg', 'ml', 'lt', 'm', 'rulo', 'set'] as const;

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
  const T = useMobileTokens();
  const variants = {
    dark:    { bg: T.ink,       fg: T.card,       border: T.ink       },
    primary: { bg: TH.primary,  fg: '#FFF',       border: TH.primary  },
    light:   { bg: T.card,      fg: T.ink2,       border: T.hairline  },
    ghost:   { bg: 'transparent', fg: T.ink2,     border: 'transparent' },
    danger:  { bg: '#9C2E2E',   fg: '#FFF',       border: '#9C2E2E'   },
    success: { bg: '#1F6B47',   fg: '#FFF',       border: '#1F6B47'   },
  } as const;
  const v = variants[variant];
  const s = size === 'sm' ? { ph: 12, pv: 7, fs: 12 }
          : size === 'lg' ? { ph: 20, pv: 12, fs: 14 }
          : { ph: 14, pv: 9, fs: 13 };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: s.ph, paddingVertical: s.pv, borderRadius: 999,
        backgroundColor: v.bg, borderWidth: 1, borderColor: v.border,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        cursor: disabled ? ('default' as any) : ('pointer' as any),
        transform: [{ scale: hovered && !disabled ? 1.02 : 1 }],
      })}
    >
      {leftIcon}
      <Text style={{ fontSize: s.fs, fontWeight: '500', color: v.fg, letterSpacing: -0.13 }}>{children}</Text>
      {rightIcon}
    </Pressable>
  );
}

/* ─────────────────────────────  Card / SecHeader / Loader / ErrorBar  ─ */

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const T = useMobileTokens();
  return (
    <View style={[{
      backgroundColor: T.card, borderRadius: 18,
      borderWidth: 1, borderColor: T.hairline,
      padding: 16,
    }, style]}>
      {children}
    </View>
  );
}

export function SecHeader({ eyebrow, title, desc, action }: {
  eyebrow: string;
  title: string;
  desc?: string;
  action?: { label: string; onPress: () => void };
}) {
  const T = useMobileTokens();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: T.ink3 }}>
            {eyebrow}
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 22, color: T.ink, letterSpacing: -0.5, marginTop: 4 }}>
            {title}
          </Text>
          {desc && (
            <Text style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>{desc}</Text>
          )}
        </View>
        {action && (
          <Pressable onPress={action.onPress}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Loader() {
  const TH = usePanelTheme();
  return (
    <View style={{ padding: 48, alignItems: 'center' }}>
      <ActivityIndicator color={TH.primary} />
    </View>
  );
}

export function ErrorBar({ message }: { message: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: 'rgba(217,75,75,0.08)', borderColor: 'rgba(217,75,75,0.25)',
      borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
    }}>
      <AlertOctagon size={14} color="#9C2E2E" />
      <Text style={{ flex: 1, fontSize: 13, color: '#9C2E2E' }}>{message}</Text>
    </View>
  );
}

export function EmptyCard({ icon: Icon, title, description, cta }: {
  icon: any; title: string; description?: string;
  cta?: { label: string; onPress: () => void };
}) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  return (
    <View style={{
      backgroundColor: T.card, borderRadius: 18,
      borderWidth: 1, borderColor: T.hairline,
      padding: 28, alignItems: 'center', gap: 10,
    }}>
      <View style={{
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={TH.primary} strokeWidth={1.8} />
      </View>
      <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink, letterSpacing: -0.3 }}>{title}</Text>
      {description && (
        <Text style={{ fontSize: 12, color: T.ink3, textAlign: 'center', maxWidth: 360, lineHeight: 18 }}>
          {description}
        </Text>
      )}
      {cta && (
        <View style={{ marginTop: 4 }}>
          <PillButton variant="dark" onPress={cta.onPress}>{cta.label}</PillButton>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────  Mini KPI tile  ──────────────────────── */

export function MiniKPI({ icon: Icon, label, value, accent, onPress, alert }: {
  icon: any; label: string; value: string | number;
  accent: string; onPress?: () => void; alert?: boolean;
}) {
  const Wrapper: any = onPress ? Pressable : View;
  const T = useMobileTokens();
  const isAlert = !!alert;
  const fg = isAlert ? '#9C2E2E' : accent;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        flex: 1, flexBasis: 0, minWidth: 140,
        backgroundColor: T.card, borderRadius: 14,
        borderWidth: 1, borderColor: isAlert ? 'rgba(220,38,38,0.25)' : T.hairline,
        padding: 12, gap: 6,
        opacity: onPress && pressed ? 0.92 : 1,
        // @ts-ignore
        transform: [{ translateY: hovered && onPress ? -1 : 0 }],
        cursor: onPress ? ('pointer' as any) : ('default' as any),
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{
          width: 24, height: 24, borderRadius: 7,
          backgroundColor: fg + '14',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={12} color={fg} strokeWidth={2.2} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.7, lineHeight: 26, color: isAlert ? '#9C2E2E' : T.ink }}>
        {value}
      </Text>
    </Wrapper>
  );
}
