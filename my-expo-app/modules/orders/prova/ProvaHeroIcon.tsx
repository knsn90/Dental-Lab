/**
 * Hero "Prova" hap düğmesinin ikonu: takvim ikonu + sağ üstte durum noktası.
 * Hero'daki PillBtn'in ikon yuvasına (size/color/strokeWidth) uyar; böylece düğme
 * satırdaki diğer haplarla aynı stilde kalır (tek stil kuralı).
 */
import React from 'react';
import { View } from 'react-native';
import { CalendarClock } from '../../../core/ui/icons';

export type ProvaDot = 'none' | 'amber' | 'red' | 'green';
const DOT: Record<Exclude<ProvaDot, 'none'>, string> = { amber: '#E89B2A', red: '#D94B4B', green: '#2D9A6B' };

const cache: Partial<Record<ProvaDot, React.ComponentType<any>>> = {};

/** Nokta rengine göre sabit bir ikon bileşeni döner (her çizimde yeni bileşen üretmez). */
export function provaHeroIcon(dot: ProvaDot): React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> {
  if (cache[dot]) return cache[dot]!;
  const C = ({ size = 14, color, strokeWidth = 1.8 }: { size?: number; color?: string; strokeWidth?: number }) => (
    <View style={{ width: size, height: size }}>
      <CalendarClock size={size} color={color} strokeWidth={strokeWidth} />
      {dot !== 'none' ? (
        <View style={{
          position: 'absolute', top: -2, right: -3, width: 7, height: 7, borderRadius: 4,
          backgroundColor: DOT[dot], borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
        }} />
      ) : null}
    </View>
  );
  C.displayName = `ProvaHeroIcon_${dot}`;
  cache[dot] = C;
  return C;
}
