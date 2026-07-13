import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ShieldAlert, ShieldCheck, KeyRound, MailWarning, Ban, Clock } from 'lucide-react-native';
import { securityOverview, type SecurityOverview } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

export default function PlatformSecurity() {
  const [s, setS] = useState<SecurityOverview | null>(null);
  useEffect(() => { securityOverview().then(setS).catch(() => setS(null)); }, []);

  const mfaPct = s ? (s.users_total > 0 ? Math.round((s.mfa_enabled / s.users_total) * 100) : 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="security" />
        <Text style={{ fontFamily: FONT, fontSize: 26, fontWeight: '300', letterSpacing: -0.8, color: C.ink, marginBottom: 4 }}>Güvenlik merkezi</Text>
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>Kimlik doğrulama ve oturum durumu. Kullanıcı işlemleri (oturum kapat, kilitle) Kullanıcılar sekmesinde.</Text>

        {!s ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <Stat icon={ShieldCheck} tone={mfaPct >= 50 ? C.green : C.amber} label="MFA kullanımı" value={`%${mfaPct}`} sub={`${s.mfa_enabled}/${s.users_total} kullanıcı`} />
              <Stat icon={KeyRound} tone={C.accent} label="Aktif oturum" value={s.active_sessions} />
              <Stat icon={MailWarning} tone={s.unconfirmed > 0 ? C.amber : C.ink} label="Doğrulanmamış e-posta" value={s.unconfirmed} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              <Stat icon={Ban} tone={s.banned > 0 ? C.red : C.ink} label="Kilitli hesap" value={s.banned} />
              <Stat icon={Clock} tone={C.ink2} label="30g+ giriş yok" value={s.stale_30d} />
              <Stat icon={ShieldAlert} tone={C.ink2} label="Hiç giriş yapmamış" value={s.never_signed_in} />
            </View>

            <View style={{ backgroundColor: 'rgba(230,162,60,0.08)', borderWidth: 1, borderColor: 'rgba(230,162,60,0.25)', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: C.ink2, fontSize: 12.5, lineHeight: 19 }}>
                Not: Başarısız giriş / şüpheli IP izleme, gerçek zamanlı oturum listesi ve IP allow/block gibi ileri güvenlik özellikleri Supabase Auth log-drain / gateway katmanı gerektirir; burada Auth veritabanından türetilen özet gösterilir. Şifre/MFA politikası Ayarlar'da tanımlanır.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ icon: Icon, tone, label, value, sub }: { icon: any; tone: string; label: string; value: string | number; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 180, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 }}>
      <Icon size={16} color={tone} strokeWidth={1.9} />
      <Text style={{ fontFamily: FONT, fontSize: 28, fontWeight: '300', color: tone, marginTop: 8 }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}
