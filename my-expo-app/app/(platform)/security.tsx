import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ShieldAlert, ShieldCheck, KeyRound, MailWarning, Ban, Clock } from '../../core/ui/icons';
import { securityOverview, type SecurityOverview } from '../../modules/platform/api';
import { C, PageHeader, Kpi, Banner } from '../../modules/platform/ui';

export default function PlatformSecurity() {
  const [s, setS] = useState<SecurityOverview | null>(null);
  useEffect(() => { securityOverview().then(setS).catch(() => setS(null)); }, []);

  const mfaPct = s ? (s.users_total > 0 ? Math.round((s.mfa_enabled / s.users_total) * 100) : 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Güvenlik" accent="merkezi"
          description="Kimlik doğrulama ve oturum durumu. Kullanıcı işlemleri (oturum kapat, kilitle) Kullanıcılar sekmesinde." />

        {!s ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <Kpi icon={ShieldCheck} tone={mfaPct >= 50 ? C.green : C.amber} label="MFA kullanımı" value={`%${mfaPct}`} sub={`${s.mfa_enabled}/${s.users_total} kullanıcı`} />
              <Kpi icon={KeyRound} tone={C.accent} label="Aktif oturum" value={s.active_sessions} />
              <Kpi icon={MailWarning} tone={s.unconfirmed > 0 ? C.amber : C.ink} label="Doğrulanmamış e-posta" value={s.unconfirmed} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
              <Kpi icon={Ban} tone={s.banned > 0 ? C.red : C.ink} label="Kilitli hesap" value={s.banned} />
              <Kpi icon={Clock} tone={C.ink2} label="30g+ giriş yok" value={s.stale_30d} />
              <Kpi icon={ShieldAlert} tone={C.ink2} label="Hiç giriş yapmamış" value={s.never_signed_in} />
            </View>

            <Banner tone={C.amber} icon={ShieldAlert}>
              Başarısız giriş / şüpheli IP izleme, gerçek zamanlı oturum listesi ve IP allow/block gibi ileri güvenlik özellikleri Supabase Auth log-drain / gateway katmanı gerektirir; burada Auth veritabanından türetilen özet gösterilir. Şifre/MFA politikası Ayarlar'da tanımlanır.
            </Banner>
          </>
        )}
      </ScrollView>
    </View>
  );
}
