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
  Dimensions,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DentistIcon } from '../../../components/icons/DentistIcon';
import { signIn } from '../api';
import { supabase } from '../../../lib/supabase';
import { C } from '../../../core/theme/colors';
import { F, FS } from '../../../core/theme/typography';
import { useIsDesktop } from '../../../core/layout/DesktopShell';

// ─── Brand palette ────────────────────────────────────────────────────────────
const BRAND   = '#1E40AF';   // deep blue panel
const ACCENT  = '#2563EB';   // primary blue (buttons, focus)
const ACCENT2 = '#3B82F6';   // lighter blue (decorative)

// ─── Feature list for desktop panel ──────────────────────────────────────────
const FEATURES = [
  { icon: 'clipboard-check-outline', text: 'Sipariş & İş Emri Yönetimi' },
  { icon: 'package-variant-closed',  text: 'Stok & Malzeme Takibi'       },
  { icon: 'file-document-outline',   text: 'Fatura & Cari Hesap'          },
  { icon: 'account-group-outline',   text: 'Çalışan & İzin Yönetimi'      },
];

// ─── FloatingInput ────────────────────────────────────────────────────────────
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
  onFocusChange?: (focused: boolean) => void;
}

function FloatingInput({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType,
  autoCapitalize, returnKeyType, onSubmitEditing, error, rightElement, onFocusChange,
}: FloatingInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const onFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
    Animated.spring(labelAnim, { toValue: 1, tension: 300, friction: 20, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
    if (!value) {
      Animated.spring(labelAnim, { toValue: 0, tension: 300, friction: 20, useNativeDriver: false }).start();
    }
  };

  // Keep label up when value is filled
  useEffect(() => {
    if (value && !isFocused) {
      Animated.spring(labelAnim, { toValue: 1, tension: 300, friction: 20, useNativeDriver: false }).start();
    }
  }, [value]);

  const labelTop  = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -10] });
  const labelSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 11] });
  const labelColor = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.textMuted, isFocused ? ACCENT : C.textSecondary],
  });

  const borderColor = error
    ? C.danger
    : isFocused
    ? ACCENT
    : C.borderMid;

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
  wrap:     { marginBottom: 20 },
  box: {
    position: 'relative',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  label: {
    position: 'absolute',
    left: 16,
    fontFamily: F.medium,
    zIndex: 2,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 2,
  },
  input: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textPrimary,
    paddingTop: 4,
    paddingBottom: 10,
    minHeight: 36,
  },
  right:    { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginLeft: 4 },
  errorText:{ fontSize: 11, fontFamily: F.regular, color: C.danger },
});

