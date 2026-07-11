/**
 * AuthShell — Login / Register / Verify / Approval ekranları için paylaşılan layout.
 *
 * Referans tasarım:
 *   • Desktop split: sol form (max 420px) + sağ mor gradient illustration paneli
 *   • Mobile: sadece form (illustration gizli)
 *   • Beyaz kart, ağır border-radius (24px), soft layered shadow
 *   • Brand mark sol üst (Siman logo mark + SIMAN logotype)
 *   • Bottom: "Yeni misin? Kayıt ol" linki
 *
 * Tüm auth ekranları AuthShell'i kullanır; sadece form içeriği değişir.
 */
import React from 'react';
import {
  View, Text, ScrollView, Pressable, Platform, Image,
  KeyboardAvoidingView, useWindowDimensions, StyleSheet, Keyboard,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LabFlowLogo } from '../../../core/ui/LabFlowLogo';
import { SimanWordmark } from '../../../core/ui/SimanWordmark';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react-native';
import { SUPPORTED, setLanguage, type Lang } from '../../../core/i18n';

// ── Auth ekranları için dil seçici (dropdown) — login/register/forgot ─────
// Kapalı: globe + mevcut dil (native ad) + chevron. Açık: native adlı liste,
// seçili olanda check. Dil adları HER ZAMAN native (autoTranslate'e takılmaz).
const LANG_LABELS: Record<string, string> = { tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی' };
const LANG_HAIR = 'rgba(0,0,0,0.06)';
function AuthLangPicker({ compact = false, dropUp = false }: { compact?: boolean; dropUp?: boolean } = {}) {
  const { i18n } = useTranslation();
  const cur = i18n.language;
  const [open, setOpen] = React.useState(false);
  const curLabel = LANG_LABELS[cur] ?? cur;

  const W = compact ? 148 : 264;
  const icon = compact ? 14 : 18;
  const font = compact ? 12 : 14;
  const padH = compact ? 11 : 16;
  const padV = compact ? 7 : 12;
  const radius = compact ? 11 : 14;

  const list = open ? (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: radius, overflow: 'hidden',
      borderWidth: 1, borderColor: LANG_HAIR,
      ...(dropUp
        ? { position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, zIndex: 100 }
        : { marginTop: 8 }),
      ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.12)' } as any : { elevation: 8 }),
    }}>
      {(SUPPORTED as readonly Lang[]).map((lng, i) => {
        const active = cur === lng;
        return (
          <Pressable
            key={lng}
            onPress={() => { setOpen(false); if (!active) setLanguage(lng); }}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: padH, paddingVertical: compact ? 10 : 13,
              backgroundColor: active ? 'rgba(0,0,0,0.03)' : 'transparent',
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: font, fontWeight: active ? '600' : '500', color: AUTH.ink }}>
              {LANG_LABELS[lng] ?? lng}
            </Text>
            {active && <CheckCircle2 size={icon} color={AUTH.inkSoft} strokeWidth={1.6} />}
          </Pressable>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={{ width: W, position: 'relative' }}>
      {dropUp && list}
      {/* Kapalı buton */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10,
          backgroundColor: '#FFFFFF', borderRadius: radius,
          paddingHorizontal: padH, paddingVertical: padV,
          borderWidth: 1, borderColor: LANG_HAIR,
          ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' } as any : {}),
        }}
      >
        <Globe size={icon} color={AUTH.inkSoft} strokeWidth={1.8} />
        <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: font, fontWeight: '600', color: AUTH.ink }}>
          {curLabel}
        </Text>
        {open
          ? <ChevronUp size={icon} color={AUTH.inkSoft} strokeWidth={1.8} />
          : <ChevronDown size={icon} color={AUTH.inkSoft} strokeWidth={1.8} />}
      </Pressable>
      {!dropUp && list}
    </View>
  );
}

