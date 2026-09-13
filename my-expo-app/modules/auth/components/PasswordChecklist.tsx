/**
 * PasswordChecklist — Şifre alanının altında canlı validation göstergesi.
 * Kural karşılandıysa yeşil ✓, karşılanmadıysa gri ○.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Check, Circle } from '../../../core/ui/icons';
import { AUTH, AUTH_FONT } from './AuthShell';

interface Props {
  password: string;
  /** Onay rengi — varsayılan saffron, klinik/hekim formunda yeşil ver */
  accent?: string;
}

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: 'En az 8 karakter',     test: (p) => p.length >= 8 },
  { label: 'Bir büyük harf (A-Z)', test: (p) => /[A-ZÇĞİÖŞÜ]/.test(p) },
  { label: 'Bir küçük harf (a-z)', test: (p) => /[a-zçğıöşü]/.test(p) },
  { label: 'Bir rakam (0-9)',      test: (p) => /\d/.test(p) },
  { label: 'Bir özel karakter (!@#$ vb.)', test: (p) => /[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(p) },
];

export function PasswordChecklist({ password, accent = AUTH.primary }: Props) {
  if (!password) return null;

  return (
    <View style={{
      marginTop: -8,
      marginBottom: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: 'rgba(0,0,0,0.02)',
      borderRadius: 10,
      gap: 5,
    }}>
      {RULES.map((rule, i) => {
        const ok = rule.test(password);
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {ok ? (
              <Check size={11} color={accent} strokeWidth={3} />
            ) : (
              <Circle size={11} color={AUTH.inkMuted} strokeWidth={1.8} />
            )}
            <Text style={{
              fontFamily: AUTH_FONT.sans,
              fontSize: 11,
              color: ok ? accent : AUTH.inkMuted,
              fontWeight: ok ? '600' : '400',
            }}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
