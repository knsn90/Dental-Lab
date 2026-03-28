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
import { supabase } from '../../lib/supabase';
import { signIn, signOut } from '../../modules/auth/api';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';

// Siyah renk sabitleri — mavi yerine kullanılır
const K = {
  primary:   '#0F172A',
  primaryBg: '#F1F5F9',
  border:    '#CBD5E1',
};

export default function AdminLoginScreen() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string }>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [focused,  setFocused]  = useState<string | null>(null);
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

    try {
      const { data: authData, error: authError } = await signIn(
        email.trim().toLowerCase(),
        password,
      );

      if (authError || !authData?.user) {
        setErrorMsg('E-posta veya şifre hatalı.');
        setLoading(false);
        return;
      }

      // Admin kontrolü — sadece user_type = 'admin' geçer
      // _layout.tsx bu sayfada otomatik yönlendirme yapmaz;
      // yönlendirmeyi biz kontrol ediyoruz.
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', authData.user.id)
        .single();

      if (!profile || profile.user_type !== 'admin') {
        // Admin değil — oturumu hemen kapat, hata göster
        await signOut();
        setErrorMsg('Bu giriş sayfası yalnızca yönetici hesapları içindir.');
        setLoading(false);
        return;
      }

      // Admin doğrulandı — panele yönlendir
      router.replace('/(admin)');
    } catch (_) {
      setErrorMsg('Bir hata oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.card}>

            {/* Brand */}
            <View style={styles.brand}>
              <View style={styles.logoBox}>
                <MaterialCommunityIcons name="shield-crown-outline" size={24} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.appName}>Admin Paneli</Text>
                <Text style={styles.appSub}>Güvenli Yönetici Erişimi</Text>
              </View>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Yönetici girişi yapın</Text>
            <Text style={styles.subheading}>Yönetici hesabınızla devam edin</Text>

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
                <MaterialCommunityIcons name="lock-outline" size={14} color={K.primary} />
              </View>
              <Text style={styles.sectionTitle}>Yönetici Bilgileri</Text>
            </View>

            {/* E-posta */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>E-POSTA</Text>
              <TextInput
                style={[styles.input, focused === 'email' && styles.inputFocused, !!errors.email && styles.inputError]}
                value={email}
                onChangeText={t => { setEmail(t); setErrors(p => ({ ...p, email: undefined })); setErrorMsg(''); }}
                placeholder="yonetici@klinik.com"
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
                  <MaterialCommunityIcons name="shield-check-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.loginBtnText}>Yönetici Olarak Giriş Yap</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>veya</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Normal giriş butonu */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.replace('/(auth)/login')}
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color={K.primary} />
              <Text style={styles.backBtnText}>Normal giriş sayfasına dön</Text>
            </TouchableOpacity>

          </View>
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
    backgroundColor: K.primary, alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: K.primaryBg, alignItems: 'center', justifyContent: 'center',
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
    borderWidth: 1, borderColor: K.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: F.regular, color: C.textPrimary,
    backgroundColor: '#FAFBFC',
  },
  inputFocused: { borderColor: K.primary, backgroundColor: '#FFFFFF' },
  inputError:   { borderColor: C.danger },
  inputRow:     { flexDirection: 'row' },
  inputFlex: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  eyeBtn: {
    borderWidth: 1, borderColor: K.border,
    borderTopRightRadius: 10, borderBottomRightRadius: 10,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  eyeBtnFocused: { borderColor: K.primary, backgroundColor: '#FFFFFF' },
  eyeBtnError:   { borderColor: C.danger },

  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  fieldError:    { fontSize: 11, fontFamily: F.regular, color: C.danger },

  // Login button
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: K.primary, borderRadius: 12,
    paddingVertical: 14, marginTop: 8,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', fontFamily: F.semibold, letterSpacing: 0.2 },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontFamily: F.regular, color: C.textMuted, fontWeight: '500' },

  // Normal giriş butonu
  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: K.primary, borderRadius: 12,
    paddingVertical: 12, backgroundColor: K.primaryBg,
  },
  backBtnText: { fontSize: 14, fontFamily: F.semibold, fontWeight: '600', color: K.primary },
});