// ── ToothIcon — projedeki assets/icons/tooth.svg path'i ──
export function ToothIcon({ size = 20, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.5,23.4c-2.8,0-3.6-6.2-3.6-9.9s-.4-1.7-.7-2.8c-.8-2.3-1.8-5.1,0-7.7C3.3,1.4,4.5.6,6,.6s1.9.3,2.9.6c1,.3,2,.7,3,.7s2.1-.3,3.1-.7c1-.3,1.9-.6,2.9-.6,1.5,0,2.8.8,4,2.4,1.9,2.5.8,5.4,0,7.7-.4,1-.7,2-.7,2.7,0,1.7-.2,9.9-3.6,9.9s-2.9-2.4-3.4-4.6c-.5-2.2-.9-3.5-2.1-3.5s-1.9,1.9-2.4,3.9c-.6,2.1-1.1,4.3-3.1,4.3ZM6,1.4c-1.2,0-2.2.6-3.2,2.1-1.6,2.3-.6,4.7.2,6.9.4,1.1.8,2.2.8,3,0,4.5,1,9.1,2.8,9.1s1.8-1.8,2.3-3.7c.6-2.1,1.2-4.5,3.2-4.5s2.4,2.1,2.9,4.1c.5,2.4,1,4,2.6,4s2.8-4.7,2.8-9.1.4-1.9.8-3c.8-2.2,1.7-4.8,0-7-1.1-1.4-2.1-2.1-3.3-2.1s-1.7.3-2.6.6c-1,.3-2.1.7-3.3.7s-2.3-.4-3.3-.7c-.9-.3-1.8-.6-2.6-.6Z"
        fill={color}
        stroke={color}
        strokeWidth={0.5}
      />
    </Svg>
  );
}

// ── AppleIcon — Apple logo SVG path'i (cross-platform) ──
export function AppleIcon({ size = 22, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.05,20.28c-.98,.95-2.05,.8-3.08,.35-1.09-.46-2.09-.48-3.24,0-1.44,.62-2.2,.44-3.06-.35C2.79,15.25,3.51,7.59,9.05,7.31c1.35,.07,2.29,.74,3.08,.8,1.18-.24,2.31-.93,3.57-.84,1.51,.12,2.65,.72,3.4,1.8-3.12,1.87-2.38,5.98,.48,7.13-.57,1.5-1.31,2.99-2.54,4.09l.01-.01ZM12.03,7.25c-.15-2.23,1.66-4.07,3.74-4.25,.29,2.58-2.34,4.5-3.74,4.25Z" />
    </Svg>
  );
}

// ── Auth design tokens ──────────────────────────────────────────────
// Referans tasarım (Welcome Back · Login phone screen):
//   • Saffron primary CTA + link
//   • Saffron eyebrow ("Welcome Back")
//   • Büyük siyah "Login" heading
//   • Gri pill inputlar
//   • Saffron tonlu page bg
export const AUTH = {
  primary:      '#F5C24B',   // Saffron — CTA, link, eyebrow
  primaryDeep:  '#E0A82E',   // Hover
  primarySoft:  '#FBE5A1',
  accent:       '#F5C24B',
  accentDeep:   '#E0A82E',
  accentSoft:   '#FBF1D4',
  ink:          '#0A0A0A',   // Heading siyah
  inkSoft:      '#475569',
  inkMuted:     '#94A3B8',
  border:       '#E5E7EB',
  inputBg:      '#F5F5F5',   // Hafif gri input bg
  cardBg:       '#FFFFFF',
  pageBg:       '#FDF6D6',   // Saffron-50 — illustration tonu
  danger:       '#DC2626',
  success:      '#16A34A',
} as const;

export const AUTH_FONT = {
  display: 'Inter Tight, Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  sans:    'Inter Tight, Inter, -apple-system, BlinkMacSystemFont, sans-serif',
};

interface Props {
  /** Heading üstünde mini saffron eyebrow ("Welcome Back" tarzı) */
  eyebrow?: string;
  /** Sol kolon başlığı — büyük bold ("Login" tarzı) */
  heading: string | React.ReactNode;
  /** Başlık altı subtitle (1 satır gri) */
  subtitle?: string;
  /** Sağ illustration panelinde gösterilecek emoji/açıklama eyebrow (örn: "Şifresiz, güvenli giriş") */
  illustrationCaption?: string;
  /** Form içeriği (children) */
  children: React.ReactNode;
  /** Bottom link satırı — örn: "Don't have an account? Sign Up" */
  footerLink?: {
    text:       string;     // "Hesabın yok mu?"
    linkText:   string;     // "Kayıt Ol"
    onPress:    () => void;
  };
  /** Tema tonu — saffron (varsayılan, lab/login) veya doctor (sage yeşil, sign-up) */
  tone?: 'saffron' | 'doctor';
  /** Sağ kolon illustration'ını override et (parent'ta require ile geçilir) */
  illustrationSource?: any;
}

