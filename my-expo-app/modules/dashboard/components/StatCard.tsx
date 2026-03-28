import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../../../core/theme/colors';

interface StatCardProps {
  label: string;
  value: number | string;
  accent: string;
  accentBg: string;
  icon: string;
  trend?: string;   // örn: "+ 12" veya "- 3"
  trendUp?: boolean;
}

export function StatCard({ label, value, accent, accentBg, icon, trend, trendUp }: StatCardProps) {
  return (
    <View style={s.card}>
      {/* Icon */}
      <View style={[s.iconWrap, { backgroundColor: accentBg }]}>
        <Text style={s.icon}>{icon}</Text>
      </View>

      {/* Label + trend row */}
      <View style={s.topRow}>
        <Text style={s.label}>{label}</Text>
        {trend != null && (
          <View style={[s.trendBadge, { backgroundColor: trendUp !== false ? '#ECFDF5' : '#FEF2F2' }]}>
            <Text style={[s.trendText, { color: trendUp !== false ? '#059669' : '#DC2626' }]}>
              {trendUp !== false ? '▲' : '▼'} {trend}
            </Text>
          </View>
        )}
      </View>

      {/* Value */}
      <Text style={[s.value, { color: accent }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textMuted,
    flex: 1,
  },
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
});
