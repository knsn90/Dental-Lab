/**
 * RegisterDoctorScreen — Hekim (muayenehane) kayıt formu.
 * AuthShell ile beyaz tema, mor accent.
 */
import React, { useState, useRef } from 'react';
import { safeBack } from '../../../core/util/safeBack';
import { View, Text, Pressable, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Lock, Eye, EyeOff, User as UserIcon, Phone, Building2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { signUpDoctor } from '../api';
import { AddressFields, AddressData, buildAddressString } from '../components/AddressFields';
import { AuthShell, AuthInput, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';
import { ConsentGate, EMPTY_CONSENTS, hasRequiredConsents, type ConsentState } from '../components/ConsentGate';
import { ClinicNameAutocomplete } from '../components/ClinicNameAutocomplete';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { isRTL } from '../../../core/i18n';

export function RegisterDoctorScreen() {
  const router = useRouter();

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
  const [consents, setConsents]   = useState<ConsentState>(EMPTY_CONSENTS);
  const [consentError, setConsentError] = useState(false);
  const [errors, setErrors]       = useState<Partial<typeof form>>({});
  const [errorMsg, setErrorMsg]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showPassC, setShowPassC] = useState(false);

  const shakeX = useRef(new Animated.Value(0)).current;
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

  const set = (key: keyof typeof form) => (val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setErrors(prev => ({ ...prev, [key]: '' }));
    setErrorMsg('');
  };

  const validate = () => {
    const e: Partial<typeof form> = {};
    const ae: Partial<Record<keyof AddressData, string>> = {};
    if (!form.full_name.trim()) e.full_name = 'Ad soyad zorunlu';
    if (!form.phone.trim()) e.phone = 'Telefon zorunlu';
    if (!form.clinic_name.trim()) e.clinic_name = 'Klinik adı zorunlu';
    if (!address.il) ae.il = 'İl seçin';
    if (!address.ilce) ae.ilce = 'İlçe seçin';
    if (!form.email.trim()) e.email = 'E-posta zorunlu';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Geçerli bir e-posta girin';
    if (form.password.length < 8) e.password = 'Şifre en az 8 karakter olmalı';
    if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Şifreler eşleşmiyor';
    setErrors(e); setAddressErrors(ae);
    // P0-5 · R-01 — zorunlu onaylar olmadan kayıt yok.
    const consentsOk = hasRequiredConsents(consents);
    setConsentError(!consentsOk);
    const hasErrors = Object.keys(e).length > 0 || Object.keys(ae).length > 0 || !consentsOk;
    if (hasErrors) triggerShake();
    return !hasErrors;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true); setErrorMsg('');
    const { error } = await signUpDoctor({
      consents,
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      clinic_name: form.clinic_name.trim(),
      phone: form.phone.trim(),
      address: buildAddressString(address),
    });
    setLoading(false);
    if (error) {
      const raw = error.message || '';
      const code = (error as any).code || (error as any).error_code || '';
      const isWeakPwd = /weak_password/i.test(code) || /weak.?password|should contain/i.test(raw);
      if (isWeakPwd) {
        setErrors((p) => ({ ...p, password: 'Şifre kurallarına uygun değil' }));
      } else {
        const m = /already registered|already been registered/i.test(raw)
                    ? 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.'
                : /Password/i.test(raw)
                    ? 'Şifre en az 8 karakter olmalı.'
                : /fetch|network/i.test(raw)
                    ? 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.'
                : raw || 'Kayıt başarısız oldu.';
        setErrorMsg(m);
      }
      // eslint-disable-next-line no-console
      console.warn('[register-doctor] error:', code, raw, error);
      triggerShake();
      return;
    }
    // OTP geçici olarak email ile (SMS yerine).
    // SMS gateway maliyeti + Twilio kurulumu beklerken e-posta OTP ile devam.
    router.replace({ pathname: '/(auth)/verify-email', params: { email: form.email.trim().toLowerCase() } } as any);
  };

  return (
    <AuthShell
      eyebrow="Hekim Kaydı"
      heading="Kayıt Ol"
      subtitle="Bilgilerini gir. Lab onayı sonrası giriş yapabilirsin."
      illustrationCaption="Tek hekim için&#10;hızlı kayıt akışı."
      tone="doctor"
      footerLink={{
        text: 'Zaten hesabın var mı?',
        linkText: 'Giriş Yap',
        onPress: () => router.replace('/(auth)/login'),
      }}
    >
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
        {/* Back */}
        <Pressable
          onPress={() => safeBack('/(auth)/login')}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 4,
            alignSelf: 'flex-start', marginBottom: 16,
            opacity: hovered ? 0.6 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          {isRTL() ? <ChevronRight size={14} color={AUTH.inkSoft} strokeWidth={2} /> : <ChevronLeft size={14} color={AUTH.inkSoft} strokeWidth={2} />}
          <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.inkSoft, fontWeight: '600' }}>
            Kayıt türü
          </Text>
        </Pressable>

        {/* Error */}
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

        <AuthInput
          value={form.full_name}
          onChangeText={set('full_name')}
          placeholder="Ad Soyad"
          autoCapitalize="sentences"
          error={errors.full_name}
          icon={<UserIcon size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
        />
        <AuthInput
          value={form.phone}
          onChangeText={set('phone')}
          placeholder="Telefon (5XX XXX XX XX)"
          keyboardType="phone-pad"
          error={errors.phone}
          icon={<Phone size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
        />
        <ClinicNameAutocomplete
          value={form.clinic_name}
          onChangeText={set('clinic_name')}
          placeholder="Klinik / Muayenehane (Google'dan ara)"
          error={errors.clinic_name}
          onPlaceSelected={(d) => {
            setForm((prev) => ({
              ...prev,
              clinic_name: d.name || prev.clinic_name,
              phone: prev.phone.trim() ? prev.phone : d.phone,
            }));
            setAddress({
              il: d.il || '',
              ilce: d.ilce || '',
              mahalle: d.mahalle || '',
              sokak: d.sokak || '',
              posta_kodu: d.postaKodu || '',
            });
            setAddressErrors({});
            setErrors((p) => ({ ...p, clinic_name: '', phone: '' }));
          }}
        />

        {/* Address */}
        <View style={{ marginBottom: 4 }}>
          <AddressFields
            value={address}
            onChange={(v) => { setAddress(v); setAddressErrors({}); }}
            errors={addressErrors}
          />
        </View>

        <AuthInput
          value={form.email}
          onChangeText={set('email')}
          placeholder="E-posta"
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
          icon={<Mail size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
        />
        <AuthInput
          value={form.password}
          onChangeText={set('password')}
          placeholder="Şifre (en az 8 karakter)"
          secureTextEntry={!showPass}
          error={errors.password}
          icon={<Lock size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
          rightElement={
            <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8} style={({ hovered }: any) => ({ opacity: hovered ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
              {showPass ? <EyeOff size={15} color={AUTH.inkMuted} strokeWidth={1.8} /> : <Eye size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
            </Pressable>
          }
        />
        <AuthInput
          value={form.passwordConfirm}
          onChangeText={set('passwordConfirm')}
          placeholder="Şifre (tekrar)"
          secureTextEntry={!showPassC}
          error={errors.passwordConfirm}
          icon={<Lock size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
          rightElement={
            <Pressable onPress={() => setShowPassC(!showPassC)} hitSlop={8} style={({ hovered }: any) => ({ opacity: hovered ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
              {showPassC ? <EyeOff size={15} color={AUTH.inkMuted} strokeWidth={1.8} /> : <Eye size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
            </Pressable>
          }
        />

        <PasswordChecklist password={form.password} accent="#7A9B85" />

        <View style={{ marginTop: 8 }}>
          <ConsentGate value={consents} onChange={setConsents} showError={consentError} />

          <AuthButton label="Hesap Oluştur" onPress={handleRegister} loading={loading} />
        </View>
      </Animated.View>
    </AuthShell>
  );
}
