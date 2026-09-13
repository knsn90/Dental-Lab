/**
 * SelectLabScreen — Çoklu-lab klinik/hekim girişinde lab seçimi.
 * Birden çok aktif lab bağlantısı olan klinik kullanıcısı, hangi lab'ın
 * bağlamına gireceğini seçer. Tek aktif bağlantıda routing bu ekranı atlar.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, ChevronLeft, ChevronRight, Clock, Plus } from '../../../core/ui/icons';
import { useAuthStore } from '../../../store/authStore';
import { useActiveLabStore } from '../../../core/store/activeLabStore';
import { AuthShell, AUTH, AUTH_FONT } from '../components/AuthShell';
import type { LabMembership } from '../../lab-connections/api';
import { isRTL } from '../../../core/i18n';

function panelBase(userType?: string): string {
  return userType === 'doctor' ? '/(doctor)' : '/(clinic)';
}

export function SelectLabScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { memberships, loaded, load, setActive } = useActiveLabStore();
  const rtl = isRTL();

  useEffect(() => {
    if (profile?.id && !loaded) load(profile.id);
  }, [profile?.id, loaded]);

  const actives = memberships.filter((m) => m.status === 'active');
  const pendings = memberships.filter((m) => m.status === 'pending');

  const pick = (m: LabMembership) => {
    if (!profile?.id) return;
    setActive(profile.id, m);
    router.replace(panelBase(profile.user_type) as any);
  };

  return (
    <AuthShell
      eyebrow="Laboratuvar Seçimi"
      heading="Select"
      subtitle="Birden çok laboratuvarla çalışıyorsun. Hangisinin ekranına girmek istersin?"
      illustrationCaption="İstediğin an profil menüsünden&#10;lab değiştirebilirsin."
    >
      {!loaded ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={AUTH.accent} /></View>
      ) : (
        <View style={{ gap: 10 }}>
          {actives.map((m) => (
            <Pressable key={m.membership_id} onPress={() => pick(m)}
              style={({ hovered }: any) => [{
                flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
                backgroundColor: hovered ? AUTH.accentSoft : '#FFFFFF',
                borderWidth: 1, borderColor: hovered ? AUTH.accent : AUTH.border,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }]}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: AUTH.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {m.lab_logo ? <Image source={{ uri: m.lab_logo }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                  : <Building2 size={20} color={AUTH.accentDeep} strokeWidth={1.8} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '700', color: AUTH.ink }}>{m.lab_name || 'Laboratuvar'}</Text>
                <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: AUTH.inkSoft, marginTop: 1 }}>Girmek için dokun</Text>
              </View>
              {rtl ? <ChevronLeft size={18} color={AUTH.inkMuted} strokeWidth={2} />
                   : <ChevronRight size={18} color={AUTH.inkMuted} strokeWidth={2} />}
            </Pressable>
          ))}

          {pendings.length > 0 && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: AUTH.inkMuted, marginStart: 2 }}>Onay bekleyen</Text>
              {pendings.map((m) => (
                <View key={m.membership_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: 'transparent', borderWidth: 1, borderColor: AUTH.border, opacity: 0.6 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: AUTH.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={18} color={AUTH.inkMuted} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '700', color: AUTH.ink }}>{m.lab_name || 'Laboratuvar'}</Text>
                    <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: AUTH.inkSoft, marginTop: 1 }}>Lab onayı bekleniyor</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {actives.length === 0 && pendings.length === 0 && (
            <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 13, color: AUTH.inkSoft, textAlign: 'center', paddingVertical: 20 }}>
              Henüz bir laboratuvara bağlı değilsin. Bir lab'ın davet kodu ile bağlanabilirsin.
            </Text>
          )}

          <Pressable onPress={() => router.push('/(auth)/connect-lab' as any)}
            style={({ hovered }: any) => [{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 14, marginTop: 4,
              backgroundColor: hovered ? AUTH.accentSoft : 'transparent', borderWidth: 1, borderColor: AUTH.border, borderStyle: 'dashed',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }]}>
            <Plus size={16} color={AUTH.accentDeep} strokeWidth={2} />
            <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13.5, fontWeight: '700', color: AUTH.accentDeep }}>Kod ile lab ekle</Text>
          </Pressable>
        </View>
      )}
    </AuthShell>
  );
}

export default SelectLabScreen;
