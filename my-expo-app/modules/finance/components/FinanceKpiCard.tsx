/**
 * FinanceKpiCard — Mali İşlemler ortak KPI kart bileşeni
 *
 * Cards Design System uyumlu: beyaz bg, transparent border, ağır gölge.
 * Tüm finans ekranlarında (Karlılık, Personel Verim, Faturalar, Rapor, Kasa) kullanılır.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';

export interface FinanceKpiCardProps {
  /** Lucide ikon adı */
  icon: string;
  /** Başlık (üst etiket — UPPERCASE görünür) */
  label: string;
  /** Ana değer (örn. "₺125.430") */
  value: string;
  /** Alt etiket / açıklama */
  sub?: string;
  /** Aksent rengi — ikon arkaplanı + delta rengi */
  accent?: string;
  /** Trend / delta etiketi (örn. "+%12") */
  delta?: string;
  /** Delta tonu */
  deltaTone?: 'up' | 'down' | 'neutral';
  /** Alarm modu — kırmızı çerçeve */
  alert?: boolean;
  /** Sıkı mod (dashboard mini kart) */
  compact?: boolean;
  style?: ViewStyle;
}

export function FinanceKpiCard({
  icon, label, value, sub,
  accent = '#2563EB',
  delta, deltaTone = 'neutral',
  alert = false,
  compact = false,
  style,
}: FinanceKpiCardProps) {
  const deltaColor =
    deltaTone === 'up'   ? '#059669' :
    deltaTone === 'down' ? '#DC2626' : '#64748B';
  const deltaBg =
    deltaTone === 'up'   ? '#ECFDF5' :
    deltaTone === 'down' ? '#FEF2F2' : '#F1F5F9';

  return (
    <View style={[
      s.card,
      alert && s.alert,
      compact && s.compact,
      style,
    ]}>
      <View style={s.top}>
        <View style={[s.iconBox, { backgroundColor: accent + '15' }]}>
          <AppIcon name={icon} size={compact ? 16 : 18} color={accent} strokeWidth={2} />
        </View>
        {delta ? (
          <View style={[s.deltaPill, { backgroundColor: deltaBg }]}>
            <Text style={[s.deltaText, { color: deltaColor }]}>{delta}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[s.value, compact && s.valueCompact, alert && { color: '#DC2626' }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.label} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: CardSpec.bg,
    borderRadius: CardSpec.radius,
    borderWidth: 1,
    borderColor: CardSpec.border,
    padding: 16,
    gap: 4,
    ...Shadows.card,
  } as ViewStyle,
  alert: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  compact: { padding: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deltaPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  deltaText: { fontSize: 11, fontWeight: '700' },
  value: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6, marginTop: 2 },
  valueCompact: { fontSize: 18 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.4, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
});
