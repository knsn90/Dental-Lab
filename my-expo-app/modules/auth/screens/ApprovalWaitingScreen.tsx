/**
 * ApprovalWaitingScreen — Kayıt tamamlandı, lab onayı bekleniyor.
 * AuthShell ile beyaz tema, mor accent.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { CheckCircle, Clock, ArrowRight, Shield, Mail } from '../../../core/ui/icons';
import { AuthShell, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';

function PulsingClock() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
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
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(checkScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }).start();
  }, []);

  const handleGoToLogin = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  return (
    <AuthShell
      eyebrow="Kayıt Tamamlandı"
      heading="Success"
      subtitle="Hesabın oluşturuldu. Lab onayından sonra giriş yapabilirsin."
      illustrationCaption="Onay bekleniyor.&#10;Sana e-posta ile haber vereceğiz."
      footerLink={{
        text: 'Tekrar denemek mi istersin?',
        linkText: 'Çıkış Yap',
        onPress: handleGoToLogin,
      }}
    >
      {/* Success icon */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Animated.View style={{
          transform: [{ scale: checkScale }],
          width: 72, height: 72, borderRadius: 22,
          backgroundColor: 'rgba(22,163,74,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircle size={36} color={AUTH.success} strokeWidth={1.8} />
        </Animated.View>
      </View>

      {/* Steps */}
      <View style={{ gap: 12, marginBottom: 24 }}>
        <StepRow
          done
          title="Bilgilerin alındı"
          desc="Kayıt formundan gelen veriler kaydedildi."
        />
        <StepRow
          done
          title="Telefon doğrulandı"
          desc="SMS kodu başarıyla onaylandı."
        />
        <StepRow
          title="Lab onayı"
          desc="Laboratuvar yöneticisi hesabını inceleyip onaylayacak."
          pulse
        />
        <StepRow
          title="Giriş yapabilirsin"
          desc="Onay sonrası e-posta gelir, sonra giriş yapabilirsin."
          muted
        />
      </View>

      {/* Info card */}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        padding: 14, borderRadius: 12,
        backgroundColor: AUTH.accentSoft,
        borderWidth: 1, borderColor: `${AUTH.accent}55`,
        marginBottom: 16,
      }}>
        <Shield size={15} color={AUTH.accentDeep} strokeWidth={1.8} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13, fontWeight: '700', color: AUTH.ink }}>
            Güvenli bekleyiş
          </Text>
          <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: AUTH.inkSoft, marginTop: 2, lineHeight: 16 }}>
            Onay genelde 1 iş günü içinde tamamlanır. Sonucu e-posta ile sana bildiririz.
          </Text>
        </View>
      </View>

      <AuthButton label="Giriş Sayfasına Dön" onPress={handleGoToLogin} variant="outline" />
    </AuthShell>
  );
}

function StepRow({
  title, desc, done, pulse, muted,
}: { title: string; desc: string; done?: boolean; pulse?: boolean; muted?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      padding: 12, borderRadius: 10,
      backgroundColor: muted ? 'transparent' : '#FFFFFF',
      borderWidth: 1,
      borderColor: muted ? 'transparent' : (pulse ? AUTH.accent : AUTH.border),
      opacity: muted ? 0.55 : 1,
    }}>
      <View style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: done ? 'rgba(22,163,74,0.12)' : pulse ? AUTH.accentSoft : AUTH.border,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {done
          ? <CheckCircle size={14} color={AUTH.success} strokeWidth={2.2} />
          : pulse
            ? <PulsingClock />
            : <Clock size={14} color={AUTH.inkMuted} strokeWidth={1.8} />
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13, fontWeight: '700', color: AUTH.ink }}>
          {title}
        </Text>
        <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: AUTH.inkSoft, marginTop: 2, lineHeight: 16 }}>
          {desc}
        </Text>
      </View>
    </View>
  );
}
