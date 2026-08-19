// core/ui/PaymentBadges.tsx
// iyzico başvurusu kriteri: Visa + Mastercard + "iyzico ile Öde" logoları görünür olmalı.
// Web'de iyzico'nun RESMİ logo bandını (public/payment/logo-band.svg) gösterir
// (iyzico ile Öde · Mastercard · Visa · American Express · troy). Native'de basit
// metin/şekil fallback (iyzico incelemesi web üzerindendir).
import React from 'react';
import { View, Text, Platform } from 'react-native';

const ALT = 'Kabul edilen ödeme yöntemleri: iyzico ile Öde, Mastercard, Visa, American Express, troy';

export function PaymentBadges({ height = 18 }: { height?: number }) {
  if (Platform.OS === 'web') {
    // react-native-web içinde gerçek DOM <img> — SVG'yi olduğu gibi render eder.
    return React.createElement('img', {
      src: '/payment/logo-band.svg',
      alt: ALT,
      style: { height, width: 'auto', maxWidth: '100%', display: 'block' },
    });
  }

  // Native fallback — basit rozetler
  const Pill = ({ children, border = '#E2E2E2' }: { children: React.ReactNode; border?: string }) => (
    <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
      {children}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Pill><Text style={{ fontSize: 14, fontWeight: '800', fontStyle: 'italic', color: '#1A1F71' }}>VISA</Text></Pill>
      <Pill>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#EB001B' }} />
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#F79E1B', marginStart: -5, opacity: 0.9 }} />
        </View>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#2C2C2C' }}>mastercard</Text>
      </Pill>
      <Pill border="#1E64FF"><Text style={{ fontSize: 12, fontWeight: '800', color: '#1E64FF' }}>iyzico</Text><Text style={{ fontSize: 12, fontWeight: '600', color: '#2C2C2C' }}>ile Öde</Text></Pill>
    </View>
  );
}
