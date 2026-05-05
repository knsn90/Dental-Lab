/**
 * AdminDashboard — Patterns design language (matching Lab dashboard layout)
 *
 * Layout:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. 4-card grid (AnimatedAktifVaka, Sipariş Trendi, PercentRing, TasksCard)
 *   3. Bottom row — WeeklyStrip + AnimatedCTACard
 *   4. Extra sections — Orders table, Finance, Status dist, Work type
 *
 * Theme: DS.exec (coral #E97757)
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions, ActivityIndicator, Animated,
  Platform, RefreshControl, Easing,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity, Users,
  CreditCard, Calendar, BarChart3, Layers, TrendingUp,
  AlertTriangle, ArrowUpRight, ArrowRight, Check, Trophy,
} from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { DS } from '../../core/theme/dsTokens';
import { useIsDesktop } from '../../core/layout/PatternsShell';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';

// ── Display font — Patterns: Inter Tight Light (300), tight tracking ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Shorthand aliases from DS tokens ──
const P   = DS.exec.primary;      // #E97757 coral
const INK = DS.ink[900];          // #0A0A0A

const CLR = {
  green:  DS.exec.success,   // #2D9A6B
  orange: DS.exec.warning,   // #E89B2A
  red:    DS.exec.danger,    // #D94B4B
  blue:   DS.exec.info,      // #4A8FC9
  purple: '#7C3AED',
  teal:   '#0D9488',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',          color: DS.ink[500],  bg: 'rgba(0,0,0,0.05)' },
  uretimde:        { label: 'Üretimde',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  teslimata_hazir: { label: 'Teslimata Hazır', color: '#1F6B47',   bg: 'rgba(45,154,107,0.12)' },
  teslim_edildi:   { label: 'Teslim Edildi',   color: DS.ink[400],  bg: 'rgba(0,0,0,0.04)' },
};
const STATUS_KEYS = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const DAYS_SHORT = ['Pz','Pa','Sa','Ça','Pe','Cu','Ct'];

const PIPELINE_STAGES = [
  { key: 'alindi',          label: 'Alındı'   },
  { key: 'uretimde',        label: 'Üretimde' },
  { key: 'kalite_kontrol',  label: 'KK'       },
  { key: 'teslimata_hazir', label: 'Hazır'    },
] as const;

// ── Helpers ──
function getTodayLabel() {
  const now = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}
function initials(name?: string | null) {
  if (!name) return '--';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '--';
}
function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} TL`;
  }
}
function hexA(hex: string, alpha: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return hex; }
}

/** Get the 7-day window for "Bu hafta" strip (Mon–Sun) */
function getWeekDays(): { label: string; date: string; isToday: boolean }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const result: { label: string; date: string; isToday: boolean }[] = [];
  const todayISO = todayStr();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    result.push({
      label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`,
      date: iso,
      isToday: iso === todayISO,
    });
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
//  ANIMATION HOOKS
// ══════════════════════════════════════════════════════════════════

function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (duration === 0) { setV(target); return; }
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
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  return { scale, opacity };
}

function PulseDot({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  const { scale, opacity } = usePulse({ duration: 1400 });
  return (
    <Animated.View style={{
      position: 'absolute',
      left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }],
      opacity,
    }} pointerEvents="none" />
  );
}

// ══════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

/** Generic card — Patterns: white bg, radius xl, 1px border */
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      className="bg-white overflow-hidden"
      style={[{ borderRadius: DS.radius.xl, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }, style]}
    >
      {children}
    </View>
  );
}

/** Card header — display serif or uppercase micro */
function CardHeader({ title, right, display }: { title: string; right?: React.ReactNode; display?: boolean }) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
      {display ? (
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{title}</Text>
      ) : (
        <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>
          {title}
        </Text>
      )}
      {right}
    </View>
  );
}

/** Status badge with dot */
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' };
  return (
    <View
      className="flex-row items-center self-start rounded-full"
      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.bg, gap: 4 }}
    >
      <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

/** Stat Pill (hero) */
function StatPill({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>
        {label}
      </Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
      </View>
    </View>
  );
}

/** Big Stat — Patterns hero right side */
function BigStat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: DS.ink[900] }}>
        {value}
      </Text>
      <Text style={{ fontSize: DS.size.micro, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

// ── PercentRingHero — gradient arc + knob + pulse ──
function PercentRingHero({
  value: targetValue, size = 200, weight = '300', animate = true, darkText = false,
}: { value: number; size?: number; weight?: '200' | '300' | '400' | '500' | '600' | '700'; animate?: boolean; darkText?: boolean }) {
  const animatedValue = useCountUp(targetValue, animate ? 1400 : 0);
  const value = animate ? animatedValue : targetValue;

  const outerStroke = Math.max(8, Math.round(size * 0.12));
  const innerStroke = outerStroke - 6;
  const r = (size - outerStroke - Math.max(3, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;

  const lightColor = P;
  const deepColor = DS.exec.primaryDeep;
  const id = `pr-hero-exec-${targetValue}-${size}`;

  const outerPillColor = darkText ? lightColor + '30' : lightColor + '22';
  const innerTrackColor = darkText ? 'rgba(0,0,0,0.06)' : lightColor + '15';

  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);
  const knobR = innerStroke * 0.85;
  const showKnob = size >= 56;
  const showPulse = size >= 100;
  const displayValue = Math.round(value);

  const knobColor = darkText ? INK : '#FFFFFF';
  const textColor = darkText ? INK : '#FFFFFF';
  const pctColor = darkText ? DS.ink[400] : lightColor;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={lightColor} stopOpacity="0.95" />
            <Stop offset="100%" stopColor={deepColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={outerPillColor} strokeWidth={outerStroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={innerTrackColor} strokeWidth={innerStroke} fill="none" />
        {value > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={`url(#${id})`} strokeWidth={innerStroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
        {value > 0 && value < 100 && showKnob && (
          <Circle cx={knobX} cy={knobY} r={knobR + Math.max(2, innerStroke * 0.4)}
                  fill={knobColor} fillOpacity={0.18} />
        )}
        {value > 0 && value < 100 && showKnob && (
          <Circle cx={knobX} cy={knobY} r={knobR}
                  fill={knobColor} />
        )}
      </Svg>
      {value > 0 && value < 100 && showPulse && (
        <PulseDot color={knobColor} size={knobR * 2.6} x={knobX} y={knobY} />
      )}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{
            fontFamily: DS.font.display as string,
            fontWeight: weight,
            fontSize: size * 0.28,
            color: textColor,
            letterSpacing: size * 0.28 * -0.04,
            lineHeight: size * 0.28,
          }}>
            {displayValue}
          </Text>
          {size >= 56 && (
            <Text style={{
              fontFamily: DS.font.display as string,
              fontWeight: '400',
              fontSize: size * 0.13,
              color: pctColor,
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

// ── Animated Aktif Vaka Card — pulsing CANLI dot + glow + breathing circles ──
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, latestOrder, router }: {
  isDesktop: boolean;
  pipelineCounts: Record<string, number>;
  latestOrder: any;
  router: any;
}) {
  const dotAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [dotAnim, glowAnim, breatheAnim]);

  const dotOpacity = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Card style={{ flex: isDesktop ? 1.1 : undefined, marginBottom: isDesktop ? 0 : 14 }}>
      {/* Dark section */}
      <View style={{
        flex: 1,
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(180deg, ${DS.ink[700]} 0%, ${DS.ink[900]} 100%)`,
        backgroundColor: DS.exec.surfaceAlt,
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <Animated.View style={{
          position: 'absolute', width: 160, height: 160, borderRadius: 80,
          backgroundColor: P,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }} pointerEvents="none" />

        {/* CANLI badge */}
        <View className="absolute rounded-full" style={{
          top: 14, left: 14,
          paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: `${P}E6`,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Animated.View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: '#FFF',
            opacity: dotOpacity,
          }} />
          <Text style={{ fontSize: 10, fontWeight: '500', color: '#FFF', letterSpacing: 0.05 * 10 }}>
            CANLI
          </Text>
        </View>

        {/* Pipeline circles */}
        <View className="flex-row items-center" style={{ gap: 12 }}>
          {PIPELINE_STAGES.map((stage) => {
            const count = pipelineCounts[stage.key] ?? 0;
            const active = count > 0;
            return (
              <Pressable
                key={stage.key}
                onPress={() => router.push('/(admin)/orders' as any)}
                className="items-center"
                style={{ gap: 4 }}
              >
                <Animated.View
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: active ? hexA(P, 0.2) : 'rgba(255,255,255,0.06)',
                    borderWidth: active ? 1.5 : 1,
                    borderColor: active ? P : 'rgba(255,255,255,0.1)',
                    alignItems: 'center', justifyContent: 'center',
                    transform: active ? [{ scale: breatheScale }] : [],
                  }}
                >
                  <Text style={{
                    ...SERIF, fontSize: 16, letterSpacing: -0.5,
                    color: active ? '#FFF' : 'rgba(255,255,255,0.3)',
                  }}>
                    {count}
                  </Text>
                </Animated.View>
                <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                  {stage.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* White section — latest order info */}
      <View style={{ padding: 16 }}>
        {latestOrder ? (
          <Pressable
            onPress={() => router.push(`/(admin)/order/${latestOrder.id}` as any)}
            style={{ gap: 2 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: INK }} numberOfLines={1}>
              {latestOrder.doctor_name ?? 'Sipariş'}
            </Text>
            <Text style={{ fontSize: 11, color: DS.ink[500], marginBottom: 10 }} numberOfLines={1}>
              #{latestOrder.order_number} · {latestOrder.work_type ?? ''}
            </Text>
            <StatusBadge status={latestOrder.status} />
          </Pressable>
        ) : (
          <Text style={{ fontSize: 13, color: DS.ink[400] }}>Yükleniyor...</Text>
        )}
      </View>
    </Card>
  );
}

// ── Production Bar Chart (simple) ──
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);

  return (
    <View className="flex-row items-end" style={{ flex: 1, gap: 6 }}>
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * 100, 6);
        const isHighlight = i === highestIdx;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            {isHighlight && d.count > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: INK, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '500' }}>{d.count}</Text>
              </View>
            )}
            <View style={{
              width: '100%',
              height: `${h}%` as any,
              backgroundColor: isHighlight ? P : INK,
              borderRadius: 4,
              minHeight: 4,
            }} />
            <Text style={{ fontSize: 9, color: DS.ink[400], textTransform: 'uppercase' }}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Weekly Calendar Strip ──
function WeeklyStrip({
  weekDays, weekCounts, onPress,
}: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  onPress: () => void;
}) {
  const totalProduction = Object.values(weekCounts).reduce((a, b) => a + b, 0);

  const first = weekDays[0];
  const last  = weekDays[6];
  const fd = new Date(first.date);
  const ld = new Date(last.date);
  const rangeLabel = `${fd.getDate()}–${ld.getDate()} ${MONTHS_TR[ld.getMonth()]} ${ld.getFullYear()}`;

  return (
    <Card style={{ padding: 18, flex: 2 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>Bu hafta</Text>
        <Text style={{ fontSize: 12, color: DS.ink[400] }}>{rangeLabel}</Text>
        <View style={{ flex: 1 }} />
        <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.exec.bgSoft }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: P }}>Toplam {totalProduction}</Text>
        </View>
      </View>

      <View className="flex-row" style={{ gap: 8, flex: 1 }}>
        {weekDays.map((day, i) => {
          const count = weekCounts[day.date] ?? 0;
          return (
            <Pressable
              key={i}
              onPress={onPress}
              style={{
                flex: 1,
                backgroundColor: day.isToday ? INK : DS.ink[50],
                borderRadius: 14,
                padding: 12,
                gap: 8,
                position: 'relative',
              }}
            >
              <Text style={{
                fontSize: 10, opacity: 0.6, letterSpacing: 0.05 * 10,
                textTransform: 'uppercase',
                color: day.isToday ? '#FFF' : INK,
              }}>
                {day.label}
              </Text>
              <Text style={{
                ...SERIF, fontSize: 24, letterSpacing: -0.02 * 24, lineHeight: 24,
                color: day.isToday ? '#FFF' : INK,
              }}>
                {count}
              </Text>
              <Text style={{ fontSize: 9, opacity: 0.5, color: day.isToday ? '#FFF' : INK }}>
                sipariş
              </Text>
              {day.isToday && (
                <View
                  className="absolute rounded-full"
                  style={{ top: 10, right: 10, width: 6, height: 6, backgroundColor: P }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// ── Animated CTA Card — floating circle + shimmer glow + arrow bounce ──
function AnimatedCTACard({ onPress, isDesktop }: { onPress: () => void; isDesktop: boolean }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(arrowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [floatAnim, glowAnim, arrowAnim]);

  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.28] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const arrowX = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  const handleHoverIn = () => {
    Animated.spring(scaleAnim, { toValue: 1.02, friction: 8, tension: 200, useNativeDriver: true }).start();
  };
  const handleHoverOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  return (
    <Pressable onPress={onPress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut} style={{ flex: 1 }}>
      <Animated.View style={{
        flex: 1,
        borderRadius: DS.radius.xl,
        padding: 22,
        position: 'relative',
        overflow: 'hidden',
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(135deg, ${P} 0%, ${DS.exec.warning} 100%)`,
        backgroundColor: P,
        minHeight: isDesktop ? undefined : 160,
        transform: [{ scale: scaleAnim }],
      }}>
        {/* Decorative floating circle */}
        <Animated.View style={{
          position: 'absolute', top: -20, right: -20,
          width: 140, height: 140, borderRadius: 70,
          backgroundColor: 'rgba(255,255,255,0.18)',
          transform: [{ translateY: floatY }],
        }} />
        {/* Glow pulse circle */}
        <Animated.View style={{
          position: 'absolute', top: -40, right: -40,
          width: 180, height: 180, borderRadius: 90,
          backgroundColor: 'rgba(255,255,255,1)',
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }} pointerEvents="none" />
        {/* Content */}
        <View style={{ position: 'relative' }}>
          <Text style={{
            fontSize: 11, fontWeight: '500', letterSpacing: 0.1 * 11,
            textTransform: 'uppercase', color: '#FFF', marginBottom: 14,
          }}>
            Hızlı işlem
          </Text>
          <Text style={{
            ...SERIF, fontSize: 32, letterSpacing: -0.02 * 32, lineHeight: 35,
            color: '#FFF', marginBottom: 16,
          }}>
            Yeni sipariş{'\n'}oluştur
          </Text>
          <View
            className="flex-row items-center self-start rounded-full"
            style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF', gap: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: INK }}>Başla</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              <ArrowRight size={14} color={INK} strokeWidth={2} />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Animated Overdue Alert Card — danger gradient + pulse + glow ──
function AnimatedOverdueCard({ count, onPress }: { count: number; onPress: () => void }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(600),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [pulseAnim, glowAnim]);

  const dotOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] });

  return (
    <Pressable onPress={onPress}
      onHoverIn={() => Animated.spring(scaleAnim, { toValue: 1.015, friction: 8, tension: 200, useNativeDriver: true }).start()}
      onHoverOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start()}
    >
      <Animated.View style={{
        borderRadius: DS.radius.xl, overflow: 'hidden', marginBottom: 14,
        // @ts-ignore web gradient
        backgroundImage: 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 50%, #B91C1C 100%)',
        backgroundColor: '#7F1D1D',
        transform: [{ scale: scaleAnim }],
        position: 'relative',
      }}>
        {/* Ambient glow */}
        <Animated.View style={{
          position: 'absolute', top: -30, right: -30,
          width: 160, height: 160, borderRadius: 80,
          backgroundColor: '#EF4444',
          opacity: glowOpacity, transform: [{ scale: glowScale }],
        }} pointerEvents="none" />

        <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* Pulsing icon */}
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ opacity: dotOpacity }}>
              <AlertTriangle size={18} color="#FCA5A5" strokeWidth={1.8} />
            </Animated.View>
          </View>

          <View style={{ flex: 1 }}>
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#FCA5A5', opacity: dotOpacity }} />
              <Text style={{ fontSize: 9, fontWeight: '500', color: '#FCA5A5', letterSpacing: 0.5, textTransform: 'uppercase' }}>Acil</Text>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.5, lineHeight: 24, color: '#FFF', marginLeft: 4 }}>
                {count}
              </Text>
              <Text style={{ fontSize: 13, color: '#FCA5A5', marginLeft: 2 }}>geciken sipariş</Text>
            </View>
          </View>

          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpRight size={14} color="#FCA5A5" strokeWidth={1.8} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Bugünkü Görevler — Dark card ──
