/**
 * EmptyState — Evrensel boş durum bileşeni
 *
 * Kullanım (icon + CTA):
 *   <EmptyState icon="clipboard-list" title="Henüz sipariş yok"
 *     subtitle="Yeni bir iş emri oluşturun." ctaLabel="Yeni İş Emri" onCta={...} />
 *
 * Geriye dönük compat (emoji):
 *   <EmptyState emoji="📋" title="..." subtitle="..." action={{ label, onPress }} />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
import { C } from '../theme/colors';

export interface EmptyStateProps {
  /** Lucide ikon adı (yeni API) */
  icon?: string;
  /** Emoji (eski API — geriye compat) */
  emoji?: string;
  title: string;
  subtitle?: string;
  /** Yeni API — birincil aksiyon */
  ctaLabel?: string;
  onCta?: () => void;
  /** Eski API — compat */
  action?: { label: string; onPress: () => void };
  /** İkincil aksiyon (daha hafif buton) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** 'error' → kırmızı ton */
  variant?: 'default' | 'error';
  style?: any;
}

export function EmptyState({
  icon = 'inbox',
  emoji,
  title,
  subtitle,
  ctaLabel,
  onCta,
  action,
  secondaryLabel,
  onSecondary,
  variant = 'default',
  style,
}: EmptyStateProps) {
  const isError   = variant === 'error';
  const iconColor = isError ? C.danger   : C.textMuted;
  const iconBg    = isError ? C.dangerBg : '#F1F5F9';

  // Eski API birleştirme
  const primaryLabel    = ctaLabel  ?? action?.label;
  const primaryOnPress  = onCta     ?? action?.onPress;

  return (
    <View style={[s.wrap, style]}>
      {/* ── Icon / Emoji circle ── */}
      {emoji ? (
        <View style={[s.iconCircle, { backgroundColor: iconBg }]}>
          <Text style={{ fontSize: 32 }}>{emoji}</Text>
        </View>
      ) : (
        <View style={[s.iconCircle, { backgroundColor: iconBg }]}>
          <AppIcon name={icon} size={32} color={iconColor} strokeWidth={1.5} />
        </View>
      )}

      {/* ── Title ── */}
      <Text style={[s.title, isError && { color: C.danger }]}>{title}</Text>

      {/* ── Subtitle ── */}
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

      {/* ── Primary CTA ── */}
      {primaryLabel && primaryOnPress ? (
        <TouchableOpacity
          style={[s.cta, isError && { backgroundColor: C.danger }]}
          onPress={primaryOnPress}
          activeOpacity={0.82}
        >
          <Text style={s.ctaText}>{primaryLabel}</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Secondary ── */}
      {secondaryLabel && onSecondary ? (
        <TouchableOpacity style={s.secondary} onPress={onSecondary} activeOpacity={0.7}>
          <Text style={s.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(15,23,42,0.07)',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 21,
    marginBottom: 24,
  },
  cta: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 10,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  secondary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  secondaryText: {
    color: C.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
