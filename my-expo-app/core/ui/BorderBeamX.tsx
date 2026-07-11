// core/ui/BorderBeamX.tsx
// Magic UI BorderBeam'in RN/Expo Web port'u — conic gradient + CSS spin animation.
// Web-only; native platformlarda null döner (sessizce devre dışı).

import React, { useId } from 'react';
import { Platform, View } from 'react-native';

interface BorderBeamXProps {
  /** Beam'in yörüngesi tamamlanma süresi (saniye). */
  duration?:    number;
  /** Border kalınlığı (px). */
  borderWidth?: number;
  /** Renk gradient başlangıcı. */
  colorFrom?:   string;
  /** Renk gradient bitişi. */
  colorTo?:     string;
  /** Border radius — parent'ın radius'una eşitle. Default 'inherit'. */
  borderRadius?: number | string;
  /** Ters yön. */
  reverse?:     boolean;
}

export function BorderBeamX({
  duration = 6,
  borderWidth = 1.5,
  colorFrom = '#3B82F6',
  colorTo = '#A855F7',
  borderRadius = 'inherit',
  reverse = false,
}: BorderBeamXProps) {
  // Hook'lar koşulsuz olmalı — useId'i her zaman çağır, sonra web check'i yap
  const rawId = useId();
  if (Platform.OS !== 'web') return null;
  const animId = `bb-${rawId.replace(/:/g, '')}`;
  const fromDeg = reverse ? 360 : 0;
  const toDeg   = reverse ? 0 : 360;

  // @ts-ignore web-only inline CSS
  const styleTag = (
    <style
      // @ts-ignore web
      dangerouslySetInnerHTML={{
        __html: `@keyframes ${animId}{from{transform:rotate(${fromDeg}deg)}to{transform:rotate(${toDeg}deg)}}`,
      }}
    />
  );

  return (
    <View
      pointerEvents="none"
      // @ts-ignore web styles
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius,
        overflow: 'hidden',
      }}
    >
      {styleTag}
      <View
        // @ts-ignore web styles
        style={{
          position: 'absolute',
          // 200% beam'in dönerken her köşeyi dolaşmasını sağlar
          top: '-50%', left: '-50%',
          width: '200%', height: '200%',
          background: `conic-gradient(from 0deg, transparent 0deg, transparent 270deg, ${colorFrom} 320deg, ${colorTo} 360deg)`,
          animation: `${animId} ${duration}s linear infinite`,
        } as any}
      />
      {/* İç maske — sadece ince border bandı görünür */}
      <View
        pointerEvents="none"
        // @ts-ignore web styles
        style={{
          position: 'absolute',
          top: borderWidth, left: borderWidth,
          right: borderWidth, bottom: borderWidth,
          borderRadius,
          backgroundColor: 'inherit',
        } as any}
      />
    </View>
  );
}
