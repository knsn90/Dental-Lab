/**
 * VerifyPhoneScreen — SMS OTP doğrulama
 *
 * Kayıt sonrası telefon doğrulama adımı.
 * V3 Editorial layout — yeşil (clinic) tema
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, Platform,
  KeyboardAvoidingView, ActivityIndicator, Animated, Easing,
  useWindowDimensions, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import {
  Smartphone, ArrowRight, AlertCircle, RefreshCw, Shield,
} from 'lucide-react-native';

// ── Design tokens — clinic green ──
const INK = DS.ink[900];
const GREEN = DS.clinic.primary;
const GREEN_DEEP = DS.clinic.accent;
const KREM = '#F5F2EA';
const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

const isDesktopWidth = (w: number) => w >= 900;

const OTP_LENGTH = 4;
const RESEND_COOLDOWN = 60; // seconds
const TEST_OTP = '1234'; // TODO: Production'da kaldır

// ── Pulsing dot ──
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity, marginRight: 8 }} />;
}

export function VerifyPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWidth(width);
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [smsSent, setSmsSent] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const shakeX = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(isDesktop ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;

  // Card slide-up animation (mobile)
  useEffect(() => {
    if (!isDesktop) {
      Animated.parallel([
        Animated.spring(cardSlide, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Auto-send OTP on mount
  useEffect(() => {
    if (phone && !smsSent) sendOtp();
  }, [phone]);

  const sendOtp = useCallback(async () => {
    if (!phone) return;
    setSending(true);
    setErrorMsg('');

    // TODO: Production'da Edge Function'a geç
    // try {
    //   const { data, error } = await supabase.functions.invoke('send-otp', {
    //     body: { phone },
    //   });
    //   if (error) setErrorMsg(error.message || 'SMS gönderilemedi');
    //   else if (data?.error) setErrorMsg(data.error);
    //   else { setSmsSent(true); setCooldown(RESEND_COOLDOWN); }
    // } catch (err: any) {
    //   setErrorMsg(err.message || 'SMS gönderilemedi');
    // }

    // Test mode: SMS gönderme, sadece kodu kabul et
    setSmsSent(true);
    setCooldown(RESEND_COOLDOWN);
    setSending(false);
  }, [phone]);

  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 7, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -7, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setErrorMsg('');

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === OTP_LENGTH - 1) {
      const code = newOtp.join('');
      if (code.length === OTP_LENGTH) {
        verifyOtp(code);
      }
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
    setLoading(true);
    setErrorMsg('');

    // TODO: Production'da Edge Function'a geç
    // Test mode: sabit kod ile doğrula
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
      setErrorMsg('Lütfen 6 haneli kodu girin');
      triggerShake();
      return;
    }
    verifyOtp(code);
  };

  const maskedPhone = phone
    ? phone.replace(/(\d{4})(\d+)(\d{2})/, '$1****$3')
    : '';

  // ── Form card ──
  const formCard = (
    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
      {/* Header */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{
          width: 64, height: 64, borderRadius: 20,
          backgroundColor: `${GREEN}18`, alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <Smartphone size={28} color={GREEN} strokeWidth={1.8} />
        </View>

        <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.03 * 26, color: INK, marginBottom: 8, textAlign: 'center' }}>
          Telefon doğrulama
        </Text>
        <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, textAlign: 'center', maxWidth: 280 }}>
          <Text style={{ fontWeight: '600', color: DS.ink[700] }}>{maskedPhone}</Text>
          {' '}numarasına gönderilen 6 haneli kodu girin.
        </Text>
      </View>

      {/* Error */}
      {errorMsg ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
          borderWidth: 1, borderColor: 'rgba(217,75,75,0.15)',
        }}>
          <AlertCircle size={15} color={DS.clinic.danger} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 13, color: DS.clinic.danger, lineHeight: 18 }}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* OTP inputs */}
      <View style={{
        flexDirection: 'row', justifyContent: 'center', gap: 10,
        marginBottom: 28,
      }}>
        {otp.map((digit, i) => (
          <TextInput
            key={i}
            ref={ref => { inputRefs.current[i] = ref; }}
            value={digit}
            onChangeText={v => handleOtpChange(i, v)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={i === 0}
            selectTextOnFocus
            style={{
              width: 48, height: 56, borderRadius: 12,
              backgroundColor: '#FFFFFF',
              borderWidth: digit ? 1.5 : 1,
              borderColor: digit ? GREEN : 'rgba(0,0,0,0.08)',
              textAlign: 'center',
              fontSize: 22, fontWeight: '600', color: INK,
              fontFamily: DS.font.display as string,
              // @ts-ignore
              outlineStyle: 'none',
            }}
          />
        ))}
      </View>

      {/* Verify button */}
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <Pressable
          onPress={handleVerify}
          onPressIn={() => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start()}
          disabled={loading}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 14, paddingVertical: 15,
            backgroundColor: GREEN_DEEP, opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Doğrula</Text>
              <ArrowRight size={14} color="#FFF" strokeWidth={2} />
            </>
          )}
        </Pressable>
      </Animated.View>

      {/* Resend */}
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        {cooldown > 0 ? (
          <Text style={{ fontSize: 12, color: DS.ink[400] }}>
            Yeni kod göndermek için {cooldown} saniye bekleyin
          </Text>
        ) : (
          <Pressable
            onPress={sendOtp}
            disabled={sending}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
          >
            {sending ? (
              <ActivityIndicator size={12} color={GREEN} />
            ) : (
              <RefreshCw size={13} color={GREEN} strokeWidth={2} />
            )}
            <Text style={{ fontSize: 13, color: GREEN, fontWeight: '500' }}>
              Tekrar gönder
            </Text>
          </Pressable>
        )}
      </View>

      {/* Trust footer */}
      <View style={{
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 18,
        marginTop: 32,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Shield size={12} color={DS.ink[400]} strokeWidth={2} />
        <Text style={{ fontSize: 10, color: DS.ink[400] }}>
          Bilgileriniz güvenle korunmaktadır
        </Text>
      </View>
    </Animated.View>
  );

  // ════════ DESKTOP ════════
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: GREEN_DEEP }}>
        {/* Left — dark green editorial panel */}
        <View style={{ flex: 1, padding: 48, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -60, top: 80, opacity: 0.06 }} pointerEvents="none">
            <Image source={require('../../../assets/images/icon.png')}
              style={{ width: 380, height: 380, tintColor: '#FFFFFF' }} resizeMode="contain" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={require('../../../assets/images/icon.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', letterSpacing: -0.02 * 14 }}>Dental Lab</Text>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <PulseDot color={GREEN} />
              <Text style={{ fontSize: 11, color: GREEN, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '600' }}>
                Telefon doğrulama
              </Text>
            </View>
            <Text style={{
              ...DISPLAY, fontSize: 72, letterSpacing: -0.045 * 72, lineHeight: 72 * 0.92,
              color: '#FFFFFF', marginBottom: 24,
            }}>
              Güvenli{'\n'}
              <Text style={{ color: GREEN }}>doğrulama</Text>{'\n'}
              adımı.
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 420, lineHeight: 21 }}>
              Telefonunuza gönderilen kodu girerek kaydınızı tamamlayın.
            </Text>
          </View>

          <View />
        </View>

        {/* Right — krem form */}
        <View style={{
          width: 440, backgroundColor: KREM,
          borderRadius: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0,
          padding: 40, marginTop: 24, marginBottom: 24, marginLeft: 24,
          justifyContent: 'center',
        }}>
          {formCard}
        </View>
      </View>
    );
  }

  // ════════ MOBILE ════════
  return (
    <View style={{ flex: 1, backgroundColor: GREEN_DEEP }}>
      <View style={{
        paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center',
      }}>
        <View style={{
          width: 52, height: 52, borderRadius: 16, backgroundColor: GREEN,
          alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        }}>
          <Smartphone size={24} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF', letterSpacing: 1.5, marginBottom: 4 }}>
          DOĞRULAMA
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>SMS kodu girin</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Animated.View style={{
          flex: 1, backgroundColor: KREM,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 24, paddingTop: 28, paddingBottom: insets.bottom + 24,
          transform: [{ translateY: cardSlide }], opacity: cardOpacity,
          justifyContent: 'center',
        }}>
          {formCard}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
