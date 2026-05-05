/**
 * LabDashboardScreen — Mockup-faithful rewrite
 *
 * Layout from dashboard-lab.jsx mockup:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. 4-column card grid (Aktif Vaka, Üretim Süresi, Mesai Ring, Bugünkü Görevler)
 *   3. Bottom row — Weekly calendar strip + Hızlı İşlem CTA
 *   4. Scrollable extras — Stok, Sipariş Trendi, İstasyon, Teknisyen
 *
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions, RefreshControl,
  Animated, Platform, Easing,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  Plus, ClipboardList, TrendingUp, AlertTriangle, Package,
  Calendar, ShieldCheck, Inbox, Activity, CheckCircle,
  ChevronRight, ArrowUpRight, ArrowRight, Clock, Trophy,
  Check, Clipboard, Box, Settings,
} from 'lucide-react-native';

// DS tokens — single source of truth for all design values
import { DS } from '../../../core/theme/dsTokens';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { supabase } from '../../../core/api/supabase';

// Display font — Patterns: Inter Tight Light (300), tight tracking
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Shorthand aliases from DS tokens ──
const P   = DS.lab.primary;     // #F5C24B saffron
const INK = DS.ink[900];        // #0A0A0A

const CLR = {
  blue: '#2563EB', green: DS.lab.success, orange: DS.lab.warning,
  red: DS.lab.danger, purple: '#7C3AED',
};

// ── CountUp hook — 0'dan target'e ease-out ──
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

// ── Pulse animasyon hook ──
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

// ── PulseDot — knob için animasyonlu halo ──
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

// ── PercentRingHero — gradient arc + knob + pulse (Patterns 11.7) ──
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

  const lightColor = DS.lab.primary;
  const deepColor = DS.lab.primaryDeep;
  const id = `pr-hero-lab-${targetValue}-${size}`;

  // Light bg: daha belirgin track; dark bg: soluk track
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

  // Knob & pulse color based on bg
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

// ── Types ──
interface TodayProva {
  id: string; prova_number: number; prova_type: string | null;
  scheduled_date: string | null; status: string; order_item_name: string | null;
  work_order: {
    id: string; order_number: string; patient_name: string | null;
    doctor?: { full_name: string; clinic?: { name: string } | null };
  } | null;
}
interface MonthBar    { month: string; count: number; }
interface StationStat { station_name: string; station_color: string | null; avg_duration_hours: number; active_count: number; total_processed: number; }
interface TechStat    { technician_name: string; approval_rate: number; avg_work_duration_hours: number; total_assigned: number; }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',          color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' },
  uretimde:        { label: 'Üretimde',        color: '#9C5E0E',       bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#1F5689',       bg: 'rgba(74,143,201,0.12)' },
  teslimata_hazir: { label: 'Teslimata Hazır', color: '#1F6B47',       bg: 'rgba(45,154,107,0.12)' },
  teslim_edildi:   { label: 'Teslim Edildi',   color: DS.ink[400],bg: 'rgba(0,0,0,0.04)' },
};

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const DAYS_SHORT = ['Pz','Pa','Sa','Ça','Pe','Cu','Ct'];

// ── Helpers ──
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function getTodayLabel() {
  const d = new Date();
  const days   = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}
function initials(name?: string | null) {
  if (!name) return '--';
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map(x => x[0]?.toUpperCase() ?? '').join('') || '--';
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
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // go back to Monday

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
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

/** Generic card — Patterns section 05 "solid": white bg, radius 24, 1px border, NO shadow */
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

/** Card header — Patterns section 05/09: uppercase micro label or display-style title */
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

