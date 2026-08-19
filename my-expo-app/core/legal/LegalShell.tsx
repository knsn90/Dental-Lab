// core/legal/LegalShell.tsx
// Public (giriş gerektirmeyen) yasal sayfa kabuğu — iyzico incelemesi için.
// Üst bar (marka) + kaydırılabilir içerik + footer (şirket bilgisi + ödeme rozetleri
// + diğer yasal sayfalara linkler). Tüm /legal/* sayfaları bunu kullanır.
import React from 'react';
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { COMPANY } from './companyInfo';
import { PaymentBadges } from '../ui/PaymentBadges';

const INK = { 900: '#0A0A0A', 700: '#2C2C2C', 500: '#6B6B6B', 400: '#9A9A9A', 200: '#E6E6E6', 100: '#F3F3F1' };

const LINKS: { href: string; label: string }[] = [
  { href: '/legal/hakkimizda',    label: 'Hakkımızda' },
  { href: '/legal/mesafeli-satis', label: 'Mesafeli Satış Sözleşmesi' },
  { href: '/legal/teslimat-iade',  label: 'Teslimat ve İade Şartları' },
  { href: '/legal/gizlilik',       label: 'Gizlilik Sözleşmesi' },
];

/** Sayfa içi tipografi yardımcıları — legal içeriklerde kullan. */
export function H({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900], marginTop: 22, marginBottom: 8 }}>{children}</Text>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 14, lineHeight: 22, color: INK[700], marginBottom: 10 }}>{children}</Text>;
}
export function LI({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, paddingStart: 4 }}>
      <Text style={{ fontSize: 14, lineHeight: 22, color: INK[400] }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: INK[700] }}>{children}</Text>
    </View>
  );
}

export function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width - 32, 820);
  const go = (href: string) => router.push(href as any);
  const openHome = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = 'https://siman.app';
    else router.replace('/' as any);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FBFBFA' }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 48 }}>
      {/* Üst bar */}
      <View style={{ width: '100%', borderBottomWidth: 1, borderBottomColor: INK[200], backgroundColor: '#FFFFFF' }}>
        <View style={{ width: '100%', maxWidth: maxW, alignSelf: 'center', paddingHorizontal: 16, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={openHome} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: INK[900], letterSpacing: -0.5 }}>{COMPANY.brand}</Text>
          </Pressable>
          <Pressable onPress={openHome} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E64FF' }}>siman.app →</Text>
          </Pressable>
        </View>
      </View>

      {/* İçerik */}
      <View style={{ width: '100%', maxWidth: maxW, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: INK[900], marginTop: 28, letterSpacing: -0.6 }}>{title}</Text>
        {updated ? <Text style={{ fontSize: 12, color: INK[400], marginTop: 6 }}>Son güncelleme: {updated}</Text> : null}
        <View style={{ marginTop: 12 }}>{children}</View>

        {/* Footer — şirket bilgisi + ödeme yöntemleri + linkler */}
        <View style={{ marginTop: 40, paddingTop: 20, borderTopWidth: 1, borderTopColor: INK[200], gap: 14 }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: INK[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Satıcı / Firma</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: INK[900] }}>{COMPANY.legalName}</Text>
            <Text style={{ fontSize: 12.5, color: INK[700], marginTop: 3 }}>{COMPANY.address}</Text>
            <Text style={{ fontSize: 12.5, color: INK[700], marginTop: 3 }}>VKN: {COMPANY.vkn}{COMPANY.mersis ? ` · MERSİS: ${COMPANY.mersis}` : ''}</Text>
            <Text style={{ fontSize: 12.5, color: INK[700], marginTop: 3 }}>E-posta: {COMPANY.email}{COMPANY.phone ? ` · Tel: ${COMPANY.phone}` : ''}</Text>
          </View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: INK[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Güvenli Ödeme</Text>
            <PaymentBadges />
            <Text style={{ fontSize: 11, color: INK[400], marginTop: 8 }}>Ödemeler iyzico altyapısı ile 256-bit SSL üzerinden güvenle alınır.</Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
            {LINKS.map(l => (
              <Pressable key={l.href} onPress={() => go(l.href)} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
                <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#1E64FF' }}>{l.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: INK[400], marginTop: 8 }}>© {new Date().getFullYear()} {COMPANY.legalName}. Tüm hakları saklıdır.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
