/**
 * ProgressX — Yeni handoff bundle progress primitif'leri
 *
 *   • LinearProgressX  — pill kapsül + accent fill + saffron knob + count-up
 *   • PercentRingX     — outer pill ring + animated stroke + halo (hero / kart içi)
 *   • StepsTimelineX   — yatay süreç adımları + aktif node pulse halo
 *   • useCountUp       — 0'dan target'e ease-out cubic (rakam animasyonu)
 *
 *   Patterns showcase'inden çıkarıldı (önceden /dev/patterns'ta lokal idi).
 *   Tema duyarlı: lab / clinic / exec / tech / plum / teal.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Svg, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DS, dsTheme, type DsTheme } from '../theme/dsTokens';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

// ─── Hooks ─────────────────────────────────────────────────────────────────
export function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let raf: any;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function usePulse({ duration = 1600 }: { duration?: number } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  const scale   = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  return { scale, opacity };
}

// ─── Pulse primitives ──────────────────────────────────────────────────────
function PulseRing({ color, size }: { color: string; size: number }) {
  const { scale, opacity } = usePulse({ duration: 1600 });
  return (
    <Animated.View style={{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }], opacity,
    }} />
  );
}

function PulseDot({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  const { scale, opacity } = usePulse({ duration: 1400 });
  return (
    <Animated.View style={{
      position: 'absolute',
      left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }], opacity,
    }} pointerEvents="none" />
  );
}

function PulseLinearHalo({ color, size, leftPct }: { color: string; size: number; leftPct: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale   = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0] });
  return (
    <Animated.View style={{
      position: 'absolute',
      left: `${leftPct}%` as any, top: '50%' as any,
      width: size, height: size,
      marginLeft: -size / 2, marginTop: -size / 2,
      borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }], opacity,
    }} pointerEvents="none" />
  );
}

// ─── LinearProgressX ───────────────────────────────────────────────────────
export function LinearProgressX({
  value: targetValue, label, trend, theme = 'lab', compact = false, animate = true,
  hideLabel = false, fillColor,
}: {
  value: number;
  label?: string;
  trend?: string;
  theme?: DsTheme;
  compact?: boolean;
  animate?: boolean;
  hideLabel?: boolean;
  /** Doldurulan kısmın rengi — default: t.accent */
  fillColor?: string;
}) {
  const t = dsTheme(theme);
  const accentFill = fillColor ?? t.accent;
  const knobBg = t.primary;

  const animatedValue = useCountUp(targetValue, animate ? 1400 : 0);
  const value = animate ? animatedValue : targetValue;
  const displayValue = Math.round(value);

  // Theme bazlı pill renkleri
  const railOuter =
    theme === 'lab'    ? '#FAF5E8' :
    theme === 'clinic' ? '#EDF2EE' :
    theme === 'exec'   ? '#FAF5F1' :
    theme === 'tech'   ? '#F4F8FC' :
    theme === 'plum'   ? '#F7F3FA' :
    theme === 'teal'   ? '#F1F8F7' :
                         '#FAFAFA';
  const trackInner =
    theme === 'lab'    ? '#E8E2C8' :
    theme === 'clinic' ? '#D5E2DA' :
    theme === 'exec'   ? '#E5D4C5' :
    theme === 'tech'   ? '#D8E5F2' :
    theme === 'plum'   ? '#DDD0EA' :
    theme === 'teal'   ? '#C9E2DF' :
                         '#EAEAEA';

  const railH = compact ? 18 : 22;             // compact biraz daha kalın (14 → 18)
  const padding = compact ? 3 : 4;              // compact iç padding inceltildi
  const fillInset = compact ? 1 : 3;            // fill daha dolgun (2 → 1)
  const knobSize = compact ? 18 : 22;

  return (
    <View style={{ gap: 8 }}>
      {!compact && !hideLabel && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {trend && <Text style={{ fontSize: 11, color: DS.ink[500] }}>{trend}</Text>}
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900] }}>
              {displayValue}<Text style={{ fontSize: 12, color: DS.ink[400] }}>%</Text>
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: Math.max(knobSize, railH) + 4, justifyContent: 'center', position: 'relative' }}>
        <View style={{
          position: 'absolute', left: 0, right: 0,
          height: railH,
          top: '50%', marginTop: -railH / 2,
          backgroundColor: railOuter, borderRadius: 999, padding,
        }}>
          <View style={{
            flex: 1, backgroundColor: trackInner, borderRadius: 999,
            position: 'relative', overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', left: 0, top: fillInset, bottom: fillInset,
              width: `${value}%`, backgroundColor: accentFill, borderRadius: 999,
            }} />
          </View>
        </View>

        <PulseLinearHalo color={knobBg} size={knobSize * 1.5} leftPct={value} />

        <View style={{
          position: 'absolute',
          left: `${value}%` as any, top: '50%',
          width: knobSize, height: knobSize,
          marginLeft: -knobSize / 2, marginTop: -knobSize / 2,
          borderRadius: knobSize / 2,
          backgroundColor: knobBg,
          // @ts-ignore web shadow
          boxShadow: `0 1px 3px rgba(0,0,0,0.15)`,
        }} />
      </View>

      {compact && !hideLabel && label && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>{label}</Text>
          <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[900] }}>{displayValue}%</Text>
        </View>
      )}
    </View>
  );
}

