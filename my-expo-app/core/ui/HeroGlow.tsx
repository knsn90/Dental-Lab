/**
 * HeroGlow — hero kartlarındaki dekoratif ışık lekesi.
 *
 * NEDEN: hero'lar panel accent'i (kobalt/safran/zümrüt) zeminde duruyor ve
 * üstlerinde sabit beyaz daireler var. Koyu temada parlak accent zemin ekranın
 * geri kalanıyla kavga ediyor; beyaz daireler de keskin disk gibi duruyor.
 * Koyu temada zemin derin lacivert/koyu tona iner (`useHeroBg`), daireler ise
 * BLUR ile yayılıp yavaşça nefes alır — disk değil, ışık olur.
 *
 *   const heroBg = useHeroBg(theme.primary);
 *   <View style={{ backgroundColor: heroBg, borderRadius: 20, overflow: 'hidden' }}>
 *     <HeroGlow size={180} opacity={0.20} style={{ top: -50, end: -40 }} />
 *
 * Erişilebilirlik: `prefers-reduced-motion` açıksa hareket durur, blur kalır.
 */
import React, { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, ReduceMotion,
} from 'react-native-reanimated';
import { useThemeModeStore } from '../store/themeModeStore';

/** Hex rengi koyu temada derinleştirir: #4771AB → #1B2B41 (navy). */
export function deepenForDark(hex: string, factor = 0.38): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Hex → HSL hue (0-360). Mavi ailesini ayırt etmek için. */
function hueOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * Koyu tema lacivert paleti (kullanıcı seçimi) — mavi accent'lerin karşılığı.
 *   from  #001F3F  en derin (gradyan başlangıcı, zemin)
 *   to    #002A5C  orta ton (düz zemin gerektiğinde bu kullanılır)
 *   light #004B87  açık ton (gradyan bitişi, hover, vurgu)
 */
export const HERO_NAVY = { from: '#001F3F', to: '#002A5C', light: '#004B87' } as const;

/**
 * AÇIK temada ilerleme/timeline ışık izi. Lacivert ailesinden ama beyaz
 * zeminde "neon" okunacak kadar doygun: HERO_NAVY.light'ın (#004B87)
 * parlaklığı ve doygunluğu artırılmış hâli. Doğrudan #314F7E gibi koyu
 * lacivert kullanmak beyaz üstünde sert bir şerit yapıyordu.
 */
export const NAVY_SWEEP = '#1E7FD4';

/**
 * Hero yüzeyi — `...heroBg` olarak yayılır (renk + web'de gradyan).
 * Açık tema: panel accent'i (değişmez). Koyu tema: mavi accent'lerde
 * `#001F3F → #002A5C` lacivert gradyan; diğer panellerde accent'in derin tonu
 * (safran/zümrüt kimliği korunur, yalnız kararır).
 * Native'de gradyan yok → düz koyu ton (web-first koyu tema).
 */
export function useHeroSurface(accent: string, factor = 0.38): any {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  if (!isDark) return { backgroundColor: accent };
  const h = hueOf(accent);
  const isBlue = h !== null && h >= 185 && h <= 265;
  const from = isBlue ? HERO_NAVY.from  : deepenForDark(accent, factor * 0.72);
  const mid  = isBlue ? HERO_NAVY.to    : deepenForDark(accent, factor);
  const to   = isBlue ? HERO_NAVY.light : deepenForDark(accent, factor * 1.28);
  return {
    backgroundColor: mid,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(135deg, ${from} 0%, ${mid} 58%, ${to} 100%)` }
      : {}),
  };
}

/** Hex'i açar (koyu temada accent'in "neon" karşılığını üretmek için). */
export function lightenForDark(hex: string, amount = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const up = (v: number) => Math.round(v + (255 - v) * amount);
  return `#${[up((n >> 16) & 255), up((n >> 8) & 255), up(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * "Spotlight" yüzeyi — Hızlı İşlem kartının dili: koyu temada siyah→lacivert
 * gradyan, ÜSTTEN yayılan ışık ve neon kenar. Mavi accent'lerde lacivert palet,
 * diğer panellerde accent'in derin tonu kullanılır (panel kimliği korunur).
 * Açık temada `null` döner — çağıran kendi açık tasarımını korur.
 */
export function useSpotlightSurface(accent: string): { surface: any; glow: string } | null {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  if (!isDark) return null;
  const h = hueOf(accent);
  const isBlue = h !== null && h >= 185 && h <= 265;
  const deep = isBlue ? HERO_NAVY.from  : deepenForDark(accent, 0.28);
  const mid  = isBlue ? HERO_NAVY.to    : deepenForDark(accent, 0.40);
  const top  = isBlue ? HERO_NAVY.light : deepenForDark(accent, 0.58);
  const glow = isBlue ? '#38BDF8' : lightenForDark(accent, 0.30);
  return {
    glow,
    surface: {
      backgroundColor: deep,
      ...(Platform.OS === 'web' ? {
        backgroundImage:
          `radial-gradient(120% 78% at 50% -10%, ${alpha(top, 0.95)} 0%, ${alpha(mid, 0.55)} 42%, rgba(0,0,0,0) 76%), ` +
          `linear-gradient(160deg, #0A0A0A 0%, ${deep} 62%, ${mid} 100%)`,
      } : {}),
      borderWidth: 1,
      borderColor: alpha(glow, 0.26),
    },
  };
}

/**
 * Neon kenar + üstten ışık NABZI — `useSpotlightSurface` ile birlikte kullanılır.
 * Yalnız opacity/scale animasyonu (compositor dostu); reduced-motion'da sabit.
 * Kartın İÇİNE, içerikten ÖNCE koyulur; `pointerEvents:none`.
 */
export function NeonPulse({ radius = 24, color = '#38BDF8' }: { radius?: number; color?: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (prefersReducedMotion()) { p.value = 1; return; }
    p.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      -1, true,
    );
    return () => cancelAnimation(p);
  }, [p]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + p.value * 0.45,
    transform: [{ scale: 1 + p.value * 0.08 }],
  }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: 0.22 + p.value * 0.48 }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[
        { position: 'absolute', top: 0, start: 0, end: 0, height: '72%' },
        Platform.OS === 'web'
          ? ({ backgroundImage: `radial-gradient(110% 100% at 50% -10%, ${alpha(color, 0.28)} 0%, rgba(0,0,0,0) 72%)` } as any)
          : null,
        glowStyle,
      ]} />
      <Animated.View pointerEvents="none" style={[
        {
          position: 'absolute', top: 0, start: 0, end: 0, bottom: 0,
          borderRadius: radius, borderWidth: 1, borderColor: color,
        },
        Platform.OS === 'web'
          ? ({ boxShadow: `0 0 18px ${alpha(color, 0.35)}, inset 0 0 22px ${alpha(color, 0.10)}` } as any)
          : null,
        borderStyle,
      ]} />
    </>
  );
}

