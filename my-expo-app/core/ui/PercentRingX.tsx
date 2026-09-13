/**
 * PercentRingX — Patterns showcase'deki yüzde halkasının reusable hâli.
 *
 * Özellikler:
 *   • Soft track (accent ton 18% alpha)
 *   • Gradient progress arc (accent → accentDeep)
 *   • Glow halo + beyaz knob (active state)
 *   • Display 300 büyük rakam + ince % suffix
 *   • Otomatik font ölçek (size ≥ 140 büyük, ≥ 100 orta, < 100 küçük)
 *
 * Kullanım:
 *   <PercentRingX value={72} size={160} accentColor="#EA7A4C" label="Normal" />
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useThemeModeStore } from '../store/themeModeStore';

interface Props {
  /** 0-100 arası değer */
  value: number;
  /** Halkanın çapı (px) — default 100 */
  size?: number;
  /** Ana accent rengi (hex) — gradient'in açık ucu */
  accentColor: string;
  /** Gradient'in koyu ucu (verilmezse accentColor + 20% darken) */
  accentDeep?: string;
  /** Track (boş kısım) rengi — verilmezse accent + 18% alpha */
  trackColor?: string;
  /** Alt etiket (ör: "Normal") — sadece size ≥ 140'ta görünür */
  label?: string;
  /** Stroke kalınlığı — verilmezse size / 14 */
  stroke?: number;
  /** Mount/değer değiştiğinde 0→target ease-out animasyonu (default true) */
  animate?: boolean;
  /** Animasyon süresi ms (default 1400) */
  duration?: number;
}

// Patterns'taki useCountUp ile aynı pattern (ProgressX.tsx)
function useCountUp(target: number, duration = 1400, enabled = true) {
  const [val, setVal] = useState(enabled ? 0 : target);
  const fromRef = useRef(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setVal(target); return; }
    const from = fromRef.current;
    const to   = target;
    if (from === to) return;
    const start = Date.now();
    let raf: number | null = null;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [target, duration, enabled]);
  return val;
}

// Hex'i biraz koyulaştırmak için (accentDeep verilmezse)
function darken(hex: string, amount = 0.18): string {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return hex;
  const [r, g, b] = m.map(h => parseInt(h, 16));
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount))));
  const toHex = (v: number) => f(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Accent + alpha → rgba string
function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = m.map(h => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

const DISPLAY_FONT = Platform.OS === 'web'
  ? 'Inter Tight, Inter, system-ui, sans-serif'
  : 'InterTight_300Light';

export function PercentRingX({
  value, size = 100,
  accentColor,
  accentDeep,
  trackColor,
  label,
  stroke: strokeProp,
  animate = true,
  duration = 1400,
}: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const target = Math.max(0, Math.min(100, value));
  const animatedValue = useCountUp(target, duration, animate);
  const v = animate ? animatedValue : target;
  const stroke = strokeProp ?? Math.max(5, size / 14);
  const r = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  const lightColor = accentColor;
  const deepColor  = accentDeep ?? darken(accentColor, 0.18);
  const track      = trackColor ?? withAlpha(accentColor, 0.18);

  // Knob konumu (saat 12'den başlar, saat yönünde)
  const angleDeg = (v / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);

  const knobR = Math.max(5, stroke * 0.85);
  const isLarge = size >= 140;
  const numFontSize = isLarge ? 44 : (size >= 100 ? 28 : 16);

  // SVG <defs> id (collision-safe)
  // SVG id sabit kalsın — yoksa animasyon her tick'te yeniden tanımlanan grad'i kullanır
  const id = `pr-grad-${Math.round(size)}-${Math.round(target)}-${accentColor.slice(1, 4)}`;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={lightColor} />
            <Stop offset="100%" stopColor={deepColor} />
          </LinearGradient>
        </Defs>

        {/* Soluk accent track */}
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={track} strokeWidth={stroke} fill="none" />

        {/* Progress arc */}
        {v > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}

        {/* Knob halo (1-99 arası) */}
        {v > 0 && v < 100 && (
          <Circle cx={knobX} cy={knobY} r={knobR + 3}
                  fill={lightColor} fillOpacity={0.25} />
        )}

        {/* Beyaz knob + ince accent stroke + iç parlak nokta */}
        {v > 0 && v < 100 && (
          <>
            <Circle cx={knobX} cy={knobY} r={knobR}
                    fill="#FFFFFF" stroke={deepColor} strokeWidth={1.2} />
            <Circle cx={knobX} cy={knobY} r={knobR / 3}
                    fill={deepColor} />
          </>
        )}

        {/* %100 — tek dolu knob saat 12'de */}
        {v === 100 && (
          <Circle cx={size / 2} cy={size / 2 - r} r={knobR / 2}
                  fill={deepColor} />
        )}
      </Svg>

      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: '300',
          fontSize: numFontSize,
          color: isDark ? '#F7F2E9' : '#0A0A0A',
          letterSpacing: numFontSize > 30 ? -1.4 : -0.5,
          lineHeight: numFontSize,
        }}>
          {Math.round(v)}
          <Text style={{ fontSize: numFontSize * 0.5, color: isDark ? 'rgba(247,242,233,0.45)' : '#9A9A9A', fontWeight: '400' }}>%</Text>
        </Text>
        {label && isLarge && (
          <Text style={{ fontSize: 10, color: isDark ? 'rgba(247,242,233,0.45)' : '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginTop: 8 }}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}
