// core/ui/SpotlightBackground.tsx
// Hero card gibi karanlık kartlar üstüne yumuşak, hareketli "spotlight" overlay'i.
// - Web: CSS @keyframes ile 3 ayrı radial-gradient blob'u dolaşır (framer-motion'a gerek yok)
// - Native: Animated.loop ile yumuşak translate/rotate döngüsü (3 blob)
// Renkler dışarıdan `colors` (3'lü tuple) olarak gelir → her panel için kendi tonu.

import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

interface SpotlightBackgroundProps {
  /** 3 farklı blob için yarı saydam renk (rgba). Sırasıyla: sol-üst, orta, sağ. */
  colors: [string, string, string];
  /** Container'ı doldurur — parent görünür alanına yayılır. */
  style?: any;
}

// ─── Web variant — sabit (perf için animasyon kaldırıldı, tasarım korundu) ────
function WebSpotlight({ colors, style }: SpotlightBackgroundProps) {
  // Tüm CSS property'leri inline → className'e ihtiyaç yok
  const blobBase = {
    position:      'absolute' as const,
    borderRadius:  9999,
    pointerEvents: 'none' as const,
    // filter: blur(...) kaldırıldı — radial-gradient kenarları zaten transparan'a fade ediyor
    // ve `filter` GPU'da pahalı bir compositing katmanı yaratıyor (perf)
  };

  const radial = (color: string) =>
    `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 65%)`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {/* SOL anchor — sabit pozisyon, animasyon kaldırıldı (perf) */}
      <View
        // @ts-ignore — backgroundImage RN-Web property
        style={{
          ...blobBase,
          top:    '-30%',
          left:   '-15%',
          width:  '60%',
          height: '160%',
          backgroundImage: radial(colors[0]),
        }}
      />
      {/* ORTA — sabit */}
      <View
        // @ts-ignore
        style={{
          ...blobBase,
          top:    '-15%',
          left:   '25%',
          width:  '55%',
          height: '150%',
          backgroundImage: radial(colors[1]),
        }}
      />
      {/* SAĞ anchor — sabit */}
      <View
        // @ts-ignore
        style={{
          ...blobBase,
          top:    '-25%',
          left:   '55%',
          width:  '60%',
          height: '155%',
          backgroundImage: radial(colors[2]),
        }}
      />
    </View>
  );
}

// ─── Native variant — sabit blob'lar (animasyon kaldırıldı, perf) ─────────────
function NativeSpotlight({ colors, style }: SpotlightBackgroundProps) {
  const blob = (
    color: string,
    base: { top: number; left: number; size: number },
  ) => (
    <View
      pointerEvents="none"
      style={{
        position:        'absolute',
        top:             base.top,
        left:            base.left,
        width:           base.size,
        height:          base.size,
        borderRadius:    base.size / 2,
        backgroundColor: color,
        opacity:         0.7,
      }}
    />
  );

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {blob(colors[0], { top: -120, left: -80,  size: 360 })}
      {blob(colors[1], { top:  -40, left: 120,  size: 320 })}
      {blob(colors[2], { top:  -80, left: 280,  size: 340 })}
    </View>
  );
}

// ─── Public ───────────────────────────────────────────────────────────────────
export function SpotlightBackground(props: SpotlightBackgroundProps) {
  return Platform.OS === 'web'
    ? <WebSpotlight {...props} />
    : <NativeSpotlight {...props} />;
}

export default SpotlightBackground;
