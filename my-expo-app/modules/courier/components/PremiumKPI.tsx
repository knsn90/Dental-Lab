/**
 * PremiumKPI — sade, hizalı, tipografi-odaklı KPI kartı.
 *
 * Önceki revizyonun gürültüsü temizlendi:
 *   ❌ Dotted mesh texture (sağda) → kaldırıldı (görsel gürültü)
 *   ❌ Accent tinted bg → beyaza dönüldü (standart kart)
 *   ❌ Trend chip eyebrow'da → kaldırıldı (kart-içi hizalama bozulmuyordu)
 *   ❌ Italic sub + inline icon karışımı → temiz roman text
 *
 * Kalan ayırt edici öğeler:
 *   ✓ Eyebrow: 6px accent nokta + uppercase tracked label
 *   ✓ Devasa DISPLAY value, sol-hizalı, sabit baseline
 *   ✓ Value'nun altında SABİT genişlikte accent rule (her kart aynı genişlik)
 *   ✓ Sub: tek satır clean roman, ink[500]
 *   ✓ Kart sabit min yükseklik → bir sıradaki tüm KPI'lar hizalı
 *
 * Boyutlar:
 *   `size="lg"` (desktop — 48 display, 156 min height)
 *   `size="md"` (orta tablet — 40 display, 138 min height)
 *   `size="sm"` (mobile — 32 display, 118 min height)
 */

import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { DS } from '../../../core/theme/dsTokens';
import { useInkUI } from '../../../core/theme/inkScale';

// View fonksiyon-stil uygulamaz: onPress yoksa (Wrapper=View) stili düz nesneye çöz.
const resolveStyle = (fn: (st: any) => any, pressable: boolean) => (pressable ? fn : fn({}));


const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

type Size = 'sm' | 'md' | 'lg';

interface Props {
  icon: any;          // sadece API uyumluluğu için, kullanılmıyor (KPI tipo merkezli)
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  size?: Size;
  onPress?: () => void;
  /** Geri uyumluluk için props'da var ama görsel etkisi yok artık */
  trend?: { value: string; tone?: 'up' | 'down' | 'neutral' };
}

const sizeMap: Record<Size, {
  pad: number;
  minHeight: number;
  display: number;
  track: number;
  dotSize: number;
  ruleW: number;
  ruleGap: number;
  subGap: number;
}> = {
  sm: { pad: 16, minHeight: 118, display: 32, track: -1.0, dotSize: 5, ruleW: 24, ruleGap: 10, subGap: 8  },
  md: { pad: 18, minHeight: 138, display: 40, track: -1.4, dotSize: 6, ruleW: 28, ruleGap: 12, subGap: 10 },
  lg: { pad: 22, minHeight: 156, display: 48, track: -1.7, dotSize: 6, ruleW: 32, ruleGap: 14, subGap: 12 },
};

export function PremiumKPI({
  label, value, sub, accent, size = 'lg', onPress,
}: Props) {
  const U = useInkUI();
  const s = sizeMap[size];
  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={resolveStyle(({ hovered, pressed }: any) => ({
        flex: 1, minWidth: 140, minHeight: s.minHeight,
        backgroundColor: U.surface,
        borderRadius: 18,
        borderWidth: 1, borderColor: U.ink[200],
        padding: s.pad,
        // İçerikleri dikey eşit dağıt
        justifyContent: 'space-between',
        opacity: pressed ? 0.94 : 1,
        // @ts-ignore
        transform: [{ translateY: hovered && onPress ? -1 : 0 }],
        // @ts-ignore
        boxShadow: hovered && onPress
          ? `0 6px 18px ${accent}1A`
          : 'none',
        // @ts-ignore
        transition: 'transform 220ms ease, box-shadow 220ms ease',
        cursor: onPress ? ('pointer' as any) : ('default' as any),
      }), !!onPress)}
    >
      {/* Üst bölge — eyebrow */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: s.dotSize, height: s.dotSize, borderRadius: s.dotSize / 2,
          backgroundColor: accent,
        }} />
        <Text
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: U.ink[500],
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>

      {/* Orta bölge — value + accent rule (sabit baseline) */}
      <View style={{ marginTop: s.ruleGap }}>
        <Text
          style={{
            ...DISPLAY,
            fontSize: s.display,
            letterSpacing: s.track,
            lineHeight: s.display * 1,
            color: U.ink[900],
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        <View style={{
          width: s.ruleW, height: 2, borderRadius: 1,
          backgroundColor: accent, marginTop: 8,
        }} />
      </View>

      {/* Alt bölge — sub (tek satır, sabit yükseklik) */}
      <View style={{ marginTop: s.subGap, minHeight: 14 }}>
        {sub ? (
          <Text
            style={{ fontSize: 11, color: U.ink[500], fontWeight: '500' }}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
    </Wrapper>
  );
}
