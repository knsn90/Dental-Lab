// core/ui/mobile/Ring.tsx
// Shared mobile Ring — Aydın Lab handoff dashboard ring.
// Özellikler:
//   • Yumuşak track ring (track color)
//   • Progress arc (color)
//   • Arc end'inde beyaz dot + animasyonlu pulse halo
//   • Merkez children (büyük %)

import React, { useEffect, useRef } from 'react';
import { View, Animated, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface RingProps {
  value: number;                  // 0-100
  size?: number;                  // px
  stroke?: number;                // arc width
  color?: string;                 // progress color
  track?: string;                 // track color
  /** Beyaz dot'u arc'ın sonuna koy ve halo pulse animasyonu çalıştır */
  animatedEndDot?: boolean;
  /** Dot rengi (default: white) */
  dotColor?: string;
  /** Halo rengi (default: dot rengi semi-transparent) */
  haloColor?: string;
  children?: React.ReactNode;
}

export function Ring({
  value,
  size = 200,
  stroke = 14,
  color = '#5B8DEF',
  track = 'rgba(255,255,255,0.10)',
  animatedEndDot = true,
  dotColor = '#FFFFFF',
  haloColor,
  children,
}: RingProps) {
  // Değeri 0-100 aralığına sabitle; NaN/undefined → 0 (animated daire 0'da dursun)
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (v / 100);

  // Dot end position — 12 o'clock'tan saat yönünde v/100 * 360°
  const theta = (v / 100) * 360; // degrees from top, clockwise
  const rad = (theta * Math.PI) / 180;
  const cx = size / 2 + r * Math.sin(rad);
  const cy = size / 2 - r * Math.cos(rad);
  const dotR = stroke * 0.95;
  const haloR = stroke * 1.7;
  const halo = haloColor ?? `${dotColor === '#FFFFFF' ? 'rgba(255,255,255,' : 'rgba(0,0,0,'}0.35)`;

  // Pulse animasyonu — halo dışa yayılır
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.setValue(0);
    // %0 ise animated daire dursun — pulse loop'u sadece ilerleme varken çalışır
    if (v <= 0) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, v]);
  const haloScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track + progress arc */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {v > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
          />
        )}
      </Svg>

      {/* End dot + animated halo — value=0 olsa bile başlangıç noktasında (12 o'clock) göster */}
      {animatedEndDot && v > 0 && v < 100 && (
        <>
          {/* Halo — pulse loop */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - haloR,
              top:  cy - haloR,
              width:  haloR * 2,
              height: haloR * 2,
              borderRadius: haloR,
              backgroundColor: halo,
              transform: [{ scale: haloScale }],
              opacity: haloOpacity,
            }}
          />
          {/* Statik halo (her zaman görünür, daha yumuşak ring) */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - haloR,
              top:  cy - haloR,
              width:  haloR * 2,
              height: haloR * 2,
              borderRadius: haloR,
              backgroundColor: halo,
              opacity: 0.22,
            }}
          />
          {/* Dot — solid */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - dotR,
              top:  cy - dotR,
              width:  dotR * 2,
              height: dotR * 2,
              borderRadius: dotR,
              backgroundColor: dotColor,
              ...(Platform.OS === 'web'
                ? { boxShadow: `0 0 0 2px ${halo}` } as any
                : {}),
            }}
          />
        </>
      )}

      {/* Center children */}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}
