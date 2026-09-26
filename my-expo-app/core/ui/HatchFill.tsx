/**
 * HatchFill — çapraz tarama (hatch) dolgusu.
 *
 * Web'de desen `repeating-linear-gradient` ile çiziliyor; bu CSS özelliği
 * react-native-web'e özgüdür, iOS/Android'de YOKTUR → native'de ray düz renk
 * kalıyordu. Bu bileşen native'de aynı deseni react-native-svg `Pattern` ile
 * çizer, web'de ise null döner (CSS gradyanı olduğu gibi kalır, görünüm bit-bit
 * korunur).
 *
 * Kullanım — çizgili rayın İLK çocuğu olarak koy (mutlak konumlu, bar'ların
 * altında kalır; ray zaten `overflow:'hidden'` + `position:'relative'`):
 *
 *   <View style={{ ..., backgroundImage: STRIPE_BG }}>
 *     <HatchFill color={P.primary} />
 *     {bar}
 *   </View>
 */
import React from 'react';
import { Platform, View } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect } from 'react-native-svg';

type Props = {
  /** Çizgi rengi — panel accent'i (CSS'teki `${accent}14` ile aynı renk). */
  color: string;
  /**
   * Çizgi opaklığı. Varsayılan 0.22 — CSS'teki `14` (0.08) telefonda neredeyse
   * görünmüyor; bu değer lab/klinik panellerinde cihazda ayarlanmış olandır.
   */
  opacity?: number;
  /** Çizgi kalınlığı (12px periyotta). */
  thickness?: number;
  /** Desen periyodu. */
  period?: number;
};

export function HatchFill({ color, opacity = 0.22, thickness = 5, period = 12 }: Props) {
  // Aynı ekranda birden çok ray var; pattern id'leri çakışmamalı.
  // (Hook koşulsuz çağrılır — erken return'ün ÜSTÜNDE kalmalı.)
  const id = `hatch-${React.useId().replace(/:/g, '')}`;
  // Web: CSS gradyanı zaten çiziyor — hiçbir şey ekleme.
  if (Platform.OS === 'web') return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/* rotate(135) = CSS'teki 135deg ile aynı yön */}
          <Pattern id={id} patternUnits="userSpaceOnUse" width={period} height={period} patternTransform="rotate(135)">
            <Line x1="0" y1="0" x2="0" y2={period} stroke={color} strokeWidth={thickness} strokeOpacity={opacity} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
