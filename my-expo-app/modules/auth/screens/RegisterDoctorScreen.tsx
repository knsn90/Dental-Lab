/**
 * RegisterDoctorScreen — Muayenehane (tek hekim) kayıt formu
 *
 * V3 Editorial layout (LoginScreen uyumlu) — yeşil (clinic) tema
 * Desktop: dark green left panel + krem right form card
 * Mobile: dark green header + krem form card sliding up
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Platform,
  KeyboardAvoidingView, ActivityIndicator, Animated, Easing,
  useWindowDimensions, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signUpDoctor } from '../api';
import { DS } from '../../../core/theme/dsTokens';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Check,
  AlertCircle, ChevronLeft, Stethoscope, User, Building2, Phone,
} from 'lucide-react-native';
import { AddressFields, AddressData, buildAddressString } from '../components/AddressFields';

// ── Design tokens — clinic green ──
const INK   = DS.ink[900];
const GREEN = DS.clinic.primary;     // #6BA888 sage
const GREEN_DEEP = DS.clinic.accent; // #0F2A1F dark forest
const KREM  = '#F5F2EA';
const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

const isDesktopWidth = (w: number) => w >= 900;

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

// ── InputField — LoginScreen ile aynı stil ──
function InputField({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize,
  returnKeyType, onSubmitEditing, error, rightElement, icon, multiline,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences'; returnKeyType?: 'next' | 'go' | 'done';
  onSubmitEditing?: () => void; error?: string; rightElement?: React.ReactNode;
  icon?: React.ReactNode; multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 13,
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: focused ? 1.5 : 1,
        borderColor: error ? DS.clinic.danger : focused ? GREEN : 'rgba(0,0,0,0.08)',
        ...(multiline ? { minHeight: 80 } : {}),
      }}>
        {icon && <View style={multiline ? { paddingTop: 2 } : undefined}>{icon}</View>}
        <TextInput
          style={{
            flex: 1, fontSize: 13, color: INK,
            fontFamily: secureTextEntry ? 'monospace' : (DS.font.display as string),
            letterSpacing: secureTextEntry ? 2 : 0,
            ...(multiline ? { textAlignVertical: 'top' as const, minHeight: 52 } : {}),
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
          multiline={multiline}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightElement}
      </View>
      {error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 4 }}>
          <AlertCircle size={11} color={DS.clinic.danger} strokeWidth={2} />
          <Text style={{ fontSize: 11, color: DS.clinic.danger }}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ── Section divider ──
function SectionDivider({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingTop: 10, paddingBottom: 8,
    }}>
      <View style={{
        width: 24, height: 24, borderRadius: 7,
        backgroundColor: `${GREEN}25`, alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </View>
      <Text style={{ fontSize: 11, color: DS.ink[400], fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginLeft: 8 }} />
    </View>
  );
}

// ── Main ──
export function RegisterDoctorScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWidth(width);

  const [form, setForm] = useState({
    full_name: '',
    clinic_name: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [address, setAddress] = useState<AddressData>({ il: '', ilce: '', mahalle: '', sokak: '' });
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressData, string>>>({});
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Partial<typeof form>>({});
  const [errorMsg, setErrorMsg]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showPassC, setShowPassC] = useState(false);

  // Animations
  const shakeX      = useRef(new Animated.Value(0)).current;
  const btnScale    = useRef(new Animated.Value(1)).current;
  const cardSlide   = useRef(new Animated.Value(isDesktop ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;

  useEffect(() => {
    if (!isDesktop) {
      Animated.parallel([
        Animated.spring(cardSlide,   { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setErrorMsg('');
  };

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
    const e: Partial<typeof form> = {};
    const ae: Partial<Record<keyof AddressData, string>> = {};
    if (!form.full_name.trim()) e.full_name = 'Ad soyad zorunludur';
    if (!form.phone.trim()) e.phone = 'Telefon zorunludur';
    if (!form.clinic_name.trim()) e.clinic_name = 'Klinik adı zorunludur';
    if (!address.il) ae.il = 'İl seçiniz';
    if (!address.ilce) ae.ilce = 'İlçe seçiniz';
    if (!address.mahalle.trim()) ae.mahalle = 'Mahalle zorunludur';
    if (!form.email.trim()) e.email = 'E-posta zorunludur';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Geçerli bir e-posta girin';
    if (form.password.length < 8) e.password = 'Şifre en az 8 karakter olmalı';
    if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Şifreler eşleşmiyor';
    setErrors(e);
    setAddressErrors(ae);
    const hasErrors = Object.keys(e).length > 0 || Object.keys(ae).length > 0;
    if (hasErrors) triggerShake();
    return !hasErrors;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await signUpDoctor({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      clinic_name: form.clinic_name.trim(),
      phone: form.phone.trim(),
      address: buildAddressString(address),
    });

    setLoading(false);

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setErrorMsg('Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin.');
      } else if (error.message.includes('Password')) {
        setErrorMsg('Şifre en az 8 karakter olmalı.');
      } else {
        setErrorMsg(error.message);
      }
      triggerShake();
      return;
    }

    // Kayıt başarılı — telefon doğrulamaya yönlendir (oturum açık kalır)
    router.replace({
      pathname: '/(auth)/verify-phone',
      params: { phone: form.phone.trim() },
    } as any);
  };

  // ── Form card ──
  const formCard = (
    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
      {/* Back */}
      <Pressable
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 20, paddingVertical: 4 }}
      >
        <ChevronLeft size={16} color={DS.ink[500]} strokeWidth={2} />
        <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Kayıt türü</Text>
      </Pressable>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: `${GREEN}25`, alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={14} color={GREEN} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 11, color: GREEN, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>
          Muayenehane · Tek Hekim
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.03 * 28, color: INK, marginBottom: 6 }}>
        Hekim kaydı
      </Text>
      <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, marginBottom: 24 }}>
        Bilgilerinizi girin. Kayıt sonrası yönetici onayı gerekir.
      </Text>

      {/* Error / Success */}
      {errorMsg ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18,
          borderWidth: 1, borderColor: 'rgba(217,75,75,0.15)',
        }}>
          <AlertCircle size={15} color={DS.clinic.danger} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 13, color: DS.clinic.danger, lineHeight: 18 }}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* ── Kişisel Bilgiler ── */}
      <SectionDivider icon={<User size={12} color={GREEN} strokeWidth={2} />} label="Kişisel Bilgiler" />

      <InputField label="Ad Soyad *" value={form.full_name} onChangeText={set('full_name')}
        placeholder="Dr. Ahmet Yılmaz" error={errors.full_name}
        icon={<User size={14} color={DS.ink[400]} strokeWidth={1.8} />} />

      <InputField label="Telefon *" value={form.phone} onChangeText={set('phone')}
        placeholder="0532 000 00 00" keyboardType="phone-pad" error={errors.phone}
        icon={<Phone size={14} color={DS.ink[400]} strokeWidth={1.8} />} />

      {/* ── Klinik Bilgisi ── */}
      <SectionDivider icon={<Building2 size={12} color={GREEN} strokeWidth={2} />} label="Klinik Bilgisi" />

      <InputField label="Muayenehane Adı *" value={form.clinic_name} onChangeText={set('clinic_name')}
        placeholder="Yılmaz Diş Kliniği" error={errors.clinic_name}
        icon={<Building2 size={14} color={DS.ink[400]} strokeWidth={1.8} />} />

      <AddressFields
        value={address}
        onChange={(v) => { setAddress(v); setAddressErrors({}); }}
        errors={addressErrors}
      />

      {/* ── Hesap Bilgileri ── */}
      <SectionDivider icon={<Lock size={12} color={GREEN} strokeWidth={2} />} label="Hesap Bilgileri" />

      <InputField label="E-posta *" value={form.email} onChangeText={set('email')}
        placeholder="ornek@email.com" keyboardType="email-address" autoCapitalize="none" error={errors.email}
        icon={<Mail size={14} color={DS.ink[400]} strokeWidth={1.8} />} />

      <InputField label="Şifre *" value={form.password} onChangeText={set('password')}
        placeholder="En az 8 karakter" secureTextEntry={!showPass} error={errors.password}
        icon={<Lock size={14} color={DS.ink[400]} strokeWidth={1.8} />}
        rightElement={
          <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8}>
            {showPass ? <EyeOff size={14} color={DS.ink[400]} strokeWidth={1.8} /> : <Eye size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          </Pressable>
        } />

      <InputField label="Şifre Tekrar *" value={form.passwordConfirm} onChangeText={set('passwordConfirm')}
        placeholder="Şifrenizi tekrar girin" secureTextEntry={!showPassC} error={errors.passwordConfirm}
        icon={<Lock size={14} color={DS.ink[400]} strokeWidth={1.8} />}
        rightElement={
          <Pressable onPress={() => setShowPassC(!showPassC)} hitSlop={8}>
            {showPassC ? <EyeOff size={14} color={DS.ink[400]} strokeWidth={1.8} /> : <Eye size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          </Pressable>
        } />

      {/* CTA */}
      <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 10 }}>
        <Pressable
          onPress={handleRegister}
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
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Kayıt Ol</Text>
              <ArrowRight size={14} color="#FFF" strokeWidth={2} />
            </>
          )}
        </Pressable>
      </Animated.View>

      {/* Login link */}
      <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center', marginTop: 18 }}>
        Zaten hesabınız var mı?{' '}
        <Text onPress={() => router.replace('/(auth)/login')}
          style={{ color: INK, fontWeight: '500', textDecorationLine: 'underline' }}>
          Giriş yapın
        </Text>
      </Text>

      <View style={{ height: 24 }} />

      {/* Footer trust */}
      <View style={{
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 18,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        <Check size={11} color={DS.ink[400]} strokeWidth={2} />
        <Text style={{ fontSize: 10, color: DS.ink[400] }}>SOC 2 · KVKK · ISO 27001</Text>
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
                Muayenehane kaydı
              </Text>
            </View>
            <Text style={{
              ...DISPLAY, fontSize: 72, letterSpacing: -0.045 * 72, lineHeight: 72 * 0.92,
              color: '#FFFFFF', marginBottom: 24,
            }}>
              Tek hekim,{'\n'}
              <Text style={{ color: GREEN }}>güçlü</Text>{'\n'}
              bağlantı.
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 420, lineHeight: 21 }}>
              Muayenehanenizi kaydedin, laboratuvarla doğrudan çalışmaya başlayın.
            </Text>
          </View>

          <View />
        </View>

        {/* Right — krem form */}
        <View style={{ width: 440, backgroundColor: KREM, borderRadius: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0, padding: 40, marginTop: 24, marginBottom: 24, marginLeft: 24 }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            {formCard}
          </ScrollView>
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
          <User size={24} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF', letterSpacing: 1.5, marginBottom: 4 }}>
          MUAYENEHANE
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Tek hekim kaydı</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Animated.View style={{
          flex: 1, backgroundColor: KREM,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 24, paddingTop: 28, paddingBottom: insets.bottom + 24,
          transform: [{ translateY: cardSlide }], opacity: cardOpacity,
        }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1 }}>
            {formCard}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
