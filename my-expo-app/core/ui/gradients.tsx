/**
 * gradients — web/native'de AYNI görünen gradyan dolguları.
 *
 * RN'de CSS `backgroundImage` yalnız web'de çalışır; native'de gradyan/blur yok.
 * Bu yüzden native'de SVG ile birebir aynısını çiziyoruz (react-native-svg zaten kurulu).
 * Kapsayıcının içine ilk MUTLAK çocuk olarak konur; içerik üstünde çizilir.
 */
import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Defs, Stop, Rect, LinearGradient as SvgLinearGradient, RadialGradient } from 'react-native-svg';

/**
 * Doğrusal gradyan dolgu. `angle` CSS ile aynı anlamda (135deg = sol-üst → sağ-alt).
 * Kapsayıcı `overflow:'hidden'` + borderRadius ile kırpılır.
 */
export function GradientFill({
  from, to, angle = 135, radius = 0,
}: { from: string; to: string; angle?: number; radius?: number }) {
  const uid = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius, backgroundImage: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)` } as any]}
      />
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={from} />
            <Stop offset="100%" stopColor={to} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${uid})`} />
      </Svg>
    </View>
  );
}

/**
 * Yumuşak radial ışıma (hero'daki büyük ışık daireleri).
 * Native'de blur olmadığı için düz daire SERT görünür → SVG radial ile şeffaflığa erir.
 * Kendi kapsayıcısını doldurur; boyut/konum dışarıdan verilir.
 */
export function RadialGlow({
  color = '#FFFFFF', opacity = 0.2, stopAt = 68,
}: { color?: string; opacity?: number; stopAt?: number }) {
  const uid = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundImage: `radial-gradient(circle, ${hexA(color, opacity)}, ${hexA(color, 0)} ${stopAt}%)` } as any]}
      />
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={uid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset={`${stopAt}%`} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${uid})`} />
      </Svg>
    </View>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
