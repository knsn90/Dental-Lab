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
import { View, Text, Animated, Easing, Platform } from 'react-native';
import { Svg, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Inbox, Cog, ShieldCheck, PackageCheck, Truck, Check, type LucideIcon } from './icons';
import { DS, dsTheme, type DsTheme } from '../theme/dsTokens';
import { isRTL } from '../i18n';
import { useThemeModeStore } from '../store/themeModeStore';

// Sipariş status timeline'ı için varsayılan ikon seti (Alındı→Üretim→QC→Hazır→Teslim)
const DEFAULT_STATUS_ICONS: LucideIcon[] = [Inbox, Cog, ShieldCheck, PackageCheck, Truck];

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

function usePulse({ duration = 1600, fromScale = 1, toScale = 1.5, fromOpacity = 0.4, toOpacity = 0 }:
  { duration?: number; fromScale?: number; toScale?: number; fromOpacity?: number; toOpacity?: number } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Tek yönlü infinite loop — geri dönüşle salınım yerine sürekli "dışa yayılan" dalga
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    v.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  const scale   = v.interpolate({ inputRange: [0, 1], outputRange: [fromScale, toScale] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [fromOpacity, toOpacity] });
  return { scale, opacity };
}

// ─── Pulse primitives ──────────────────────────────────────────────────────
// Knob — nabız atan beyaz nokta (yüzde göstergesi)
function BreathingKnob({
  x, y, radius, color, active,
}: { x: number; y: number; radius: number; color: string; active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.25, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.85, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, [active, scale, opacity]);
  const d = radius * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - radius, top: y - radius,
        width: d, height: d, borderRadius: radius,
        backgroundColor: color,
        opacity, transform: [{ scale }],
      }}
    />
  );
}

// PercentRing — başlangıç (12 o'clock) işaretçisi: SABİT küçük dot (animasyon yok).
// Eskiden ring etrafında dönüyordu; artık başlangıç noktasında sabit kalır.
function OrbitingHighlight({ size, radius, color }: { size: number; radius: number; color: string }) {
  const dotSize = Math.max(4, size * 0.06);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size, height: size,
        alignItems: 'center', justifyContent: 'flex-start',
      }}
    >
      <View style={{
        marginTop: size / 2 - radius - dotSize / 2,
        width: dotSize, height: dotSize, borderRadius: dotSize / 2,
        backgroundColor: color, opacity: 0.55,
      }} />
    </View>
  );
}

