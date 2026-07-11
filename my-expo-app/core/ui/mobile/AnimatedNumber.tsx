// core/ui/mobile/AnimatedNumber.tsx
// Smooth count-up number animation for KPI cards & dashboard metrics.
// On mount or value change, smoothly tweens from previous value to new value.

import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { Easing, Animated } from 'react-native';

interface Props {
  value: number;
  /** Render-time formatter — e.g. (n) => `${Math.round(n)}%` */
  format?: (n: number) => string;
  /** Animation duration in ms (default 700) */
  duration?: number;
  /** Animation delay in ms (default 0) */
  delay?: number;
  style?: StyleProp<TextStyle>;
}

export function AnimatedNumber({ value, format, duration = 700, delay = 0, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const prevTargetRef = useRef(0);
  const [displayed, setDisplayed] = useState<string>(() =>
    (format ?? defaultFormat)(0),
  );

  useEffect(() => {
    const from = prevTargetRef.current;
    const to = value;
    if (from === to) {
      setDisplayed((format ?? defaultFormat)(to));
      return;
    }

    anim.setValue(0);
    const listenerId = anim.addListener(({ value: t }) => {
      const current = from + (to - from) * t;
      setDisplayed((format ?? defaultFormat)(current));
    });

    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // we need JS listener, can't be native
    }).start(() => {
      setDisplayed((format ?? defaultFormat)(to));
      prevTargetRef.current = to;
    });

    return () => anim.removeListener(listenerId);
  }, [value, duration, delay, format, anim]);

  return <Text style={style}>{displayed}</Text>;
}

function defaultFormat(n: number): string {
  return String(Math.round(n));
}
