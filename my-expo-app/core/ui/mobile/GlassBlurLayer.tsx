// core/ui/mobile/GlassBlurLayer.tsx
// Cam yüzeyin BLUR katmanı — ayrı bir çocuk olarak render edilir.
//
// Neden ayrı: Chromium `backdrop-filter: url(#mercek) blur(7px)` gibi KARIŞIK
// bir zincirde SVG yer değiştirmesini uygulamıyor (ölçüldü: ölçek 0.16→0.80
// arasında fark 1 luminans seviyesi, yani hiç). Mercek tek başına çalışıyor.
// Çözüm iki katman:
//   ebeveyn  → yalnız mercek (refraksiyon)      [navSurfaceStyle]
//   bu çocuk → blur + doygunluk/luminans zinciri
// Çocuğun "backdrop"u ebeveynin boyadığı her şeyi (saptırılmış arka plan +
// tül) içerdiği için zincir iki eleman üzerinden kurulmuş olur ve refraksiyon
// bileşimde YAŞAR (ölçüldü: fark 1.1 → 6.68).
//
// Yüzeyin İLK çocuğu olarak konur: içerik (ikon/metin) sonra boyandığı için
// bu katmandan etkilenmez. Native'de null (backdrop-filter yok; orada blur
// BlurView ile yapılır).

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { navBlurLayerStyle, type NavGlass } from './navGlass';

export function GlassBlurLayer({ glass, radius }: { glass: NavGlass; radius: number }) {
  if (Platform.OS !== 'web') return null;
  const style = navBlurLayerStyle(glass);
  if (!style) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { borderRadius: radius }, style]}
    />
  );
}
