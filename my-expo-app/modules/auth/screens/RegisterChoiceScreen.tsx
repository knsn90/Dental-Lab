/**
 * RegisterChoiceScreen — "Muayenehane mi, Klinik mi?" seçim ekranı.
 * Doctor (sage green) tema — sign up akışı.
 */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, User } from 'lucide-react-native';
import { AuthShell, AUTH, AUTH_FONT } from '../components/AuthShell';

// Doctor tonu — AuthShell ile aynı palet
const TONE = {
  primary:     '#7A9B85',
  primaryDeep: '#5C7E68',
  primarySoft: '#D5E2DB',
  accentSoft:  '#E1ECE5',
} as const;

function ChoiceCard({
  icon, title, subtitle, onPress,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: hovered ? `${TONE.primary}10` : '#FFFFFF',
        borderWidth: 1,
        borderColor: hovered ? TONE.primary : AUTH.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
          transitionProperty: 'background-color, border-color, transform' as any,
          transitionDuration: '160ms' as any,
          boxShadow: hovered
            ? `0 8px 24px ${TONE.primary}33`
            : '0 1px 2px rgba(0,0,0,0.03)',
        } as any : {}),
      })}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: TONE.accentSoft,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontFamily: AUTH_FONT.display,
          fontSize: 15, fontWeight: '800', color: AUTH.ink,
        }}>
          {title}
        </Text>
        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 12.5, color: AUTH.inkSoft, lineHeight: 17, marginTop: 2,
        }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export function RegisterChoiceScreen() {
  const router = useRouter();

  return (
    <AuthShell
      tone="doctor"
      illustrationSource={require('../../../assets/images/auth-illustration-doctor.png')}
      eyebrow="Hoş Geldin"
      heading="Kayıt Ol"
      subtitle="Size en uygun kayıt yolunu seçin."
      illustrationCaption={'Hekim ve klinikler için\ntek panel.'}
      footerLink={{
        text: 'Zaten hesabın var mı?',
        linkText: 'Giriş Yap',
        onPress: () => router.replace('/(auth)/login'),
      }}
    >
      <View style={{ gap: 12 }}>
        <ChoiceCard
          icon={<User size={20} color={TONE.primaryDeep} strokeWidth={1.8} />}
          title="Muayenehane"
          subtitle="Tek hekim, kendi kliniğinde çalışıyorsun."
          onPress={() => router.push('/(auth)/register-doctor')}
        />
        <ChoiceCard
          icon={<Building2 size={20} color={TONE.primaryDeep} strokeWidth={1.8} />}
          title="Klinik / Poliklinik"
          subtitle="Birden fazla hekim personel bir kurumsun."
          onPress={() => router.push('/(auth)/register-clinic')}
        />
      </View>
    </AuthShell>
  );
}