// ─── Main LoginScreen ─────────────────────────────────────────────────────────
export function LoginScreen() {
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
    if (!email.trim())               e.email = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Geçerli bir e-posta girin';
    if (!password)                   e.password = 'Şifre gerekli';
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
        setErrorMsg('Hesabınız henüz onaylanmadı. Laborant yöneticisi onayından sonra giriş yapabilirsiniz.');
        triggerShake();
        setLoading(false);
        return;
      }
      if (prof?.user_type === 'doctor' && prof?.approval_status === 'rejected') {
        await supabase.auth.signOut();
        setErrorMsg('Hesabınız reddedildi. Detay için laborant ile iletişime geçin.');
        triggerShake();
        setLoading(false);
        return;
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

  // ── Desktop split layout ──────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={d.root}>
        <BrandPanel />
        <View style={d.formPanel}>
          <ScrollView
            contentContainerStyle={d.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={d.formInner}>
              <FormContent
                mode="lab"
                email={email}         setEmail={setEmail}
                password={password}   setPassword={setPassword}
                loading={loading}     errors={errors}
                errorMsg={errorMsg}   setErrors={setErrors}
                setErrorMsg={setErrorMsg}
                showPass={showPass}   setShowPass={setShowPass}
                forgotMode={forgotMode}       setForgotMode={setForgotMode}
                forgotEmail={forgotEmail}     setForgotEmail={setForgotEmail}
                forgotLoading={forgotLoading} forgotSent={forgotSent}
                forgotError={forgotError}     setForgotError={setForgotError}
                onForgotSubmit={handleForgotPassword}
                onOpenForgot={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
                onLogin={handleLogin}
                btnScale={btnScale}
                shakeX={shakeX}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                onNavigateOther={() => router.push('/(auth)/admin-login')}
                onRegister={() => router.push('/(auth)/register-doctor')}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <View style={m.root}>
      {/* Dark header zone */}
      <View style={m.header}>
        <DecoCircles />
        <View style={[m.headerContent, { paddingTop: insets.top + 24 }]}>
          <View style={m.logoRing}>
            <Image
              source={require('../../../assets/images/icon.png')}
              style={m.logoImg}
              resizeMode="contain"
            />
          </View>
          <Text style={m.appName}>DENTAL LAB</Text>
          <Text style={m.tagline}>Dijital Diş Laboratuvarı</Text>
        </View>
      </View>

      {/* Form card slides up */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={m.kavFlex}
      >
        <Animated.View
          style={[
            m.card,
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
            <FormContent
              mode="lab"
              email={email}         setEmail={setEmail}
              password={password}   setPassword={setPassword}
              loading={loading}     errors={errors}
              errorMsg={errorMsg}   setErrors={setErrors}
              setErrorMsg={setErrorMsg}
              showPass={showPass}   setShowPass={setShowPass}
              forgotMode={forgotMode}       setForgotMode={setForgotMode}
              forgotEmail={forgotEmail}     setForgotEmail={setForgotEmail}
              forgotLoading={forgotLoading} forgotSent={forgotSent}
              forgotError={forgotError}     setForgotError={setForgotError}
              onForgotSubmit={handleForgotPassword}
              onOpenForgot={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
              onLogin={handleLogin}
              btnScale={btnScale}
              shakeX={shakeX}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              onNavigateOther={() => router.push('/(auth)/admin-login')}
              onRegister={() => router.push('/(auth)/register-doctor')}
            />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── BrandPanel (desktop left) ────────────────────────────────────────────────
function BrandPanel() {
  return (
    <View style={bp.panel}>
      <DecoCircles />
      <View style={bp.content}>
        <View style={bp.logoRing}>
          <Image
            source={require('../../../assets/images/icon.png')}
            style={bp.logoImg}
            resizeMode="contain"
          />
        </View>
        <Text style={bp.appName}>DENTAL LAB</Text>
        <Text style={bp.tagline}>Dijital Diş Laboratuvarı Yönetim Sistemi</Text>

        <View style={bp.divider} />

        {FEATURES.map((f, i) => (
          <View key={i} style={bp.featureRow}>
            <View style={bp.featureIcon}>
              <MaterialCommunityIcons name={f.icon as any} size={16} color={ACCENT2} />
            </View>
            <Text style={bp.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <Text style={bp.footer}>YETKİLİ KULLANIM • GÜVENLİ BAĞ</Text>
    </View>
  );
}

const bp = StyleSheet.create({
  panel: {
    width: '42%',
    backgroundColor: BRAND,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingVertical: 60,
    zIndex: 2,
  },
  logoRing: {
    width: 68, height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  logoImg:  { width: 44, height: 44 },
  appName:  {
    fontSize: 26, fontWeight: '800', fontFamily: F.bold,
    color: '#FFFFFF', letterSpacing: 3.5, marginBottom: 8,
  },
  tagline: {
    fontSize: 13, fontFamily: F.regular,
    color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: 36,
  },
  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18,
  },
  featureIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: {
    fontSize: 13.5, fontFamily: F.medium,
    color: 'rgba(255,255,255,0.82)',
  },
  footer: {
    paddingHorizontal: 48, paddingBottom: 28,
    fontSize: 9, fontFamily: F.medium, fontWeight: '600',
    color: 'rgba(255,255,255,0.3)', letterSpacing: 2,
    zIndex: 2,
  },
});

// ─── Decorative background circles ────────────────────────────────────────────
function DecoCircles() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={[dc.circle, { width: 340, height: 340, top: -120, left: -100, opacity: 0.08 }]} />
      <View style={[dc.circle, { width: 240, height: 240, bottom: -60, right: -80, opacity: 0.1  }]} />
      <View style={[dc.circle, { width: 140, height: 140, top: '40%', right: -30,  opacity: 0.07 }]} />
      <View style={[dc.dot, { top: '30%', left: 40,  opacity: 0.25 }]} />
      <View style={[dc.dot, { top: '55%', left: 110, opacity: 0.18 }]} />
      <View style={[dc.dot, { top: '65%', left: 70,  opacity: 0.15 }]} />
      <View style={[dc.dot, { top: '25%', right: 50, opacity: 0.2  }]} />
    </View>
  );
}

const dc = StyleSheet.create({
  circle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
  },
  dot: {
    position: 'absolute',
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});

// ─── FormContent ─────────────────────────────────────────────────────────────
interface FormContentProps {
  mode: 'lab' | 'admin';
  email: string;      setEmail: (v: string) => void;
  password: string;   setPassword: (v: string) => void;
  loading: boolean;
  errors: { email?: string; password?: string };
  setErrors: (e: any) => void;
  errorMsg: string;   setErrorMsg: (v: string) => void;
  showPass: boolean;  setShowPass: (v: boolean) => void;
  forgotMode: boolean;    setForgotMode: (v: boolean) => void;
  forgotEmail: string;    setForgotEmail: (v: string) => void;
  forgotLoading: boolean; forgotSent: boolean;
  forgotError: string;    setForgotError: (v: string) => void;
  onForgotSubmit: () => void;
  onOpenForgot:   () => void;
  onLogin: () => void;
  btnScale: Animated.Value;
  shakeX: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
  onNavigateOther: () => void;
  onRegister?: () => void;
}

function FormContent({
  mode, email, setEmail, password, setPassword, loading, errors, setErrors,
  errorMsg, setErrorMsg, showPass, setShowPass,
  forgotMode, setForgotMode, forgotEmail, setForgotEmail,
  forgotLoading, forgotSent, forgotError, setForgotError,
  onForgotSubmit, onOpenForgot,
  onLogin, btnScale, shakeX, onPressIn, onPressOut, onNavigateOther, onRegister,
}: FormContentProps) {
  const accentColor = mode === 'lab' ? ACCENT : '#0F172A';

  return (
    <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
      {/* Header text */}
      <Text style={fc.welcomeTitle}>Tekrar Hoşgeldiniz</Text>
      <Text style={fc.welcomeSub}>Hesabınıza giriş yapın</Text>

      {/* Segment switcher */}
      <View style={fc.segment}>
        <View style={[fc.segBtn, mode === 'lab' && fc.segBtnActive]}>
          <MaterialCommunityIcons
            name="flask-outline"
            size={13}
            color={mode === 'lab' ? accentColor : C.textMuted}
          />
          <Text style={[fc.segText, mode === 'lab' && { color: accentColor, fontFamily: F.semibold }]}>
            Laboratuvar
          </Text>
        </View>
        <TouchableOpacity
          style={[fc.segBtn, mode === 'admin' && fc.segBtnActive]}
          onPress={onNavigateOther}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name="shield-crown-outline"
            size={13}
            color={mode === 'admin' ? accentColor : C.textMuted}
          />
          <Text style={[fc.segText, mode === 'admin' && { color: accentColor, fontFamily: F.semibold }]}>
            Yönetici
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {errorMsg ? (
        <View style={fc.errorBanner}>
          <MaterialCommunityIcons name="alert-circle" size={15} color={C.danger} />
          <Text style={fc.errorBannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      {/* Fields */}
      <FloatingInput
        label="E-posta adresi"
        value={email}
        onChangeText={v => { setEmail(v); setErrors((p: any) => ({ ...p, email: undefined })); setErrorMsg(''); }}
        placeholder="ornek@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={onLogin}
        error={errors.email}
      />

      <FloatingInput
        label="Şifre"
        value={password}
        onChangeText={v => { setPassword(v); setErrors((p: any) => ({ ...p, password: undefined })); setErrorMsg(''); }}
        secureTextEntry={!showPass}
        returnKeyType="go"
        onSubmitEditing={onLogin}
        error={errors.password}
        rightElement={
          <TouchableOpacity onPress={() => setShowPass(!showPass)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons
              name={showPass ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={C.textMuted}
            />
          </TouchableOpacity>
        }
      />

      {/* Forgot link */}
      <TouchableOpacity
        style={fc.forgotRow}
        onPress={onOpenForgot}
      >
        <Text style={[fc.forgotText, { color: accentColor }]}>Şifremi unuttum</Text>
      </TouchableOpacity>

      {/* Forgot panel */}
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
                  style={[fc.forgotSend, { backgroundColor: accentColor, opacity: forgotLoading ? 0.65 : 1 }]}
                  onPress={onForgotSubmit}
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={fc.forgotSendText}>Gönder</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* Submit button */}
      <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 4 }}>
        <TouchableOpacity
          style={[fc.loginBtn, { backgroundColor: accentColor, opacity: loading ? 0.7 : 1 }]}
          onPress={onLogin}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={loading}
          activeOpacity={1}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={fc.loginBtnText}>Giriş Yap</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Divider + Register */}
      {mode === 'lab' && onRegister && (
        <>
          <View style={fc.divider}>
            <View style={fc.dividerLine} />
            <Text style={fc.dividerText}>veya</Text>
            <View style={fc.dividerLine} />
          </View>
          <TouchableOpacity
            style={[fc.registerBtn, { borderColor: accentColor }]}
            onPress={onRegister}
            activeOpacity={0.8}
          >
            <View style={[fc.registerIcon, { backgroundColor: `${accentColor}15` }]}>
              <DentistIcon size={16} color={accentColor} />
            </View>
            <Text style={[fc.registerText, { color: accentColor }]}>Hekim olarak kayıt ol</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

const fc = StyleSheet.create({
  welcomeTitle: {
    fontSize: 26, fontWeight: '800', fontFamily: F.bold,
    color: C.textPrimary, letterSpacing: -0.5, marginBottom: 6,
  },
  welcomeSub: {
    fontSize: 14, fontFamily: F.regular,
    color: C.textSecondary, marginBottom: 28,
  },

  // Segment
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
    gap: 4,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  segBtnActive: { backgroundColor: '#FFFFFF' },
  segText: {
    fontSize: 13, fontFamily: F.medium, fontWeight: '500',
    color: C.textSecondary,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.dangerBg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 20, borderWidth: 1, borderColor: C.dangerBorder,
  },
  errorBannerText: {
    flex: 1, fontSize: 13, fontFamily: F.regular, color: C.danger, lineHeight: 18,
  },

  // Forgot link
  forgotRow: { alignItems: 'flex-end', marginTop: -8, marginBottom: 20 },
  forgotText: { fontSize: 12, fontFamily: F.semibold, fontWeight: '600' },

  // Forgot panel
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
  forgotSend: {
    flex: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  forgotSendText: { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },

  // Login button
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 16,
  },
  loginBtnText: {
    fontSize: 15, fontWeight: '700', fontFamily: F.bold,
    color: '#FFFFFF', letterSpacing: 0.2,
  },

  // Divider
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: {
    fontSize: 11, fontFamily: F.medium, fontWeight: '500',
    color: C.textMuted, letterSpacing: 0.8,
  },

  // Register button
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13,
  },
  registerIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  registerText: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold },
});

// ─── Desktop layout styles ────────────────────────────────────────────────────
const d = StyleSheet.create({
  root:      { flex: 1, flexDirection: 'row' },
  formPanel: { flex: 1, backgroundColor: '#FAFBFD' },
  formScroll:{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  formInner: {
    width: '100%', maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    margin: 40,
    borderWidth: 1,
    borderColor: C.border,
    // subtle shadow on web
    ...Platform.select({
      web: {
        boxShadow: '0 4px 32px rgba(15,23,42,0.07)',
      } as any,
    }),
  },
});

// ─── Mobile layout styles ─────────────────────────────────────────────────────
const m = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BRAND },
  header: { height: 260, overflow: 'hidden' },
  headerContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 2,
  },
  logoRing: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  logoImg:  { width: 42, height: 42 },
  appName:  {
    fontSize: 22, fontWeight: '800', fontFamily: F.bold,
    color: '#FFFFFF', letterSpacing: 3.5, marginBottom: 6,
  },
  tagline: {
    fontSize: 12, fontFamily: F.regular,
    color: 'rgba(255,255,255,0.65)',
  },
  kavFlex: { flex: 1 },
  card: {
    flex: 1,
    backgroundColor: '#FAFBFD',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  // Drag handle visual affordance
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.borderMid,
    alignSelf: 'center',
    marginVertical: 12,
  },
});
