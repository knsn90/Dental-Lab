/**
 * VerifyPhoneScreen — SMS OTP doğrulama.
 * AuthShell ile beyaz tema, mor accent.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { safeBack } from '../../../core/util/safeBack';
import {
  View, Text, Pressable, TextInput, Platform, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Smartphone, AlertCircle, RefreshCw } from '../../../core/ui/icons';
import { AuthShell, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';

const OTP_LENGTH = 4;
const RESEND_COOLDOWN = 60;
const TEST_OTP = '1234';

export function VerifyPhoneScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [smsSent, setSmsSent] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendOtp = useCallback(async () => {
    if (!phone) return;
    setSending(true); setErrorMsg('');
    // Test mode
    setSmsSent(true);
    setCooldown(RESEND_COOLDOWN);
    setSending(false);
  }, [phone]);

  useEffect(() => { if (phone && !smsSent) sendOtp(); }, [phone]);

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

  const handleOtpChange = (index: number, value: string) => {
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

  const verifyOtp = async (code: string) => {
    setLoading(true); setErrorMsg('');
    if (code === TEST_OTP) {
      router.replace('/(auth)/approval-waiting' as any);
    } else {
      setErrorMsg('Doğrulama kodu hatalı. Test kodu: 1234');
      triggerShake();
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
    setLoading(false);
  };

  const handleVerify = () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setErrorMsg('Lütfen 4 haneli kodu girin');
      triggerShake();
      return;
    }
    verifyOtp(code);
  };

  const maskedPhone = phone ? phone.replace(/(\d{4})(\d+)(\d{2})/, '$1****$3') : '';

  return (
    <AuthShell
      eyebrow="Doğrulama"
      heading="Verify"
      subtitle={maskedPhone ? `${maskedPhone} numarasına 4 haneli bir kod gönderdik.` : 'Telefonuna gönderilen kodu gir.'}
      illustrationCaption="Tek kullanımlık kod ile&#10;güvenli doğrulama."
      footerLink={{
        text: 'Yanlış telefon mu?',
        linkText: 'Geri Dön',
        onPress: () => safeBack('/(auth)/login'),
      }}
    >
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
        {/* Phone icon */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 14,
            backgroundColor: AUTH.accentSoft,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Smartphone size={26} color={AUTH.accentDeep} strokeWidth={1.8} />
          </View>
        </View>

        {errorMsg ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'rgba(220,38,38,0.06)',
            borderRadius: 10, padding: 12, marginBottom: 14,
            borderStartWidth: 3, borderStartColor: AUTH.danger,
          }}>
            <AlertCircle size={14} color={AUTH.danger} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.danger, lineHeight: 18 }}>
              {errorMsg}
            </Text>
          </View>
        ) : null}

        {/* OTP boxes */}
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <TextInput
              key={i}
              ref={ref => { inputRefs.current[i] = ref; }}
              style={{
                width: 56, height: 64, borderRadius: 12,
                borderWidth: otp[i] ? 1.5 : 1,
                borderColor: otp[i] ? AUTH.ink : AUTH.border,
                backgroundColor: '#FFFFFF',
                textAlign: 'center', fontSize: 24, fontWeight: '700',
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
              maxLength={1}
              autoFocus={i === 0}
            />
          ))}
        </View>

        {/* Resend */}
        <Pressable
          onPress={cooldown > 0 ? undefined : sendOtp}
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
            {cooldown > 0 ? `Yeniden gönder (${cooldown}s)` : 'Yeniden gönder'}
          </Text>
        </Pressable>

        <AuthButton label="Doğrula" onPress={handleVerify} loading={loading} />

        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 11, color: AUTH.inkMuted,
          textAlign: 'center', marginTop: 16, fontStyle: 'italic',
        }}>
          Test modunda — sabit kod: 1234
        </Text>
      </Animated.View>
    </AuthShell>
  );
}
