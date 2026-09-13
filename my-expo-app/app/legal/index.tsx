import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LegalShell, P } from '../../core/legal/LegalShell';
import { COMPANY } from '../../core/legal/companyInfo';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

const ITEMS = [
  { href: '/legal/hakkimizda',     label: 'Hakkımızda', desc: 'Firma ve hizmetlerimiz' },
  { href: '/legal/mesafeli-satis', label: 'Mesafeli Satış Sözleşmesi', desc: 'Satış koşulları' },
  { href: '/legal/teslimat-iade',  label: 'Teslimat ve İade Şartları', desc: 'Teslimat, iade, garanti' },
  { href: '/legal/gizlilik',       label: 'Gizlilik Sözleşmesi', desc: 'KVKK ve veri güvenliği' },
];

export default function LegalIndex() {
  const router = useRouter();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <LegalShell title="Yasal Bilgiler">
      <P>{COMPANY.brand} platformuna ilişkin yasal metinler ve sözleşmeler aşağıdadır.</P>
      <View style={{ gap: 10, marginTop: 8 }}>
        {ITEMS.map(it => (
          <Pressable
            key={it.href}
            onPress={() => router.push(it.href as any)}
            style={({ hovered }: any) => ({
              padding: 16, borderRadius: 12, borderWidth: 1, borderColor: isDark ? T.hairline : '#E6E6E6',
              backgroundColor: isDark ? (hovered ? 'rgba(255,255,255,0.05)' : T.card) : (hovered ? '#F6F8FF' : '#FFFFFF'),
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? T.ink : '#0A0A0A' }}>{it.label}</Text>
            <Text style={{ fontSize: 12.5, color: isDark ? T.ink3 : '#6B6B6B', marginTop: 2 }}>{it.desc}</Text>
          </Pressable>
        ))}
      </View>
    </LegalShell>
  );
}
