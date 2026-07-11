// core/ui/mobile/HeroGlowOverlay.tsx
// Hero card için cross-platform "radial glow" overlay.
// Web: CSS radial-gradient (sıcak, geniş feather'lı blob'lar)
// Native: SVG RadialGradient (4-stop opacity feather — gerçek yumuşak halo,
//         iOS/Android'da solid circle yerine gradient hissi)
//
// Kullanım:
//   <View style={{ ..., backgroundColor: HERO_BG, overflow: 'hidden' }}>
//     <HeroGlowOverlay color={LAB.primary} />
//     ...content...
//   </View>

import React from 'react';
import { View, Platform } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';

export interface HeroGlowOverlayProps {
  /** Accent rengi (panel.primary) — glow'un base hue'su */
  color: string;
  /** "warm" (default, sol üst sıcak + sağ alt accent) veya "single" (sadece sağ üst tek glow) */
  variant?: 'warm' | 'single';
}

export function HeroGlowOverlay({ color, variant = 'warm' }: HeroGlowOverlayProps) {
  if (Platform.OS === 'web') {
    if (variant === 'single') {
      return (
        <View
          // @ts-ignore
          pointerEvents="none"
          style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 100,
            // @ts-ignore
            backgroundImage: `radial-gradient(circle at center, ${color}CC, ${color}55 35%, transparent 70%)`,
          } as any}
        />
      );
    }
    return (
      <>
        <View
          // @ts-ignore
          pointerEvents="none"
          style={{
            position: 'absolute', top: -50, right: -50, width: 260, height: 260, borderRadius: 130,
            // @ts-ignore
            backgroundImage: `radial-gradient(circle at center, ${color}CC, ${color}55 35%, transparent 70%)`,
          } as any}
        />
        <View
          // @ts-ignore
          pointerEvents="none"
          style={{
            position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90,
            // @ts-ignore
            backgroundImage: `radial-gradient(circle at center, ${color}66, transparent 65%)`,
          } as any}
        />
      </>
    );
  }

  // Native (iOS/Android): SVG RadialGradient — gerçek feather'lı glow
  if (variant === 'single') {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="hero-glow-single" cx="85%" cy="10%" rx="60%" ry="60%" fx="85%" fy="10%">
              <Stop offset="0%" stopColor={color} stopOpacity="0.80" />
              <Stop offset="35%" stopColor={color} stopOpacity="0.35" />
              <Stop offset="70%" stopColor={color} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-glow-single)" />
        </Svg>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/* Sol üst sıcak glow — yoğun merkez, geniş feather */}
          <RadialGradient id="hero-glow-tl" cx="15%" cy="10%" rx="75%" ry="75%" fx="15%" fy="10%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <Stop offset="35%" stopColor={color} stopOpacity="0.35" />
            <Stop offset="70%" stopColor={color} stopOpacity="0.08" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
          {/* Sağ alt soft accent */}
          <RadialGradient id="hero-glow-br" cx="90%" cy="100%" rx="55%" ry="55%" fx="90%" fy="100%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <Stop offset="60%" stopColor={color} stopOpacity="0.10" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-glow-tl)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-glow-br)" />
      </Svg>
    </View>
  );
}
