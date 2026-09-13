/**
 * LoginScreen — Beyaz tema + mor gradient illustration panel
 * Referans: Dribbble Finnger login design
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Platform, Animated, Keyboard, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Check, WifiOff, ShieldAlert, RefreshCw, X } from '../../../core/ui/icons';

// "Beni Hatırla" preference — localStorage'da saklanır.
// OFF olursa: sayfa kapanırken supabase.auth.signOut çağrılır (tab close → logout).
// ON (default): persistSession davranışı standart (oturum kalıcı).
const REMEMBER_KEY = 'auth_remember_me';
function readRemember(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  const v = window.localStorage.getItem(REMEMBER_KEY);
  return v === null ? true : v === 'true';
}
function writeRemember(v: boolean) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(REMEMBER_KEY, String(v));
}

// Brute-force koruması: 3 başarısız denemeden sonra password login disable,
// kullanıcı e-postaya gelen 6 haneli OTP ile giriş yapmak zorunda.
// Counter per-email, SESSION-STORAGE'da saklanır → tab kapanınca sıfırlanır.
// (localStorage çok agresif; eski test entry'leri kullanıcıyı OTP'ye kilitliyordu.)
const MAX_PWD_ATTEMPTS = 3;
const FAIL_KEY_PREFIX = 'auth_fail_';

// Migration: eski localStorage entry'lerini bir kez temizle
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    Object.keys(window.localStorage).forEach((k) => {
      if (k.startsWith(FAIL_KEY_PREFIX)) window.localStorage.removeItem(k);
    });
  } catch { /* */ }
}

function readFailCount(email: string): number {
  if (typeof window === 'undefined' || !window.sessionStorage) return 0;
  const v = window.sessionStorage.getItem(FAIL_KEY_PREFIX + email.toLowerCase());
  return v ? Math.min(MAX_PWD_ATTEMPTS, Number(v) || 0) : 0;
}
function bumpFailCount(email: string): number {
  if (typeof window === 'undefined' || !window.sessionStorage) return 0;
  const k = FAIL_KEY_PREFIX + email.toLowerCase();
  const next = (Number(window.sessionStorage.getItem(k)) || 0) + 1;
  window.sessionStorage.setItem(k, String(next));
  return next;
}
function clearFailCount(email: string) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(FAIL_KEY_PREFIX + email.toLowerCase());
}
import { signIn } from '../api';
import { supabase } from '../../../core/api/supabase';
import { useKioskMode } from '../../../core/kiosk/kioskModeStore';
import { AuthShell, AuthInput, AuthButton, AUTH, AUTH_FONT } from '../components/AuthShell';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

