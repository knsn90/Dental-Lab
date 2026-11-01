/**
 * ApprovalWaitingScreen — public kayıt (hekim / klinik yöneticisi) sonrası hesap durumu.
 *
 * Oturum açık kalır: root guard onay bekleyen klinik kullanıcısını buraya getirir.
 *  • kod henüz kullanılmadı / lab reddetti → lab bağlantı kodu girişi
 *  • istek lab'da bekliyor → hangi lab + adımlar; durum 20 sn'de bir yoklanır
 *  • hesap açıldı → kendi paneline geçer
 * Kayıtta girilen kod (auth metadata `connect_code`) ilk açılışta bir kez
 * otomatik kullanılır. DB: 20261017193000_clinic_self_signup_flow.sql
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Animated, Easing, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { CheckCircle, Clock, Shield, KeyRound, Building2 } from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  clinicSignupConnect, connectCodeErrorMessage, myLabMemberships,
} from '../../lab-connections/api';
import { connectCodeError, normalizeConnectCode } from '../components/ConnectCodeField';
import { AuthShell, AuthButton, AuthInput, AUTH, AUTH_FONT } from '../components/AuthShell';

type Phase = 'loading' | 'no_session' | 'need_code' | 'waiting';

const POLL_MS = 20_000;

function PulsingClock() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Clock size={16} color={AUTH.accentDeep} strokeWidth={2} />
    </Animated.View>
  );
}

export function ApprovalWaitingScreen() {
  const router = useRouter();
  const session = useAuthStore(s => s.session);
  const fetchProfile = useAuthStore(s => s.fetchProfile);
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const [phase, setPhase] = useState<Phase>('loading');
  const [labNames, setLabNames] = useState<string[]>([]);
  const [rejected, setRejected] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autoTried = useRef(false);
  const leaving = useRef(false);

  const uid = session?.user?.id ?? null;
  const metaCode: string | undefined = (session?.user?.user_metadata as any)?.connect_code;

  const refresh = useCallback(async (): Promise<void> => {
    if (!uid) { setPhase('no_session'); return; }
    if (leaving.current) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('user_type, approval_status, clinic_id')
      .eq('id', uid)
      .maybeSingle();

    // Hesap açıldı → store'u tazele, kendi paneline geç.
    if (prof?.approval_status === 'approved' && prof?.clinic_id) {
      leaving.current = true;
      await fetchProfile(uid);
      router.replace((prof.user_type === 'doctor' ? '/(doctor)' : '/(clinic)') as any);
      return;
    }

    const { data: rows } = await supabase
      .from('clinic_lab_memberships')
      .select('status')
      .eq('member_profile_id', uid);
    const statuses = (rows ?? []).map((r: any) => r.status as string);

    if (statuses.some(s => s === 'pending' || s === 'active')) {
      let names: string[] = [];
      try {
        names = (await myLabMemberships())
          .map(m => m.lab_name)
          .filter((n): n is string => !!n);
      } catch { /* ad gösterilemezse bekleme ekranı yine çalışır */ }
      setLabNames(names);
      setPhase('waiting');
      return;
    }

    setRejected(statuses.includes('rejected'));

    // Kayıtta girilen kod — yalnız hiç istek yoksa ve bir kez.
    if (!autoTried.current && statuses.length === 0 && typeof metaCode === 'string' && metaCode.trim()) {
      autoTried.current = true;
      try {
        await clinicSignupConnect(metaCode);
        return refresh();
      } catch (e) {
        setErr(connectCodeErrorMessage(e));
        setCode(normalizeConnectCode(metaCode));
      }
    }
    setPhase('need_code');
  }, [uid, metaCode, fetchProfile, router]);

  useEffect(() => { refresh(); }, [refresh]);

  // Lab'ın kararını yokla — yalnız bekleme durumunda.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const iv = setInterval(() => { refresh(); }, POLL_MS);
    return () => clearInterval(iv);
  }, [phase, refresh]);

  const connect = async () => {
    const c = normalizeConnectCode(code);
    const ve = connectCodeError(c);
    if (ve) { setErr(ve); return; }
    setBusy(true); setErr(null);
    try {
      await clinicSignupConnect(c);
      autoTried.current = true;
      await refresh();
    } catch (e) {
      setErr(connectCodeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try { await refresh(); } finally { setChecking(false); }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const textInk  = isDark ? (MT.ink as string)  : AUTH.ink;
  const textSoft = isDark ? (MT.ink2 as string) : AUTH.inkSoft;

  if (phase === 'loading') {
    return (
      <AuthShell eyebrow="Kayıt Tamamlandı" heading="Onay Bekleniyor">
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={textSoft} />
        </View>
      </AuthShell>
    );
  }

  if (phase === 'no_session') {
    return (
      <AuthShell
        eyebrow="Kayıt Tamamlandı"
        heading="Onay Bekleniyor"
        subtitle="Hesabının durumunu görmek için giriş yap."
      >
        <AuthButton label="Giriş Yap" onPress={() => router.replace('/(auth)/login')} />
      </AuthShell>
    );
  }

  if (phase === 'need_code') {
    return (
      <AuthShell
        eyebrow="Laboratuvara Bağlan"
        heading="Bağlantı Kodu"
        subtitle={rejected
          ? 'Bu laboratuvar isteğini reddetti. Başka bir laboratuvarın kodunu deneyebilirsin.'
          : 'Hesabının açılması için çalıştığın laboratuvarın verdiği bağlantı kodunu gir.'}
        footerLink={{ text: 'Farklı bir hesapla mı gireceksin?', linkText: 'Çıkış Yap', onPress: handleSignOut }}
      >
        <AuthInput
          value={code}
          onChangeText={(t) => { setCode(normalizeConnectCode(t)); setErr(null); }}
          placeholder="Lab bağlantı kodu"
          autoCapitalize="characters"
          returnKeyType="go"
          onSubmitEditing={connect}
          error={err ?? undefined}
          icon={<KeyRound size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
        />
        <AuthButton label={busy ? 'Bağlanıyor…' : 'Bağlan'} onPress={connect} disabled={busy || !code.trim()} />
      </AuthShell>
    );
  }

  // phase === 'waiting'
  return (
    <AuthShell
      eyebrow="Kayıt Tamamlandı"
      heading="Onay Bekleniyor"
      subtitle="Laboratuvar onayından sonra panele otomatik geçeceksin."
      footerLink={{ text: 'Farklı bir hesapla mı gireceksin?', linkText: 'Çıkış Yap', onPress: handleSignOut }}
    >
      <View style={{ gap: 12, marginBottom: 20 }}>
        <StepRow done title="Hesabın oluşturuldu" desc="Kayıt formundaki bilgiler kaydedildi." />
        <StepRow done title="E-posta doğrulandı" desc="Doğrulama kodu onaylandı." />
        <StepRow pulse title="Lab onayı" desc="Laboratuvar yöneticisi isteğini inceleyip onaylayacak.">
          {labNames.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {labNames.map(n => (
                <View key={n} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
                }}>
                  <Building2 size={11} color={textSoft} strokeWidth={1.8} />
                  <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, fontWeight: '600', color: textInk }} numberOfLines={1}>
                    {n}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </StepRow>
        <StepRow muted title="Panele geçiş" desc="Onaylanınca bu ekran seni otomatik olarak paneline alır." />
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 14, borderRadius: 12, marginBottom: 16,
        backgroundColor: isDark ? 'rgba(245,194,75,0.10)' : AUTH.accentSoft,
        borderWidth: 1, borderColor: isDark ? 'rgba(245,194,75,0.28)' : `${AUTH.accent}55`,
      }}>
        <Shield size={15} color={AUTH.accentDeep} strokeWidth={1.8} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13, fontWeight: '700', color: textInk }}>
            Güvenli bekleyiş
          </Text>
          <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: textSoft, marginTop: 2, lineHeight: 16 }}>
            Onay genelde 1 iş günü içinde tamamlanır. Onaylandığında bildirim alırsın.
          </Text>
        </View>
      </View>

      <AuthButton label={checking ? 'Kontrol ediliyor…' : 'Durumu yenile'} onPress={checkNow} disabled={checking} variant="outline" />
    </AuthShell>
  );
}

