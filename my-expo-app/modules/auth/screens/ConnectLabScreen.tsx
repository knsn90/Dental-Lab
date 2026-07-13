/**
 * ConnectLabScreen — Klinik/hekim, bir lab'ın kodunu girerek bağlanır.
 * Davet kodu (invite) → anında aktif. Public katılım kodu → lab onayına düşebilir.
 * Tek input; önce davet olarak dener, olmazsa public istek olarak dener.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useAuthStore } from '../../../store/authStore';
import { useActiveLabStore } from '../../../core/store/activeLabStore';
import { clinicAcceptInvite, clinicRequestLab } from '../../lab-connections/api';
import { AuthShell, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';

function panelBase(userType?: string): string {
  return userType === 'doctor' ? '/(doctor)' : '/(clinic)';
}

export function ConnectLabScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { load, setActive, memberships } = useActiveLabStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const connect = async () => {
    const c = code.trim().toUpperCase();
    if (!c || !profile?.id) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      let membershipId: string;
      try {
        membershipId = await clinicAcceptInvite(c);          // davet kodu → aktif
      } catch (e: any) {
        if (/wrong code type/i.test(e?.message ?? '')) {
          membershipId = await clinicRequestLab(c);           // public katılım kodu
        } else {
          throw e;
        }
      }
      await load(profile.id);
      const m = useActiveLabStore.getState().memberships.find((x) => x.membership_id === membershipId)
        ?? memberships.find((x) => x.membership_id === membershipId);
      if (m && m.status === 'active') {
        setActive(profile.id, m);
        router.replace(panelBase(profile.user_type) as any);
      } else {
        setMsg('Bağlanma isteğin gönderildi. Lab onayladığında burada görünecek.');
        setCode('');
      }
    } catch (e: any) {
      const raw = e?.message ?? '';
      setErr(
        /invalid code/i.test(raw) ? 'Kod bulunamadı. Kontrol edip tekrar dene.'
        : /expired/i.test(raw) ? 'Kodun süresi dolmuş. Lab\'dan yeni kod iste.'
        : /used up|inactive/i.test(raw) ? 'Bu kod artık geçerli değil.'
        : 'Bağlanılamadı. Kodu kontrol et.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Laboratuvara Bağlan"
      heading="Connect"
      subtitle="Çalışmak istediğin laboratuvarın sana verdiği bağlantı kodunu gir."
      illustrationCaption="Kod lab panelindeki&#10;'Klinik davet et' bölümünden alınır."
      footerLink={{ text: 'Lab listesine dön', linkText: 'Geri', onPress: () => router.replace('/(auth)/select-lab' as any) }}
    >
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: err ? AUTH.danger : AUTH.border, borderRadius: 14, paddingHorizontal: 14, height: 54 }}>
          <KeyRound size={18} color={AUTH.accentDeep} strokeWidth={1.9} />
          <TextInput
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setErr(null); }}
            placeholder="ÖRN: K7P2QX"
            placeholderTextColor={AUTH.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            onSubmitEditing={connect}
            style={{ flex: 1, fontFamily: AUTH_FONT.display, fontSize: 20, fontWeight: '700', letterSpacing: 3, color: AUTH.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
          />
        </View>
        {err ? <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.danger, fontWeight: '600' }}>{err}</Text> : null}
        {msg ? <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.success, fontWeight: '600' }}>{msg}</Text> : null}
        <AuthButton label={busy ? 'Bağlanıyor…' : 'Bağlan'} onPress={connect} disabled={busy || !code.trim()} />
      </View>
    </AuthShell>
  );
}

export default ConnectLabScreen;
