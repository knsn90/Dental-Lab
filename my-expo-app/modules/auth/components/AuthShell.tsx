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
  View, Text, ScrollView, Pressable, Platform,
  KeyboardAvoidingView, useWindowDimensions, StyleSheet, Animated, Easing, AccessibilityInfo,
} from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LabFlowLogo } from '../../../core/ui/LabFlowLogo';
import { SimanWordmark } from '../../../core/ui/SimanWordmark';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, ChevronUp, CheckCircle2, Monitor, Sun, Moon } from '../../../core/ui/icons';
import { SUPPORTED, setLanguage, isRTL, type Lang } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

// ── Auth ekranları için dil seçici (dropdown) — login/register/forgot ─────
// Kapalı: globe + mevcut dil (native ad) + chevron. Açık: native adlı liste,
// seçili olanda check. Dil adları HER ZAMAN native (autoTranslate'e takılmaz).
const LANG_LABELS: Record<string, string> = { tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی' };
const LANG_HAIR = 'rgba(0,0,0,0.06)';
/**
 * Giriş ekranı tema seçici — dil seçicinin yanında duran 3'lü kompakt kontrol
 * (Otomatik / Açık / Koyu). Uygulama içindeki profil menüsüyle aynı görsel dil.
 */
function AuthThemePicker() {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const mode = useThemeModeStore(s => s.mode);
  const setMode = useThemeModeStore(s => s.setMode);

  const opts: Array<{ v: 'system' | 'light' | 'dark'; Icon: any; label: string }> = [
    { v: 'system', Icon: Monitor, label: autoT('Otomatik') },
    { v: 'light',  Icon: Sun,     label: autoT('Açık tema') },
    { v: 'dark',   Icon: Moon,    label: autoT('Koyu tema') },
  ];

  // Minimal ghost segment — kutu/kenarlık yok, yalnız aktif olanın arkasında hafif ton.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {opts.map(o => {
        const on = mode === o.v;
        return (
          <Pressable
            key={o.v}
            onPress={() => setMode(o.v)}
            accessibilityLabel={o.label}
            hitSlop={4}
            style={({ pressed }: any) => ({
              width: 32, height: 30, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)') : 'transparent',
              opacity: pressed ? 0.6 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <o.Icon
              size={14}
              color={on ? (isDark ? (MT.ink as string) : AUTH.ink) : (isDark ? (MT.ink2 as string) : AUTH.inkSoft)}
              strokeWidth={on ? 2.1 : 1.8}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthLangPicker({ compact = false, dropUp = false }: { compact?: boolean; dropUp?: boolean } = {}) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { i18n } = useTranslation();
  const cur = i18n.language;
  const [open, setOpen] = React.useState(false);
  const curLabel = LANG_LABELS[cur] ?? cur;

  const W = compact ? 136 : 264;
  const icon = compact ? 14 : 18;
  const font = compact ? 12 : 14;
  const padH = compact ? 11 : 16;
  const padV = compact ? 7 : 12;
  const radius = compact ? 11 : 14;

  const list = open ? (
    <View style={{
      backgroundColor: isDark ? MT.card : '#FFFFFF', borderRadius: radius, overflow: 'hidden',
      borderWidth: 1, borderColor: isDark ? MT.hairline : LANG_HAIR,
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
              backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent',
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: isDark ? MT.hairline : 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: font, fontWeight: active ? '600' : '500', color: isDark ? MT.ink : AUTH.ink }}>
              {LANG_LABELS[lng] ?? lng}
            </Text>
            {active && <CheckCircle2 size={icon} color={isDark ? (MT.ink3 as string) : AUTH.inkSoft} strokeWidth={1.6} />}
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
          flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 10,
          // compact = ghost (kutu/kenarlık yok); geniş hâli kartlı kalır
          backgroundColor: compact ? 'transparent' : (isDark ? MT.card : '#FFFFFF'), borderRadius: radius,
          paddingHorizontal: compact ? 8 : padH, paddingVertical: compact ? 6 : padV,
          borderWidth: compact ? 0 : 1, borderColor: isDark ? MT.hairline : LANG_HAIR,
          ...(Platform.OS === 'web' ? { cursor: 'pointer', ...(compact ? {} : { boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }) } as any : {}),
        }}
      >
        <Globe size={icon} color={isDark ? (MT.ink2 as string) : AUTH.inkSoft} strokeWidth={1.8} />
        <Text style={{ flex: 1, fontFamily: AUTH_FONT.sans, fontSize: font, fontWeight: compact ? '500' : '600', color: compact ? (isDark ? MT.ink2 : AUTH.inkSoft) : (isDark ? MT.ink : AUTH.ink) }}>
          {curLabel}
        </Text>
        {open
          ? <ChevronUp size={icon} color={isDark ? (MT.ink3 as string) : AUTH.inkSoft} strokeWidth={1.8} />
          : <ChevronDown size={icon} color={isDark ? (MT.ink3 as string) : AUTH.inkSoft} strokeWidth={1.8} />}
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
  inputBg:      '#F3F1EC',   // Hafif krem-gri input bg (off-white ile uyumlu)
  cardBg:       '#FFFFFF',
  pageBg:       '#F6F4EF',   // Off-white — safran artık yalnız accent (eski doygun #FDF6D6 kaldırıldı)
  danger:       '#DC2626',
  success:      '#16A34A',
  // Auth aksanları — lacivert CTA (logo alt tonu) + mavi metin linkleri
  brand:        '#28316F',   // CTA dolgusu, açık tema (logo laciverti)
  brandDark:    '#548DCA',   // Çelik mavi (logo üst tonu) — CTA dolgusu, koyu tema
  link:         '#1D4ED8',   // Metin linki, açık tema (beyaz üstünde ≥4.5:1)
  linkDark:     '#8FB4E6',   // Metin linki, koyu tema
} as const;

export const AUTH_FONT = {
  display: 'Inter Tight, Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  sans:    'Inter Tight, Inter, -apple-system, BlinkMacSystemFont, sans-serif',
};

// ── Arka plan (native): logodan türeyen lacivert tonlu, yavaşça akan blob'lar ──
// Logo gradienti #548dca → #28316f + HERO_NAVY (#004B87 / #001F3F). Web'de aynı
// tonlar CSS mesh olarak çizilir (ensureBlobCss). Blob = SVG radial gradient
// (merkez dolu → kenar şeffaf); CSS blur'a gerek yok, native'de de yumuşak.
type BlobSpec = { id: number; color: string; size: number; top?: string; bottom?: string; start?: string; end?: string };
const PANEL_BLOBS: BlobSpec[] = [
  { id: 1, color: '#3B82F6', size: 600, top: '-16%',   start: '-14%' },   // köşe ışıması (üst-baş)
  { id: 2, color: '#2563EB', size: 560, top: '26%',    end: '-16%'  },   // sağ orta
  { id: 3, color: '#60A5FA', size: 470, bottom: '-12%', end: '-6%'   },   // sağ alt
  { id: 4, color: '#93C5FD', size: 440, bottom: '2%',   start: '-8%' },   // sol alt
  { id: 5, color: '#BFDBFE', size: 380, top: '-6%',     start: '46%' },   // üst orta
];

// Web: GPU'da çalışan CSS keyframe animasyonu (JS'siz). Bir kez <head>'e enjekte edilir.
// `prefers-reduced-motion` açıkken durur. Native: aşağıdaki Animated.loop.
const BLOB_CSS_ID = 'siman-auth-blob-css';
function ensureBlobCss() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(BLOB_CSS_ID)) return;
  const st = document.createElement('style');
  st.id = BLOB_CSS_ID;
  st.textContent = `
/* ── Aurora / mesh gradient (web) — logodan türeyen tek ton: çelik mavi #548dca → lacivert #28316f
      (+ HERO_NAVY #004B87 / #001F3F). Açık tema: lacivert–beyaz · koyu tema: lacivert–siyah. ── */
#siman-auth-mesh,#siman-auth-mesh2{position:absolute;top:-25%;left:-25%;right:-25%;bottom:-25%;pointer-events:none;will-change:transform;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
#siman-auth-mesh{background:
 radial-gradient(40% 46% at 6% 4%, rgba(59,130,246,.55) 0%, rgba(59,130,246,0) 72%),
 radial-gradient(42% 48% at 98% 40%, rgba(37,99,235,.34) 0%, rgba(37,99,235,0) 72%),
 radial-gradient(34% 38% at 86% 98%, rgba(96,165,250,.30) 0%, rgba(96,165,250,0) 72%);
 filter:blur(80px);animation-name:simanMeshA;animation-duration:32s}
#siman-auth-mesh2{background:
 radial-gradient(32% 36% at 22% 92%, rgba(147,197,253,.34) 0%, rgba(147,197,253,0) 72%),
 radial-gradient(28% 32% at 58% 2%, rgba(191,219,254,.45) 0%, rgba(191,219,254,0) 72%);
 filter:blur(95px);animation-name:simanMeshB;animation-duration:44s}
html.dark #siman-auth-mesh{background:
 radial-gradient(50% 50% at 18% 20%, rgba(0,75,135,.85) 0%, rgba(0,75,135,0) 70%),
 radial-gradient(52% 52% at 84% 78%, rgba(40,49,111,.90) 0%, rgba(40,49,111,0) 70%),
 radial-gradient(40% 40% at 78% 16%, rgba(84,141,202,.45) 0%, rgba(84,141,202,0) 70%),
 radial-gradient(36% 36% at 40% 62%, rgba(0,31,63,.90) 0%, rgba(0,31,63,0) 70%)}
html.dark #siman-auth-mesh2{background:
 radial-gradient(40% 40% at 66% 36%, rgba(84,141,202,.35) 0%, rgba(84,141,202,0) 70%),
 radial-gradient(44% 44% at 24% 74%, rgba(0,31,63,.80) 0%, rgba(0,31,63,0) 70%)}
@keyframes simanMeshA{0%{transform:translate3d(0,0,0) rotate(0deg) scale(1)}50%{transform:translate3d(4%,-3%,0) rotate(7deg) scale(1.12)}100%{transform:translate3d(-4%,3%,0) rotate(-5deg) scale(1.06)}}
@keyframes simanMeshB{0%{transform:translate3d(0,0,0) rotate(0deg) scale(1.08)}50%{transform:translate3d(-5%,4%,0) rotate(-9deg) scale(1.2)}100%{transform:translate3d(5%,-2%,0) rotate(8deg) scale(1.02)}}
/* İnce film greni — modern doku; overlay ile hem açık hem koyu zeminde çalışır */
#siman-auth-grain{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;mix-blend-mode:overlay;filter:grayscale(1) contrast(160%);background-size:180px 180px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
/* ── Liquid glass kart: gradient rim (::before) + üst gloss (::after) ── */
#siman-auth-card{position:relative;isolation:isolate}
#siman-auth-card::before{content:"";position:absolute;inset:0;border-radius:20px;padding:1px;pointer-events:none;background:rgba(15,23,42,.06);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
#siman-auth-card::after{content:"";position:absolute;inset:0;border-radius:20px;pointer-events:none;z-index:-1;background:none}
html.dark #siman-auth-card::before{padding:1.6px;background:linear-gradient(135deg,rgba(255,255,255,.85) 0%,rgba(255,255,255,.45) 18%,rgba(255,255,255,.10) 42%,rgba(255,255,255,.05) 58%,rgba(255,255,255,.32) 80%,rgba(255,255,255,.80) 100%)}
html.dark #siman-auth-card::after{background:linear-gradient(160deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,.03) 36%,rgba(255,255,255,0) 60%,rgba(255,255,255,.02) 100%)}
/* Chrome'un otomatik doldurma vurgusu koyu temada beyaz blok gibi patlıyor — alanın kendi zeminiyle ez */
#siman-auth-root input:-webkit-autofill,#siman-auth-root input:-webkit-autofill:hover,#siman-auth-root input:-webkit-autofill:focus{-webkit-text-fill-color:#0A0A0A;-webkit-box-shadow:0 0 0 1000px #F3F4F6 inset;box-shadow:0 0 0 1000px #F3F4F6 inset;caret-color:#0A0A0A;transition:background-color 600000s 0s}
html.dark #siman-auth-root input:-webkit-autofill,html.dark #siman-auth-root input:-webkit-autofill:hover,html.dark #siman-auth-root input:-webkit-autofill:focus{-webkit-text-fill-color:#F7F2E9;-webkit-box-shadow:0 0 0 1000px #22242B inset;box-shadow:0 0 0 1000px #22242B inset;caret-color:#F7F2E9}
@media (prefers-reduced-motion:reduce){#siman-auth-mesh,#siman-auth-mesh2{animation:none!important}}
`;
  document.head.appendChild(st);
}

function AuthBlob({ spec, maxSize, opacity }: { spec: BlobSpec; maxSize: number; opacity: number }) {
  const size = Math.min(spec.size, maxSize);
  const v = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (Platform.OS === 'web') return;   // web: CSS keyframes (ensureBlobCss)
    let anim: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    const dur = (14 + spec.id * 2) * 1000;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      anim = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      anim.start();
    }).catch(() => {});
    return () => { cancelled = true; anim?.stop(); };
  }, [v, spec.id]);

  const drift = size * 0.12 * (spec.id % 2 === 0 ? -1 : 1);
  const nativeTransform = Platform.OS === 'web' ? null : {
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.abs(drift) * 0.8] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  };
  const rtl = isRTL();
  const pos: any = {
    ...(spec.top !== undefined ? { top: spec.top } : {}),
    ...(spec.bottom !== undefined ? { bottom: spec.bottom } : {}),
    ...(spec.start !== undefined ? (rtl ? { right: spec.start } : { left: spec.start }) : {}),
    ...(spec.end !== undefined ? (rtl ? { left: spec.end } : { right: spec.end }) : {}),
  };
  const gid = `simanBlobGrad${spec.id}`;
  return (
    <Animated.View
      pointerEvents="none"
      nativeID={`siman-auth-blob-${spec.id}`}
      style={[{ position: 'absolute', width: size, height: size, opacity }, pos, nativeTransform] as any}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={spec.color} stopOpacity={0.9} />
            <Stop offset="45%"  stopColor={spec.color} stopOpacity={0.45} />
            <Stop offset="100%" stopColor={spec.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

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
  /** Sayfanın sol alt köşesi (RTL'de sağ alt) — kart DIŞINDA duran yasal linkler vb. */
  bottomStart?: React.ReactNode;
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



export function AuthShell({ heading, subtitle, children, footerLink, tone = 'saffron', bottomStart }: Props) {
  const T = tone === 'doctor' ? DOCTOR_TONE : SAFFRON_TONE;
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  React.useEffect(() => { ensureBlobCss(); }, []);

  // ── Ortalanmış glass kart + panel renkli akan gradient zemin ──────
  // Zemin: off-white (koyu: #0E0E0E) üstünde 5 panel-renkli blob (safran/zümrüt/
  // kobalt/plum/teal) yavaşça akar. Kart: yarı saydam + backdrop blur (web),
  // native'de expo-blur BlurView. Görünür alan etiketleri AuthInput'ta.
  // Açık: beyaz zemin + köşelerde yumuşak mavi ışıma · Koyu: lacivert–siyah
  const pageBg = isDark ? '#0B0D12' : '#FFFFFF';
  const blobOpacity = isDark ? 0.5 : 0.7;
  const blobMax = Math.max(320, Math.round(width * 1.25));
  // Liquid glass: düşük alfa zemin + güçlü backdrop blur/saturate. Rim (::before) ve
  // gloss (::after) web'de CSS ile çizilir (ensureBlobCss). Native: BlurView + kenarlık.
  // Açık tema: opak off-white panel + çok hafif gölge (cam açık zeminde okunmuyordu).
  // Koyu tema: liquid glass (yarı saydam + backdrop blur + CSS rim/gloss).
  const glassBg = isDark ? 'rgba(22,20,18,0.42)' : '#FFFFFF';
  const glassBorder = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.08)';   // native kenarlık (web'de CSS rim)
  const isWeb = Platform.OS === 'web';
  const narrow = width < 560;
  const bare = narrow;          // mobil: kart kabuğu (zemin/kenar/gölge/blur) kaldırılır
  const rtl = isRTL();

  return (
    <View nativeID="siman-auth-root" style={{ flex: 1, backgroundColor: pageBg, overflow: 'hidden' }}>
      {isWeb ? (
        <>
          {/* Aurora/mesh gradient + gren — konum, gradient, blur ve animasyon CSS'te */}
          {/* Açık temada akış daha doygun + gren daha belirgin: cam altında bulanan doku camı okutur */}
          <View pointerEvents="none" nativeID="siman-auth-mesh"  style={{ opacity: isDark ? 0.75 : 0.95 }} />
          <View pointerEvents="none" nativeID="siman-auth-mesh2" style={{ opacity: isDark ? 0.60 : 0.85 }} />
          <View pointerEvents="none" nativeID="siman-auth-grain" style={{ opacity: isDark ? 0.10 : 0.04 }} />
        </>
      ) : PANEL_BLOBS.map(b => (
        <AuthBlob key={b.id} spec={b} maxSize={blobMax} opacity={blobOpacity} />
      ))}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, justifyContent: 'center', alignItems: 'center',
            // Mobilde kart tam ekran: kabuk yok, içerik ekranı boydan boya kullanır (24 kenar payı)
            paddingHorizontal: narrow ? 24 : 20,
            paddingTop: Math.max(insets.top, 12) + 24,
            // Alt şerit (linkler + tema/dil) kartla çakışmasın diye altta ek pay (dar ekranda şerit iki satır)
            paddingBottom: Math.max(insets.bottom, 12) + (narrow ? 112 : 64),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View nativeID={bare ? undefined : 'siman-auth-card'} style={{
            // Desktop 440–480 aralığı; iç boşluk her yönde 32.
            // Mobilde kart kabuğu YOK (bare): içerik doğrudan zemin üstünde durur — daha sade.
            width: '100%', maxWidth: 460,
            backgroundColor: bare ? 'transparent' : glassBg,
            borderRadius: bare ? 0 : 20,
            borderWidth: (bare || isWeb) ? 0 : (isDark ? 1.5 : 1),
            borderColor: glassBorder,
            padding: bare ? 0 : 32,
            ...(bare ? {} : isWeb
              ? {
                  ...(isDark ? {
                    backdropFilter: 'blur(40px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                  } : {}),
                  // Koyu: dış gölge + iç spekülerler (liquid glass "ışık tutan kenar"). Açık: çok hafif gölge.
                  boxShadow: isDark
                    ? '0 30px 80px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.28), inset 1px 0 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.06)'
                    : '0 1px 2px rgba(15,23,42,0.03), 0 18px 44px rgba(37,99,235,0.10)',
                } as any
              : { overflow: 'hidden' }),
          }}>
            {Platform.OS !== 'web' && !bare && (
              <BlurView
                intensity={isDark ? 30 : 50}
                tint={isDark ? 'dark' : 'light'}
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
            )}

            {/* Marka kilidi — logo işareti + SIMAN logotype, ortalı */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: bare ? 26 : 30 }}>
              <LabFlowLogo size={bare ? 30 : 28} />
              <SimanWordmark height={bare ? 16 : 15} />
            </View>

            {/* Başlık — ortalı */}
            {typeof heading === 'string' ? (
              <Text style={{
                fontFamily: AUTH_FONT.display, fontSize: 26, fontWeight: '500',
                letterSpacing: -0.4, textAlign: 'center',
                color: isDark ? MT.ink : AUTH.ink,
              }}>
                {heading}
              </Text>
            ) : heading}
            {subtitle ? (
              <Text style={{
                fontFamily: AUTH_FONT.sans, fontSize: 13.5, lineHeight: 19,
                textAlign: 'center', color: isDark ? MT.ink3 : AUTH.inkSoft, marginTop: 8,
              }}>
                {subtitle}
              </Text>
            ) : null}
            {/* "Hesabın yok mu? Kayıt Ol" — başlığın hemen altında, ortalı */}
            {footerLink ? (
              <Text style={{
                fontFamily: AUTH_FONT.sans, fontSize: 13.5, lineHeight: 19, textAlign: 'center',
                color: isDark ? MT.ink3 : AUTH.inkSoft, marginTop: 8,
              }}>
                {footerLink.text}{' '}
                <Text
                  onPress={footerLink.onPress}
                  style={{ color: isDark ? AUTH.linkDark : AUTH.link, fontWeight: '500', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) } as any}
                >
                  {footerLink.linkText}
                </Text>
              </Text>
            ) : null}

            {/* Form (children) — ritim: link → 28 → ilk alan */}
            <View style={{ marginTop: 28 }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Alt şerit — kartın DIŞINDA: başta yasal linkler (bottomStart), sonda tema + dil (ghost).
          Dar ekranda (mobil) dikey: tema/dil üstte, linkler altta tam genişlikte sarar. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute', zIndex: 5, left: 18, right: 18,
          bottom: Math.max(insets.bottom, 12) + 8,
          flexDirection: narrow ? 'column-reverse' : (isRTL() ? 'row-reverse' : 'row'),
          alignItems: narrow ? 'center' : 'flex-end',
          justifyContent: narrow ? 'center' : 'space-between', gap: narrow ? 12 : 16,
        }}
      >
        <View pointerEvents="box-none" style={narrow ? { alignItems: 'center' } : { flex: 1 }}>{bottomStart ?? null}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AuthThemePicker />
          <AuthLangPicker compact dropUp />
        </View>
      </View>
    </View>
  );
}