function StepRow({
  title, desc, done, pulse, muted, children,
}: { title: string; desc: string; done?: boolean; pulse?: boolean; muted?: boolean; children?: React.ReactNode }) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const line   = isDark ? 'rgba(255,255,255,0.10)' : AUTH.border;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      padding: 12, borderRadius: 10,
      backgroundColor: muted ? 'transparent' : cardBg,
      borderWidth: 1,
      borderColor: muted ? 'transparent' : (pulse ? AUTH.accent : line),
      opacity: muted ? 0.55 : 1,
    }}>
      <View style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: done ? 'rgba(22,163,74,0.12)' : pulse ? (isDark ? 'rgba(245,194,75,0.14)' : AUTH.accentSoft) : line,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {done
          ? <CheckCircle size={14} color={AUTH.success} strokeWidth={2.2} />
          : pulse
            ? <PulsingClock />
            : <Clock size={14} color={AUTH.inkMuted} strokeWidth={1.8} />
        }
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13, fontWeight: '700', color: isDark ? (MT.ink as string) : AUTH.ink }}>
          {title}
        </Text>
        <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: isDark ? (MT.ink2 as string) : AUTH.inkSoft, marginTop: 2, lineHeight: 16 }}>
          {desc}
        </Text>
        {children}
      </View>
    </View>
  );
}