export function LoginScreen() {
  const router = useRouter();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Mobil sadeleştirme eşiği — AuthShell'deki `narrow` ile aynı (kart kabuğu kalkar)
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 560;

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string }>({});
  const [errorMsg, setErrorMsg] = useState('');

  const [remember, setRemember] = useState<boolean>(readRemember);

  // remember=false ise sayfa kapatılınca signOut (sadece web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (remember) return;
    const handler = () => { try { supabase.auth.signOut(); } catch { /* noop */ } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [remember]);

  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent,    setForgotSent]    = useState(false);
  const [forgotError,   setForgotError]   = useState('');

  // OTP fallback (brute-force protection)
  const OTP_LENGTH = 6;
  const [otpMode, setOtpMode] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpCode = otpDigits.join('');
  const setOtpCode = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpDigits(prev => Array.from({ length: OTP_LENGTH }, (_, i) => clean[i] ?? ''));
  };
  const otpRefs = useRef<(TextInput | null)[]>([]);
  /** Şifre alanı — e-postada Enter'a basınca odak buraya geçer. */
  const passRef = useRef<TextInput>(null);
  const handleOtpBoxChange = (idx: number, v: string) => {
    const digit = (v.replace(/\D/g, '').slice(-1)) || '';
    setOtpDigits(prev => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    setErrorMsg('');
    if (digit && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKey = (idx: number, key: string) => {
    if (key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
      setOtpDigits(prev => { const n = [...prev]; n[idx - 1] = ''; return n; });
    }
  };
  const [otpSending, setOtpSending] = useState(false);
  const [otpSentNotice, setOtpSentNotice] = useState('');

  // Honeypot — invisible field; bot doldurursa submit silently reject olur
  const [hp, setHp] = useState('');

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

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim())                     e.email    = 'E-posta gerekli';
    else if (!/\S+@\S+\.\S+/.test(email))  e.email    = 'Geçerli bir e-posta girin';
    if (!password)                         e.password = 'Şifre gerekli';
    setErrors(e);
    if (Object.keys(e).length) triggerShake();
    return Object.keys(e).length === 0;
  };

  // OTP gönder (passwordless magic-code)
  const sendLoginOtp = async (targetEmail: string) => {
    setOtpSending(true); setErrorMsg(''); setOtpSentNotice('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setErrorMsg(error.message || 'OTP gönderilemedi.');
      } else {
        setOtpSentNotice(`6 haneli kod ${targetEmail} adresine gönderildi.`);
      }
    } finally { setOtpSending(false); }
  };

  // OTP + şifre 2-katmanlı doğrula → login
  // 1) verifyOtp ile token doğrula (Supabase session açar)
  // 2) signInWithPassword ile şifreyi de kontrol et — yanlışsa signOut
  // Sonuç: hem OTP hem şifre doğru olmadan login yok (defense in depth).
  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) { setErrorMsg('6 haneli kodu eksiksiz gir.'); triggerShake(); return; }
    if (!password) { setErrorMsg('Şifreni de gir — OTP ile birlikte şifre de gerekli.'); triggerShake(); return; }
    setLoading(true); setErrorMsg('');
    const emailLc = email.trim().toLowerCase();

    // 1) OTP doğrula
    const { error: otpErr } = await supabase.auth.verifyOtp({
      email: emailLc, token: otpCode, type: 'email',
    });
    if (otpErr) {
      setLoading(false);
      setErrorMsg('Kod hatalı veya süresi dolmuş.');
      triggerShake();
      return;
    }
    // 2) Şifreyi de kontrol et — verifyOtp session açtı ama biz hala şifre doğruluğunu istiyoruz
    const { error: pwdErr } = await supabase.auth.signInWithPassword({ email: emailLc, password });
    if (pwdErr) {
      // Şifre yanlışsa açılan OTP session'unu kapat
      await supabase.auth.signOut();
      setLoading(false);
      setErrorMsg('Kod doğru ama şifre yanlış. Tekrar dene.');
      triggerShake();
      return;
    }
    // İkisi de başarılı: sayaç sıfırla, OTP mode kapat + kiosk bayrağını temizle
    useKioskMode.getState().setKiosk(false);
    setLoading(false);
    clearFailCount(emailLc);
    setOtpMode(false); setOtpCode(''); setOtpSentNotice('');
  };

  const handleLogin = async () => {
    if (!validate()) return;

    // 3 başarısız sonra password'lu giriş kapalı — OTP mode'a geç
    const fails = readFailCount(email.trim().toLowerCase());
    if (fails >= MAX_PWD_ATTEMPTS) {
      if (!otpMode) {
        setOtpMode(true);
        await sendLoginOtp(email.trim().toLowerCase());
      }
      return;
    }
    // KRİTİK iOS 26.4 beta crash fix:
    //
    // Crash zinciri (eski davranış):
    //   1) Login butonuna basılıyor
    //   2) signIn() resolve → router.replace → login screen view siliniyor
    //   3) Email/password TextInput hâlâ first responder olduğu için iOS
    //      resignFirstResponder zincirini başlatıyor
    //   4) UIKeyboardSceneDelegate setInputViews → UISystemKeyboardDockController
    //      Accessibility globe-key hesaplaması yapıyor
    //   5) iOS 26.4 beta'da TIInputModeController.supportedInputModeIdentifiers
    //      nil array'a NSArray.arrayByAddingObjectsFromArray: çağırıp objc_msgSend'i
    //      nil'e gönderiyor → uncaught Obj-C exception → TurboModule queue rethrow
    //      → abort → app crash.
    //
    // Çözüm: Login screen kaldırılmadan ÖNCE TextInput'ları first-responder'lıktan
    // çıkar ve keyboard hide animasyonunu eventiyle bekle.
    Keyboard.dismiss();
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      // keyboardDidHide tetiklenirse keyboard tamamen gitti
      const sub = Keyboard.addListener('keyboardDidHide', () => {
        sub.remove();
        finish();
      });
      // Klavye zaten kapalıydı veya event gelmedi → fallback (iOS animation ~280ms)
      setTimeout(() => { try { sub.remove(); } catch { /* */ } finish(); }, 450);
    });
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await signIn(email.trim().toLowerCase(), password);
    if (error) {
      const raw = (error as any)?.message ?? '';
      // Hatalı şifre sayacı bump (sadece kimlik/şifre hatalarında)
      const isCredErr = /invalid login|invalid grant|invalid credentials/i.test(raw);
      let newFails = fails;
      if (isCredErr) newFails = bumpFailCount(email.trim().toLowerCase());

      const remain = Math.max(0, MAX_PWD_ATTEMPTS - newFails);
      const credMsg = remain > 0
        ? `E-posta veya şifre hatalı. (${remain} hak kaldı)`
        : 'Çok fazla başarısız deneme. E-posta OTP ile devam etmen gerekiyor.';
      const msg = isCredErr                                ? credMsg
                : /email not confirmed/i.test(raw)         ? 'E-posta adresini doğrulaman gerekiyor.'
                : /network|fetch|failed to fetch/i.test(raw) ? 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.'
                : raw || 'Giriş başarısız oldu.';
      setErrorMsg(msg);
      // eslint-disable-next-line no-console
      console.warn('[login] signIn error:', raw, error);
      triggerShake();
      setLoading(false);
      // Limit aşıldıysa OTP mode'a geç, kod gönder
      if (isCredErr && newFails >= MAX_PWD_ATTEMPTS) {
        setOtpMode(true);
        sendLoginOtp(email.trim().toLowerCase());
      }
      return;
    }
    // Başarılı login → fail counter sıfırla
    if (data?.user) clearFailCount(email.trim().toLowerCase());
    if (data?.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_type, approval_status, is_active')
        .eq('id', data.user.id)
        .single();
      if (prof?.user_type === 'doctor' && prof?.approval_status === 'pending') {
        await supabase.auth.signOut();
        setErrorMsg('Hesabınız henüz onaylanmadı. Laboratuvar onayından sonra giriş yapabilirsiniz.');
        triggerShake(); setLoading(false); return;
      }
      if (prof?.user_type === 'doctor' && prof?.approval_status === 'rejected') {
        await supabase.auth.signOut();
        setErrorMsg('Hesabınız reddedildi. Detay için laboratuvar ile iletişime geçin.');
        triggerShake(); setLoading(false); return;
      }
    }
    // Normal e-posta/şifre girişi kiosk DEĞİLDİR → cihazda kalmış kiosk bayrağını
    // temizle (tablet silindiğinde ayarların geri gelmemesi buradan kaynaklanıyordu).
    useKioskMode.getState().setKiosk(false);
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setForgotError('Geçerli bir e-posta girin'); return;
    }
    setForgotLoading(true); setForgotError('');
    const { error } = await supabase.auth.resetPasswordForEmail(
      forgotEmail.trim().toLowerCase(),
      { redirectTo: 'https://siman.app/reset-password' },
    );
    setForgotLoading(false);
    if (error) { setForgotError('E-posta gönderilemedi. Tekrar deneyin.'); return; }
    setForgotSent(true);
  };

  return (
    <AuthShell
      eyebrow={forgotMode ? 'Şifre Sıfırlama' : 'Tekrar Hoş Geldin'}
      heading={forgotMode ? 'Şifremi Unuttum' : 'Giriş Yap'}
      subtitle={forgotMode ? 'Sıfırlama bağlantısı için e-postanı gir.' : undefined}
      illustrationCaption="Üretimi yönetir, kârını gösterir."
      footerLink={forgotMode ? undefined : {
        text: 'Hesabın yok mu?',
        linkText: 'Kayıt Ol',
        onPress: () => router.push('/(auth)/register-choice'),
      }}
      bottomStart={(
        /* iyzico kriteri: giriş ekranında yasal sayfa linkleri görünür — kartın dışında,
           sol alt köşede (ödeme logoları fatura sayfasında). */
        <View style={{
          flexDirection: 'row', flexWrap: 'wrap', gap: narrow ? 14 : 16,
          justifyContent: narrow ? 'center' : 'flex-start',
          maxWidth: 380,
        }}>
          {[
            { href: '/legal/hakkimizda', label: 'Hakkımızda' },
            { href: '/legal/mesafeli-satis', label: 'Mesafeli Satış' },
            { href: '/legal/teslimat-iade', label: 'Teslimat & İade' },
            { href: '/legal/gizlilik', label: 'Gizlilik / KVKK' },
          ].map(l => (
            <Pressable key={l.href} onPress={() => router.push(l.href as any)} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
              {/* Footer karttan daha sessiz: küçük punto, ~%55 ink */}
              <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, fontWeight: '500', color: isDark ? 'rgba(247,242,233,0.50)' : 'rgba(26,22,19,0.55)' }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
        {/* Error banner — premium alert card (3 tipte: network / credentials / generic) */}
        {errorMsg ? (() => {
          const isNetwork = /bağlan|sunucu|internet|network|fetch/i.test(errorMsg);
          const isCred = /şifre hatalı|hak kaldı|başarısız deneme|OTP/i.test(errorMsg);
          const Icon = isNetwork ? WifiOff : isCred ? ShieldAlert : AlertCircle;
          const tone = isNetwork ? '#0EA5E9' : isCred ? '#F59E0B' : AUTH.danger;
          const toneSoft = isNetwork ? 'rgba(14,165,233,0.08)' : isCred ? 'rgba(245,158,11,0.08)' : 'rgba(220,38,38,0.06)';
          const toneRing = isNetwork ? 'rgba(14,165,233,0.18)' : isCred ? 'rgba(245,158,11,0.20)' : 'rgba(220,38,38,0.16)';
          const title = isNetwork ? 'Sunucuya bağlanılamadı'
                      : isCred ? 'Giriş yapılamadı'
                      : 'Hata';
          const desc  = isNetwork
            ? 'İnternet bağlantını kontrol et veya birkaç saniye sonra tekrar dene.'
            : errorMsg;
          return (
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 12,
              backgroundColor: isDark ? T.card : '#FFFFFF',
              borderRadius: 14, padding: 14, marginBottom: 16,
              borderWidth: 1, borderColor: toneRing,
              shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
            }}>
              {/* Icon circle */}
              <View style={{
                width: 36, height: 36, borderRadius: 999,
                backgroundColor: toneSoft,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={17} color={tone} strokeWidth={2.2} />
              </View>
              {/* Title + Description */}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                {isNetwork || isCred ? (
                  <Text style={{
                    fontFamily: AUTH_FONT.display,
                    fontSize: 13.5, fontWeight: '700',
                    color: isDark ? T.ink : AUTH.ink, letterSpacing: -0.1,
                  }}>
                    {title}
                  </Text>
                ) : null}
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 12.5, color: isDark ? T.ink3 : AUTH.inkSoft, lineHeight: 18,
                }}>
                  {desc}
                </Text>
                {/* Network durumunda 'Tekrar dene' aksiyonu */}
                {isNetwork && (
                  <Pressable
                    onPress={() => { setErrorMsg(''); /* yeniden submit kullanıcıya bırak — sadece banner kapanır */ }}
                    style={({ hovered }: any) => ({
                      alignSelf: 'flex-start',
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      marginTop: 6, paddingHorizontal: 10, paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: hovered ? toneSoft : 'transparent',
                      borderWidth: 1, borderColor: toneRing,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <RefreshCw size={11} color={tone} strokeWidth={2.4} />
                    <Text style={{
                      color: tone, fontSize: 11, fontWeight: '700',
                      fontFamily: AUTH_FONT.sans,
                    }}>
                      Yeniden dene
                    </Text>
                  </Pressable>
                )}
              </View>
              {/* Dismiss */}
              <Pressable
                onPress={() => setErrorMsg('')}
                hitSlop={6}
                style={({ hovered }: any) => ({
                  width: 22, height: 22, borderRadius: 11,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hovered ? (isDark ? 'rgba(255,255,255,0.06)' : '#F4F4F5') : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <X size={12} color={isDark ? (T.ink3 as string) : AUTH.inkMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
          );
        })() : null}

        {/* ───── FORGOT MODE ───── */}
        {forgotMode ? (
          <>
            {forgotSent ? (
              // Başarı paneli
              <View style={{
                padding: 16, borderRadius: 12, marginBottom: 16,
                backgroundColor: 'rgba(22,163,74,0.06)',
                borderWidth: 1, borderColor: 'rgba(22,163,74,0.22)',
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 8,
                  backgroundColor: 'rgba(22,163,74,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={14} color={AUTH.success} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 13, fontWeight: '700', color: isDark ? T.ink : AUTH.ink }}>
                    E-posta gönderildi
                  </Text>
                  <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11, color: isDark ? T.ink3 : AUTH.inkSoft, marginTop: 2 }}>
                    Gelen kutunu kontrol et.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                {/* Bilgilendirme */}
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 13, color: isDark ? T.ink3 : AUTH.inkSoft,
                  marginBottom: 14, lineHeight: 19,
                }}>
                  E-posta adresini gir, sana sıfırlama bağlantısı gönderelim.
                </Text>
                {/* Forgot email input */}
                <AuthInput
                  value={forgotEmail}
                  onChangeText={v => { setForgotEmail(v); setForgotError(''); }}
                  placeholder="ornek@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={forgotError}
                  label="E-posta"
                  autoFocus
                />
                {/* Send button — kompakt pill, sağa yaslı (login CTA ile aynı dizilim) */}
                <View style={{ marginTop: 4, alignItems: 'flex-end' }}>
                  <AuthButton
                    compact
                    label={forgotLoading ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
                    onPress={handleForgotPassword}
                    loading={forgotLoading}
                  />
                </View>
              </>
            )}
            {/* Geri dönüş */}
            <View style={{ alignItems: 'center', marginTop: 18 }}>
              <Pressable
                onPress={() => { setForgotMode(false); setForgotSent(false); setForgotError(''); }}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
              >
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 13.5, color: isDark ? AUTH.linkDark : AUTH.link, fontWeight: '500',
                }}>
                  ← Giriş sayfasına dön
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          /* ───── LOGIN MODE ───── */
          <>
            {/* OTP banner — fail limit aşıldıysa kullanıcıyı bilgilendir */}
            {otpSentNotice ? (
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                backgroundColor: 'rgba(22,163,74,0.06)',
                borderRadius: 10, padding: 12, marginBottom: 14,
                borderStartWidth: 3, borderStartColor: AUTH.success,
              }}>
                <Check size={14} color={AUTH.success} strokeWidth={2.4} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.success, lineHeight: 18 }}>
                  {otpSentNotice}
                </Text>
              </View>
            ) : null}

            {/* E-posta */}
            <AuthInput
              value={email}
              onChangeText={v => { setEmail(v); setErrors(p => ({ ...p, email: undefined })); setErrorMsg(''); }}
              placeholder="ornek@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              // Enter → şifre alanına geç. `returnKeyType="next"` yazıyordu ama
              // odağı taşıyan kod yoktu; e-postada Enter'a basmak hiçbir şey
              // yapmıyor, kullanıcı da "Enter ile giriş olmuyor" diyordu.
              onSubmitEditing={() => passRef.current?.focus()}
              error={errors.email}
              label="E-posta"
              icon={<Mail size={16} color={isDark ? (T.ink3 as string) : '#6B7280'} strokeWidth={1.7} />}
            />

            {/* OTP mode'da 6-box OTP input + ayrıca Şifre (2 katman) */}
            {otpMode && (
              <>
                <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-start', marginTop: 4, marginBottom: 8 }}>
                  {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                    <TextInput
                      key={i}
                      ref={ref => { otpRefs.current[i] = ref; }}
                      value={otpDigits[i]}
                      onChangeText={(v) => handleOtpBoxChange(i, v)}
                      onKeyPress={(e) => handleOtpKey(i, (e as any).nativeEvent?.key)}
                      keyboardType="number-pad"
                      maxLength={1}
                      autoFocus={i === 0}
                      style={{
                        width: 36, height: 44, borderRadius: 9,
                        borderWidth: otpDigits[i] ? 1.5 : 1,
                        borderColor: otpDigits[i] ? (isDark ? T.ink : AUTH.ink) : (isDark ? T.hairline : 'rgba(15,23,42,0.12)'),
                        backgroundColor: isDark ? T.cardSoft : '#FFFFFF',
                        textAlign: 'center', fontSize: 17, fontWeight: '700',
                        color: isDark ? T.ink : AUTH.ink,
                        ...(Platform.OS === 'web' ? {
                          outlineStyle: 'none',
                          boxShadow: otpDigits[i] ? `0 0 0 2px ${AUTH.primary}33` : '0 1px 2px rgba(0,0,0,0.03)',
                          transitionProperty: 'box-shadow, border-color' as any,
                          transitionDuration: '160ms' as any,
                        } : {}),
                      } as any}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 11.5, color: isDark ? T.ink3 : AUTH.inkSoft }}>
                    {otpSending ? 'Kod gönderiliyor…' : '6 haneli kodu e-postandan al · Şifreni de gir'}
                  </Text>
                  <Pressable
                    onPress={() => sendLoginOtp(email.trim().toLowerCase())}
                    disabled={otpSending}
                    style={Platform.OS === 'web' ? { cursor: otpSending ? 'wait' : 'pointer' } as any : undefined}
                  >
                    <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.primary, fontWeight: '700' }}>
                      Yeniden Gönder
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Şifre — her zaman göster (OTP mode'da bile gerekli) */}
            <AuthInput
                value={password}
                onChangeText={v => { setPassword(v); setErrors(p => ({ ...p, password: undefined })); setErrorMsg(''); }}
                placeholder="••••••••••••"
                inputRef={passRef}
                secureTextEntry={!showPass}
                returnKeyType="go"
                onSubmitEditing={otpMode ? handleOtpVerify : handleLogin}
                error={errors.password}
                label="Şifre"
                icon={<Lock size={16} color={isDark ? (T.ink3 as string) : '#6B7280'} strokeWidth={1.7} />}
                rightElement={
                  <Pressable
                    onPress={() => setShowPass(!showPass)}
                    hitSlop={8}
                    style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                  >
                    {showPass
                      ? <EyeOff size={15} color={isDark ? (T.ink3 as string) : AUTH.inkSoft} strokeWidth={1.8} />
                      : <Eye size={15} color={isDark ? (T.ink3 as string) : AUTH.inkSoft} strokeWidth={1.8} />
                    }
                  </Pressable>
                }
              />

            {/* Beni Hatırla — lacivert checkbox (mobilde ortalı) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: narrow ? 'center' : 'flex-start', marginTop: -2, marginBottom: narrow ? 18 : 14 }}>
              <Pressable
                onPress={() => { setRemember(v => { const n = !v; writeRemember(n); return n; }); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingVertical: 4, paddingEnd: 8,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <View style={{
                  width: 16, height: 16, borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: remember
                    ? (isDark ? AUTH.brandDark : AUTH.brand)
                    : (isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,23,42,0.28)'),
                  backgroundColor: remember ? (isDark ? AUTH.brandDark : AUTH.brand) : 'transparent',
                  // (Beni Hatırla kutusu da CTA ile aynı lacivert)
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {remember && <Check size={11} color={isDark ? '#0A0A0A' : '#FFFFFF'} strokeWidth={3} />}
                </View>
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 13, color: isDark ? T.ink2 : '#3F3F46', fontWeight: '500',
                }}>
                  Beni Hatırla
                </Text>
              </Pressable>
            </View>

            {/* Masaüstü: solda "Şifremi unuttum" + sağda kompakt pill CTA.
                Mobil (sade): tam genişlik CTA, altında ortalı "Şifremi unuttum". */}
            {narrow ? (
              <>
                <AuthButton
                  label={otpMode ? 'Kodu Doğrula' : 'Giriş Yap'}
                  onPress={otpMode ? handleOtpVerify : handleLogin}
                  loading={loading || otpSending}
                  rightIcon={<ArrowRight size={16} color={isDark ? '#0A0A0A' : '#FFFFFF'} strokeWidth={2} />}
                />
                <View style={{ alignItems: 'center', marginTop: 14 }}>
                  <Pressable
                    onPress={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
                    hitSlop={6}
                    style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                  >
                    <Text style={{
                      fontFamily: AUTH_FONT.sans, fontSize: 13.5, fontWeight: '500',
                      color: isDark ? AUTH.linkDark : AUTH.link,
                    }}>
                      Şifremi unuttum
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Pressable
                  onPress={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false); setForgotError(''); }}
                  hitSlop={6}
                  style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                >
                  <Text style={{
                    fontFamily: AUTH_FONT.sans,
                    fontSize: 13.5, fontWeight: '500',
                    color: isDark ? AUTH.linkDark : AUTH.link,
                  }}>
                    Şifremi unuttum
                  </Text>
                </Pressable>
                <AuthButton
                  compact
                  label={otpMode ? 'Kodu Doğrula' : 'Giriş Yap'}
                  onPress={otpMode ? handleOtpVerify : handleLogin}
                  loading={loading || otpSending}
                  rightIcon={<ArrowRight size={16} color={isDark ? '#0A0A0A' : '#FFFFFF'} strokeWidth={2} />}
                />
              </View>
            )}

            {/* OTP'den şifre moduna dön */}
            {otpMode && (
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <Pressable
                  onPress={() => {
                    // Sayaç/kilit KORUNUR — mod değişimi brute-force sayacını sıfırlamaz
                    setOtpMode(false); setOtpCode(''); setOtpSentNotice(''); setErrorMsg('');
                  }}
                  style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                >
                  <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: isDark ? T.ink2 : AUTH.inkSoft, fontWeight: '600' }}>
                    ← Şifre ile giriş yap
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </Animated.View>

    </AuthShell>
  );
}
