/**
 * RegisterClinicScreen — Klinik / Poliklinik / Hastane kayıt formu.
 * AuthShell ile beyaz tema, mor accent.
 */
import React, { useState, useRef } from 'react';
import { safeBack } from '../../../core/util/safeBack';
import { View, Text, Pressable, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Mail, Lock, Eye, EyeOff, User as UserIcon, Phone, Building2,
  AlertCircle, ChevronLeft, ChevronRight,
} from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { signUpClinic } from '../api';
import { AddressFields, AddressData, buildAddressString } from '../components/AddressFields';
import { AuthShell, AuthInput, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';
import { ConsentGate, EMPTY_CONSENTS, hasRequiredConsents, type ConsentState } from '../components/ConsentGate';
import { ClinicNameAutocomplete } from '../components/ClinicNameAutocomplete';
import { PasswordChecklist } from '../components/PasswordChecklist';

type ClinicType = 'klinik' | 'poliklinik' | 'hastane';

// Sage yeşil — DOCTOR_TONE.primary ile uyumlu (RegisterClinicScreen tone="doctor")
const TONE_GREEN = '#7A9B85';

function SegmentPicker({ value, onChange }: { value: ClinicType; onChange: (v: ClinicType) => void }) {
  const opts: { key: ClinicType; label: string }[] = [
    { key: 'klinik',     label: 'Klinik' },
    { key: 'poliklinik', label: 'Poliklinik' },
    { key: 'hastane',    label: 'Hastane' },
  ];
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{
        fontFamily: AUTH_FONT.sans,
        fontSize: 11, color: AUTH.inkSoft, fontWeight: '600',
        marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase',
      }}>
        Kurum Türü
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {opts.map(o => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              style={({ hovered }: any) => ({
                flex: 1, height: 44, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? TONE_GREEN : (hovered ? `${TONE_GREEN}10` : '#FFFFFF'),
                borderWidth: 1, borderColor: active ? TONE_GREEN : AUTH.border,
                ...(Platform.OS === 'web' ? {
                  cursor: 'pointer',
                  transitionProperty: 'background-color, border-color' as any,
                  transitionDuration: '160ms' as any,
                } as any : {}),
              })}
            >
              <Text style={{
                fontFamily: AUTH_FONT.display,
                fontSize: 13, fontWeight: '700',
                color: active ? '#FFFFFF' : AUTH.inkSoft,
              }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function RegisterClinicScreen() {
  const router = useRouter();

  const [form, setForm] = useState({
    clinic_name: '',
    clinic_type: 'klinik' as ClinicType,
    full_name: '',
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
  const [errors, setErrors]       = useState<Partial<Record<keyof typeof form, string>>>({});
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
    const e: Partial<Record<keyof typeof form, string>> = {};
    const ae: Partial<Record<keyof AddressData, string>> = {};
    if (!form.clinic_name.trim()) e.clinic_name = 'Klinik adı zorunlu';
    if (!address.il) ae.il = 'İl seçin';
    if (!address.ilce) ae.ilce = 'İlçe seçin';
    if (!form.full_name.trim()) e.full_name = 'Ad soyad zorunlu';
    if (!form.phone.trim()) e.phone = 'Telefon zorunlu';
    if (!form.email.trim()) e.email = 'E-posta zorunlu';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Geçerli bir e-posta girin';
    if (form.password.length < 8) e.password = 'Şifre en az 8 karakter olmalı';
    if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Şifreler eşleşmiyor';
    setErrors(e); setAddressErrors(ae);
    const has = Object.keys(e).length > 0 || Object.keys(ae).length > 0;
    if (has) triggerShake();
    return !has;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true); setErrorMsg('');
    const { error } = await signUpClinic({
      consents,
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      clinic_name: form.clinic_name.trim(),
      phone: form.phone.trim(),
      address: buildAddressString(address),
      clinic_type: form.clinic_type,
    });
    setLoading(false);
    if (error) {
      const raw = error.message || '';
      const code = (error as any).code || (error as any).error_code || '';
      const isWeakPwd = /weak_password/i.test(code) || /weak.?password|should contain/i.test(raw);
      if (isWeakPwd) {
        // Checklist zaten gösteriyor — sadece input'a inline hata ata, banner gösterme
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
      console.warn('[register-clinic] error:', code, raw, error);
      triggerShake();
      return;
    }
    router.replace({ pathname: '/(auth)/verify-email', params: { email: form.email.trim().toLowerCase() } } as any);
  };

  return (
    <AuthShell
      eyebrow="Klinik Kaydı"
      heading="Kayıt Ol"
      subtitle="Kurum bilgilerini gir, hekimlerini daha sonra davet et."
      illustrationCaption="Çoklu hekim,&#10;merkezi yönetim."
      tone="doctor"
      footerLink={{
        text: 'Zaten hesabın var mı?',
        linkText: 'Giriş Yap',
        onPress: () => router.replace('/(auth)/login'),
      }}
    >
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
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

        <SegmentPicker value={form.clinic_type} onChange={(v) => setForm(p => ({ ...p, clinic_type: v }))} />

        <ClinicNameAutocomplete
          value={form.clinic_name}
          onChangeText={set('clinic_name')}
          placeholder="Kurum Adı (Google'dan ara)"
          error={errors.clinic_name}
          onPlaceSelected={(d) => {
            // Telefon boşsa Google'dan dolur — kullanıcı override edebilir
            setForm((prev) => ({
              ...prev,
              clinic_name: d.name || prev.clinic_name,
              phone: prev.phone.trim() ? prev.phone : d.phone,
            }));
            // Adres alanlarını otomatik doldur (manuel düzenleme mümkün)
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

        <AddressFields
          value={address}
          onChange={(v) => { setAddress(v); setAddressErrors({}); }}
          errors={addressErrors}
        />

        {/* Ad+Telefon yan yana */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AuthInput
              value={form.full_name}
              onChangeText={set('full_name')}
              placeholder="Yetkili Ad Soyad"
              autoCapitalize="sentences"
              error={errors.full_name}
              icon={<UserIcon size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AuthInput
              value={form.phone}
              onChangeText={set('phone')}
              placeholder="Yetkili Telefon"
              keyboardType="phone-pad"
              error={errors.phone}
              icon={<Phone size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
            />
          </View>
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

        {/* Şifre + Şifre tekrar yan yana */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AuthInput
              value={form.password}
              onChangeText={set('password')}
              placeholder="Şifre"
              secureTextEntry={!showPass}
              error={errors.password}
              icon={<Lock size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
              rightElement={
                <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8} style={({ hovered }: any) => ({ opacity: hovered ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                  {showPass ? <EyeOff size={15} color={AUTH.inkMuted} strokeWidth={1.8} /> : <Eye size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
                </Pressable>
              }
            />
          </View>
          <View style={{ flex: 1 }}>
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
          </View>
        </View>

        <PasswordChecklist password={form.password} accent={TONE_GREEN} />

        <View style={{ marginTop: 8 }}>
          <ConsentGate value={consents} onChange={setConsents} showError={consentError} />

          <AuthButton label="Hesap Oluştur" onPress={handleRegister} loading={loading} />
        </View>
      </Animated.View>
    </AuthShell>
  );
}