// ── Animated Aktif Vaka Card — pulsing CANLI dot + glow + breathing circles ──
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, latestOrder, router }: {
  isDesktop: boolean;
  pipelineCounts: Record<string, number>;
  latestOrder: any;
  router: any;
}) {
  // Pulsing CANLI dot
  const dotAnim = useRef(new Animated.Value(0)).current;
  // Ambient glow behind pipeline circles
  const glowAnim = useRef(new Animated.Value(0)).current;
  // Breathing scale on active pipeline circles
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // CANLI dot pulse — opacity blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();

    // Ambient glow — slow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    // Breathing circles — subtle scale
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
        backgroundColor: DS.lab.surfaceAlt,
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Ambient glow behind circles */}
        <Animated.View style={{
          position: 'absolute', width: 160, height: 160, borderRadius: 80,
          backgroundColor: P,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }} pointerEvents="none" />

        {/* CANLI badge with animated dot */}
        <View className="absolute rounded-full" style={{
          top: 14, left: 14,
          paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: `${P}E6`,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Animated.View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: INK,
            opacity: dotOpacity,
          }} />
          <Text style={{ fontSize: 10, fontWeight: '500', color: INK, letterSpacing: 0.05 * 10 }}>
            CANLI
          </Text>
        </View>

        {/* Pipeline circles mini with breathing */}
        <View className="flex-row items-center" style={{ gap: 12 }}>
          {PIPELINE_STAGES.slice(0, 4).map((stage) => {
            const count = pipelineCounts[stage.key] ?? 0;
            const active = count > 0;
            return (
              <Pressable
                key={stage.key}
                onPress={() => router.push('/(lab)/all-orders' as any)}
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
            onPress={() => router.push(`/(lab)/order/${latestOrder.id}` as any)}
            style={{ gap: 2 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: INK }} numberOfLines={1}>
              {latestOrder.patient_name ?? (latestOrder.doctor as any)?.full_name ?? 'Sipariş'}
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

// ── Animated CTA Card — floating circle + shimmer glow + arrow bounce ──
function AnimatedCTACard({ onPress, isDesktop }: { onPress: () => void; isDesktop: boolean }) {
  // Floating decorative circle — slow float up/down
  const floatAnim = useRef(new Animated.Value(0)).current;
  // Shimmer glow circle — pulsing opacity
  const glowAnim = useRef(new Animated.Value(0)).current;
  // Arrow bounce — nudge right periodically
  const arrowAnim = useRef(new Animated.Value(0)).current;
  // Hover scale (web)
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Float: smooth up/down loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    // Glow: pulse opacity
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    // Arrow: periodic nudge right
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
        backgroundImage: `linear-gradient(135deg, ${DS.lab.primary} 0%, ${DS.lab.warning} 100%)`,
        backgroundColor: DS.lab.primary,
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
        {/* Glow pulse circle — larger, softer */}
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
            textTransform: 'uppercase', color: INK, marginBottom: 14,
          }}>
            Hızlı işlem
          </Text>
          <Text style={{
            ...SERIF, fontSize: 32, letterSpacing: -0.02 * 32, lineHeight: 35,
            color: INK, marginBottom: 16,
          }}>
            Yeni sipariş{'\n'}oluştur
          </Text>
          <View
            className="flex-row items-center self-start rounded-full"
            style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: INK, gap: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>Başla</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              <ArrowRight size={14} color="#FFF" strokeWidth={2} />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
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

// ── Stat Pill (mockup hero) ──
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

// ── Big Stat — Patterns section 10, Hero 1 right side ──
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

// ── Üretim Süresi Bar Chart (mockup card 2) ──
function ProductionBarChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);
  const lastIdx = data.length - 1;

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
              {d.month}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Weekly Calendar Strip (mockup bottom-left) ──
function WeeklyStrip({
  weekDays, weekCounts, onPress,
}: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  onPress: () => void;
}) {
  const totalProduction = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const completedCount = Math.round(totalProduction * 0.65); // approximate

  // Week range label
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
        <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.lab.bgSoft }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#9C5E0E' }}>Üretimde {totalProduction}</Text>
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

// ── Bugünkü Görevler — Dark card (mockup card 4) ──
function TasksCard({
  tasks,
}: {
  tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[];
}) {
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <View style={{
      backgroundColor: DS.lab.surfaceAlt,
      // @ts-ignore web gradient — Patterns 11.5 dark card
      backgroundImage: `linear-gradient(135deg, ${DS.lab.surfaceAlt} 0%, ${DS.lab.primaryDeep}33 100%)`,
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
                {t.done && <Check size={10} color={INK} strokeWidth={2.5} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Station Bottleneck ──
function StationBottleneck({ data }: { data: StationStat[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.avg_duration_hours), 1);
  return (
    <View style={{ gap: 12 }}>
      {data.map((st, i) => {
        const pct   = (st.avg_duration_hours / maxVal) * 100;
        const color = st.station_color ?? CLR.blue;
        return (
          <View key={i} style={{ gap: 5 }}>
            <View className="flex-row justify-between items-center">
              <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{st.station_name}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{st.avg_duration_hours.toFixed(1)}s</Text>
            </View>
            <View className="rounded overflow-hidden" style={{ height: 6, backgroundColor: DS.ink[100] }}>
              <View className="rounded" style={{ height: 6, backgroundColor: color, width: `${pct}%` as any }} />
            </View>
            <Text style={{ fontSize: 10, color: DS.ink[400] }}>
              {st.active_count} aktif · {st.total_processed} işlendi
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Top Technicians ──
function TopTechnicians({ data }: { data: TechStat[] }) {
  if (data.length === 0) return null;
  return (
    <View>
      {data.map((tech, i) => {
        const rate     = Math.round((tech.approval_rate ?? 0) * 100);
        const barColor = rate >= 80 ? CLR.green : rate >= 60 ? CLR.orange : CLR.red;
        return (
          <View
            key={i}
            className="flex-row items-center"
            style={{
              paddingVertical: 10, gap: 10,
              borderBottomWidth: i < data.length - 1 ? 1 : 0,
              borderBottomColor: 'rgba(0,0,0,0.04)',
            }}
          >
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 26, height: 26,
                backgroundColor: i === 0 ? hexA(P, 0.2) : 'rgba(0,0,0,0.05)',
              }}
            >
              {i === 0
                ? <Trophy size={13} color={P} strokeWidth={2} />
                : <Text style={{ fontSize: 11, fontWeight: '800', color: DS.ink[500] }}>{i + 1}</Text>
              }
            </View>
            <View className="flex-1" style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{tech.technician_name}</Text>
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <View className="flex-1 rounded overflow-hidden" style={{ height: 5, backgroundColor: DS.ink[100] }}>
                  <View className="rounded" style={{ height: 5, backgroundColor: barColor, width: `${rate}%` as any }} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: barColor, width: 30, textAlign: 'right' }}>{rate}%</Text>
              </View>
              <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                {tech.total_assigned} atama · {(tech.avg_work_duration_hours ?? 0).toFixed(1)}s ort.
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { key: 'alindi',          label: 'Alındı'   },
  { key: 'uretimde',        label: 'Üretimde' },
  { key: 'kalite_kontrol',  label: 'KK'       },
  { key: 'teslimata_hazir', label: 'Hazır'    },
  { key: 'teslim_edildi',   label: 'Teslim'   },
] as const;

export function LabDashboardScreen() {
  const router       = useRouter();
  const { profile }  = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width }    = useWindowDimensions();
  const isDesktop    = width >= 900;
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, []);

  const [provas,          setProvas]         = useState<TodayProva[]>([]);
  const [provasLoading,   setProvasLoading]  = useState(true);
  const [monthly,         setMonthly]        = useState<MonthBar[]>([]);
  const [recentOrders,    setRecentOrders]   = useState<any[]>([]);
  const [todayNewCount,   setTodayNewCount]  = useState(0);
  const [totalActiveCount,setTotalActive]    = useState(0);
  const [totalCaseCount,  setTotalCases]     = useState(0);
  const [refreshing,      setRefreshing]     = useState(false);
  const [hovered,         setHovered]        = useState<string | null>(null);
  const [stationStats,    setStationStats]   = useState<StationStat[]>([]);
  const [topTechs,        setTopTechs]       = useState<TechStat[]>([]);
  const [pendingCount,    setPendingCount]   = useState(0);
  const [weekCounts,      setWeekCounts]     = useState<Record<string, number>>({});
  const [pipelineCounts,  setPipelineCounts] = useState<Record<string, number>>({});

  const [stockSummary, setStockSummary] = useState<{
    lowCount: number; materialCostMtd: number; wasteCostMtd: number; topUsedName: string | null;
  } | null>(null);

  const isManager  = profile?.role === 'manager' || profile?.user_type === 'admin';
  const today      = todayStr();
  const firstName  = profile?.full_name?.split(' ')[0] ?? '';
  const overdueOrders    = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const todayDeliverable = orders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');

  // ── Data loaders ──
  const loadPipeline = useCallback(async () => {
    try {
      const statuses = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];
      const results = await Promise.all(
        statuses.map(st =>
          supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', st)
        )
      );
      const counts: Record<string, number> = {};
      statuses.forEach((st, i) => { counts[st] = results[i].count ?? 0; });
      setPipelineCounts(counts);

      // Total active (non-delivered)
      const active = statuses.slice(0, 4).reduce((s, st, i) => s + (results[i].count ?? 0), 0);
      setTotalActive(active);
    } catch (_) {}
  }, []);

  const loadExtra = useCallback(async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, delivery_date, created_at, patient_name, doctor:doctor_id(full_name)')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      setRecentOrders(data.slice(0, 5));
      setTotalCases(data.length);

      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const y = d.getFullYear(), m = d.getMonth();
        bars.push({
          month: MONTHS_TR[m],
          count: data.filter(o => {
            const c = new Date(o.created_at);
            return c.getFullYear() === y && c.getMonth() === m;
          }).length,
        });
      }
      setMonthly(bars);

      // Week counts
      const weekDays = getWeekDays();
      const wc: Record<string, number> = {};
      weekDays.forEach(wd => {
        wc[wd.date] = data.filter(o => o.created_at?.startsWith(wd.date)).length;
      });
      setWeekCounts(wc);
    }

    const { count: todayCount } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`);
    setTodayNewCount(todayCount ?? 0);

    const { count: approvalCount } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'kalite_kontrol');
    setPendingCount(approvalCount ?? 0);
  }, [today]);

  const loadAnalytics = useCallback(async () => {
    try {
      const labId = profile?.lab_id;
      if (!labId) return;
      const [{ data: stations }, { data: techs }] = await Promise.all([
        supabase.from('v_station_analytics')
          .select('station_name, station_color, avg_duration_hours, active_count, total_processed')
          .eq('lab_id', labId).order('avg_duration_hours', { ascending: false }).limit(4),
        supabase.from('v_technician_performance')
          .select('technician_name, approval_rate, avg_work_duration_hours, total_assigned')
          .eq('lab_id', labId).order('approval_rate', { ascending: false }).limit(3),
      ]);
      setStationStats((stations ?? []) as StationStat[]);
      setTopTechs((techs ?? []) as TechStat[]);
    } catch (_) {}
  }, [profile?.lab_id]);

  const loadProvas = useCallback(async () => {
    setProvasLoading(true);
    const { data } = await fetchTodayProvas();
    setProvas((data as TodayProva[]) ?? []);
    setProvasLoading(false);
  }, []);

  const loadStockSummary = useCallback(async () => {
    const labId = profile?.lab_id ?? profile?.id;
    if (!labId) return;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    try {
      const [itemsRes, movRes] = await Promise.all([
        supabase.from('stock_items').select('id, name, quantity, min_quantity').eq('lab_id', labId),
        supabase.from('stock_movements')
          .select('item_id, item_name, type, quantity, unit_cost_at_time, is_reversed')
          .eq('lab_id', labId).gte('created_at', monthStart),
      ]);
      const items = (itemsRes.data ?? []) as any[];
      const lowCount = items.filter(i => (i.min_quantity ?? 0) > 0 && i.quantity < i.min_quantity).length;

      let materialCost = 0, wasteCost = 0;
      const usageByItem = new Map<string, { name: string; qty: number }>();
      for (const m of (movRes.data ?? []) as any[]) {
        const cost = Number(m.quantity ?? 0) * Number(m.unit_cost_at_time ?? 0);
        if (m.type === 'OUT' && !m.is_reversed) {
          materialCost += cost;
          const cur = usageByItem.get(m.item_id) ?? { name: m.item_name, qty: 0 };
          cur.qty += Number(m.quantity ?? 0);
          usageByItem.set(m.item_id, cur);
        } else if (m.type === 'WASTE') { wasteCost += cost; }
      }
      const topUsed = Array.from(usageByItem.values()).sort((a, b) => b.qty - a.qty)[0];
      setStockSummary({
        lowCount, materialCostMtd: Math.round(materialCost),
        wasteCostMtd: Math.round(wasteCost), topUsedName: topUsed?.name ?? null,
      });
    } catch {}
  }, [profile?.lab_id, profile?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadProvas(), loadExtra(), loadAnalytics(), loadPipeline(), loadStockSummary()]);
    setRefreshing(false);
  };

  useEffect(() => { loadProvas(); loadExtra(); loadAnalytics(); loadPipeline(); loadStockSummary(); }, [loadStockSummary]);

  // ── Derived data ──
  const weekDays = getWeekDays();

  // Pipeline percentages for hero stat pills
  const totalPipe = Object.values(pipelineCounts).reduce((s, v) => s + v, 0) || 1;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct   = Math.round(((pipelineCounts['teslim_edildi'] ?? 0) / totalPipe) * 100);
  const readyPct      = Math.round(((pipelineCounts['teslimata_hazir'] ?? 0) / totalPipe) * 100);

  // Latest active order for "Aktif Vaka" card
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi') ?? recentOrders[0];

  // Tasks for dark card
  const taskItems = [
    ...overdueOrders.slice(0, 2).map(o => ({
      icon: Clock as React.FC<any>,
      label: `${(o.doctor as any)?.full_name ?? 'Sipariş'} · gecikmiş`,
      time: fmtDate(o.delivery_date),
      done: false,
      onPress: () => router.push(`/(lab)/order/${o.id}` as any),
    })),
    ...todayDeliverable.slice(0, 2).map(o => ({
      icon: Package as React.FC<any>,
      label: `${(o.doctor as any)?.full_name ?? 'Sipariş'} · teslim`,
      time: 'Bugün',
      done: false,
      onPress: () => router.push(`/(lab)/order/${o.id}` as any),
    })),
    ...provas.slice(0, 2).map(pv => ({
      icon: Calendar as React.FC<any>,
      label: `${pv.work_order?.order_number ?? ''} · prova`,
      time: pv.scheduled_date ? fmtDate(pv.scheduled_date) : 'Bugün',
      done: pv.status === 'completed',
      onPress: pv.work_order ? () => router.push(`/(lab)/order/${pv.work_order!.id}` as any) : undefined,
    })),
  ].slice(0, 5);

  // If no tasks, add placeholders
  if (taskItems.length === 0) {
    taskItems.push(
      { icon: CheckCircle as React.FC<any>, label: 'Bekleyen görev yok', time: '', done: true, onPress: undefined },
    );
  }

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
        {/* Hero content row */}
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
              <StatPill label="Teslim" value={`${deliveryPct}%`} bg={P} color={INK} />
              <StatPill label="Hazır" value={`${readyPct}%`} bg="rgba(0,0,0,0.08)" color={INK} />
              {overdueOrders.length > 0 && (
                <StatPill label="Geciken" value={`${overdueOrders.length}`} bg="rgba(217,75,75,0.12)" color="#9C2E2E" />
              )}
            </View>
          </View>

          {/* Right: big stats */}
          <View className="flex-row" style={{ gap: 32, alignItems: 'flex-end' }}>
            <BigStat value={totalActiveCount} label="Aktif sipariş" />
            <BigStat value={provas.length} label="Prova" />
            <BigStat value={totalCaseCount.toLocaleString('tr-TR')} label="Toplam vaka" />
          </View>
        </View>
      </View>

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
              onPress={() => router.push('/(lab)/all-orders' as any)}
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

        {/* Card 3: Üretim Ring — PercentRingHero (Patterns 11.7) on white bg */}
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 14 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>Üretim</Text>
            <Pressable onPress={() => router.push('/(lab)/all-orders' as any)}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          {/* PercentRingHero — card bg (no dark container) */}
          <PercentRingHero value={deliveryPct} size={140} darkText />
          {/* Label */}
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
              <Text style={{ fontSize: 10, fontWeight: '500', color: '#9C5E0E' }}>
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
        {/* Weekly strip */}
        <WeeklyStrip
          weekDays={weekDays}
          weekCounts={weekCounts}
          onPress={() => router.push('/(lab)/all-orders' as any)}
        />

        {/* Hızlı İşlem CTA — saffron gradient + animated (mockup bottom-right) */}
        <AnimatedCTACard onPress={() => router.push('/(lab)/new-order' as any)} isDesktop={isDesktop} />
      </View>

      {/* ════════ EXTRA SECTIONS (below fold) ════════ */}

      {/* Son Siparişler — Patterns section 09 table */}
      <Card style={{ marginBottom: 14 }}>
        <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Son Siparişler</Text>
          <Pressable onPress={() => router.push('/(lab)/all-orders' as any)}>
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
              const drName  = (order.doctor as any)?.full_name ?? '--';
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
                        ? 'rgba(74,143,201,0.06)'
                        : undefined,
                  }}
                  onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                  // @ts-ignore
                  onMouseEnter={() => setHovered(order.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '800', color: P }} numberOfLines={1}>#{order.order_number}</Text>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View
                      className="items-center justify-center rounded-full"
                      style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(drName)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{drName}</Text>
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

      {/* Stok & Maliyet */}
      {stockSummary && (
        <Card style={{ marginBottom: 14 }}>
          <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Stok & Maliyet</Text>
            <Pressable onPress={() => router.push('/(lab)/stock' as any)}>
              <Text style={{ fontSize: 12, color: P, fontWeight: '700' }}>Stoğa git →</Text>
            </Pressable>
          </View>
          <View className="flex-row" style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
            <Pressable
              className="rounded-xl"
              style={{
                flex: 1, padding: 12, gap: 4,
                backgroundColor: stockSummary.lowCount > 0 ? 'rgba(217,75,75,0.06)' : DS.ink[50],
                borderWidth: 1, borderColor: stockSummary.lowCount > 0 ? 'rgba(217,75,75,0.2)' : 'rgba(0,0,0,0.04)',
              }}
              onPress={() => router.push('/(lab)/stock' as any)}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: stockSummary.lowCount > 0 ? '#9C2E2E' : INK }}>
                {stockSummary.lowCount}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>Kritik Stok</Text>
            </Pressable>

            <View className="rounded-xl" style={{ flex: 1, padding: 12, gap: 4, backgroundColor: DS.ink[50], borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: INK, letterSpacing: -0.4 }}>
                {stockSummary.materialCostMtd.toLocaleString('tr-TR')} ₺
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>Materyal Maliyeti</Text>
            </View>

            <View className="rounded-xl" style={{
              flex: 1, padding: 12, gap: 4,
              backgroundColor: stockSummary.wasteCostMtd > 0 ? 'rgba(217,75,75,0.06)' : DS.ink[50],
              borderWidth: 1, borderColor: stockSummary.wasteCostMtd > 0 ? 'rgba(217,75,75,0.2)' : 'rgba(0,0,0,0.04)',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: stockSummary.wasteCostMtd > 0 ? '#9C2E2E' : INK }}>
                {stockSummary.wasteCostMtd > 0 ? '-' : ''}{stockSummary.wasteCostMtd.toLocaleString('tr-TR')} ₺
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>Fire Kaybı</Text>
            </View>
          </View>
          {stockSummary.topUsedName && (
            <View className="flex-row items-center" style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6 }}>
              <Trophy size={13} color={P} strokeWidth={2} />
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                En çok kullanılan: <Text style={{ fontWeight: '800', color: INK }}>{stockSummary.topUsedName}</Text>
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* İstasyon & Teknisyen */}
      {(stationStats.length > 0 || topTechs.length > 0) && (
        <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
          {stationStats.length > 0 && (
            <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
              <CardHeader title="İstasyon Yoğunluğu" display />
              <StationBottleneck data={stationStats} />
            </Card>
          )}
          {topTechs.length > 0 && (
            <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22 }}>
              <CardHeader title="Teknisyen Performansı" display />
              <TopTechnicians data={topTechs} />
            </Card>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
