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
import { signIn } from '../api';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [focused, setFocused]   = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Geçerli bir e-posta girin';
    if (!password) e.password = 'Şifre gerekli';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrorMsg('');
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) setErrorMsg('E-posta veya şifre hatalı.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.card}>

            {/* Brand */}
            <View style={styles.brand}>
              <View style={styles.logoBox}>
                <MaterialCommunityIcons name="stethoscope" size={24} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.appName}>Dental Lab</Text>
                <Text style={styles.appSub}>Yönetim Sistemi</Text>
              </View>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Hesabınıza giriş yapın</Text>
            <Text style={styles.subheading}>Devam etmek için bilgilerinizi girin</Text>

            {/* Error */}
            {errorMsg ? (
              <View style={styles.alertBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.danger} />
                <Text style={styles.alertText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Section */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <MaterialCommunityIcons name="lock-outline" size={14} color={C.primary} />
              </View>
              <Text style={styles.sectionTitle}>Hesap Bilgileri</Text>
            </View>

            {/* E-posta */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>E-POSTA</Text>
              <TextInput
                style={[styles.input, focused === 'email' && styles.inputFocused, !!errors.email && styles.inputError]}
                value={email}
                onChangeText={t => { setEmail(t); setErrors(p => ({ ...p, email: undefined })); setErrorMsg(''); }}
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
              {errors.email ? (
                <View style={styles.fieldErrorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={12} color={C.danger} />
                  <Text style={styles.fieldError}>{errors.email}</Text>
                </View>
              ) : null}
            </View>

            {/* Şifre */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ŞİFRE</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex, focused === 'password' && styles.inputFocused, !!errors.password && styles.inputError]}
                  value={password}
                  onChangeText={t => { setPassword(t); setErrors(p => ({ ...p, password: undefined })); setErrorMsg(''); }}
                  placeholder="••••••••"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!showPass}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  // @ts-ignore
                  outlineStyle="none"
                />
                <TouchableOpacity
                  style={[styles.eyeBtn, focused === 'password' && styles.eyeBtnFocused, !!errors.password && styles.eyeBtnError]}
                  onPress={() => setShowPass(!showPass)}
                >
                  <MaterialCommunityIcons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              {errors.password ? (
                <View style={styles.fieldErrorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={12} color={C.danger} />
                  <Text style={styles.fieldError}>{errors.password}</Text>
                </View>
              ) : null}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" />
                  <Text style={styles.loginBtnText}>Giriş Yap</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>veya</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Register */}
            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() => router.push('/(auth)/register-doctor')}
            >
              <DentistIcon size={18} color={C.primary} />
              <Text style={styles.registerBtnText}>Hekim olarak kayıt ol</Text>
            </TouchableOpacity>

          </View>

          {/* Admin giriş bağlantısı — ince, dikkat çekmez */}
          <TouchableOpacity
            style={styles.adminLink}
            onPress={() => router.push('/(auth)/admin-login')}
          >
            <MaterialCommunityIcons name="shield-crown-outline" size={13} color={C.textMuted} />
            <Text style={styles.adminLinkText}>Yönetici girişi</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  flex:      { flex: 1 },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  card: {
    width: '100%',
    maxWidth: 420,
  },

  // Brand
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  logoBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: 18, fontWeight: '800', fontFamily: F.bold, color: C.textPrimary, letterSpacing: -0.3 },
  appSub:  { fontSize: 11, fontFamily: F.regular, color: C.textMuted, marginTop: 2 },

  // Heading
  heading:    { fontSize: 24, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary, marginBottom: 6, letterSpacing: -0.4 },
  subheading: { fontSize: 14, fontFamily: F.regular, color: C.textSecondary, marginBottom: 24 },

  // Alert
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.dangerBg, borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FECACA',
  },
  alertText: { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.danger },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionIcon: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', fontFamily: F.semibold,
    color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6,
  },

  // Fields
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium,
    color: '#64748B', marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: F.regular, color: C.textPrimary,
    backgroundColor: '#FAFBFC',
  },
  inputFocused: { borderColor: C.primary, backgroundColor: '#FFFFFF' },
  inputError:   { borderColor: C.danger },
  inputRow:     { flexDirection: 'row' },
  inputFlex: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  eyeBtn: {
    borderWidth: 1, borderColor: C.border,
    borderTopRightRadius: 10, borderBottomRightRadius: 10,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  eyeBtnFocused: { borderColor: C.primary, backgroundColor: '#FFFFFF' },
  eyeBtnError:   { borderColor: C.danger },

  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  fieldError:    { fontSize: 11, fontFamily: F.regular, color: C.danger },

  // Login button
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 14, marginTop: 8,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', fontFamily: F.semibold, letterSpacing: 0.2 },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontFamily: F.regular, color: C.textMuted, fontWeight: '500' },

  // Register button
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: C.primary, borderRadius: 12,
    paddingVertical: 12, backgroundColor: C.primaryBg,
  },
  registerBtnText: { fontSize: 14, fontFamily: F.semibold, fontWeight: '600', color: C.primary },

  // Admin link
  adminLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 20, paddingVertical: 8,
  },
  adminLinkText: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
});