// Aktif step ikonu — breathing scale (rotation KALDIRILDI: kullanıcı ikonun
// dönmesini istemedi, sabit yerinde dursun — yalnız nazikçe nefes alır).
function ActiveStepIcon({ Icon, color = '#FFFFFF' }: { Icon: LucideIcon; color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon size={16} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

function PulseRing({ color, size }: { color: string; size: number }) {
  // İki katmanlı dalga — birincisi hızlı, ikincisi yarım faz gecikmeli
  const wave1 = usePulse({ duration: 1800, fromScale: 1, toScale: 1.9, fromOpacity: 0.55, toOpacity: 0 });
  const wave2 = usePulse({ duration: 1800, fromScale: 1, toScale: 1.55, fromOpacity: 0.35, toOpacity: 0 });
  return (
    <>
      <Animated.View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale: wave1.scale }], opacity: wave1.opacity,
      }} pointerEvents="none" />
      <Animated.View style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale: wave2.scale }], opacity: wave2.opacity,
      }} pointerEvents="none" />
    </>
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
  // RTL: çubuk sağdan dolar → hale de yüzdeyi sağ kenardan ölçmeli.
  // (`left`/`marginStart` yön-duyarlı DEĞİL; fiziksel eksen açıkça seçilir.)
  const rtl = isRTL();
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
      ...(rtl
        ? { right: `${leftPct}%` as any, marginRight: -size / 2 }
        : { left: `${leftPct}%` as any, marginLeft: -size / 2 }),
      top: '50%' as any,
      width: size, height: size,
      marginTop: -size / 2,
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
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const accentFill = fillColor ?? t.accent;
  const knobBg = t.primary;

  const animatedValue = useCountUp(targetValue, animate ? 1400 : 0);
  const value = animate ? animatedValue : targetValue;
  const displayValue = Math.round(value);

  // Theme bazlı pill renkleri. Koyu modda açık "beyaz ray" (railOuter) + knob
  // eski-tip slider hissi veriyordu → koyuda tek koyu track, ray/knob yok.
  const railOuter = isDark ? 'transparent' :
    theme === 'lab'    ? '#FAF5E8' :
    theme === 'clinic' ? '#EDF2EE' :
    theme === 'exec'   ? '#EEF2F8' :
    theme === 'tech'   ? '#F4F8FC' :
    theme === 'plum'   ? '#F7F3FA' :
    theme === 'teal'   ? '#F1F8F7' :
                         '#FAFAFA';
  const trackInner = isDark ? '#30302D' :
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
              position: 'absolute', ...(rtl ? { right: 0 } : { left: 0 }), top: fillInset, bottom: fillInset,
              width: `${value}%`, backgroundColor: accentFill, borderRadius: 999,
            }} />
          </View>
        </View>

        {/* Knob + halo — yalnız açık temada. Koyu modda düz progress bar. */}
        {!isDark && (
          <>
            <PulseLinearHalo color={knobBg} size={knobSize * 1.5} leftPct={value} />

            <View style={{
              position: 'absolute',
              ...(rtl
                ? { right: `${value}%` as any, marginRight: -knobSize / 2 }
                : { left: `${value}%` as any, marginLeft: -knobSize / 2 }),
              top: '50%',
              width: knobSize, height: knobSize,
              marginTop: -knobSize / 2,
              borderRadius: knobSize / 2,
              backgroundColor: knobBg,
              // @ts-ignore web shadow
              boxShadow: `0 1px 3px rgba(0,0,0,0.15)`,
            }} />
          </>
        )}
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
  const showPulse = size >= 60;
  const inProgress = animate && targetValue > 0 && targetValue < 100;
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

      {showKnob && (
        <BreathingKnob
          x={knobX} y={knobY}
          radius={knobR}
          color={pctColor}
          active={true}
        />
      )}

      {inProgress && (
        <OrbitingHighlight
          size={size}
          radius={r}
          color={pctColor}
        />
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
              marginStart: 3,
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
  icons, accentColor, markColor = '#FFFFFF',
  surfaceDark = false, flowColor, sweepColor, surfaceBg,
}: {
  steps: string[]; current: number; theme?: DsTheme;
  /** dark = koyu zemin (beyaz label) | light = açık zemin (ink label) */
  variant?: 'dark' | 'light';
  /** Adım başına Lucide ikon. Verilmezse 5-adımda DEFAULT_STATUS_ICONS, diğer durumda nokta. */
  icons?: LucideIcon[];
  /** Düğüm/halo/aktif-label rengini override eder (ör. accent=hero-bg iken beyaz daire için). */
  accentColor?: string;
  /** Düğüm içindeki işaret (check / aktif ikon / nokta) rengi. Varsayılan beyaz. */
  markColor?: string;
  /**
   * Koyu tema yüzeyi (T.card): görsel dil değişir → tamamlanan daireler KOYU + yeşil check,
   * aktif daire AÇIK + yeşil ikon, çizgiler koyu gri (tamamlanan hafif yeşil), aktif yazı beyaz.
   * markColor bu modda "yeşil" olarak verilir.
   */
  surfaceDark?: boolean;
  /**
   * Verilirse yeşil "tamamlandı" dili yerine bu renk kullanılır (işaret, halo,
   * tamamlanan çizgi) ve aktif adıma giren bağlayıcıda ışık izi akar.
   * Koyu temada lacivert/neon mavi için: Özet'teki CANLI kartıyla ortak dil.
   */
  flowColor?: string;
  /**
   * Işık süpürmesini flowColor'dan BAĞIMSIZ açar. flowColor aynı zamanda
   * "tamamlandı" renk dilini (çizgi/işaret) değiştirdiği için açık temada
   * kullanılamıyordu — süpürme için onu vermek tamamlanan çizgilerin rengini de
   * bozuyordu. Verilmezse flowColor'a düşer (koyu temadaki mevcut davranış).
   */
  sweepColor?: string;
  /**
   * Timeline'ın ARKASINDAKİ yüzey rengi. Verilirse düğümler OPAK boyanır —
   * ışık süpürmesi yarı saydam düğümlerin içinden sızmasın, arkalarından geçsin.
   */
  surfaceBg?: string;
}) {
  // Varsayılan ikonlar — 5-adım sipariş status'una uyumlu
  const stepIcons: (LucideIcon | undefined)[] = icons
    ?? (steps.length === DEFAULT_STATUS_ICONS.length ? DEFAULT_STATUS_ICONS : []);
  const t = dsTheme(theme);
  const accent = accentColor ?? t.primary;
  const green = flowColor ?? (markColor && markColor !== '#FFFFFF' ? markColor : '#32BB78');
  /** Yarı saydam bir tonu opak zemine karıştırır (cam yerine düz yüzey). */
  const mixHex = (base: string, over: string, a: number) => {
    const px = (h: string) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(h);
      const n = m ? parseInt(m[1], 16) : 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const [br, bg2, bb] = px(base), [or_, og, ob] = px(over);
    const m2 = (b: number, o: number) => Math.round(b + (o - b) * a);
    return `#${[m2(br, or_), m2(bg2, og), m2(bb, ob)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  };

  const labelActive = surfaceDark ? '#FFFFFF' : variant === 'dark' ? '#FFFFFF' : DS.ink[900];
  const labelRest   = surfaceDark ? 'rgba(255,255,255,0.50)' : variant === 'dark' ? 'rgba(255,255,255,0.45)' : DS.ink[400];
  const lineRest    = surfaceDark ? 'rgba(255,255,255,0.14)' : variant === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
  // surfaceDark görsel dili — açık tema/emerald hero davranışını DEĞİŞTİRMEZ.
  const nodePastBg       = surfaceDark
                            ? (surfaceBg ? mixHex(surfaceBg, '#FFFFFF', 0.10) : 'rgba(255,255,255,0.10)')
                            : accent;   // koyu daire (surfaceBg varsa OPAK)
  const nodeActiveBg     = surfaceDark ? '#F2ECE1' : accent;                   // açık aktif daire
  const haloColor        = surfaceDark ? green : accent;                       // yeşil halo
  const nodeFutureBorder = surfaceDark ? 'rgba(255,255,255,0.20)' : lineRest;
  const lineDone         = flowColor ? `${flowColor}66`
                          : surfaceDark ? 'rgba(50,187,120,0.55)' : accent;     // tamamlanan hafif yeşil
  const labelCurrent     = surfaceDark ? '#FFFFFF' : accent;                   // aktif yazı beyaz

  const NODE = 36;
  const HALO = 50;
  const GAP  = 8;

  // ── Işık süpürmesi ──────────────────────────────────────────────────────
  // Segment segment kuyruk DENENDİ ve BIRAKILDI: iz her düğümde sıfırlandığı
  // için kısa segmentlerde kesik kesik görünüyordu. Bunun yerine şeridin
  // TAMAMINI bir kez geçen tek parça, yumuşak (blur'lu) bir ışık bandı —
  // metaldeki parlama gibi. İlk daireden başlar, son daireye varır, söner.
  const [rowW, setRowW] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const sweepHue = sweepColor ?? flowColor;
  // Bandın yoğunluğu ZEMİNE göre ayarlanır — aynı ayar iki temada tutmuyor:
  //   • Koyu kartta neon renk %65 alfayla "parlama" gibi duruyor.
  //   • Beyaz hero'da aynı alfa önce görünmüyordu; yükseltilince bu sefer sert
  //     bir lacivert şerit oldu (kullanıcı geri bildirimi). Açık zeminde doğru
  //     his DÜŞÜK alfa + GENİŞ band + fazla blur: kâğıt üstünden geçen ışık.
  const sweepOnLight = (() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(surfaceBg ?? '');
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.65;
  })();
  const SWEEP_W = sweepOnLight ? 150 : 120;
  // Açık zeminde band İNCE: çizgiye sarılan küçücük bir bulut. Yüksek/geniş
  // band denendi, kartın üstünde duran ayrı bir şerit gibi görünüyordu.
  const SWEEP_H = sweepOnLight ? 6 : 18;
  const sweepStops = sweepOnLight
    ? { mid: '26', peak: '66', blur: 6 }    // ~%15 → %40, ince olduğu için biraz doygun
    : { mid: '59', peak: 'A6', blur: 7 };
  useEffect(() => {
    sweep.stopAnimation();
    sweep.setValue(0);
    if (!sweepHue || !rowW) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 4600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(2800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, sweepHue, rowW]);

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', position: 'relative' }}
      onLayout={e => setRowW(e.nativeEvent.layout.width)}
    >
      {!!sweepHue && rowW > 0 && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: HALO / 2 - SWEEP_H / 2, start: 0,
          width: SWEEP_W, height: SWEEP_H, borderRadius: SWEEP_H / 2,
          opacity: sweep.interpolate({
            inputRange: [0, 0.14, 0.86, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [{
            translateX: sweep.interpolate({
              inputRange: [0, 1],
              // İlk dairenin ÖNÜNDEN değil, ondan SONRAKİ çizginin başından
              // başlar; SON DAİREDE biter (satırın sağ kenarına taşmaz).
              // Bandın en parlak noktası ~%65'inde olduğu için bitiş, son
              // dairenin merkezinden o kadar geri kaydırılır.
              outputRange: [
                (current === 0 ? HALO : NODE) + GAP,
                rowW - (current === steps.length - 1 ? HALO : NODE) / 2 - SWEEP_W * 0.65,
              ],
            }),
          }],
          ...(Platform.OS === 'web' ? {
            backgroundImage: `linear-gradient(90deg, ${sweepHue}00 0%, ${sweepHue}${sweepStops.mid} 45%, ${sweepHue}${sweepStops.peak} 70%, ${sweepHue}00 100%)`,
            filter: `blur(${sweepStops.blur}px)`,
          } as any : { backgroundColor: `${sweepHue}${sweepOnLight ? '24' : '33'}` }),
        }} />
      )}
      {steps.map((step, i) => {
        const isPast    = i < current;
        const isCurrent = i === current;
        const isFuture  = i > current;
        const isLast    = i === steps.length - 1;
        const nodeW = isCurrent ? HALO : NODE;
        const StepIcon = stepIcons[i];

        return (
          <React.Fragment key={i}>
            <View style={{ alignItems: 'center', width: nodeW }}>
              {isCurrent && (
                <View style={{ width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' }}>
                  <PulseRing color={haloColor} size={HALO} />
                  <View style={{
                    position: 'absolute',
                    width: HALO, height: HALO, borderRadius: HALO / 2,
                    backgroundColor: haloColor, opacity: 0.18,
                  }} />
                  <Animated.View style={{
                    width: NODE, height: NODE, borderRadius: NODE / 2,
                    backgroundColor: nodeActiveBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Aktif step — ikon (varsa) ya da nokta (fallback) */}
                    {StepIcon ? (
                      <ActiveStepIcon Icon={StepIcon} color={surfaceDark ? green : markColor} />
                    ) : (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: surfaceDark ? green : markColor }} />
                    )}
                  </Animated.View>
                </View>
              )}
              {isPast && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  backgroundColor: nodePastBg, marginTop: (HALO - NODE) / 2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Tamamlanan step — Lucide check ikonu */}
                  <Check size={16} color={surfaceDark ? green : markColor} strokeWidth={2.5} />
                </View>
              )}
              {isFuture && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  // Opak: süpürme ışığı boş dairelerin içinden görünmesin.
                  backgroundColor: surfaceBg ?? 'transparent',
                  borderWidth: 2, borderColor: nodeFutureBorder, marginTop: (HALO - NODE) / 2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Yaklaşan step — soluk ikon (varsa) */}
                  {StepIcon && (
                    <StepIcon size={14} color={nodeFutureBorder} strokeWidth={1.8} />
                  )}
                </View>
              )}
              <Text style={{
                fontSize: 12, fontWeight: '500',
                color: isPast ? labelActive : isCurrent ? labelCurrent : labelRest,
                marginTop: 12, textAlign: 'center',
              }}>
                {step}
              </Text>
            </View>

            {!isLast && (
              <View style={{
                flex: 1, height: 2,
                backgroundColor: i < current ? lineDone : lineRest,
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
