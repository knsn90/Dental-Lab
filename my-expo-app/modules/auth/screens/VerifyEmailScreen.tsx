/**
 * VerifyEmailScreen — Email OTP doğrulama.
 * Supabase auth signUp ile otomatik gönderilen 6-haneli token'ı kullanır.
 * AuthShell ile beyaz tema.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { safeBack } from '../../../core/util/safeBack';
import {
  View, Text, Pressable, TextInput, Platform, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Mail, AlertCircle, RefreshCw, CheckCircle2 } from '../../../core/ui/icons';
import { AuthShell, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';
import { supabase } from '../../../core/api/supabase';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resendOtp = useCallback(async () => {
    if (!email) return;
    setSending(true); setErrorMsg(''); setSuccessMsg('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: String(email),
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg('Yeni kod gönderildi — e-postanı kontrol et.');
        setCooldown(RESEND_COOLDOWN);
      }
    } finally {
      setSending(false);
    }
  }, [email]);

  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const verifyOtp = async (code: string) => {
    if (!email) return;
    setLoading(true); setErrorMsg(''); setSuccessMsg('');
    const { error } = await supabase.auth.verifyOtp({
      email: String(email),
      token: code,
      type: 'signup',
    });
    setLoading(false);
    if (error) {
      setErrorMsg('Kod hatalı veya süresi dolmuş. Lütfen tekrar dene.');
      triggerShake();
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      return;
    }
    setSuccessMsg('E-posta doğrulandı. Yönlendiriliyorsun…');
    setTimeout(() => router.replace('/(auth)/approval-waiting' as any), 600);
  };

  const handleOtpChange = (index: number, value: string) => {
    // Paste support — 6-haneli kod tek inputa yapıştırılabilir
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      if (pasted.length === OTP_LENGTH) {
        setOtp(pasted.split(''));
        verifyOtp(pasted);
        return;
      }
    }
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setErrorMsg('');
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (digit && index === OTP_LENGTH - 1) {
      const code = newOtp.join('');
      if (code.length === OTP_LENGTH) verifyOtp(code);
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  const handleVerify = () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setErrorMsg('Lütfen 6 haneli kodu girin');
      triggerShake();
      return;
    }
    verifyOtp(code);
  };

  const maskedEmail = email ? (() => {
    const [user, domain] = String(email).split('@');
    if (!user || !domain) return String(email);
    const visible = user.slice(0, Math.min(2, user.length));
    return `${visible}${'*'.repeat(Math.max(0, user.length - 2))}@${domain}`;
  })() : '';

  return (
    <AuthShell
      eyebrow="Doğrulama"
      heading="E-posta Doğrula"
      subtitle={maskedEmail ? `${maskedEmail} adresine 6 haneli bir kod gönderdik.` : 'E-posta kutuna gönderilen kodu gir.'}
      illustrationCaption="Tek kullanımlık kod ile&#10;güvenli doğrulama."
      footerLink={{
        text: 'Yanlış e-posta mı?',
        linkText: 'Geri Dön',
        onPress: () => safeBack('/(auth)/login'),
      }}
    >
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
        {/* Mail icon */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 14,
            backgroundColor: AUTH.accentSoft,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={26} color={AUTH.accentDeep} strokeWidth={1.8} />
          </View>
        </View>

        {errorMsg ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'rgba(220,38,38,0.06)',
            borderRadius: 10, padding: 12, marginBottom: 14,
            borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)',
          }}>
            <AlertCircle size={14} color={AUTH.danger} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.danger, lineHeight: 18 }}>
              {errorMsg}
            </Text>
          </View>
        ) : null}

        {successMsg ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'rgba(16,185,129,0.08)',
            borderRadius: 10, padding: 12, marginBottom: 14,
            borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)',
          }}>
            <CheckCircle2 size={14} color="#059669" strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: '#065F46', lineHeight: 18 }}>
              {successMsg}
            </Text>
          </View>
        ) : null}

        {/* OTP boxes — 6 digits */}
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <TextInput
              key={i}
              ref={ref => { inputRefs.current[i] = ref; }}
              style={{
                width: 46, height: 60, borderRadius: 12,
                borderWidth: otp[i] ? 1.5 : 1,
                borderColor: otp[i] ? AUTH.ink : AUTH.border,
                backgroundColor: '#FFFFFF',
                textAlign: 'center', fontSize: 22, fontWeight: '700',
                color: AUTH.ink,
                fontFamily: AUTH_FONT.display,
                ...(Platform.OS === 'web' ? {
                  outlineStyle: 'none',
                  boxShadow: otp[i] ? `0 0 0 3px ${AUTH.accent}40` : '0 1px 2px rgba(0,0,0,0.03)',
                  transitionProperty: 'box-shadow, border-color' as any,
                  transitionDuration: '160ms' as any,
                } : {}),
              } as any}
              value={otp[i]}
              onChangeText={v => handleOtpChange(i, v)}
              onKeyPress={(e) => handleKeyPress(i, e.nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus={i === 0}
            />
          ))}
        </View>

        {/* Resend */}
        <Pressable
          onPress={cooldown > 0 ? undefined : resendOtp}
          disabled={cooldown > 0 || sending}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 8, marginBottom: 16,
            opacity: cooldown > 0 ? 0.5 : (hovered ? 0.7 : 1),
            ...(Platform.OS === 'web' && cooldown === 0 ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <RefreshCw size={13} color={AUTH.inkSoft} strokeWidth={1.8} />
          <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.inkSoft, fontWeight: '500' }}>
            {cooldown > 0 ? `Yeniden gönder (${cooldown}s)` : (sending ? 'Gönderiliyor…' : 'Yeniden gönder')}
          </Text>
        </Pressable>

        <AuthButton label="Doğrula" onPress={handleVerify} loading={loading} />

        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 11, color: AUTH.inkMuted,
          textAlign: 'center', marginTop: 16,
        }}>
          Spam klasörünü kontrol etmeyi unutma.
        </Text>
      </Animated.View>
    </AuthShell>
  );
}
