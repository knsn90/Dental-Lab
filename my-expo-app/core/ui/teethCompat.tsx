// core/ui/teethCompat.tsx
// Drop-in `ActivityIndicator` shim — uygulamadaki tüm spinner'ları diş ikonuna
// çevirir. React Native ActivityIndicator API'siyle aynı (size + color),
// böylece mevcut kodda sadece import yolu değişir, JSX dokunulmaz.
//
// Standart kullanım:
//   import { ActivityIndicator } from 'react-native';   ← önce
//   import { ActivityIndicator } from 'core/ui/teethCompat'; ← sonra

import React from 'react';
import { TeethLoader } from './TeethLoader';

interface AIProps {
  size?: number | 'small' | 'large';
  color?: string;
  style?: any;
  animating?: boolean;
}

export function ActivityIndicator({ size = 'small', color = '#3B82F6', style, animating = true }: AIProps) {
  if (!animating) return null;
  // Daha büyük default — eski ActivityIndicator boyutlarına göre normalize:
  // small ≈ 20 → 36, large ≈ 36 → 64. Numeric verilirse ona değer.
  const pixelSize =
    typeof size === 'number' ? size :
    size === 'large' ? 64 : 36;
  return (
    <TeethLoader inline size={pixelSize} accentColor={color} />
  );
}

export default ActivityIndicator;
