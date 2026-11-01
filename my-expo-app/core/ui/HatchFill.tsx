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
import Svg, { Line } from 'react-native-svg';

type Props = {
  /** Çizgi rengi — panel accent'i (CSS'teki `${accent}14` ile aynı renk). */
  color: string;
  /**
   * Şerit opaklığı. Varsayılan 0x14/255 ≈ 0.078 — CSS'teki `${accent}14` ile
   * BİREBİR (web Özet'iyle aynı görünüm, 2026-10-20 yan yana ölçüldü).
   */
  opacity?: number;
  /** Şerit kalınlığı — varsayılan periyodun yarısı (CSS: 6px şerit + 6px boşluk). */
  thickness?: number;
  /** Desen periyodu. */
  period?: number;
};

export function HatchFill({ color, opacity = 0x14 / 255, thickness, period = 12 }: Props) {
  const band = thickness ?? period / 2;
  // Rayın gerçek boyutu — çizgiler buna göre hesaplanır (Pattern KULLANILMAZ).
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  // Web: CSS gradyanı zaten çiziyor — hiçbir şey ekleme.
  if (Platform.OS === 'web') return null;

  // CSS `repeating-linear-gradient(135deg, c 0 6px, transparent 6px 12px)` ile
  // aynı: şeritler sol alttan sağ üste (/) gider, dik aralık `period`, kalınlık
  // `band`. x + y = c doğruları arasındaki dik mesafe Δc/√2 → Δc = period·√2.
  //
  // NEDEN Pattern değil: react-native-svg iOS'ta `patternTransform="rotate(…)"`
  // ile döndürülmüş karoyu kenarlarından kırpıyor; şeritler yerine üçgen/nokta
  // deseni çıkıyordu (build 69, 2026-10-21). Tarayıcıdaki SVG bunu göstermediği
  // için web testinde yakalanmadı. Düz çizgiler her motorda aynı çizilir.
  const lines: React.ReactNode[] = [];
  if (size) {
    const { w, h } = size;
    const step = period * Math.SQRT2;
    for (let c = 0, i = 0; c <= w + h + step; c += step, i++) {
      lines.push(
        <Line
          key={i}
          x1={c} y1={0} x2={c - h} y2={h}
          stroke={color} strokeOpacity={opacity} strokeWidth={band} strokeLinecap="butt"
        />,
      );
    }
  }
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {size ? <Svg width={size.w} height={size.h}>{lines}</Svg> : null}
    </View>
  );
}
