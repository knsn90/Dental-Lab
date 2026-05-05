/**
 * LoginScreen — V3 Editorial redesign
 *
 * Desktop: dark left brand panel (editorial typography) + krem right form card
 * Mobile: dark header → krem form card sliding up
 *
 * Patterns design language: DS tokens, Inter Tight, saffron accent.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Platform,
  KeyboardAvoidingView, ActivityIndicator, Animated, Easing,
  useWindowDimensions, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signIn } from '../api';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Shield, Check,
  AlertCircle, ChevronRight, Stethoscope,
} from 'lucide-react-native';

// ── Design tokens ──
const INK  = DS.ink[900];
const P    = DS.lab.primary;      // #F5C24B saffron
const KREM = '#F5F2EA';
const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

const isDesktopWidth = (w: number) => w >= 900;

// ── Animated pulsing dot for "Lab kimlik sistemi" ──
function PulseDotInline({ color }: { color: string }) {
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
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity, marginRight: 8,
    }} />
  );
}

// ── FloatingInput — patterns style ──
function InputField({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize,
  returnKeyType, onSubmitEditing, error, rightElement, icon,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences'; returnKeyType?: 'next' | 'go' | 'done';
  onSubmitEditing?: () => void; error?: string; rightElement?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 13,
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: focused ? 1.5 : 1,
        borderColor: error ? DS.lab.danger : focused ? INK : 'rgba(0,0,0,0.08)',
      }}>
        {icon}
        <TextInput
          style={{
            flex: 1, fontSize: 13, color: INK,
            fontFamily: secureTextEntry ? 'monospace' : (DS.font.display as string),
            letterSpacing: secureTextEntry ? 2 : 0,
            // @ts-ignore
            outlineStyle: 'none',
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={DS.ink[400]}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightElement}
      </View>
      {error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 4 }}>
          <AlertCircle size={11} color={DS.lab.danger} strokeWidth={2} />
          <Text style={{ fontSize: 11, color: DS.lab.danger }}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ── Main LoginScreen ──
export function LoginScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWidth(width);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string }>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent,    setForgotSent]    = useState(false);
  const [forgotError,   setForgotError]   = useState('');

  // Animations
  const shakeX     = useRef(new Animated.Value(0)).current;
  const btnScale   = useRef(new Animated.Value(1)).current;
  const cardSlide  = useRef(new Animated.Value(isDesktop ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;

  useEffect(() => {
    if (!isDesktop) {
      Animated.parallel([
        Animated.spring(cardSlide,   { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 7,   duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -7,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim())                      e.email = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(email))  e.email = 'Geçerli bir e-posta girin';
    if (!password)                          e.password = 'Şifre gerekli';
    setErrors(e);
    if (Object.keys(e).length) triggerShake();
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await signIn(email.trim().toLowerCase(), password);
    if (error) {
      setErrorMsg('E-posta veya şifre hatalı.');
      triggerShake();
      setLoading(false);
      return;
    }
    if (data?.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_type, approval_status, is_active')
        .eq('id', data.user.id)
        .single();
      if (prof?.user_type === 'doctor' && prof?.approval_status === 'pending') {
        await supabase.auth.signOut();
        setErrorMsg('Hesabınız henüz onaylanmadı. Laboratuvar onayından sonra giriş yapabilirsiniz.');
        triggerShake(); setLoading(false); return;
      }
      if (prof?.user_type === 'doctor' && prof?.approval_status === 'rejected') {
        await supabase.auth.signOut();
        setErrorMsg('Hesabınız reddedildi. Detay için laborant ile iletişime geçin.');
        triggerShake(); setLoading(false); return;
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setForgotError('Geçerli bir e-posta girin'); return;
    }
    setForgotLoading(true); setForgotError('');
    const { error } = await supabase.auth.resetPasswordForEmail(
      forgotEmail.trim().toLowerCase(),
      { redirectTo: 'https://lab.esenkim.com/reset-password' },
    );
    setForgotLoading(false);
    if (error) { setForgotError('E-posta gönderilemedi. Tekrar deneyin.'); return; }
    setForgotSent(true);
  };

  const openForgot = () => {
    setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError('');
  };

  // ── Form card (shared between desktop & mobile) ──
  const formCard = (
    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
      {/* Header */}
      <Text style={{ fontSize: 11, color: DS.ink[400], letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>
        Giriş
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.03 * 28, color: INK, marginBottom: 28 }}>
        Hesabına gir
      </Text>

      {/* Error banner */}
      {errorMsg ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
          borderWidth: 1, borderColor: 'rgba(217,75,75,0.15)',
        }}>
          <AlertCircle size={15} color={DS.lab.danger} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 13, color: DS.lab.danger, lineHeight: 18 }}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* E-posta */}
      <InputField
        label="E-posta"
        value={email}
        onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: undefined })); setErrorMsg(''); }}
        placeholder="ornek@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        error={errors.email}
        icon={<Mail size={14} color={DS.ink[400]} strokeWidth={1.8} />}
      />

      {/* Şifre */}
      <View style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>Şifre</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={openForgot}>
            <Text style={{ fontSize: 11, color: INK, fontWeight: '500', textDecorationLine: 'underline' }}>Unuttum</Text>
          </Pressable>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 13,
          backgroundColor: '#FFFFFF', borderRadius: 12,
          borderWidth: 1, borderColor: errors.password ? DS.lab.danger : 'rgba(0,0,0,0.08)',
        }}>
          <Lock size={14} color={DS.ink[400]} strokeWidth={1.8} />
          <TextInput
            style={{
              flex: 1, fontSize: 13, color: INK,
              fontFamily: 'monospace', letterSpacing: 2,
              // @ts-ignore
              outlineStyle: 'none',
            }}
            value={password}
            onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: undefined })); setErrorMsg(''); }}
            secureTextEntry={!showPass}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8}>
            {showPass
              ? <EyeOff size={14} color={DS.ink[400]} strokeWidth={1.8} />
              : <Eye size={14} color={DS.ink[400]} strokeWidth={1.8} />
            }
          </Pressable>
        </View>
        {errors.password && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 4 }}>
            <AlertCircle size={11} color={DS.lab.danger} strokeWidth={2} />
            <Text style={{ fontSize: 11, color: DS.lab.danger }}>{errors.password}</Text>
          </View>
        )}
      </View>

      {/* Forgot panel */}
      {forgotMode && (
        <View style={{
          backgroundColor: 'rgba(245,194,75,0.08)', borderRadius: 12,
          padding: 18, marginTop: 14,
        }}>
          {forgotSent ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 8,
                backgroundColor: 'rgba(45,154,107,0.12)', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={16} color={DS.lab.success} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.lab.success }}>E-posta gönderildi</Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>Gelen kutunuzu kontrol edin.</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 4 }}>Şifre Sıfırla</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 12 }}>
                Sıfırlama bağlantısı e-postanıza gönderilecek.
              </Text>
              <InputField
                label="E-posta adresiniz"
                value={forgotEmail}
                onChangeText={v => { setForgotEmail(v); setForgotError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={forgotError}
                icon={<Mail size={14} color={DS.ink[400]} strokeWidth={1.8} />}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setForgotMode(false)}
                  style={{
                    flex: 1, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)',
                    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
                </Pressable>
                <Pressable
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                  style={{
                    flex: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                    backgroundColor: INK, opacity: forgotLoading ? 0.65 : 1,
                  }}
                >
                  {forgotLoading
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Gönder</Text>
                  }
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}

      {/* 2FA hint card */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12, marginTop: 18,
        backgroundColor: `${P}2E`, borderRadius: 12,
      }}>
        <View style={{
          width: 24, height: 24, borderRadius: 7, backgroundColor: INK,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={11} color={P} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 11, color: DS.ink[700], flex: 1 }}>
          Bu cihaz tanımlı. <Text style={{ fontWeight: '600' }}>2FA atlanır.</Text>
        </Text>
      </View>

      {/* CTA button */}
      <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 18 }}>
        <Pressable
          onPress={handleLogin}
          onPressIn={() => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start()}
          disabled={loading}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 14, paddingVertical: 15,
            backgroundColor: INK, opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Giriş yap</Text>
              <ArrowRight size={14} color="#FFF" strokeWidth={2} />
            </>
          )}
        </Pressable>
      </Animated.View>

      {/* Register link */}
      <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center', marginTop: 18 }}>
        Yeni misin?{' '}
        <Text
          onPress={() => router.push('/(auth)/register-choice')}
          style={{ color: INK, fontWeight: '500', textDecorationLine: 'underline' }}
        >
          Hekim olarak kayıt ol
        </Text>
      </Text>

      {/* Spacer */}
      <View style={{ height: 24 }} />

      {/* Footer trust */}
      <View style={{
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 18,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        <Check size={11} color={DS.ink[400]} strokeWidth={2} />
        <Text style={{ fontSize: 10, color: DS.ink[400] }}>SOC 2 · KVKK · ISO 27001</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/(auth)/admin-login')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 10, color: DS.ink[400] }}>Yönetici girişi</Text>
            <ChevronRight size={10} color={DS.ink[400]} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );

  // ════════ DESKTOP — V3 editorial split ════════
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: INK }}>
        {/* Left — dark editorial brand panel */}
        <View style={{ flex: 1, padding: 48, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          {/* Decorative tooth silhouette */}
          <View style={{ position: 'absolute', right: -60, top: 80, opacity: 0.05 }} pointerEvents="none">
            <Image
              source={require('../../../assets/images/icon.png')}
              style={{ width: 380, height: 380, tintColor: '#FFFFFF' }}
              resizeMode="contain"
            />
          </View>

          {/* Top — logo + version */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 11, backgroundColor: P,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Image
                source={require('../../../assets/images/icon.png')}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', letterSpacing: -0.02 * 14 }}>
              Dental Lab
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>v2.4.1</Text>
          </View>

          {/* Middle — big editorial typography */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <PulseDotInline color={P} />
              <Text style={{ fontSize: 11, color: P, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '600' }}>
                Lab kimlik sistemi
              </Text>
            </View>
            <Text style={{
              ...DISPLAY, fontSize: 82, letterSpacing: -0.045 * 82, lineHeight: 82 * 0.92,
              color: '#FFFFFF', marginBottom: 24,
            }}>
              Üretimi{'\n'}
              <Text style={{ color: P }}>yönetir</Text>,{'\n'}
              kârını{'\n'}
              gösterir.
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 460, lineHeight: 21 }}>
              Üretim, kalite kontrol, sevkiyat ve fatura — tek panelde, gerçek zamanlı.
            </Text>

            {/* Client logos */}
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center', marginTop: 32, opacity: 0.4 }}>
              {['Aydın·', 'NorthDent', '· Lumineer', '· Beyaz Diş', '· Kuzey Lab'].map((n, i) => (
                <Text key={i} style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>{n}</Text>
              ))}
            </View>
          </View>

          {/* Bottom spacer — already handled by justify: space-between */}
          <View />
        </View>

        {/* Right — krem form card */}
        <View style={{
          width: 420, backgroundColor: KREM,
          borderRadius: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0,
          padding: 40, marginTop: 24, marginBottom: 24, marginLeft: 24,
          justifyContent: 'center',
        }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            {formCard}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ════════ MOBILE — dark header + krem form ════════
  return (
    <View style={{ flex: 1, backgroundColor: INK }}>
      {/* Dark header zone */}
      <View style={{
        paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: 32,
        alignItems: 'center',
      }}>
        <View style={{
          width: 56, height: 56, borderRadius: 18, backgroundColor: P,
          alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <Image
            source={require('../../../assets/images/icon.png')}
            style={{ width: 34, height: 34 }}
            resizeMode="contain"
          />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFF', letterSpacing: 2, marginBottom: 6 }}>
          DENTAL LAB
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Lab kimlik sistemi</Text>
      </View>

      {/* Krem form card sliding up */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Animated.View style={{
          flex: 1, backgroundColor: KREM,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 24, paddingTop: 32,
          paddingBottom: insets.bottom + 24,
          transform: [{ translateY: cardSlide }],
          opacity: cardOpacity,
        }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {formCard}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
