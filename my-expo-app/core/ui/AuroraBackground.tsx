// core/ui/AuroraBackground.tsx
//
// Aurora animasyonlu arka plan — React Native Web uyumlu uyarlama.
// Kaynak: aceternity-ui Aurora Background (Next.js + Tailwind orijinali).
//
// Web'de gerçek CSS gradient + keyframe + mix-blend-difference animasyonu.
// Native'de soft fallback (animasyonsuz pastel mesh).
//
// Kullanım:
//   <View style={{ position: 'relative', overflow: 'hidden' }}>
//     <AuroraBackground />
//     <YourContent />
//   </View>
//
// Liquid glass için: AuroraBackground arkada → cam üstünde backdrop-filter
// blur → mesh sürekli hareket eder, cam onu bulanıklaştırır → CANLI etki.

import React, { useEffect } from 'react';
import { View, Platform, StyleSheet, ViewStyle } from 'react-native';

export interface AuroraBackgroundProps {
  /** Üst-sağ köşeden radial fade (true varsayılan, full-bleed için false) */
  showRadialGradient?: boolean;
  /** 0–1 arası opacity (cam'a sızacak renk yoğunluğu) */
  intensity?: number;
  /** Aurora renk paleti — varsayılan sky/violet */
  palette?: 'sky' | 'sunset' | 'mint' | 'aurora';
  /** Animasyon süresi (saniye) */
  durationSec?: number;
  /** Ek style override */
  style?: ViewStyle;
}

const PALETTES: Record<NonNullable<AuroraBackgroundProps['palette']>, string[]> = {
  // Sky — Apple Liquid Glass tarzı serin mavi/lavanta
  sky:    ['#0EA5E9', '#BAE6FD', '#7DD3FC', '#DDD6FE', '#38BDF8'],
  // Sunset — sıcak turuncu/pembe
  sunset: ['#F472B6', '#FCA5A5', '#FDBA74', '#FCD34D', '#FB7185'],
  // Mint — yeşil/turkuaz
  mint:   ['#10B981', '#A7F3D0', '#6EE7B7', '#A5F3FC', '#34D399'],
  // Aurora — orijinal aceternity teması (mavi/indigo/violet)
  aurora: ['#3B82F6', '#A5B4FC', '#93C5FD', '#C4B5FD', '#60A5FA'],
};

/** Web için gradient string'ini hazırla — palette renklerini eşit aralıklarla diz */
function buildAuroraGradient(palette: string[]): string {
  // 100deg açıyla repeating-linear-gradient: 5 renk %10–%30 aralığında
  const stops = [
    `${palette[0]} 10%`,
    `${palette[1]} 15%`,
    `${palette[2]} 20%`,
    `${palette[3]} 25%`,
    `${palette[4]} 30%`,
  ].join(', ');
  return `repeating-linear-gradient(100deg, ${stops})`;
}

const WHITE_STRIPES =
  'repeating-linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 7%, transparent 10%, transparent 12%, #FFFFFF 16%)';

const RADIAL_MASK =
  'radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%)';

/** Native fallback için statik soft mesh (animasyon yok) */
function NativeFallback({
  palette,
  intensity,
  showRadialGradient: _radial,
  style,
}: AuroraBackgroundProps) {
  // basit gradient — react-native-svg üzerinden çiziyoruz olabilir ama
  // ekstra paket yüklememek için layered View'lar yeterli
  const colors = PALETTES[palette ?? 'sky'];
  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colors[1], opacity: (intensity ?? 0.5) * 0.5 },
        ]}
      />
    </View>
  );
}

export function AuroraBackground({
  showRadialGradient = true,
  intensity = 0.5,
  palette = 'sky',
  durationSec = 60,
  style,
}: AuroraBackgroundProps) {
  // Inject keyframes once on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'aurora-bg-keyframes';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes auroraBgMove {
        from { background-position: 50% 50%, 50% 50%; }
        to   { background-position: 350% 50%, 350% 50%; }
      }
    `;
    document.head.appendChild(el);
  }, []);

  if (Platform.OS !== 'web') {
    return <NativeFallback {...{ palette, intensity, showRadialGradient, style }} />;
  }

  const auroraGradient = buildAuroraGradient(PALETTES[palette]);
  const bgImage   = `${WHITE_STRIPES}, ${auroraGradient}`;
  const maskStyle = showRadialGradient
    ? { maskImage: RADIAL_MASK, WebkitMaskImage: RADIAL_MASK }
    : {};

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      {/* Outer aurora layer */}
      <View
        // @ts-ignore — web-only inline styles
        style={{
          position: 'absolute',
          top: -10, right: -10, bottom: -10, left: -10,
          opacity: intensity,
          filter: 'blur(10px) invert(1)',
          willChange: 'transform',
          pointerEvents: 'none',
          backgroundImage: bgImage,
          backgroundSize: '300%, 200%',
          backgroundPosition: '50% 50%, 50% 50%',
          ...maskStyle,
        }}
      >
        {/* After pseudo — animated mix-blend-difference layer */}
        <View
          // @ts-ignore
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: bgImage,
            backgroundSize: '200%, 100%',
            backgroundAttachment: 'fixed',
            mixBlendMode: 'difference',
            animation: `auroraBgMove ${durationSec}s linear infinite`,
            pointerEvents: 'none',
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none' as any,
  },
});

export default AuroraBackground;
