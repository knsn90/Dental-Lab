import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signUpLabUser, LabRole } from '../api';
import { Input } from '../../../core/ui/Input';
import { Button } from '../../../core/ui/Button';
import { C } from '../../../core/theme/colors';

const ROLES: { value: LabRole; label: string; desc: string }[] = [
  { value: 'technician', label: 'Teknisyen', desc: 'İş emirlerini üretir' },
  { value: 'manager', label: 'Mesul Müdür', desc: 'Tüm işlemleri yönetir' },
];

export function RegisterLabScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
    role: 'technician' as LabRole,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
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
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const { data, error } = await signUpLabUser({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      role: form.role,
      phone: form.phone.trim() || undefined,
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
      return;
    }

    if (!data?.session) {
      setSuccessMsg('Kayıt başarılı! Lütfen e-posta adresinizi onaylayın, ardından giriş yapın.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Geri</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Lab Kullanıcı Kaydı</Text>
          <Text style={styles.subtitle}>Laborant hesabı oluşturun</Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>⚠️  {errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBox}>
              <Text style={styles.successBoxText}>✅  {successMsg}</Text>
            </View>
          ) : null}

          <Input
            label="Ad Soyad"
            value={form.full_name}
            onChangeText={set('full_name')}
            placeholder="Mehmet Kaya"
            error={errors.full_name}
          />

          <Text style={styles.roleLabel}>Rol</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => setForm((prev) => ({ ...prev, role: r.value }))}
                style={[styles.roleBtn, form.role === r.value && styles.roleBtnActive]}
              >
                <Text style={[styles.roleBtnTitle, form.role === r.value && styles.roleBtnTitleActive]}>
                  {r.label}
                </Text>
                <Text style={[styles.roleBtnDesc, form.role === r.value && styles.roleBtnDescActive]}>
                  {r.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Telefon (isteğe bağlı)"
            value={form.phone}
            onChangeText={set('phone')}
            placeholder="0532 000 00 00"
            keyboardType="phone-pad"
          />
          <Input
            label="E-posta"
            value={form.email}
            onChangeText={set('email')}
            placeholder="ornek@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
          <Input
            label="Şifre"
            value={form.password}
            onChangeText={set('password')}
            placeholder="En az 8 karakter"
            secureTextEntry
            error={errors.password}
          />
          <Input
            label="Şifre Tekrar"
            value={form.passwordConfirm}
            onChangeText={set('passwordConfirm')}
            placeholder="Şifrenizi tekrar girin"
            secureTextEntry
            error={errors.passwordConfirm}
          />

          <Button
            onPress={handleRegister}
            label="Kayıt Ol"
            loading={loading}
            style={styles.submitBtn}
          />

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              Zaten hesabınız var mı? <Text style={styles.link}>Giriş yapın</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 24 },
  back: { marginBottom: 16 },
  backText: { fontSize: 16, color: C.primary, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: C.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
  errorBox: {
    backgroundColor: C.dangerBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBoxText: { color: C.danger, fontSize: 14, fontWeight: '500' },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  successBoxText: { color: '#059669', fontSize: 14, fontWeight: '500' },
  roleLabel: { fontSize: 14, fontWeight: '600', color: C.textPrimary, marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: C.surface,
  },
  roleBtnActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  roleBtnTitle: { fontSize: 14, fontWeight: '700', color: C.textSecondary, marginBottom: 2 },
  roleBtnTitleActive: { color: C.primary },
  roleBtnDesc: { fontSize: 11, color: C.textMuted },
  roleBtnDescActive: { color: C.primary },
  submitBtn: { marginTop: 8, marginBottom: 16 },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontSize: 14, color: C.textSecondary },
  link: { color: C.primary, fontWeight: '600' },
});