// Doctor (sage green) tema — sign up akışı için
const DOCTOR_TONE = {
  primary:     '#7A9B85',
  primaryDeep: '#5C7E68',
  primarySoft: '#D5E2DB',
  accent:      '#7A9B85',
  accentDeep:  '#5C7E68',
  accentSoft:  '#E1ECE5',
  pageBg:      '#E8EFEA',
  gradTop:     '#F1F5F2',
  gradBottom:  '#C9D9CE',
} as const;

const SAFFRON_TONE = {
  primary:     AUTH.primary,
  primaryDeep: AUTH.primaryDeep,
  primarySoft: AUTH.primarySoft,
  accent:      AUTH.accent,
  accentDeep:  AUTH.accentDeep,
  accentSoft:  AUTH.accentSoft,
  pageBg:      AUTH.pageBg,
  gradTop:     '#FFFCEC',
  gradBottom:  '#F9E89A',
} as const;

export function AuthShell({ eyebrow, heading, subtitle, illustrationCaption, children, footerLink, tone = 'saffron', illustrationSource }: Props) {
  const T = tone === 'doctor' ? DOCTOR_TONE : SAFFRON_TONE;
  const illustration = illustrationSource ?? (tone === 'doctor'
    ? require('../../../assets/images/auth-illustration-doctor.png')
    : require('../../../assets/images/auth-illustration.png'));
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // Klavye açıldığında brand mark + illustration'ı gizle ki kart yukarı
  // kayınca karışmasın. Klavye kapanınca tekrar göster.
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  React.useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

  // ── Brand mark (logo + wordmark) ──────────────────────────────────
  // LabFlow gradient stroke logo + wordmark
  const brandMark = (
    <View style={{
      alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 10,
      // Logo arka planla karışmasın diye beyaz kutu (mobil login + PWA splash zemini)
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 14, paddingVertical: 10,
      borderRadius: 14,
    }}>
      <LabFlowLogo size={36} />
      <SimanWordmark height={19} color={AUTH.ink} />
    </View>
  );

  // ── Sol kolon (form) ──────────────────────────────────────────────
  const leftColumn = (
    <View
      style={{
        flex: 1,
        paddingHorizontal: isDesktop ? 56 : 24,
        paddingTop:    isDesktop ? 44 : Math.max(insets.top, 8) + 24,
        paddingBottom: isDesktop ? 44 : Math.max(insets.bottom, 12) + 20,
        // Desktop: 3-band space-between (brand top · form mid · footer bottom)
        // Mobile : flex-start; form ile footer arası flexible spacer
        justifyContent: isDesktop ? 'space-between' : 'flex-start',
      }}
    >
      {/* Top: brand */}
      <View style={{ alignItems: isDesktop ? 'flex-start' : 'center', marginBottom: isDesktop ? 0 : 28 }}>
        {brandMark}
      </View>

      {/* Middle: heading + subtitle + form */}
      <View style={{
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
        gap: 18,
        paddingVertical: isDesktop ? 16 : 0,
      }}>
        <View style={{ alignItems: isDesktop ? 'flex-start' : 'center' }}>
          {/* Eyebrow — saffron uppercase mini başlık (Welcome Back tarzı) */}
          {eyebrow ? (
            <Text style={{
              fontFamily: AUTH_FONT.sans,
              fontSize: 12, fontWeight: '700',
              color: T.primary,
              letterSpacing: 0.6, marginBottom: 6,
              textTransform: 'uppercase' as any,
            }}>
              {eyebrow}
            </Text>
          ) : null}
          {typeof heading === 'string' ? (
            <Text style={{
              fontFamily: AUTH_FONT.display,
              fontSize: isDesktop ? 38 : 28,
              lineHeight: isDesktop ? 42 : 32,
              fontWeight: '800',
              letterSpacing: -0.9,
              color: AUTH.ink,
              textAlign: isDesktop ? 'left' : 'center',
            }}>
              {heading}
            </Text>
          ) : heading}
          {subtitle ? (
            <Text style={{
              fontFamily: AUTH_FONT.sans,
              fontSize: 13, color: AUTH.inkSoft,
              marginTop: 8, lineHeight: 19,
              textAlign: isDesktop ? 'left' : 'center',
              maxWidth: 340,
            }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: isDesktop ? 0 : 8 }}>{children}</View>
      </View>

      {/* Mobile için esnek spacer — footer'ı en alta itsin */}
      {!isDesktop && <View style={{ flex: 1, minHeight: 24 }} />}

      {/* Bottom: footer link (sol) + dil seçici (sağ, aynı satır) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: isDesktop ? 0 : 16 }}>
        {footerLink ? (
          <Text style={{
            flexShrink: 1,
            fontFamily: AUTH_FONT.sans,
            fontSize: 13, color: AUTH.inkSoft,
          }}>
            {footerLink.text}{' '}
            <Text
              onPress={footerLink.onPress}
              style={{
                color: T.primary, fontWeight: '700',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              } as any}
            >
              {footerLink.linkText}
            </Text>
          </Text>
        ) : <View style={{ flexShrink: 1 }} />}
        <AuthLangPicker compact dropUp />
      </View>
    </View>
  );

  // ── Sağ kolon (illustration) — sadece desktop ─────────────────────
  // Custom dental lab illustration — saffron arkaplan + 3D karakter
  const rightColumn = (
    <View
      style={{
        flex: 1,
        borderTopRightRadius: 28,
        borderBottomRightRadius: 28,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        padding: 16,
        alignItems: 'stretch',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Ana illustration — 16px beyaz çerçeve içinde
          (sağ köşeler 28−16=12, sol köşeler 0−16'dan klempli 0 → concentric) */}
      <Image
        source={illustration}
        style={{
          width: '100%',
          height: '100%',
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
        resizeMode="cover"
      />

    </View>
  );

  // ── Outer card (centered on page) ─────────────────────────────────
  if (isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: T.pageBg, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          flex: 1,
          flexDirection: 'row',
          backgroundColor: AUTH.cardBg,
          borderRadius: 28,
          overflow: 'hidden',
          maxWidth: 1080,
          maxHeight: 720,
          width: '100%',
          alignSelf: 'center',
          ...(Platform.OS === 'web' ? {
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
          } as any : {}),
        }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {leftColumn}
          </ScrollView>
          {rightColumn}
        </View>
      </View>
    );
  }

  // Mobile: FULL-SCREEN background image + bottom-sheet card
  // Ref: Dribbble "Premium Login" — illustration tüm ekrana yayılır, form
  // kart alttan kayar gibi binmiş şekilde durur.
  return (
    <View style={{ flex: 1, backgroundColor: '#E5E7EB' /* illustration üst gri/bulut tonu */ }}>
      {/* ── ARKAPLAN: full-screen illustration ──────────────────── */}
      {!keyboardVisible && (
        <Image
          source={illustration}
          resizeMode="cover"
          style={{
            position: 'absolute',
            top: -80, left: 0, right: 0, bottom: 0,
            width: '100%', height: '100%',
          }}
        />
      )}

      {/* Brand mark üst — illustration üzerinde, klavye açıkken gizli */}
      {!keyboardVisible && (
        <View style={{
          position: 'absolute',
          top: Math.max(insets.top, 8) + 14,
          left: 0, right: 0,
          alignItems: 'center',
          zIndex: 2,
        }}>
          {brandMark}
        </View>
      )}

      {/* ── BOTTOM-SHEET KART: alttan kayar ──────────────────────────
         iOS'ta klavyeyi ScrollView.automaticallyAdjustKeyboardInsets yönetir →
         KeyboardAvoidingView'da iOS için padding YOK (çift itme = garip zıplama).
         Android'de KAV 'height' kullanılır (automaticallyAdjust iOS-only). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View
            style={{
              backgroundColor: AUTH.cardBg,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 24,
              paddingTop: 28,
              paddingBottom: Math.max(insets.bottom, 12) + 20,
              ...(Platform.OS === 'ios' ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -8 },
                shadowOpacity: 0.12,
                shadowRadius: 24,
              } : {
                elevation: 12,
              }),
            }}
          >
            {/* Drag handle (görsel ipucu — bottom-sheet hissi) */}
            <View style={{
              alignSelf: 'center',
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#E5E7EB',
              marginBottom: 16,
            }} />

            {/* Eyebrow + heading + subtitle */}
            <View style={{ alignItems: 'flex-start', marginBottom: 18 }}>
              {eyebrow ? (
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 12, fontWeight: '700',
                  color: T.primary,
                  letterSpacing: 0.6, marginBottom: 6,
                  textTransform: 'uppercase' as any,
                }}>
                  {eyebrow}
                </Text>
              ) : null}
              {typeof heading === 'string' ? (
                <Text style={{
                  fontFamily: AUTH_FONT.display,
                  fontSize: 28,
                  lineHeight: 32,
                  fontWeight: '800',
                  letterSpacing: -0.6,
                  color: AUTH.ink,
                }}>
                  {heading}
                </Text>
              ) : heading}
              {subtitle ? (
                <Text style={{
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 13, color: AUTH.inkSoft,
                  marginTop: 6, lineHeight: 19,
                }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {/* Form (children) */}
            <View>{children}</View>

            {/* Footer link (sol) + dil seçici (sağ, aynı satır) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22 }}>
              {footerLink ? (
                <Text style={{
                  flexShrink: 1,
                  fontFamily: AUTH_FONT.sans,
                  fontSize: 13, color: AUTH.inkSoft,
                }}>
                  {footerLink.text}{' '}
                  <Text
                    onPress={footerLink.onPress}
                    style={{
                      color: T.primary, fontWeight: '700',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    } as any}
                  >
                    {footerLink.linkText}
                  </Text>
                </Text>
              ) : <View style={{ flexShrink: 1 }} />}
              <AuthLangPicker compact dropUp />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Cloud SVG shape (decorative) ─────────────────────────────────────
function CloudShape({ style, size = 100 }: { style?: any; size?: number }) {
  // Basit ellipse blob — beyaz, hafif blur
  return (
    <View style={[{
      width: size, height: size * 0.5,
      borderRadius: size,
      backgroundColor: '#FFFFFF',
      ...(Platform.OS === 'web' ? {
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      } as any : {}),
    }, style]} />
  );
}

// ── Reusable inputs ──────────────────────────────────────────────────
/** Beyaz arka planlı, soft shadow'lu, label içermeyen input (referansta olduğu gibi) */
export function AuthInput({
  value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize,
  returnKeyType, onSubmitEditing, error, autoFocus, rightElement, icon,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'characters';
  returnKeyType?: 'next' | 'go' | 'done';
  onSubmitEditing?: () => void;
  error?: string;
  autoFocus?: boolean;
  rightElement?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, height: 44,
        backgroundColor: AUTH.inputBg,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: error
          ? AUTH.danger
          : focused
            ? AUTH.primary
            : 'transparent',
        ...(Platform.OS === 'web' ? {
          boxShadow: focused
            ? `0 0 0 3px ${AUTH.primary}33, 0 1px 2px rgba(0,0,0,0.03)`
            : '0 1px 2px rgba(0,0,0,0.03)',
          transitionProperty: 'box-shadow, border-color' as any,
          transitionDuration: '160ms' as any,
        } as any : {}),
      }}>
        {icon}
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={AUTH.inkMuted}
          style={{
            flex: 1,
            // iOS Safari 16px altı font'ta auto-zoom yapıyor — PWA için kritik
            fontSize: 16, color: AUTH.ink,
            fontFamily: AUTH_FONT.sans,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
          } as any}
        />
        {rightElement}
      </View>
      {error ? (
        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 11, color: AUTH.danger, marginTop: 5, marginLeft: 4, fontWeight: '500',
        }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ── CTA button (mor pill, referansla aynı) ──────────────────────────
export function AuthButton({
  label, onPress, loading, disabled, variant = 'primary', rightIcon, accent,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  rightIcon?: React.ReactNode;
  /** Override primary color — örn. tone="doctor" form'larda yeşil */
  accent?: string;
}) {
  const isOutline = variant === 'outline';
  const primary = accent ?? AUTH.primary;
  const baseStyle = {
    height: 44,
    borderRadius: 999,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 20,
    backgroundColor: isOutline
      ? 'transparent'
      : (disabled || loading)
        ? primary + '99'
        : primary,
    borderWidth: isOutline ? 1 : 0,
    borderColor: AUTH.border,
    opacity: disabled ? 0.5 : 1,
    ...(Platform.OS === 'web' ? {
      cursor: (disabled || loading) ? 'wait' : 'pointer',
      transitionProperty: 'background-color, transform' as any,
      transitionDuration: '160ms' as any,
      boxShadow: isOutline ? 'none' : `0 8px 24px ${primary}55, 0 2px 6px ${primary}33`,
    } as any : {}),
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={baseStyle}
    >
      <Text style={{
        fontFamily: AUTH_FONT.display,
        fontSize: 14, fontWeight: '700',
        color: isOutline ? AUTH.ink : '#FFFFFF',
        letterSpacing: 0.2,
      }}>
        {loading ? 'Yükleniyor…' : label}
      </Text>
      {!loading && rightIcon ? rightIcon : null}
    </Pressable>
  );
}

// Make sure TextInput import is included
import { TextInput as RNTextInput } from 'react-native';