// ─── PercentRingX ──────────────────────────────────────────────────────────
export function PercentRingX({
  value: targetValue, size = 200, theme = 'lab',
  weight = '300', animate = true,
  textColor,
}: {
  value: number; size?: number; theme?: DsTheme;
  weight?: '200' | '300' | '400' | '500' | '600' | '700';
  animate?: boolean;
  textColor?: string;
}) {
  const animatedValue = useCountUp(targetValue, animate ? 1400 : 0);
  const value = animate ? animatedValue : targetValue;

  const outerStroke = Math.max(8, Math.round(size * 0.12));
  const innerStroke = outerStroke - 6;
  const r = (size - outerStroke - Math.max(3, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const t = dsTheme(theme);

  const lightColor = t.primary;
  const deepColor = t.primaryDeep;
  const id = `prx-${theme}-${targetValue}-${size}`;

  const outerPillColor = lightColor + '22';
  const innerTrackColor = lightColor + '15';

  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);
  const knobR = innerStroke * 0.85;
  const showKnob = size >= 56;
  const showPulse = size >= 100;
  const displayValue = Math.round(value);
  const pctColor = textColor ?? '#FFFFFF';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={lightColor} stopOpacity="0.95" />
            <Stop offset="100%" stopColor={deepColor}  stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={outerPillColor} strokeWidth={outerStroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={innerTrackColor} strokeWidth={innerStroke} fill="none" />
        {value > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={`url(#${id})`} strokeWidth={innerStroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
        {showKnob && (
          <Circle cx={knobX} cy={knobY} r={knobR + Math.max(2, innerStroke * 0.4)}
                  fill={pctColor} fillOpacity={0.18} />
        )}
        {showKnob && (
          <Circle cx={knobX} cy={knobY} r={knobR} fill={pctColor} />
        )}
      </Svg>

      {showPulse && (
        <PulseDot color={pctColor} size={knobR * 2.6} x={knobX} y={knobY} />
      )}

      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{
            fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
            fontWeight: weight,
            fontSize: size * 0.28,
            color: pctColor,
            letterSpacing: size * 0.28 * -0.04,
            lineHeight: size * 0.28,
          }}>
            {displayValue}
          </Text>
          {size >= 56 && (
            <Text style={{
              fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
              fontWeight: '400',
              fontSize: size * 0.13,
              color: lightColor,
              marginLeft: 3,
              lineHeight: size * 0.13,
            }}>
              %
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── StepsTimelineX ────────────────────────────────────────────────────────
export function StepsTimelineX({
  steps, current, theme = 'lab',
  variant = 'dark',
}: {
  steps: string[]; current: number; theme?: DsTheme;
  /** dark = koyu zemin (beyaz label) | light = açık zemin (ink label) */
  variant?: 'dark' | 'light';
}) {
  const t = dsTheme(theme);
  const accent = t.primary;
  const labelActive = variant === 'dark' ? '#FFFFFF' : DS.ink[900];
  const labelRest   = variant === 'dark' ? 'rgba(255,255,255,0.45)' : DS.ink[400];
  const lineRest    = variant === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';

  const NODE = 36;
  const HALO = 50;
  const GAP  = 8;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((step, i) => {
        const isPast    = i < current;
        const isCurrent = i === current;
        const isFuture  = i > current;
        const isLast    = i === steps.length - 1;
        const nodeW = isCurrent ? HALO : NODE;

        return (
          <React.Fragment key={i}>
            <View style={{ alignItems: 'center', width: nodeW }}>
              {isCurrent && (
                <View style={{ width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' }}>
                  <PulseRing color={accent} size={HALO} />
                  <View style={{
                    position: 'absolute',
                    width: HALO, height: HALO, borderRadius: HALO / 2,
                    backgroundColor: accent, opacity: 0.18,
                  }} />
                  <View style={{
                    width: NODE, height: NODE, borderRadius: NODE / 2,
                    backgroundColor: accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent }} />
                  </View>
                </View>
              )}
              {isPast && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  backgroundColor: accent, marginTop: (HALO - NODE) / 2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.accent }}>✓</Text>
                </View>
              )}
              {isFuture && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  borderWidth: 2, borderColor: lineRest, marginTop: (HALO - NODE) / 2,
                }} />
              )}
              <Text style={{
                fontSize: 12, fontWeight: '500',
                color: isPast ? labelActive : isCurrent ? accent : labelRest,
                marginTop: 12, textAlign: 'center',
              }}>
                {step}
              </Text>
            </View>

            {!isLast && (
              <View style={{
                flex: 1, height: 2,
                backgroundColor: i < current ? accent : lineRest,
                marginTop: HALO / 2 - 1,
                marginHorizontal: GAP,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