/** Lacivert ailenin AÇIK ucu — koyu zeminde metin/ikon için (#004B87 metin olarak okunmaz). */
export const NAVY_INK = '#5AA9E6';

/**
 * Accent'in koyu temadaki iki karşılığı:
 *   fill → dolgu/zemin (buton, rozet, ring)  · maviyse #004B87
 *   ink  → metin/ikon/kenarlık               · maviyse #5AA9E6
 * Açık temada ikisi de accent'in kendisidir (light bit-bit korunur).
 * Mavi olmayan panellerde (safran/zümrüt) kimlik korunur, ink hafif açılır.
 */
export function useAccentTones(accent: string): { fill: string; ink: string } {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  if (!isDark) return { fill: accent, ink: accent };
  const h = hueOf(accent);
  const isBlue = h !== null && h >= 185 && h <= 265;
  if (isBlue) return { fill: HERO_NAVY.light, ink: NAVY_INK };
  return { fill: accent, ink: lightenForDark(accent, 0.16) };
}

/** Yalnız renk gereken yerler için (gradyan yok). */
export function useHeroBg(accent: string, factor = 0.38): string {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  if (!isDark) return accent;
  const h = hueOf(accent);
  return h !== null && h >= 185 && h <= 265 ? HERO_NAVY.to : deepenForDark(accent, factor);
}

/** Kullanıcı "hareketi azalt" dediyse animasyon çalışmasın (web). */
export function prefersReducedMotion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function HeroGlow({
  size = 160,
  opacity = 0.18,
  color = '#FFFFFF',
  delay = 0,
  style,
}: {
  size?: number;
  /** Açık temadaki alfa; koyu temada blur yayıldığı için bir tık yükseltilir. */
  opacity?: number;
  color?: string;
  delay?: number;
  style?: any;
}) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width } = useWindowDimensions();
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (prefersReducedMotion()) { breathe.value = 0; return; }
    breathe.value = withRepeat(
      withTiming(1, { duration: 7000 + delay, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [breathe, delay]);

  // Nefes: ölçek + hafif kayma. Genlik küçük — kart içinde yayılan ışık hissi,
  // dikkat çeken bir hareket değil.
  const anim = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + breathe.value * 0.14 },
      { translateX: breathe.value * 10 },
      { translateY: breathe.value * -8 },
    ],
    opacity: 1 - breathe.value * 0.18,
  }));

  const alpha = isDark ? Math.min(opacity * 1.5, 0.4) : opacity;
  // Blur yarıçapı kürenin boyutuyla ölçeklenir; dar ekranda taşmasın diye kısılır.
  const blur = Math.round(Math.min(size, width) * (isDark ? 0.22 : 0.12));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color === '#FFFFFF'
            ? `rgba(255,255,255,${alpha})`
            : color,
        },
        Platform.OS === 'web' ? ({ filter: `blur(${blur}px)` } as any) : null,
        style,
        anim,
      ]}
    />
  );
}
