/**
 * RegisterLabScreen — Lab personeli kayıt (teknisyen / mesul müdür).
 * AuthShell ile beyaz tema, mor accent.
 */
import React, { useState, useRef } from 'react';
import { safeBack } from '../../../core/util/safeBack';
import { View, Text, Pressable, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Mail, Lock, Eye, EyeOff, User as UserIcon, Phone,
  AlertCircle, Check, ChevronLeft,
} from 'lucide-react-native';
import { signUpLabUser, LabRole } from '../api';
import { AuthShell, AuthInput, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';
import { ConsentGate, EMPTY_CONSENTS, hasRequiredConsents, type ConsentState } from '../components/ConsentGate';

const ROLES: { value: LabRole; label: string; desc: string }[] = [
  { value: 'technician', label: 'Teknisyen',    desc: 'İş emirlerini üretir' },
  { value: 'manager',    label: 'Mesul Müdür',  desc: 'Tüm işlemleri yönetir' },
];

export function RegisterLabScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', password: '', passwordConfirm: '',
    role: 'technician' as LabRole,
  });
  const [loading,    setLoading]    = useState(false);
  const [consents, setConsents]   = useState<ConsentState>(EMPTY_CONSENTS);
  const [consentError, setConsentError] = useState(false);
  const [errors,     setErrors]     = useState<Partial<Record<keyof typeof form, string>>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [showPassC,  setShowPassC]  = useState(false);

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
    if (!form.full_name.trim()) e.full_name = 'Ad soyad gerekli';
    if (!form.email.trim()) e.email = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Geçerli bir e-posta girin';
    if (form.password.length < 8) e.password = 'Şifre en az 8 karakter olmalı';
    if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Şifreler eşleşmiyor';
    setErrors(e);
    // P0-5 · R-01 — zorunlu onaylar olmadan kayıt yok.
    const consentsOk = hasRequiredConsents(consents);
    setConsentError(!consentsOk);
    const hasErrors = Object.keys(e).length > 0 || !consentsOk;
    if (hasErrors) triggerShake();
    return !hasErrors;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true); setErrorMsg(''); setSuccessMsg('');
    const { data, error } = await signUpLabUser({
      consents,
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      role: form.role,
      phone: form.phone.trim() || undefined,
    });
    setLoading(false);
    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setErrorMsg('Bu e-posta zaten kayıtlı. Giriş yapmayı dene.');
      } else if (error.message.includes('Password')) {
        setErrorMsg('Şifre en az 8 karakter olmalı.');
      } else {
        setErrorMsg(error.message);
      }
      triggerShake();
      return;
    }
    if (!data?.session) {
      setSuccessMsg('Kayıt başarılı! E-posta adresini onayla, ardından giriş yap.');
    }
  };

  return (
    <AuthShell
      eyebrow="Lab Personeli"
      heading="Kayıt Ol"
      subtitle="Lab takımının bir üyesi olarak kayıt ol."
      illustrationCaption="Teknisyen ve yöneticiler&#10;için tek panel."
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
          <ChevronLeft size={14} color={AUTH.inkSoft} strokeWidth={2} />
          <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.inkSoft, fontWeight: '600' }}>Geri</Text>
        </Pressable>

        {errorMsg ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: 'rgba(220,38,38,0.06)',
            borderRadius: 10, padding: 12, marginBottom: 14,
            borderLeftWidth: 3, borderLeftColor: AUTH.danger,
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
            backgroundColor: 'rgba(22,163,74,0.08)',
            borderRadius: 10, padding: 12, marginBottom: 14,
            borderLeftWidth: 3, borderLeftColor: AUTH.success,
          }}>
            <Check size={14} color={AUTH.success} strokeWidth={2.4} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.success, lineHeight: 18, fontWeight: '500' }}>
              {successMsg}
            </Text>
          </View>
        ) : null}

        {/* Role segment */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{
            fontFamily: AUTH_FONT.sans,
            fontSize: 11, color: AUTH.inkSoft, fontWeight: '600',
            marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase',
          }}>
            Rol
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ROLES.map(r => {
              const active = r.value === form.role;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setForm(p => ({ ...p, role: r.value }))}
                  style={({ hovered }: any) => ({
                    flex: 1, padding: 12, borderRadius: 10,
                    backgroundColor: active ? AUTH.primary : (hovered ? `${AUTH.primary}08` : '#FFFFFF'),
                    borderWidth: 1, borderColor: active ? AUTH.primary : AUTH.border,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{
                    fontFamily: AUTH_FONT.display,
                    fontSize: 13, fontWeight: '700',
                    color: active ? '#FFFFFF' : AUTH.ink,
                  }}>
                    {r.label}
                  </Text>
                  <Text style={{
                    fontFamily: AUTH_FONT.sans,
                    fontSize: 11, color: active ? 'rgba(255,255,255,0.85)' : AUTH.inkSoft,
                    marginTop: 2,
                  }}>
                    {r.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
          placeholder="Telefon (opsiyonel)"
          keyboardType="phone-pad"
          error={errors.phone}
          icon={<Phone size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
        />
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

        <View style={{ marginTop: 8 }}>
          <ConsentGate value={consents} onChange={setConsents} showError={consentError} />

          <AuthButton label="Hesap Oluştur" onPress={handleRegister} loading={loading} />
        </View>
      </Animated.View>
    </AuthShell>
  );
}
