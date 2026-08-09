// core/ui/PulseRing.tsx
// Rozetlerin (bildirim / mesaj / onay sayaçları) arkasından yayılan nabız halkası.
// Dikkat çekmek için: rozet boyutunda bir daire 1→2.6 büyüyüp saydamlaşarak döngüde atar.
//
// Kullanım: rozet View'ından HEMEN ÖNCE, aynı absolute konuma koy → halka rozetin
// altından yayılır. `pointerEvents="none"` olduğu için tıklamayı engellemez.
//
// Cross-platform: transform(scale)+opacity tabanlı Animated (web'de JS-driven, native'de
// useNativeDriver). CSS @keyframes'in RN karşılığı.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

interface Props {
  /** Halka çapı — rozet boyutuyla aynı ver (varsayılan 14). */
  size?: number;
  /** Halka rengi — rozetin rengiyle aynı olsun (varsayılan kırmızı). */
  color?: string;
  /** Bir atımın süresi (ms). */
  duration?: number;
  /** Absolute konum — rozetle birebir aynı ver. */
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
}

export function PulseRing({ size = 14, color = '#DC2626', duration = 1800, top, right, left, bottom }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, duration]);

  const scale = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 2.6, 2.6] });
  const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 0, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top, right, left, bottom,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}
