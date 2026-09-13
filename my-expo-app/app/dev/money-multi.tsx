/**
 * /dev/money-multi — MoneyMultiX kanonik bileşeninin önizlemesi (K1).
 * Katı per-currency: hiçbir yerde base/≈ yok; her para birimi ayrı.
 */
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MoneyMultiX } from '../../core/money/MoneyMultiX';
import { groupByCurrency } from '../../core/money/aggregations';
import type { Currency } from '../../core/money/currency';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

// Örnek hareketler (kullanıcının örneği): farklı para birimleri bağımsız
const TX: { amount: number; currency: Currency }[] = [
  { amount: 125000, currency: 'TRY' },
  { amount: 8500,   currency: 'TRY' },
  { amount: 12500,  currency: 'EUR' },
  { amount: 6000,   currency: 'EUR' },
  { amount: 4200,   currency: 'USD' },
];

// Cari bakiye örneği (borç/alacak — eksi olabilir)
const BAL: { amount: number; currency: Currency }[] = [
  { amount: 8450,  currency: 'TRY' },
  { amount: 1250,  currency: 'EUR' },
  { amount: -600,  currency: 'USD' },
];

const ACCENT = '#EA7A4C'; // exec/admin mercan — demo

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ gap: 10, backgroundColor: isDark ? T.card : '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.06)' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? (T.ink3 as string) : '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>{title}</Text>
      {children}
    </View>
  );
}

export default function MoneyMultiPreview() {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const txSlices  = groupByCurrency(TX,  t => ({ amount: t.amount, currency: t.currency }));
  const balSlices = groupByCurrency(BAL, t => ({ amount: t.amount, currency: t.currency }), { keepZero: true });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? T.bg : '#F5F1EB' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '300', color: isDark ? T.ink : '#0A0A0A', fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', letterSpacing: -0.5 }}>
          MoneyMultiX — katı per-currency
        </Text>

        <Section title='variant="cards" · Dashboard kartı'>
          <MoneyMultiX slices={txSlices} variant="cards" label="Toplam Tahsilat" accentColor={ACCENT} size="lg" showCount />
        </Section>

        <Section title='variant="rows" · Rapor / özet'>
          <MoneyMultiX slices={txSlices} variant="rows" label="Satışlar" accentColor={ACCENT} showCount />
        </Section>

        <Section title='variant="inline" · Liste satırı (kompakt chip)'>
          <MoneyMultiX slices={txSlices} variant="inline" accentColor={ACCENT} showCount />
        </Section>

        <Section title='colorBySign · Cari bakiye (EUR/TRY/USD bağımsız, USD 0)'>
          <MoneyMultiX slices={balSlices} variant="cards" label="ABC Dental Bakiye" accentColor={ACCENT} colorBySign signed size="md" />
        </Section>

        <Section title='Boş durum'>
          <MoneyMultiX slices={[]} variant="cards" label="Toplam Gider" />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
