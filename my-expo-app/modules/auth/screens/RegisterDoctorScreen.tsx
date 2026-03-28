import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DentistIcon } from '../../../components/icons/DentistIcon';
import { signUpDoctor } from '../api';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

export function RegisterDoctorScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    clinic_name: '',
    address: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const set = (key: keyof typeof form) => (val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setErrorMsg('');
  };

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.full_name.trim()) e.full_name = 'Ad soyad zorunludur';
    if (!form.phone.trim()) e.phone = 'Telefon zorunludur';
    if (!form.clinic_name.trim()) e.clinic_name = 'Klinik adı zorunludur';
    if (!form.address.trim()) e.address = 'Adres zorunludur';
    if (!form.email.trim()) e.email = 'E-posta zorunludur';
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

    const { data, error } = await signUpDoctor({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim(),
      clinic_name: form.clinic_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
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
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card */}
          <View style={styles.card}>

            {/* Card Header */}
            <View style={styles.cardHeader}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <MaterialCommunityIcons name="chevron-left" size={18} color={C.textSecondary} />
                <Text style={styles.backText}>Geri</Text>
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <View style={styles.iconWrap}>
                  <DentistIcon size={22} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Hekim Kaydı</Text>
                  <Text style={styles.cardSubtitle}>Yeni hekim hesabı oluşturun</Text>
                </View>
              </View>
            </View>

            {/* Messages */}
            {errorMsg ? (
              <View style={styles.alertBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.danger} />
                <Text style={styles.alertText}>{errorMsg}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={[styles.alertBox, styles.alertSuccess]}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={C.success} />
                <Text style={[styles.alertText, { color: C.success }]}>{successMsg}</Text>
              </View>
            ) : null}

            {/* ── Section: Kişisel Bilgiler ── */}
            <SectionHeader icon="person-outline" title="Kişisel Bilgiler" />

            <FieldGroup label="Ad Soyad *" error={errors.full_name}>
              <TextInput
                style={[styles.input, focused === 'full_name' && styles.inputFocused, !!errors.full_name && styles.inputError]}
                value={form.full_name}
                onChangeText={set('full_name')}
                placeholder="Dr. Ahmet Yılmaz"
                placeholderTextColor={C.textMuted}
                onFocus={() => setFocused('full_name')}
                onBlur={() => setFocused(null)}
                // @ts-ignore
                outlineStyle="none"
              />
            </FieldGroup>

            <FieldGroup label="Telefon *" error={errors.phone}>
              <TextInput
                style={[styles.input, focused === 'phone' && styles.inputFocused, !!errors.phone && styles.inputError]}
                value={form.phone}
                onChangeText={set('phone')}
                placeholder="0532 000 00 00"
                placeholderTextColor={C.textMuted}
                keyboardType="phone-pad"
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                // @ts-ignore
                outlineStyle="none"
              />
            </FieldGroup>

            {/* ── Section: Klinik Bilgisi ── */}
            <SectionHeader icon="business-outline" title="Klinik Bilgisi" />

            <FieldGroup label="Klinik / Muayenehane Adı *" error={errors.clinic_name}>
              <TextInput
                style={[styles.input, focused === 'clinic_name' && styles.inputFocused, !!errors.clinic_name && styles.inputError]}
                value={form.clinic_name}
                onChangeText={set('clinic_name')}
                placeholder="Yılmaz Diş Kliniği"
                placeholderTextColor={C.textMuted}
                onFocus={() => setFocused('clinic_name')}
                onBlur={() => setFocused(null)}
                // @ts-ignore
                outlineStyle="none"
              />
            </FieldGroup>

            <FieldGroup label="Adres *" error={errors.address}>
              <TextInput
                style={[styles.input, styles.inputMulti, focused === 'address' && styles.inputFocused, !!errors.address && styles.inputError]}
                value={form.address}
                onChangeText={set('address')}
                placeholder="Mahalle, sokak, il/ilçe..."
                placeholderTextColor={C.textMuted}
                multiline
                textAlignVertical="top"
                onFocus={() => setFocused('address')}
                onBlur={() => setFocused(null)}
                // @ts-ignore
                outlineStyle="none"
              />
            </FieldGroup>

            {/* ── Section: Hesap Bilgileri ── */}
            <SectionHeader icon="lock-closed-outline" title="Hesap Bilgileri" />

            <FieldGroup label="E-posta *" error={errors.email}>
              <TextInput
                style={[styles.input, focused === 'email' && styles.inputFocused, !!errors.email && styles.inputError]}
                value={form.email}
                onChangeText={set('email')}
                placeholder="ornek@email.com"
                placeholderTextColor={C.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                // @ts-ignore
                outlineStyle="none"
              />
            </FieldGroup>

            <FieldGroup label="Şifre *" error={errors.password}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex, focused === 'password' && styles.inputFocused, !!errors.password && styles.inputError]}
                  value={form.password}
                  onChangeText={set('password')}
                  placeholder="En az 8 karakter"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  // @ts-ignore
                  outlineStyle="none"
                />
                <TouchableOpacity
                  style={[styles.eyeBtn, focused === 'password' && styles.eyeBtnFocused, !!errors.password && styles.eyeBtnError]}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </FieldGroup>

            <FieldGroup label="Şifre Tekrar *" error={errors.passwordConfirm}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex, focused === 'passwordConfirm' && styles.inputFocused, !!errors.passwordConfirm && styles.inputError]}
                  value={form.passwordConfirm}
                  onChangeText={set('passwordConfirm')}
                  placeholder="Şifrenizi tekrar girin"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!showPasswordConfirm}
                  onFocus={() => setFocused('passwordConfirm')}
                  onBlur={() => setFocused(null)}
                  // @ts-ignore
                  outlineStyle="none"
                />
                <TouchableOpacity
                  style={[styles.eyeBtn, focused === 'passwordConfirm' && styles.eyeBtnFocused, !!errors.passwordConfirm && styles.eyeBtnError]}
                  onPress={() => setShowPasswordConfirm(!showPasswordConfirm)}
                >
                  <MaterialCommunityIcons name={showPasswordConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </FieldGroup>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>Kayıt Ol</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Login link */}
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={styles.loginLink}
            >
              <Text style={styles.loginLinkText}>
                Zaten hesabınız var mı?{' '}
                <Text style={styles.loginLinkBold}>Giriş yapın</Text>
              </Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={sh.row}>
      <View style={sh.iconBox}>
        <MaterialCommunityIcons name={icon as any} size={14} color={C.primary} />
      </View>
      <Text style={sh.title}>{title}</Text>
    </View>
  );
}

function FieldGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={fg.wrap}>
      <Text style={fg.label}>{label}</Text>
      {children}
      {error ? (
        <View style={fg.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={12} color={C.danger} />
          <Text style={fg.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },

  card: {
    width: '100%',
    maxWidth: 460,
  },

  // Card header
  cardHeader: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
    color: C.textSecondary,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.textMuted,
    marginTop: 2,
  },

  // Alerts
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 0,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.dangerBg,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  alertSuccess: {
    backgroundColor: C.successBg,
    borderColor: '#6EE7B7',
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontFamily: F.regular,
    color: C.danger,
    lineHeight: 18,
  },

  // Inputs
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textPrimary,
    backgroundColor: '#FAFBFC',
  },
  inputFocused: {
    borderColor: C.primary,
    backgroundColor: C.surface,
  },
  inputError: {
    borderColor: C.danger,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputFlex: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  eyeBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  eyeBtnFocused: {
    borderColor: C.primary,
    backgroundColor: C.surface,
  },
  eyeBtnError: {
    borderColor: C.danger,
  },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 0,
    marginTop: 24,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: C.primary,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  loginLink: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 4,
  },
  loginLinkText: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textSecondary,
  },
  loginLinkBold: {
    color: C.primary,
    fontFamily: F.semibold,
    fontWeight: '600',
  },
});

const sh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 4,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: C.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

const fg = StyleSheet.create({
  wrap: {
    paddingHorizontal: 0,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: F.medium,
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  errorText: {
    fontSize: 11,
    fontFamily: F.regular,
    color: C.danger,
  },
});