// ── Reusable inputs ──────────────────────────────────────────────────
/** Glass kart üstünde duran, görünür etiketli input (Circle stili) */
export function AuthInput({
  value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize,
  returnKeyType, onSubmitEditing, error, autoFocus, rightElement, icon, inputRef, label, labelAccessory,
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
  /** Görünür alan etiketi — input'un üstünde küçük başlık. */
  label?: string;
  /** Etiket satırının sağı — örn. "Şifremi unuttum?" linki (modern login kalıbı). */
  labelAccessory?: React.ReactNode;
  /**
   * Alttaki TextInput'a erişim — "Enter → sonraki alan" için gerekli.
   * `returnKeyType="next"` tek başına HİÇBİR ŞEY yapmaz; sadece klavyedeki
   * tuşun etiketini değiştirir. Odağı taşıyan kod olmadan Enter ölüdür.
   */
  inputRef?: React.RefObject<RNTextInput | null>;
}) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [focused, setFocused] = React.useState(false);
  // Etiket input'un İÇİNDE (floating label): boşken ortada placeholder gibi durur,
  // odak/değer gelince üstte küçülür. Görünür etiket korunur, alan minimal kalır.
  const inside = !!label;
  const floated = inside && (focused || value.length > 0);
  const fieldH = inside ? 46 : 42;
  const muted = isDark ? (MT.ink3 as string) : '#6B7280';
  return (
    <View style={{ marginBottom: 14 }}>
      {labelAccessory ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 }}>{labelAccessory}</View>
      ) : null}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, height: fieldH,
        // Referans dizilim: dolgulu, kenarlıksız yumuşak alan; odakta ince mavi kenarlık
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: error
          ? AUTH.danger
          : focused
            ? (isDark ? 'rgba(255,255,255,0.28)' : 'rgba(40,49,111,0.40)')
            : 'transparent',
        ...(Platform.OS === 'web' ? {
          transitionProperty: 'border-color, background-color' as any,
          transitionDuration: '160ms' as any,
        } as any : {}),
      }}>
        {icon}
        <View style={{ flex: 1, height: fieldH, justifyContent: 'center' }}>
          {inside ? (
            <Text
              pointerEvents="none"
              numberOfLines={1}
              style={{
                position: 'absolute', left: 0, right: 0,
                top: floated ? 5 : (fieldH - 20) / 2,
                fontFamily: AUTH_FONT.sans,
                fontSize: floated ? 10.5 : 15, lineHeight: floated ? 12 : 20,
                fontWeight: floated ? '500' : '400',
                color: muted,
                ...(Platform.OS === 'web' ? {
                  transitionProperty: 'top, font-size, line-height' as any,
                  transitionDuration: '140ms' as any,
                } as any : {}),
              }}
            >
              {label}
            </Text>
          ) : null}
          <RNTextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            // Etiket içerideyken placeholder yalnız etiket yukarı kaydığında görünür
            placeholder={inside && !floated ? '' : placeholder}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            autoFocus={autoFocus}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholderTextColor={muted}
            style={{
              width: '100%', height: fieldH,
              // Etiket üstte kalsın diye değer alt yarıya iner
              paddingTop: inside ? 14 : 0, paddingBottom: 0,
              // iOS Safari 16px altı font'ta auto-zoom yapıyor — PWA için kritik
              fontSize: 16, color: isDark ? MT.ink : AUTH.ink,
              fontFamily: AUTH_FONT.sans,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
            } as any}
          />
        </View>
        {rightElement}
      </View>
      {error ? (
        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 11, color: isDark ? '#FCA5A5' : AUTH.danger, marginTop: 5, marginStart: 4, fontWeight: '500',
        }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ── CTA button (mor pill, referansla aynı) ──────────────────────────
export function AuthButton({
  label, onPress, loading, disabled, variant = 'primary', rightIcon, accent, compact,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  rightIcon?: React.ReactNode;
  /** Override primary color — örn. tone="doctor" form'larda yeşil */
  accent?: string;
  /** Kompakt pill (tam genişlik yerine içerik kadar, sağa yaslı) — referans "Login" butonu */
  compact?: boolean;
}) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const isOutline = variant === 'outline';
  // Dolu buton = logo mavisi (açık: lacivert + beyaz metin, koyu: çelik mavi + koyu metin).
  // `accent` verilirse (ör. sage akışları) o renk dolgu + koyu metin.
  const fill = accent ?? (isDark ? AUTH.brandDark : AUTH.brand);
  const fillText = accent ? '#0A0A0A' : (isDark ? '#0A0A0A' : '#FFFFFF');
  const baseStyle = {
    height: 44,
    borderRadius: compact ? 999 : 12,
    alignSelf: (compact ? 'flex-end' : 'stretch') as 'flex-end' | 'stretch',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: compact ? 28 : 18,
    backgroundColor: isOutline ? 'transparent' : fill,
    borderWidth: isOutline ? 1 : 0,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
    opacity: disabled ? 0.45 : loading ? 0.7 : 1,
    ...(Platform.OS === 'web' ? {
      cursor: (disabled || loading) ? 'wait' : 'pointer',
      transitionProperty: 'opacity, transform' as any,
      transitionDuration: '160ms' as any,
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
        fontSize: 14, fontWeight: '600',
        color: isOutline ? (isDark ? MT.ink : AUTH.ink) : fillText,
        letterSpacing: 0,
      }}>
        {loading ? 'Yükleniyor…' : label}
      </Text>
      {!loading && rightIcon ? rightIcon : null}
    </Pressable>
  );
}

// Make sure TextInput import is included
import { TextInput as RNTextInput } from 'react-native';