function TasksCard({
  tasks,
}: {
  tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[];
}) {
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <View style={{
      backgroundColor: DS.exec.surfaceAlt,
      // @ts-ignore web gradient
      backgroundImage: `linear-gradient(135deg, ${DS.exec.surfaceAlt} 0%, ${DS.exec.primaryDeep}33 100%)`,
      borderRadius: DS.radius.xl, padding: 22,
      flex: 1, gap: 0,
    }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Bugünkü görevler</Text>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{doneCount}/{tasks.length}</Text>
      </View>
      <View style={{ gap: 10, flex: 1 }}>
        {tasks.map((t, i) => {
          const IconComp = t.icon;
          return (
            <Pressable
              key={i}
              onPress={t.onPress}
              className="flex-row items-center"
              style={{
                gap: 10, paddingBottom: 10,
                borderBottomWidth: i < tasks.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <IconComp size={14} color="#FFF" strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12, fontWeight: '500', color: '#FFF',
                    textDecorationLine: t.done ? 'line-through' : 'none',
                    opacity: t.done ? 0.4 : 1,
                  }}
                >
                  {t.label}
                </Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.time}</Text>
              </View>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: t.done ? P : 'transparent',
                borderWidth: t.done ? 0 : 1.5,
                borderColor: t.done ? undefined : 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {t.done && <Check size={10} color="#FFF" strokeWidth={2.5} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Status Distribution Card ──
function StatusDistCard({ byStatus }: { byStatus: { label: string; count: number; key: string }[] }) {
  const total = byStatus.reduce((s, x) => s + x.count, 0) || 1;
  return (
    <Card style={{ padding: 22 }}>
      <CardHeader title="Statü Dağılımı" display />
      <View style={{ gap: 12 }}>
        {byStatus.map(item => {
          const pct = Math.round((item.count / total) * 100);
          const cfg = STATUS_CFG[item.key];
          return (
            <View key={item.key}>
              <View className="flex-row items-center" style={{ marginBottom: 5 }}>
                <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: cfg?.color ?? INK, marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>{item.label}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: INK }}>{item.count}</Text>
                <Text style={{ fontSize: 10, color: DS.ink[400], marginLeft: 6, width: 28, textAlign: 'right' }}>{pct}%</Text>
              </View>
              <View className="rounded overflow-hidden" style={{ height: 4, backgroundColor: DS.ink[100] }}>
                <View className="rounded" style={{ height: 4, backgroundColor: cfg?.color ?? INK, width: `${pct}%` as any }} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ── Work Type Card ──
function WorkTypeCard({ data }: { data: { label: string; count: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const palette = [P, CLR.blue, CLR.purple, CLR.teal, CLR.orange];
  return (
    <Card style={{ padding: 22 }}>
      <CardHeader title="İş Tipi Dağılımı" display />
      <View style={{ gap: 10 }}>
        {data.slice(0, 5).map((w, i) => (
          <View key={i}>
            <View className="flex-row items-center" style={{ marginBottom: 5 }}>
              <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: palette[i], marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 11, color: INK, fontWeight: '500' }} numberOfLines={1}>{w.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[500] }}>{w.count}</Text>
            </View>
            <View className="rounded overflow-hidden" style={{ height: 3, backgroundColor: DS.ink[100] }}>
              <View className="rounded" style={{ height: 3, backgroundColor: palette[i], width: `${Math.round((w.count / max) * 100)}%` as any, opacity: 0.7 }} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ── Finance Card ──
function FinanceCard({ monthly, pending, paid }: { monthly: number; pending: number; paid: number }) {
  return (
    <Card style={{ padding: 22 }}>
      <CardHeader title="Finansal Özet" display />
      <View style={{ gap: 14 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className="rounded-full" style={{ width: 8, height: 8, backgroundColor: CLR.green }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 2 }}>Bu Ay Tahsilat</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: CLR.green, letterSpacing: -0.4 }}>{fmtMoney(monthly)}</Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: DS.ink[100] }} />
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className="rounded-full" style={{ width: 8, height: 8, backgroundColor: CLR.orange }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 2 }}>Bekleyen Fatura</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: CLR.orange, letterSpacing: -0.4 }}>{fmtMoney(pending)}</Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: DS.ink[100] }} />
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className="rounded-full" style={{ width: 8, height: 8, backgroundColor: INK }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 2 }}>Ödenen Fatura Adedi</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>{paid}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const router    = useRouter();
  const isDesktop = useIsDesktop();
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, [setTitle, clear]);

  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [totalOrders, setTotalOrders]     = useState(0);
  const [todayOrders, setTodayOrders]     = useState(0);
  const [overdueCount, setOverdue]        = useState(0);
  const [totalDoctors, setDoctors]        = useState(0);
  const [totalLabUsers, setLabUsers]      = useState(0);
  const [todayDelivery, setTodayDelivery] = useState(0);
  const [byStatus, setByStatus]           = useState<{ label: string; count: number; key: string }[]>([]);
  const [byWorkType, setByWorkType]       = useState<{ label: string; count: number }[]>([]);
  const [monthly, setMonthly]             = useState<{ label: string; count: number }[]>([]);
  const [recentOrders, setRecentOrders]   = useState<any[]>([]);
  const [upcoming, setUpcoming]           = useState<any[]>([]);
  const [hovered, setHovered]             = useState<string | null>(null);
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});
  const [weekCounts, setWeekCounts]       = useState<Record<string, number>>({});

  // Finance state
  const [finMonthly, setFinMonthly]       = useState(0);
  const [finPending, setFinPending]       = useState(0);
  const [finPaidCount, setFinPaidCount]   = useState(0);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayStr();
      const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3);
      const in3DaysStr = in3Days.toISOString().split('T')[0];

      const [ordersRes, profilesRes, recentRes, upcomingRes] = await Promise.all([
        supabase.from('work_orders').select('status, delivery_date, created_at, work_type, doctor:doctor_id(full_name)'),
        supabase.from('profiles').select('user_type').neq('user_type', 'admin'),
        supabase.from('work_orders').select('id, order_number, work_type, status, delivery_date, is_urgent, doctor:doctor_id(full_name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('work_orders').select('id, order_number, status, delivery_date, doctor:doctor_id(full_name)').gte('delivery_date', today).lte('delivery_date', in3DaysStr).neq('status', 'teslim_edildi').order('delivery_date'),
      ]);

      const orders   = (ordersRes.data ?? []) as any[];
      const profiles = profilesRes.data ?? [];
      const recent   = (recentRes.data ?? []) as any[];
      const upcomingData = (upcomingRes.data ?? []) as any[];

      let todayCount = 0, overdueC = 0, todayDel = 0;
      const statusMap: Record<string, number> = {};
      const wtMap: Record<string, number>     = {};
      const monthMap: Record<string, number>  = {};

      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
      }

      for (const o of orders) {
        if (o.created_at?.startsWith(today)) todayCount++;
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueC++;
        if (o.delivery_date === today && o.status !== 'teslim_edildi') todayDel++;
        statusMap[o.status] = (statusMap[o.status] ?? 0) + 1;
        if (o.work_type) wtMap[o.work_type] = (wtMap[o.work_type] ?? 0) + 1;
        if (o.created_at) {
          const d = new Date(o.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (key in monthMap) monthMap[key] += 1;
        }
      }

      // Pipeline counts
      const pipeCounts: Record<string, number> = {};
      STATUS_KEYS.forEach(k => { pipeCounts[k] = statusMap[k] ?? 0; });
      setPipelineCounts(pipeCounts);

      // Week counts
      const weekDays = getWeekDays();
      const wc: Record<string, number> = {};
      weekDays.forEach(wd => {
        wc[wd.date] = orders.filter(o => o.created_at?.startsWith(wd.date)).length;
      });
      setWeekCounts(wc);

      setTotalOrders(orders.length);
      setTodayOrders(todayCount);
      setOverdue(overdueC);
      setTodayDelivery(todayDel);
      setDoctors(profiles.filter((p: any) => p.user_type === 'doctor').length);
      setLabUsers(profiles.filter((p: any) => ['lab', 'lab_user', 'mesul_mudur'].includes(p.user_type)).length);

      setByStatus(STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: statusMap[k] ?? 0 })));
      setByWorkType(Object.entries(wtMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count })));
      setMonthly(Object.entries(monthMap).map(([key, count]) => ({ label: MONTHS_TR[parseInt(key.split('-')[1]) - 1], count })));
      setRecentOrders(recent.map(o => ({
        id: o.id, order_number: o.order_number, work_type: o.work_type,
        status: o.status, delivery_date: o.delivery_date, is_urgent: o.is_urgent ?? false,
        doctor_name: (o.doctor as any)?.full_name ?? '--',
      })));
      setUpcoming(upcomingData.map(o => ({
        id: o.id, order_number: o.order_number, status: o.status,
        delivery_date: o.delivery_date, doctor_name: (o.doctor as any)?.full_name ?? '--',
      })));

      // Finance data
      try {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const [invRes, pendRes] = await Promise.all([
          supabase.from('invoices').select('total_amount, status').gte('created_at', monthStart.toISOString()),
          supabase.from('invoices').select('total_amount').eq('status', 'sent'),
        ]);
        if (invRes.data) {
          const paid = invRes.data.filter((i: any) => i.status === 'paid');
          setFinMonthly(paid.reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0));
          setFinPaidCount(paid.length);
        }
        if (pendRes.data) {
          setFinPending(pendRes.data.reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0));
        }
      } catch { /* invoices table may not exist */ }
    } catch (e) {
      console.error('AdminDashboard loadStats error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const today = todayStr();

  // Derived stats
  const totalActive = totalOrders - (byStatus.find(s => s.key === 'teslim_edildi')?.count ?? 0);
  const totalPipe = Object.values(pipelineCounts).reduce((s, v) => s + v, 0) || 1;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct   = Math.round(((pipelineCounts['teslim_edildi'] ?? 0) / totalPipe) * 100);

  // Latest active order for AnimatedAktifVakaCard
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi') ?? recentOrders[0];

  // Tasks for dark card
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];

  // Overdue orders as tasks
  const overdueOrdersFromRecent = recentOrders.filter(o => o.delivery_date < today && o.status !== 'teslim_edildi');
  overdueOrdersFromRecent.slice(0, 2).forEach(o => {
    taskItems.push({
      icon: Clock as React.FC<any>,
      label: `${o.doctor_name ?? 'Sipariş'} · gecikmiş`,
      time: fmtDate(o.delivery_date),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Upcoming deliveries as tasks
  upcoming.slice(0, 2).forEach(o => {
    taskItems.push({
      icon: Package as React.FC<any>,
      label: `${o.doctor_name ?? 'Sipariş'} · teslim`,
      time: fmtDate(o.delivery_date),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Today's orders as tasks
  const todayOrdersFromRecent = recentOrders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');
  todayOrdersFromRecent.slice(0, 1).forEach(o => {
    taskItems.push({
      icon: Calendar as React.FC<any>,
      label: `${o.doctor_name ?? 'Sipariş'} · bugün`,
      time: 'Bugün',
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  if (taskItems.length === 0) {
    taskItems.push(
      { icon: CheckCircle as React.FC<any>, label: 'Bekleyen görev yok', time: '', done: true, onPress: undefined },
    );
  }

  const weekDays = getWeekDays();

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: isDesktop ? 10 : 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={P} />}
    >
      {/* ════════ HERO ════════ */}
      <View className="mb-5">
        <View className={`${isDesktop ? 'flex-row justify-between items-end' : ''}`} style={{ gap: 32, paddingTop: 8 }}>
          {/* Left: greeting + stat pills */}
          <View style={{ flex: 1 }}>
            <Text style={{
              ...SERIF, fontSize: isDesktop ? 56 : 40,
              letterSpacing: -0.025 * (isDesktop ? 56 : 40),
              lineHeight: isDesktop ? 56 : 42,
              color: INK,
            }}>
              Hoş geldin,{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>{firstName}</Text>
            </Text>

            {/* Stat pills row */}
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label="Aktif" value={`${totalActive}`} bg={P} color="#FFF" />
              {overdueCount > 0 && (
                <StatPill label="Geciken" value={`${overdueCount}`} bg="rgba(217,75,75,0.12)" color="#9C2E2E" />
              )}
              <StatPill label="Bugün" value={`${todayOrders}`} bg="rgba(0,0,0,0.08)" color={INK} />
            </View>
          </View>

          {/* Right: big stats */}
          <View className="flex-row" style={{ gap: 32, alignItems: 'flex-end' }}>
            <BigStat value={totalOrders.toLocaleString('tr-TR')} label="Toplam sipariş" />
            <BigStat value={totalDoctors} label="Hekim" />
            <BigStat value={totalLabUsers} label="Lab kullanıcı" />
          </View>
        </View>
      </View>

      {/* ════════ OVERDUE ALERT ════════ */}
      {overdueCount > 0 && (
        <AnimatedOverdueCard count={overdueCount} onPress={() => router.push('/(admin)/orders' as any)} />
      )}

      {/* ════════ 4-CARD GRID ════════ */}
      <View
        className={isDesktop ? 'flex-row' : ''}
        style={{ gap: 14, marginBottom: 14 }}
      >
        {/* Card 1: Aktif Vaka — dark top + white bottom + animations */}
        <AnimatedAktifVakaCard
          isDesktop={isDesktop}
          pipelineCounts={pipelineCounts}
          latestOrder={latestOrder}
          router={router}
        />

        {/* Card 2: Sipariş Trendi (bar chart) */}
        <Card style={{ flex: isDesktop ? 1.2 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.015 * 18, color: INK }}>Sipariş Trendi</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -0.025 * 42, lineHeight: 42, marginTop: 8, color: INK }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: DS.ink[400] }}> bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>Son 6 aylık trend</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(admin)/orders' as any)}
              className="items-center justify-center rounded-full"
              style={{ width: 32, height: 32, backgroundColor: DS.ink[100] }}
            >
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          {monthly.length > 0 && (
            <View style={{ flex: 1, minHeight: 120 }}>
              <ProductionBarChart data={monthly} />
            </View>
          )}
        </Card>

        {/* Card 3: Üretim Ring — PercentRingHero on white bg */}
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 14 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>Teslim Oranı</Text>
            <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <PercentRingHero value={deliveryPct} size={140} darkText />
          <Text style={{ fontSize: 9, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.08 * 9, marginTop: 10 }}>
            Teslim
          </Text>
          {/* Mini pipeline stats */}
          <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.ink[100] }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: DS.ink[500] }}>
                {pipelineCounts['uretimde'] ?? 0} üretimde
              </Text>
            </View>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(P, 0.15) }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: P }}>
                {pipelineCounts['teslimata_hazir'] ?? 0} hazır
              </Text>
            </View>
          </View>
        </Card>

        {/* Card 4: Bugünkü Görevler — Dark */}
        <View style={{ flex: isDesktop ? 1.4 : undefined }}>
          <TasksCard tasks={taskItems} />
        </View>
      </View>

      {/* ════════ BOTTOM ROW — Weekly + Hızlı İşlem CTA ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        <WeeklyStrip
          weekDays={weekDays}
          weekCounts={weekCounts}
          onPress={() => router.push('/(admin)/orders' as any)}
        />
        <AnimatedCTACard onPress={() => router.push('/(admin)/new-order' as any)} isDesktop={isDesktop} />
      </View>

      {/* ════════ EXTRA SECTIONS (below fold) ════════ */}

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 80 }}>
          <ActivityIndicator color={P} size="large" />
        </View>
      ) : (
        <>
          {/* Son Siparişler — Patterns table */}
          <Card style={{ marginBottom: 14 }}>
            <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Son Siparişler</Text>
              <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
                <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>Tümünü Gör →</Text>
              </Pressable>
            </View>

            {/* Table header */}
            <View
              className="flex-row items-center"
              style={{
                paddingHorizontal: 20, paddingVertical: 11,
                borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
                backgroundColor: DS.ink[50],
              }}
            >
              <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>No</Text>
              <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Hekim</Text>
              {isDesktop && <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>İş Tipi</Text>}
              <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Durum</Text>
              {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'right' }}>Teslim</Text>}
            </View>

            {recentOrders.length === 0
              ? <Text className="p-6 text-center" style={{ fontSize: 13, color: DS.ink[400] }}>Yükleniyor...</Text>
              : recentOrders.map((order, idx) => {
                  const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                  const isLast  = idx === recentOrders.length - 1;
                  return (
                    <Pressable
                      key={order.id}
                      className="flex-row items-center"
                      style={{
                        paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                        borderBottomWidth: !isLast ? 1 : 0,
                        borderBottomColor: 'rgba(0,0,0,0.04)',
                        backgroundColor: overdue
                          ? 'rgba(217,75,75,0.06)'
                          : hovered === order.id
                            ? 'rgba(233,119,87,0.06)'
                            : undefined,
                      }}
                      onPress={() => router.push(`/(admin)/order/${order.id}` as any)}
                      // @ts-ignore web hover
                      onMouseEnter={() => setHovered(order.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <View className="flex-row items-center" style={{ flex: 1.2, gap: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: P }} numberOfLines={1}>#{order.order_number}</Text>
                        {order.is_urgent && (
                          <View className="rounded" style={{ paddingHorizontal: 4, paddingVertical: 1, backgroundColor: 'rgba(217,75,75,0.1)' }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: CLR.red }}>ACİL</Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                        <View
                          className="items-center justify-center rounded-full"
                          style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(order.doctor_name)}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{order.doctor_name}</Text>
                      </View>
                      {isDesktop && (
                        <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500] }} numberOfLines={1}>{order.work_type || '--'}</Text>
                      )}
                      <View style={{ flex: 1.4 }}>
                        <StatusBadge status={order.status} />
                      </View>
                      {isDesktop && (
                        <Text style={{
                          flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'right',
                          color: overdue ? '#9C2E2E' : DS.ink[400],
                        }}>
                          {fmtDate(order.delivery_date)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })
            }
          </Card>

          {/* Finance + Status + Work Type — 2-column below fold */}
          <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
            <View style={{ flex: isDesktop ? 1 : undefined, gap: 14 }}>
              <FinanceCard monthly={finMonthly} pending={finPending} paid={finPaidCount} />
              {byWorkType.length > 0 && <WorkTypeCard data={byWorkType} />}
            </View>
            <View style={{ flex: isDesktop ? 1 : undefined, gap: 14, marginTop: isDesktop ? 0 : 14 }}>
              <StatusDistCard byStatus={byStatus} />
            </View>
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
