import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../lib/supabase';
import { signIn, signOut } from '../../modules/auth/api';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';
import { useIsDesktop } from '../../core/layout/DesktopShell';

// ─── Admin palette ────────────────────────────────────────────────────────────
const BRAND  = '#0F172A';  // dark navy
const ACCENT = '#1E293B';  // slightly lighter for hover etc.
const LIGHT  = '#334155';

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: 'shield-check-outline',    text: 'Tam Sistem Erişimi'           },
  { icon: 'chart-line',              text: 'Gelir-Gider Raporları'         },
  { icon: 'account-supervisor-outline', text: 'Kullanıcı Yönetimi'       },
  { icon: 'cog-outline',             text: 'Sistem Ayarları & Loglar'      },
];

// ─── FloatingInput ─────────────────────────────────────────────────────────────
interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  returnKeyType?: 'next' | 'go' | 'done';
  onSubmitEditing?: () => void;
  error?: string;
  rightElement?: React.ReactNode;
}

function FloatingInput({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType,
  autoCapitalize, returnKeyType, onSubmitEditing, error, rightElement,
}: FloatingInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const onFocus = () => {
    setIsFocused(true);
    Animated.spring(labelAnim, { toValue: 1, tension: 300, friction: 20, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    setIsFocused(false);
    if (!value) {
      Animated.spring(labelAnim, { toValue: 0, tension: 300, friction: 20, useNativeDriver: false }).start();
    }
  };

  useEffect(() => {
    if (value && !isFocused) {
      Animated.spring(labelAnim, { toValue: 1, tension: 300, friction: 20, useNativeDriver: false }).start();
    }
  }, [value]);

  const labelTop  = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -10] });
  const labelSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 11] });
  const labelColor = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.textMuted, isFocused ? BRAND : C.textSecondary],
  });

  const borderColor = error ? C.danger : isFocused ? BRAND : C.borderMid;

  return (
    <View style={fi.wrap}>
      <View style={[fi.box, { borderColor }]}>
        <Animated.Text style={[fi.label, { top: labelTop, fontSize: labelSize, color: labelColor }]}>
          {label}
        </Animated.Text>
        <TextInput
          style={fi.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={isFocused ? placeholder : ''}
          placeholderTextColor={C.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={onFocus}
          onBlur={onBlur}
          // @ts-ignore
          outlineStyle="none"
        />
        {rightElement && <View style={fi.right}>{rightElement}</View>}
      </View>
      {error ? (
        <View style={fi.errorRow}>
          <MaterialCommunityIcons name="alert-circle" size={11} color={C.danger} />
          <Text style={fi.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const fi = StyleSheet.create({
  wrap: { marginBottom: 20 },
  box: {
    position: 'relative', borderWidth: 1.5, borderRadius: 14,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  label: {
    position: 'absolute', left: 16, fontFamily: F.medium,
    zIndex: 2, backgroundColor: '#FFFFFF', paddingHorizontal: 2,
  },
  input: {
    fontSize: 14, fontFamily: F.regular, color: C.textPrimary,
    paddingTop: 4, paddingBottom: 10, minHeight: 36,
  },
  right:     { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginLeft: 4 },
  errorText: { fontSize: 11, fontFamily: F.regular, color: C.danger },
});

// ─── DecoCircles ──────────────────────────────────────────────────────────────
function DecoCircles() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={[dc.circle, { width: 360, height: 360, top: -130, left: -110, opacity: 0.06 }]} />
      <View style={[dc.circle, { width: 250, height: 250, bottom: -70, right: -90, opacity: 0.08 }]} />
      <View style={[dc.circle, { width: 150, height: 150, top: '42%', right: -40, opacity: 0.05 }]} />
      <View style={[dc.dot, { top: '28%', left: 44, opacity: 0.2  }]} />
      <View style={[dc.dot, { top: '52%', left: 114, opacity: 0.15 }]} />
      <View style={[dc.dot, { top: '22%', right: 54, opacity: 0.18 }]} />
    </View>
  );
}
const dc = StyleSheet.create({
  circle: { position: 'absolute', borderRadius: 9999, backgroundColor: '#FFFFFF' },
  dot:    { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
});

// ─── AdminLoginScreen ─────────────────────────────────────────────────────────
export default function AdminLoginScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const isDesktop = useIsDesktop();

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
  const cardSlide   = useRef(new Animated.Value(isDesktop ? 0 : 50)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;
  const btnScale    = useRef(new Animated.Value(1)).current;
  const shakeX      = useRef(new Animated.Value(0)).current;

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

  const onPressIn  = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true }).start();

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim())                    e.email    = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email   = 'Geçerli bir e-posta girin';
    if (!password)                         e.password = 'Şifre gerekli';
    setErrors(e);
    if (Object.keys(e).length) triggerShake();
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true); setErrorMsg('');
    try {
      const { data: authData, error: authError } = await signIn(email.trim().toLowerCase(), password);
      if (authError || !authData?.user) {
        setErrorMsg('E-posta veya şifre hatalı.');
        triggerShake(); setLoading(false); return;
      }
      const { data: profile } = await supabase
        .from('profiles').select('user_type').eq('id', authData.user.id).single();
      if (!profile || profile.user_type !== 'admin') {
        await signOut();
        setErrorMsg('Bu sayfa yalnızca yönetici hesapları içindir.');
        triggerShake(); setLoading(false); return;
      }
      router.replace('/(admin)');
    } catch {
      setErrorMsg('Bir hata oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
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
    if (error) { setForgotError('E-posta gönderilemedi.'); return; }
    setForgotSent(true);
  };

  // ── Shared form JSX ───────────────────────────────────────────────────────
  const formJsx = (
    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
      <Text style={fc.welcomeTitle}>Yönetici Girişi</Text>
      <Text style={fc.welcomeSub}>Güvenli yönetici erişimi</Text>

      {/* Segment switcher */}
      <View style={fc.segment}>
        <TouchableOpacity
          style={fc.segBtn}
          onPress={() => router.replace('/(auth)/login')}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="flask-outline" size={13} color={C.textMuted} />
          <Text style={fc.segText}>Laboratuvar</Text>
        </TouchableOpacity>
        <View style={[fc.segBtn, fc.segBtnActive]}>
          <MaterialCommunityIcons name="shield-crown-outline" size={13} color={BRAND} />
          <Text style={[fc.segText, { color: BRAND, fontFamily: F.semibold }]}>Yönetici</Text>
        </View>
      </View>

      {/* Error banner */}
      {errorMsg ? (
        <View style={fc.errorBanner}>
          <MaterialCommunityIcons name="alert-circle" size={15} color={C.danger} />
          <Text style={fc.errorBannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      <FloatingInput
        label="E-posta adresi"
        value={email}
        onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: undefined })); setErrorMsg(''); }}
        placeholder="yonetici@klinik.com"
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={handleLogin}
        error={errors.email}
      />

      <FloatingInput
        label="Şifre"
        value={password}
        onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: undefined })); setErrorMsg(''); }}
        secureTextEntry={!showPass}
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        error={errors.password}
        rightElement={
          <TouchableOpacity onPress={() => setShowPass(!showPass)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons
              name={showPass ? 'eye-off-outline' : 'eye-outline'}
              size={18} color={C.textMuted}
            />
          </TouchableOpacity>
        }
      />

      <TouchableOpacity
        style={fc.forgotRow}
        onPress={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
      >
        <Text style={[fc.forgotText, { color: BRAND }]}>Şifremi unuttum</Text>
      </TouchableOpacity>

      {forgotMode && (
        <View style={fc.forgotPanel}>
          {forgotSent ? (
            <View style={fc.forgotSuccess}>
              <View style={fc.forgotSuccessIcon}>
                <MaterialCommunityIcons name="check" size={16} color={C.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fc.forgotSuccessTitle}>E-posta gönderildi</Text>
                <Text style={fc.forgotSuccessSub}>Gelen kutunuzu kontrol edin.</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={fc.forgotTitle}>Şifre Sıfırla</Text>
              <Text style={fc.forgotSub}>Sıfırlama bağlantısı e-postanıza gönderilecek.</Text>
              <FloatingInput
                label="E-posta adresiniz"
                value={forgotEmail}
                onChangeText={v => { setForgotEmail(v); setForgotError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={forgotError}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={fc.forgotCancel} onPress={() => setForgotMode(false)}>
                  <Text style={fc.forgotCancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[fc.forgotSend, { backgroundColor: BRAND, opacity: forgotLoading ? 0.65 : 1 }]}
                  onPress={handleForgotPassword} disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={fc.forgotSendText}>Gönder</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 4 }}>
        <TouchableOpacity
          style={[fc.loginBtn, { backgroundColor: BRAND, opacity: loading ? 0.7 : 1 }]}
          onPress={handleLogin}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={loading}
          activeOpacity={1}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={fc.loginBtnText}>Yönetici Girişi</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Back to lab login */}
      <View style={fc.divider}>
        <View style={fc.dividerLine} />
        <Text style={fc.dividerText}>veya</Text>
        <View style={fc.dividerLine} />
      </View>
      <TouchableOpacity
        style={[fc.backBtn, { borderColor: C.borderMid }]}
        onPress={() => router.replace('/(auth)/login')}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="arrow-left" size={16} color={C.textSecondary} />
        <Text style={fc.backBtnText}>Laboratuvar girişine dön</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  // ── Desktop layout ────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={dsk.root}>
        {/* Left: dark panel */}
        <View style={dsk.brandPanel}>
          <DecoCircles />
          <View style={dsk.brandContent}>
            <View style={dsk.logoRing}>
              <MaterialCommunityIcons name="shield-crown-outline" size={30} color="#FFFFFF" />
            </View>
            <Text style={dsk.appName}>YÖNETİCİ PANELİ</Text>
            <Text style={dsk.tagline}>Güvenli Yönetici Erişimi</Text>
            <View style={dsk.divider} />
            {FEATURES.map((f, i) => (
              <View key={i} style={dsk.featureRow}>
                <View style={dsk.featureIcon}>
                  <MaterialCommunityIcons name={f.icon as any} size={15} color="rgba(255,255,255,0.7)" />
                </View>
                <Text style={dsk.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
          <Text style={dsk.footer}>YETKİLİ YÖNETİCİ KULLANIMI</Text>
        </View>

        {/* Right: form */}
        <View style={dsk.formPanel}>
          <ScrollView
            contentContainerStyle={dsk.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={dsk.formInner}>{formJsx}</View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <View style={mob.root}>
      <View style={mob.header}>
        <DecoCircles />
        <View style={[mob.headerContent, { paddingTop: insets.top + 24 }]}>
          <View style={mob.logoRing}>
            <MaterialCommunityIcons name="shield-crown-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={mob.appName}>YÖNETİCİ PANELİ</Text>
          <Text style={mob.tagline}>Güvenli Yönetici Erişimi</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Animated.View
          style={[
            mob.card,
            {
              transform: [{ translateY: cardSlide }],
              opacity: cardOpacity,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {formJsx}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Desktop styles ───────────────────────────────────────────────────────────
const dsk = StyleSheet.create({
  root:       { flex: 1, flexDirection: 'row' },
  brandPanel: { width: '42%', backgroundColor: BRAND, overflow: 'hidden', justifyContent: 'space-between' },
  brandContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 48, paddingVertical: 60, zIndex: 2 },
  logoRing: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  appName:  { fontSize: 22, fontWeight: '800', fontFamily: F.bold, color: '#FFF', letterSpacing: 2.5, marginBottom: 8 },
  tagline:  { fontSize: 13, fontFamily: F.regular, color: 'rgba(255,255,255,0.55)', marginBottom: 36 },
  divider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 28 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  featureIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  featureText: { fontSize: 13.5, fontFamily: F.medium, color: 'rgba(255,255,255,0.78)' },
  footer: {
    paddingHorizontal: 48, paddingBottom: 28, zIndex: 2,
    fontSize: 9, fontFamily: F.medium, color: 'rgba(255,255,255,0.28)', letterSpacing: 2,
  },
  formPanel:  { flex: 1, backgroundColor: '#FAFBFD' },
  formScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  formInner: {
    width: '100%', maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 40, margin: 40,
    borderWidth: 1, borderColor: C.border,
    ...Platform.select({
      web: { boxShadow: '0 4px 32px rgba(15,23,42,0.07)' } as any,
    }),
  },
});

// ─── Mobile styles ────────────────────────────────────────────────────────────
const mob = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BRAND },
  header:        { height: 240, overflow: 'hidden' },
  headerContent: { alignItems: 'center', paddingHorizontal: 24, zIndex: 2 },
  logoRing: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  appName: { fontSize: 20, fontWeight: '800', fontFamily: F.bold, color: '#FFF', letterSpacing: 2.5, marginBottom: 6 },
  tagline: { fontSize: 12, fontFamily: F.regular, color: 'rgba(255,255,255,0.6)' },
  card: {
    flex: 1, backgroundColor: '#FAFBFD',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, paddingHorizontal: 24,
  },
});

// ─── Form styles (shared between mobile/desktop) ──────────────────────────────
const fc = StyleSheet.create({
  welcomeTitle: {
    fontSize: 26, fontWeight: '800', fontFamily: F.bold,
    color: C.textPrimary, letterSpacing: -0.5, marginBottom: 6,
  },
  welcomeSub: { fontSize: 14, fontFamily: F.regular, color: C.textSecondary, marginBottom: 28 },

  segment: {
    flexDirection: 'row', backgroundColor: '#F1F5F9',
    borderRadius: 12, padding: 4, marginBottom: 28, gap: 4,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  segBtnActive: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 13, fontFamily: F.medium, fontWeight: '500', color: C.textSecondary },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.dangerBg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 20, borderWidth: 1, borderColor: C.dangerBorder,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.danger, lineHeight: 18 },

  forgotRow: { alignItems: 'flex-end', marginTop: -8, marginBottom: 20 },
  forgotText:{ fontSize: 12, fontFamily: F.semibold, fontWeight: '600' },

  forgotPanel: {
    backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1,
    borderColor: C.borderMid, padding: 18, marginBottom: 16,
  },
  forgotTitle:   { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary, marginBottom: 4 },
  forgotSub:     { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginBottom: 12 },
  forgotSuccess: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  forgotSuccessIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.successBg, alignItems: 'center', justifyContent: 'center',
  },
  forgotSuccessTitle: { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: C.success },
  forgotSuccessSub:   { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  forgotCancel: {
    flex: 1, borderWidth: 1.5, borderColor: C.borderMid,
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  forgotCancelText: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
  forgotSend:       { flex: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  forgotSendText:   { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },

  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 16,
  },
  loginBtnText: { fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#FFF', letterSpacing: 0.2 },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 11, fontFamily: F.medium, color: C.textMuted, letterSpacing: 0.8 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
});
