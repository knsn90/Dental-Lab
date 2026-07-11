/**
 * Waveform — Denty sesli mod için canlı dalga formu (çan-şekilli animasyonlu barlar).
 * Panel rengine uyumlu. Native + web (Animated, JS driver — scaleY).
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

export function Waveform({
  bars = 40,
  active = true,
  color = '#6EA8FE',
  height = 56,
}: {
  bars?: number;
  active?: boolean;
  color?: string;
  height?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height }}>
      {Array.from({ length: bars }).map((_, idx) => (
        <Bar key={idx} idx={idx} bars={bars} active={active} color={color} height={height} />
      ))}
    </View>
  );
}

function Bar({ idx, bars, active, color, height }: { idx: number; bars: number; active: boolean; color: string; height: number }) {
  const center = bars / 2;
  const dist = Math.abs(idx - center) / center;
  const base = 0.16 + (1 - dist) * 0.6;
  const peak = Math.min(1, base + 0.34);
  const v = useRef(new Animated.Value(active ? base : base * 0.35)).current;

  useEffect(() => {
    if (!active) {
      Animated.timing(v, { toValue: base * 0.35, duration: 240, useNativeDriver: false }).start();
      return;
    }
    const dur = 520 + (idx % 5) * 120;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: peak, duration: dur * 0.4, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(v, { toValue: base * 0.7, duration: dur * 0.35, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(v, { toValue: base, duration: dur * 0.25, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    const t = setTimeout(() => loop.start(), (idx % 7) * 40);
    return () => { clearTimeout(t); loop.stop(); };
  }, [active, base, peak, idx, v]);

  return (
    <Animated.View
      style={{
        width: 3,
        height: height * 0.92,
        borderRadius: 999,
        backgroundColor: color,
        transform: [{ scaleY: v }],
      }}
    />
  );
}
