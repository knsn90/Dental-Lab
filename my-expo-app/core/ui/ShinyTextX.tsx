// core/ui/ShinyTextX.tsx
// Magic UI AnimatedShinyText — text üzerinden geçen parlak shimmer.
// Web'de bg-clip-text ile gerçek shimmer; native'de subtle opacity pulse fallback.

import React, { useEffect, useId, useRef } from 'react';
import { Platform, Text, Animated, Easing } from 'react-native';

interface ShinyTextXProps {
  children:    string;
  /** Saniyede bir tam tur. */
  duration?:   number;
  /** Temel renk (shimmer geçmediği yer). */
  baseColor?:  string;
  /** Shimmer renk peak. */
  shineColor?: string;
  /** Tipografi. */
  fontSize?:   number;
  fontWeight?: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase';
}

export function ShinyTextX({
  children,
  duration = 2.4,
  baseColor = '#9CA3AF',
  shineColor = '#0F172A',
  fontSize = 14,
  fontWeight = '700',
  letterSpacing = 0.3,
  textTransform = 'uppercase',
}: ShinyTextXProps) {
  const animId = `shiny-${useId().replace(/:/g, '')}`;
  const opacity = useRef(new Animated.Value(0.7)).current;

  // Native fallback animation
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);

  if (Platform.OS === 'web') {
    return (
      <>
        <style
          // @ts-ignore web-only
          dangerouslySetInnerHTML={{
            __html: `@keyframes ${animId}{0%{background-position:200% 0}100%{background-position:-200% 0}}`,
          }}
        />
        <Text
          // @ts-ignore web-only inline styles
          style={{
            fontSize,
            fontWeight,
            letterSpacing,
            textTransform,
            // bg-clip-text shimmer
            backgroundImage: `linear-gradient(110deg, ${baseColor} 0%, ${baseColor} 40%, ${shineColor} 50%, ${baseColor} 60%, ${baseColor} 100%)`,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent' as any,
            animation: `${animId} ${duration}s linear infinite`,
          } as any}
        >
          {children}
        </Text>
      </>
    );
  }

  // Native — opacity pulse fallback
  return (
    <Animated.Text style={{
      fontSize, fontWeight, letterSpacing, textTransform,
      color: baseColor, opacity,
    }}>
      {children}
    </Animated.Text>
  );
}
