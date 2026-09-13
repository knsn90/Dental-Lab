// core/ui/SupportIcon.tsx
//
// Destek (headset) ikonu — kullanıcının verdiği SVG (support-technology, viewBox 448).
// Fill tabanlı ama ince-outline çizim olduğu için line ikon dilinde okunur.
// Lucide çağrı imzasıyla uyumlu: size + color (fill'e maplenir); strokeWidth yok sayılır.
// Can simidi (LifeBuoy) yerine tüm destek yerlerinde kullanılır.

import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number; // Lucide uyumluluğu için kabul edilir, kullanılmaz (fill ikon)
  [key: string]: any;
}

export function SupportIcon({ size = 24, color = 'currentColor', strokeWidth: _sw, ...rest }: Props) {
  // İkonun ham çizgisi bizim Lucide ikonlardan ~%50 ince kalıyordu (referansla
  // yan yana render'da doğrulandı). Aynı renkte stroke ~16 (448-uzay) ekleyince
  // kalınlık Lucide (~1.8 @ 24) ile eşleşir. viewBox 9px padding'li ki stroke
  // kenarlarda kesilmesin (kullanıcının "kalın" SVG'sindeki desen).
  return (
    <Svg width={size} height={size} viewBox="-9 -9 466 466" fill={color} stroke={color} strokeWidth={16} strokeLinejoin="round" strokeLinecap="round" {...rest}>
      <Path d="M384,172.4C384,83.6,312.4,12,224,12S64,83.6,64,172c0,0,0,0,0,0.4C28.4,174.4,0,204,0,240v8c0,37.6,30.4,68,68,68h3.6l28.4,45.2c20,32,54,50.8,91.6,50.8h5.6c3.6,13.6,16,24,30.8,24c17.6,0,32-14.4,32-32c0-17.6-14.4-32-32-32c-14.8,0-27.2,10.4-30.8,24h-5.6c-32,0-61.2-16.4-78-43.6L90.4,316H96c8.8,0,16-7.2,16-16V188c0-8.8-7.2-16-16-16H80c0-79.6,64.4-144,144-144s144,64.4,144,144h-16c-8.8,0-16,7.2-16,16v112c0,8.8,7.2,16,16,16h28c37.6,0,68-30.4,68-68v-8C448,204,419.6,174.4,384,172.4z M228,388c8.8,0,16,7.2,16,16s-7.2,16-16,16s-16-7.2-16-16S219.2,388,228,388z M96,188v112H68c-28.8,0-52-23.2-52-52v-8c0-28.8,23.2-52,52-52H96z M432,248c0,28.8-23.2,52-52,52h-28V188h28c28.8,0,52,23.2,52,52V248z" />
      <Path d="M290.4,72.4c-0.8-0.4-2-1.2-3.2-2c-1.2-0.8-2.4-1.6-3.2-2c-3.6-2.4-8.8-1.2-10.8,2.8S272,79.6,276,82c0.8,0.4,2,1.2,3.2,2s2.4,1.6,3.6,2c1.2,0.8,2.8,1.2,4,1.2c2.8,0,5.2-1.2,6.8-4C295.6,79.6,294.4,74.8,290.4,72.4z" />
      <Path d="M224,52c-34,0-66,14.8-88,40.4c-2.8,3.2-2.4,8.4,0.8,11.2c1.6,1.2,3.2,2,5.2,2c2.4,0,4.4-0.8,6-2.8c19.2-22,46.8-34.8,76-34.8c7.2,0,14.4,0.8,21.6,2.4c4.4,0.8,8.4-2,9.6-6s-2-8.4-6-9.6C240.8,52.8,232.4,52,224,52z" />
    </Svg>
  );
}
