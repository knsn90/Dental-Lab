import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

import { AppIcon } from '../../../core/ui/AppIcon';

interface Props {
  panelType: string;
  accentColor: string;
}

const INFO_ROWS = [
  { icon: 'globe' as const,      label: 'Dil',         value: 'Türkçe' },
  { icon: 'clock' as const,      label: 'Saat Dilimi',  value: 'Europe/Istanbul (UTC+3)' },
  { icon: 'calendar' as const,   label: 'Tarih Formatı', value: 'GG/AA/YYYY' },
  { icon: 'smartphone' as const, label: 'Platform',     value: 'Web (Expo)' },
];

export function GeneralSection({ accentColor }: Props) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Genel Bilgiler</Text>
          <Text style={s.cardSub}>
            Uygulama genelindeki temel yapılandırma bilgileri.
          </Text>
        </View>
        {INFO_ROWS.map((row, i) => (
          <React.Fragment key={row.label}>
            <View style={s.infoRow}>
              <View style={[s.iconBox, { backgroundColor: accentColor + '15' }]}>
                <AppIcon name={row.icon} size={15} color={accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoLabel}>{row.label}</Text>
                <Text style={s.infoValue}>{row.value}</Text>
              </View>
            </View>
            {i < INFO_ROWS.length - 1 && <View style={s.divider} />}
          </React.Fragment>
        ))}
      </View>

      <View style={[s.notice, { borderColor: accentColor + '40', backgroundColor: accentColor + '08' }]}>
        <AppIcon name="info" size={14} color={accentColor} style={{ marginTop: 1 }} />
        <Text style={[s.noticeText, { color: accentColor }]}>
          Dil ve saat dilimi ayarları şu an sistem genelinde sabittir. İleride yönetici tarafından özelleştirilebilecektir.
        </Text>
      </View>
    </ScrollView>
  );
}

const CARD_SHADOW = Platform.select({
  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
});

const s = StyleSheet.create({
  container: {
    padding: 0,
    paddingBottom: 24,
    gap: 14,
  },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    paddingBottom: 6,
    ...CARD_SHADOW,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 62,
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
