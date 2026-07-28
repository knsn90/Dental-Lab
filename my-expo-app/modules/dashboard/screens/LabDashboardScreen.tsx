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
import { useTranslation } from 'react-i18next';
import { localeTag, isRTL } from '../../../core/i18n';
import {
  View, Text, ScrollView, Pressable, Image,
  useWindowDimensions, RefreshControl,
  Animated, Platform, Easing,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  Plus, ClipboardList, TrendingUp, AlertTriangle, Package,
  Calendar, ShieldCheck, Inbox, Activity, CheckCircle,
  ChevronRight, ArrowUpRight, ArrowRight, Clock, Trophy,
  Check, Clipboard, Box, Settings, ListChecks, CornerDownRight,
  Receipt, Wallet,
} from 'lucide-react-native';
import { formatMoney, type Currency } from '../../../core/money/currency';

// DS tokens — single source of truth for all design values
import { DS } from '../../../core/theme/dsTokens';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { supabase } from '../../../core/api/supabase';
import { NumberTickerX } from '../../../core/ui/NumberTickerX';
import { useDashboardCache } from '../../../core/store/dashboardCacheStore';
import { useUiOverlayStore } from '../../../core/store/uiOverlayStore';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { FaceScanQuickAction } from '../../orders/components/FaceScanQuickAction';
import { resolveOrderStatus } from '../components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../orders/revisionGroups';
import { useRevisionParents } from '../../orders/hooks/useRevisionParents';

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
interface MonthBar    { month: string; count: number; teeth?: number; }
interface StationStat { station_name: string; station_color: string | null; avg_duration_hours: number; active_count: number; total_processed: number; }
interface TechStat    { technician_name: string; approval_rate: number; avg_work_duration_hours: number; total_assigned: number; }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',          color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' },
  atama_bekleniyor:{ label: 'Atama Bekliyor',  color: DS.ink[500],     bg: 'rgba(0,0,0,0.05)' },
  asamada:         { label: 'Üretimde',        color: '#9C5E0E',       bg: 'rgba(232,155,42,0.15)' },
  uretimde:        { label: 'Üretimde',        color: '#9C5E0E',       bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#1F5689',       bg: 'rgba(74,143,201,0.12)' },
  kurye_bekleniyor:{ label: 'Kurye Bekleniyor',color: '#1F5689',       bg: 'rgba(74,143,201,0.12)' },
  kuryede:         { label: 'Kuryede',         color: '#1F5689',       bg: 'rgba(74,143,201,0.12)' },
  iptal:           { label: 'İptal',           color: '#B91C1C',       bg: 'rgba(220,38,38,0.10)' },
  teslimata_hazir: { label: 'Kuryeye Teslim Edildi', color: '#1F6B47',       bg: 'rgba(45,154,107,0.12)' },
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
function getTodayLabel(lng?: string) {
  return new Date().toLocaleDateString(localeTag(lng), { weekday: 'long', day: 'numeric', month: 'long' });
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
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, latestOrder, planningCount = 0, router }: {
  isDesktop: boolean;
  pipelineCounts: Record<string, number>;
  latestOrder: any;
  planningCount?: number;
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
      {/* Dark section — native gradient via SVG */}
      <View style={{
        flex: 1,
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(180deg, ${DS.ink[700]} 0%, ${DS.ink[900]} 100%)`,
        backgroundColor: DS.ink[900], // fallback solid
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Native gradient — saffron radial-ish overlay (sol üstte sıcak) */}
        {Platform.OS !== 'web' && (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -80, left: -50,
                width: 200, height: 200, borderRadius: 100,
                backgroundColor: P, opacity: 0.55,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -130, left: -100,
                width: 320, height: 320, borderRadius: 160,
                backgroundColor: P, opacity: 0.20,
              }}
            />
          </>
        )}
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

        {/* Planlama bekleyen işler — sağ üst pill */}
        {planningCount > 0 && (
          <Pressable
            onPress={() => router.push('/(lab)/all-orders?status=alindi' as any)}
            className="absolute rounded-full"
            style={{
              top: 14, right: 14,
              paddingHorizontal: 10, paddingVertical: 4,
              backgroundColor: 'rgba(255,255,255,0.10)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row', alignItems: 'center', gap: 5,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Inbox size={11} color={P} strokeWidth={2} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] as any }}>
              {planningCount}
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              planlama
            </Text>
          </Pressable>
        )}

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

/** Status badge with dot. hold_status='on_hold' → Siparişler sayfasıyla aynı "Duraklatıldı" (warning). */
function StatusBadge({ status, holdStatus }: { status: string; holdStatus?: string | null }) {
  const c = holdStatus === 'on_hold'
    ? { label: 'Duraklatıldı', color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' }
    : (STATUS_CFG[status] ?? { label: status, color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' });
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
  const isNum = typeof value === 'number';
  const numStyle = { ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: DS.ink[900] };
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {isNum
        ? <NumberTickerX value={value as number} duration={900} style={numStyle} />
        : <Text style={numStyle}>{value}</Text>}
      <Text style={{ fontSize: DS.size.micro, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Üretim Süresi Bar Chart (admin paneli ile aynı pill design) ──
function ProductionBarChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);

  const FILL_LIGHT = `${P}55`;
  const FILL_DARK  = P;
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <View className="flex-row items-end" style={{ flex: 1, gap: 10, minHeight: 120, paddingHorizontal: 2 }}>
      {data.map((d, i) => {
        const pct = d.count > 0 ? Math.min(Math.max((d.count / max) * 100, 8), 100) : 0;
        const isHighlight = i === highestIdx && d.count > 0;
        const teeth = d.teeth ?? 0; // diş (üye) sayısı
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
            <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* Sabit etiket zonu — diş (üye) sayısı bar'ın üstünde, çakışmasız */}
              <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                {d.count > 0 ? (
                  isHighlight ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: FILL_DARK }}>{teeth || d.count}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500] }}>{teeth || d.count}</Text>
                  )
                ) : null}
              </View>
              <View
                style={{
                  width: '100%',
                  flex: 1,
                  borderRadius: 999,
                  backgroundColor: RAIL_BG,
                  // @ts-ignore web
                  backgroundImage: STRIPE_BG,
                  overflow: 'hidden',
                  position: 'relative' as any,
                }}
              >
                {d.count > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0, right: 0, bottom: 0,
                      height: `${pct}%`,
                      borderRadius: 999,
                      backgroundColor: isHighlight ? FILL_DARK : FILL_LIGHT,
                      // @ts-ignore
                      transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                    } as any}
                  />
                )}
              </View>
            </View>
            <Text style={{
              fontSize: 11,
              fontWeight: isHighlight ? '700' : '500',
              color: isHighlight ? INK : DS.ink[400],
              textTransform: 'uppercase',
              letterSpacing: 0.05 * 11,
            }}>
              {d.month}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Weekly Calendar Strip (admin paneli ile aynı: hatched pill + alınan/tamamlanan overlay) ──
function WeeklyStrip({
  weekDays, weekCounts, weekDone, weekTeeth, onPress,
}: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  weekDone: Record<string, number>;
  weekTeeth?: Record<string, number>;
  onPress: () => void;
}) {
  const totalReceived  = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const totalCompleted = Object.values(weekDone).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20;

  const SAGE_LIGHT = `${P}55`;
  const SAGE_DARK  = P;
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1.5 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>Bu hafta</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_LIGHT }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>Alınan </Text>
            <NumberTickerX value={totalReceived} duration={700} style={{ fontSize: 11, color: DS.ink[500] } as any} />
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_DARK }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>Tamamlanan </Text>
            <NumberTickerX value={totalCompleted} duration={700} style={{ fontSize: 11, color: DS.ink[500] } as any} />
          </View>
        </View>
      </View>

      <View className="flex-row items-end" style={{ gap: 10, flex: 1, minHeight: 140, paddingHorizontal: 2 }}>
        {weekDays.map((day, i) => {
          const received  = weekCounts[day.date] ?? 0;
          const completed = weekDone[day.date] ?? 0;
          const teeth     = weekTeeth?.[day.date] ?? 0; // diş (üye) sayısı
          const receivedPct  = received > 0 ? Math.min(Math.max((received / SCALE_MAX) * 100, 8), 100) : 0;
          const completedRel = received > 0 ? Math.min((completed / received) * 100, 100) : 0;
          const empty = received === 0;
          const showLabel = day.isToday && completed > 0;
          const ratio = received > 0 ? Math.round((completed / received) * 100) : 0;
          return (
            <Pressable
              key={i}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}
            >
              <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {/* Sabit yükseklikli etiket zonu — bar her zaman bunun altında
                    kalır, böylece dolu bar üst legend ile çakışmaz. */}
                <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                  {showLabel ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE_DARK }}>{ratio}%</Text>
                    </View>
                  ) : !empty ? (
                    // Üye (diş) sayısı — o gün alınan işlerin toplam diş adedi
                    <Text style={{ fontSize: 11, fontWeight: '700', color: day.isToday ? INK : DS.ink[500] }}>
                      {teeth || received}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    width: '100%',
                    flex: 1,
                    borderRadius: 999,
                    backgroundColor: RAIL_BG,
                    // @ts-ignore
                    backgroundImage: STRIPE_BG,
                    overflow: 'hidden',
                    position: 'relative' as any,
                  }}
                >
                  {!empty && (
                    <View
                      style={{
                        position: 'absolute',
                        left: 0, right: 0, bottom: 0,
                        height: `${receivedPct}%`,
                        borderRadius: 999,
                        backgroundColor: SAGE_LIGHT,
                        overflow: 'hidden',
                        // @ts-ignore
                        transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                      } as any}
                    >
                      {completedRel > 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            left: 0, right: 0, bottom: 0,
                            height: `${completedRel}%`,
                            borderRadius: 999,
                            backgroundColor: SAGE_DARK,
                            // @ts-ignore
                            transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                          } as any}
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
              <Text style={{
                fontSize: 11,
                fontWeight: day.isToday ? '700' : '500',
                color: day.isToday ? INK : DS.ink[400],
                textTransform: 'uppercase',
                letterSpacing: 0.05 * 11,
              }}>
                {day.label[0]}
              </Text>
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
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Bekleyen aksiyonlar</Text>
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
  const { t, i18n }  = useTranslation();
  const { profile }  = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width }    = useWindowDimensions();
  const isDesktop    = width >= 900;
  const insets       = useSafeAreaInsets();
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel(i18n.language)); return clear; }, [i18n.language]);

  // Önceki ziyaretten cache — anında render, arka planda taze veri çek.
  const cache = useDashboardCache(s => s.lab);
  const setCache = useDashboardCache(s => s.setLab);

  const [provas,          setProvas]         = useState<TodayProva[]>(cache?.provas ?? []);
  const [provasLoading,   setProvasLoading]  = useState(!cache);
  // Sipariş Trendi: ilk yüklemede de pill rail'leri görünür olsun diye 6 boş bucket ile başlat
  const [monthly,         setMonthly]        = useState<MonthBar[]>(() => {
    if (cache?.monthly && cache.monthly.length > 0) return cache.monthly;
    const out: MonthBar[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      out.push({ month: MONTHS_TR[d.getMonth()], count: 0 });
    }
    return out;
  });
  const [recentOrders,    setRecentOrders]   = useState<any[]>(cache?.recentOrders ?? []);
  const [todayNewCount,   setTodayNewCount]  = useState(cache?.todayNewCount ?? 0);
  const [totalActiveCount,setTotalActive]    = useState(cache?.totalActive ?? 0);
  const [totalCaseCount,  setTotalCases]     = useState(cache?.totalCases ?? 0);
  const [refreshing,      setRefreshing]     = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Global Bell tetiklendiğinde (herhangi bir sayfadan) sheet'i aç
  const notificationsPulse = useUiOverlayStore(s => s.notificationsPulse);
  useEffect(() => { if (notificationsPulse > 0) setNotificationsOpen(true); }, [notificationsPulse]);
  const [hovered,         setHovered]        = useState<string | null>(null);
  const [stationStats,    setStationStats]   = useState<StationStat[]>(cache?.stationStats ?? []);
  const [topTechs,        setTopTechs]       = useState<TechStat[]>(cache?.topTechs ?? []);
  const [pendingCount,    setPendingCount]   = useState(cache?.pendingCount ?? 0);
  const [todayDeliveredCount, setTodayDelivered] = useState(0);
  const [weekCounts,      setWeekCounts]     = useState<Record<string, number>>(cache?.weekCounts ?? {});
  const [weekDone,        setWeekDone]       = useState<Record<string, number>>({});
  const [weekTeeth,       setWeekTeeth]      = useState<Record<string, number>>(cache?.weekTeeth ?? {});
  const [pipelineCounts,  setPipelineCounts] = useState<Record<string, number>>(cache?.pipelineCounts ?? {});

  const [stockSummary, setStockSummary] = useState<{
    lowCount: number; materialCostMtd: number; wasteCostMtd: number; topUsedName: string | null;
  } | null>(cache?.stockSummary ?? null);
  // Planlama bekleyen siparişler — yeni gelen, henüz triajı yapılmamış
  const [triagePending, setTriagePending] = useState<any[]>(cache?.triagePending ?? []);
  // Görev kartını besleyen finans aksiyonları (faturasız teslimat + vadesi geçmiş fatura)
  const [financeActions, setFinanceActions] = useState<{ unbilled: any[]; overdueInv: any[] }>({
    unbilled: [], overdueInv: [],
  });

  const isManager  = profile?.role === 'manager' || profile?.user_type === 'admin';
  const today      = todayStr();
  const firstName  = profile?.full_name?.split(' ')[0] ?? '';
  const overdueOrders    = orders.filter(o => isOrderOverdue(o.delivery_date, o.status, (o as any).hold_status));
  const todayDeliverable = orders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');

  // ── Data loaders ──
  const loadPipeline = useCallback(async () => {
    try {
      // Tüm aktif + teslim statülerini tek sorguda say (iptal hariç). RLS lab'a kısıtlar.
      // Önemli: 'asamada', 'kutu_atandi', 'atama_bekleniyor', 'kurye_bekleniyor',
      // 'kuryede', 'tasarim_onayi_bekleniyor' de aktif üretim sayılır — eskiden atlanıyordu,
      // bu yüzden aşamadaki işler panoda 0 görünüyordu.
      const ACTIVE = ['alindi', 'kutu_atandi', 'atama_bekleniyor', 'tasarim_onayi_bekleniyor',
                      'asamada', 'uretimde', 'kalite_kontrol', 'teslimata_hazir',
                      'kurye_bekleniyor', 'kuryede'];
      const { data, error } = await supabase.from('work_orders').select('status').neq('status', 'iptal');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { const s = r.status; if (s) counts[s] = (counts[s] ?? 0) + 1; });
      setPipelineCounts(counts);

      // Total active (teslim edilmemiş + iptal olmayan)
      const active = ACTIVE.reduce((s, st) => s + (counts[st] ?? 0), 0);
      setTotalActive(active);
    } catch (_) {}
  }, []);

  const loadExtra = useCallback(async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    // 5 sorgu paralel — eskiden seri idi (~4× round-trip).
    const [mainRes, todayRes, approvalRes, triageRes, deliveredTodayRes] = await Promise.all([
      supabase
        .from('work_orders')
        // NOT: work_orders.doctor_id polymorphic (profiles VEYA doctors) — FK
        // tek tabloya bağlı değil, bu yüzden `doctor:doctor_id(...)` embed'i
        // PostgREST'te çözülemez ve sorgu hatayla döner. Dashboard için sadece
        // doctor_id'yi çekiyoruz; gerekirse doctor adını sonradan ayrı sorgu ile
        // resolve ediyoruz (latestOrder kartı patient_name'e geri düşer).
        // revision_no ŞART: revisionGroups zincirin kökünü/en güncelini bununla
        // sıralar. Eksikse hepsi 0 sayılır ve ORİJİNAL/REVİZYON etiketleri ters
        // düşer (revizyon "orijinal" görünür).
        .select('id, order_number, work_type, status, hold_status, delivery_date, created_at, patient_name, doctor_id, tooth_numbers, revision_of_id, revision_no')
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`),
      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'kalite_kontrol'),
      supabase
        .from('work_orders')
        .select('id, order_number, work_type, patient_name, created_at, is_urgent, doctor_id')
        .eq('status', 'alindi')
        .is('triaged_at', null)
        .or('is_archived.is.null,is_archived.eq.false')
        .order('created_at', { ascending: false })
        .limit(5),
      // Bugün teslim edilen (BUGÜN BİTEN kartı) — status teslim_edildi + bugün güncellenen
      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'teslim_edildi')
        .gte('updated_at', `${today}T00:00:00`),
    ]);

    const data = mainRes.data;
    if (data) {
      // Doktor isimlerini polymorphic kaynaktan (profiles + doctors) ayrı
      // sorgu ile resolve et — embed kullanmadığımız için manuel.
      const docIds = Array.from(new Set(
        data.slice(0, 5).map((o: any) => o.doctor_id).filter(Boolean),
      ));
      const doctorNameMap = new Map<string, string>();
      const doctorClinicMap = new Map<string, string>();
      const clinicLogoMap   = new Map<string, string>();
      if (docIds.length > 0) {
        const [{ data: profs }, { data: docs }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, clinic_id').in('id', docIds),
          supabase.from('doctors').select('id, full_name, clinic_id').in('id', docIds),
        ]);
        (profs ?? []).forEach((p: any) => { if (p.full_name) doctorNameMap.set(p.id, p.full_name); });
        (docs  ?? []).forEach((d: any) => { if (!doctorNameMap.has(d.id) && d.full_name) doctorNameMap.set(d.id, d.full_name); });
        // Klinik logosu: listede hekim baş harfleri yerine hangi klinikten
        // geldiğini gösterir (lab/admin panelleri).
        (profs ?? []).forEach((p: any) => { if (p.clinic_id) doctorClinicMap.set(p.id, p.clinic_id); });
        (docs  ?? []).forEach((d: any) => { if (d.clinic_id && !doctorClinicMap.has(d.id)) doctorClinicMap.set(d.id, d.clinic_id); });
        const clinicIds = Array.from(new Set(Array.from(doctorClinicMap.values())));
        if (clinicIds.length) {
          const { data: cls } = await supabase.from('clinics').select('id, logo_url').in('id', clinicIds);
          (cls ?? []).forEach((c: any) => { if (c.logo_url) clinicLogoMap.set(c.id, c.logo_url); });
        }
      }
      const recent5 = data.slice(0, 5).map((o: any) => ({
        ...o,
        doctor: o.doctor_id && doctorNameMap.has(o.doctor_id)
          ? { full_name: doctorNameMap.get(o.doctor_id)! }
          : null,
        clinic_logo_url: o.doctor_id
          ? (clinicLogoMap.get(doctorClinicMap.get(o.doctor_id) ?? '') ?? null)
          : null,
      }));
      setRecentOrders(recent5);
      setTotalCases(data.length);

      // Tek pass: monthly + week count + diş (üye) sayısı
      const weekDays = getWeekDays();
      const monthBuckets: { y: number; m: number; count: number; teeth: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), count: 0, teeth: 0 });
      }
      const wc: Record<string, number> = {};
      const wd: Record<string, number> = {};
      const wt: Record<string, number> = {}; // haftalık diş (üye) sayısı
      weekDays.forEach(d => { wc[d.date] = 0; wd[d.date] = 0; wt[d.date] = 0; });

      for (const o of data) {
        // Diş (üye) sayısı — tooth_numbers dizisinin uzunluğu
        const teeth = Array.isArray((o as any).tooth_numbers) ? (o as any).tooth_numbers.length : 0;
        const c = o.created_at ? new Date(o.created_at) : null;
        if (c) {
          const y = c.getFullYear(), m = c.getMonth();
          for (const mb of monthBuckets) {
            if (mb.y === y && mb.m === m) { mb.count++; mb.teeth += teeth; break; }
          }
          const isoDay = o.created_at?.slice(0, 10);
          if (isoDay && wc[isoDay] !== undefined) {
            wc[isoDay]++;
            wt[isoDay] += teeth;
            // Tamamlanan = teslim_edildi statüsü bu hafta içinde olan
            if ((o as any).status === 'teslim_edildi') wd[isoDay]++;
          }
        }
      }
      setMonthly(monthBuckets.map(b => ({ month: MONTHS_TR[b.m], count: b.count, teeth: b.teeth })));
      setWeekCounts(wc);
      setWeekDone(wd);
      setWeekTeeth(wt);
    }

    setTodayNewCount(todayRes.count ?? 0);
    setPendingCount(approvalRes.count ?? 0);
    setTodayDelivered(deliveredTodayRes.count ?? 0);
    // Triage listesi: doktor adlarını ayrı sorgu ile resolve et
    const triageData = triageRes.data ?? [];
    if (triageData.length > 0) {
      const tIds = Array.from(new Set(triageData.map((o: any) => o.doctor_id).filter(Boolean)));
      const tMap = new Map<string, string>();
      if (tIds.length > 0) {
        const [{ data: tProfs }, { data: tDocs }] = await Promise.all([
          supabase.from('profiles').select('id, full_name').in('id', tIds),
          supabase.from('doctors').select('id, full_name').in('id', tIds),
        ]);
        (tProfs ?? []).forEach((p: any) => { if (p.full_name) tMap.set(p.id, p.full_name); });
        (tDocs  ?? []).forEach((d: any) => { if (!tMap.has(d.id) && d.full_name) tMap.set(d.id, d.full_name); });
      }
      setTriagePending(triageData.map((o: any) => ({
        ...o,
        doctor: o.doctor_id && tMap.has(o.doctor_id) ? { full_name: tMap.get(o.doctor_id)! } : null,
      })));
    } else {
      setTriagePending([]);
    }
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

  // Finans aksiyonları — görev kartını besler (faturası kesilmemiş teslimat +
  // vadesi geçmiş fatura). Hafif tutulur: yalnız gösterilecek alanlar, limit 5.
  const loadFinanceActions = useCallback(async () => {
    try {
      const [unbilledRes, overdueRes] = await Promise.all([
        supabase
          .from('v_unbilled_work_orders')
          .select('work_order_id, order_number, patient_name, doctor_name, delivered_at')
          .order('delivered_at', { ascending: false, nullsFirst: false })
          .limit(5),
        supabase
          .from('invoices')
          .select('id, invoice_number, total, paid_amount, due_date, currency')
          .lt('due_date', today)
          .not('status', 'in', '("odendi","iptal","taslak")')  // taslak = henüz kesilmemiş fatura
          .order('due_date', { ascending: true })
          .limit(5),
      ]);
      setFinanceActions({
        unbilled:   (unbilledRes.data as any[]) ?? [],
        overdueInv: (overdueRes.data as any[]) ?? [],
      });
    } catch { /* view/tablo yoksa kart sessizce eski haliyle çalışır */ }
  }, [today]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadProvas(), loadExtra(), loadAnalytics(), loadPipeline(), loadStockSummary(), loadFinanceActions()]);
    setRefreshing(false);
  };

  useEffect(() => {
    // Bağımsız loader'lar paralel — eskiden seri başlatılıyordu (~2sn → ~400ms).
    Promise.all([loadProvas(), loadExtra(), loadAnalytics(), loadPipeline(), loadStockSummary(), loadFinanceActions()]);
  }, [loadProvas, loadExtra, loadAnalytics, loadPipeline, loadStockSummary, loadFinanceActions]);

  // Ekrana her GERİ DÖNÜŞTE tazele — sekme mount'lu kaldığından (bottom-tab / stack)
  // mount effect yeniden çalışmaz; planlama yapıp dashboard'a dönünce "planlama
  // bekliyor" sayacı (triagePending) ile pipeline sayaçları bayat kalıyordu.
  useFocusEffect(
    useCallback(() => {
      Promise.all([refetch(), loadExtra(), loadPipeline(), loadProvas()]);
      // cleanup gerekmez — fetch'ler idempotent, unmount'ta state guard'lı.
    }, [refetch, loadExtra, loadPipeline, loadProvas]),
  );

  // Local state → global cache (debounced; navigation sonrası anında render)
  useEffect(() => {
    const t = setTimeout(() => {
      setCache({
        pipelineCounts, totalActive: totalActiveCount, totalCases: totalCaseCount,
        todayNewCount, pendingCount, monthly, weekCounts, weekTeeth,
        recentOrders, triagePending, stationStats, topTechs, stockSummary, provas,
      });
    }, 200);
    return () => clearTimeout(t);
  }, [
    pipelineCounts, totalActiveCount, totalCaseCount, todayNewCount, pendingCount,
    monthly, weekCounts, weekTeeth, recentOrders, triagePending, stationStats, topTechs,
    stockSummary, provas, setCache,
  ]);

  // ── Derived data ──
  const weekDays = getWeekDays();

  // Pipeline percentages for hero stat pills
  const totalPipe = Object.values(pipelineCounts).reduce((s, v) => s + v, 0) || 1;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct   = Math.round(((pipelineCounts['teslim_edildi'] ?? 0) / totalPipe) * 100);
  const readyPct      = Math.round(((pipelineCounts['teslimata_hazir'] ?? 0) / totalPipe) * 100);

  // Latest active order for "Aktif Vaka" card
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi') ?? recentOrders[0];

  // Revizyon alt-listesi: penceredeki revizyonun ebeveyni pencere dışındaysa
  // ek sorguyla tamamlanır (hook koşulsuz çağrılmalı — erken return'lerden önce).
  const revParents = useRevisionParents(recentOrders);
  const recentWithParents = revParents.length ? [...recentOrders, ...revParents] : recentOrders;
  // Masaüstü tablo için vaka sırası (anchor + altında eski revizyonlar)
  const recentRows = flattenRevisionCases(recentWithParents);

  // Görev/aksiyon kartı — yalnız sipariş değil, iş akışındaki TÜM bekleyen
  // aksiyonlar tek yerde: planlama · gecikme · teslim · prova · faturalama ·
  // tahsilat · kritik stok. Sıra = aciliyet sırası (yukarıdan aşağı).
  // UX: 1. satır = YAPILACAK İŞ (fiil önde), 2. satır = kararı veren bağlam
  // (kaç gün gecikti, ne kadar kaldı). Kuru "gecikmiş / tahsilat" etiketleri
  // kullanıcıya ne yapacağını söylemiyordu.
  const shortNo = (no?: string | null) => (no ? `#${no}` : 'sipariş');
  const daysLate = (d?: string | null) => {
    if (!d) return null;
    const diff = Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000);
    return diff > 0 ? diff : null;
  };
  const taskItems = [
    ...(triagePending.length > 0 ? [{
      icon: ClipboardList as React.FC<any>,
      label: `Planlamayı tamamla · ${triagePending.length} sipariş`,
      time: 'Aşama ataması bekliyor',
      done: false,
      onPress: () => router.push('/(lab)/all-orders' as any),
    }] : []),
    ...overdueOrders.slice(0, 2).map(o => {
      const late = daysLate(o.delivery_date);
      return {
        icon: Clock as React.FC<any>,
        label: `Gecikmiş teslimat · ${shortNo(o.order_number)}`,
        time: late ? `${late} gün gecikti · ${fmtDate(o.delivery_date)}` : fmtDate(o.delivery_date),
        done: false,
        onPress: () => router.push(`/(lab)/order/${o.id}` as any),
      };
    }),
    ...todayDeliverable.slice(0, 2).map(o => ({
      icon: Package as React.FC<any>,
      label: `Bugün teslim et · ${shortNo(o.order_number)}`,
      time: (o as any).patient_name ?? 'Teslim tarihi bugün',
      done: false,
      onPress: () => router.push(`/(lab)/order/${o.id}` as any),
    })),
    ...provas.slice(0, 2).map(pv => ({
      icon: Calendar as React.FC<any>,
      label: `Prova randevusu · ${shortNo(pv.work_order?.order_number)}`,
      time: pv.scheduled_date ? fmtDate(pv.scheduled_date) : 'Bugün',
      done: pv.status === 'completed',
      onPress: pv.work_order ? () => router.push(`/(lab)/order/${pv.work_order!.id}` as any) : undefined,
    })),
    // Teslim edildi ama faturası kesilmedi → doğrudan sipariş detayına (fatura kes)
    ...financeActions.unbilled.slice(0, 2).map((u: any) => ({
      icon: Receipt as React.FC<any>,
      label: `Fatura kes · ${shortNo(u.order_number)}`,
      time: u.delivered_at
        ? `${fmtDate(String(u.delivered_at).slice(0, 10))} tarihinde teslim edildi`
        : 'Teslim edildi, faturası yok',
      done: false,
      onPress: () => router.push(`/(lab)/order/${u.work_order_id}` as any),
    })),
    // Vadesi geçmiş fatura → tahsilat
    ...financeActions.overdueInv.slice(0, 2).map((inv: any) => {
      const remaining = formatMoney(
        (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0),
        (inv.currency ?? 'TRY') as Currency,
        { fractionDigits: 0 },
      );
      const late = daysLate(inv.due_date);
      return {
        icon: Wallet as React.FC<any>,
        label: `Tahsilat yap · ${inv.invoice_number ?? 'fatura'}`,
        time: late ? `${remaining} kaldı · ${late} gün vadesi geçti` : `${remaining} kaldı`,
        done: false,
        onPress: () => router.push(`/(lab)/invoice/${inv.id}` as any),
      };
    }),
    ...((stockSummary?.lowCount ?? 0) > 0 ? [{
      icon: AlertTriangle as React.FC<any>,
      label: `Stok siparişi ver · ${stockSummary!.lowCount} kalem`,
      time: 'Kritik seviyenin altında',
      done: false,
      onPress: () => router.push('/(lab)/stock' as any),
    }] : []),
  ].slice(0, 7);

  // If no tasks, add placeholders
  if (taskItems.length === 0) {
    taskItems.push(
      { icon: CheckCircle as React.FC<any>, label: 'Bekleyen aksiyon yok', time: '', done: true, onPress: undefined },
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Aydın Lab handoff (LabMobileDashboard)
  // ══════════════════════════════════════════════════════════════
  if (!isDesktop) {
    const { LabMobileDashboard } = require('../components/LabMobileDashboard');
    const { NotificationsSheet } = require('../../../core/ui/mobile/NotificationsSheet');

    // Stage counts for hero
    const stageCounts = {
      alindi: (pipelineCounts['alindi'] ?? 0) + (pipelineCounts['kutu_atandi'] ?? 0)
            + (pipelineCounts['atama_bekleniyor'] ?? 0) + (pipelineCounts['tasarim_onayi_bekleniyor'] ?? 0),
      uretim: (pipelineCounts['uretimde'] ?? 0) + (pipelineCounts['asamada'] ?? 0),
      kk:     (pipelineCounts['kalite_kontrol'] ?? 0),
      hazir:  (pipelineCounts['teslimata_hazir'] ?? 0) + (pipelineCounts['kurye_bekleniyor'] ?? 0)
            + (pipelineCounts['kuryede'] ?? 0),
    };
    const totalPipe = Object.values(pipelineCounts).reduce((s, v) => s + v, 0) || 1;
    const deliveredPct = Math.round(((pipelineCounts['teslim_edildi'] ?? 0) / totalPipe) * 100);

    // Week bars (Pzt→Paz) — tüm veriden hesaplanan weekCounts/weekDone'tan türet.
    // (Eskiden useTodayOrders'tan geliyordu; o yalnız bugün/gecikmiş aktifleri içerdiği
    // için hafta grafiği hep boş kalıyordu.)
    const wdays = getWeekDays();
    const weekBars: number[]     = wdays.map(d => weekCounts[d.date] ?? 0);
    const weekDoneBars: number[] = wdays.map(d => weekDone[d.date] ?? 0);
    const monthsShort = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const ws = new Date(wdays[0].date + 'T00:00:00');
    const we = new Date(wdays[6].date + 'T00:00:00');
    const weekRange = `${ws.getDate()} ${monthsShort[ws.getMonth()]} → ${we.getDate()} ${monthsShort[we.getMonth()]}`;

    // Delayed cases — overdue + critical
    const delayedItems = overdueOrders.slice(0, 3).map((o: any) => {
      const due = new Date(o.delivery_date + 'T00:00:00').getTime();
      const days = Math.max(1, Math.floor((Date.now() - due) / 86400000));
      return {
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        remain: `${days}g geç`,
        kind: 'delay' as const,
      };
    });

    // Notification buckets
    const notifApprovals = recentOrders
      .filter((o: any) => o.status === 'onay_bekliyor')
      .slice(0, 5)
      .map((o: any) => ({
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: 'Onay bekliyor',
      }));
    const notifOverdue = overdueOrders.slice(0, 5).map((o: any) => {
      const due = new Date(o.delivery_date + 'T00:00:00').getTime();
      const days = Math.max(1, Math.floor((Date.now() - due) / 86400000));
      return {
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        daysLate: days,
      };
    });
    const notifUpcoming = todayDeliverable.slice(0, 5).map((o: any) => ({
      id: String(o.order_number ?? o.id).slice(-6),
      _id: o.id,
      patient: o.patient_name ?? 'Hasta',
      workType: o.work_type ?? '—',
      remainLabel: 'Bugün',
    }));

    // Son Siparişler — mobil kart listesi için şekillendir (durum/renk STATUS_CFG'den)
    // Vaka grupları: her satır bir vaka, eski revizyonlar altında alt-liste olur.
    // Gruplama slice'tan ÖNCE yapılır ki 6 satır 6 VAKA olsun (aynı vakanın iki
    // üyesi iki satır yiyip listeyi kısaltmasın).
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status);
      const isOverdue = !!o.delivery_date && o.delivery_date < today && o.status !== 'teslim_edildi';
      const drName = (o.doctor as any)?.full_name ?? '—';
      return {
        id: String(o.id),
        no: String(o.order_number ?? ''),
        title: drName,
        initials: initials(drName),
        workType: o.work_type || '—',
        statusLabel: st.label,
        statusColor: st.color,
        statusBg: st.bg,
        delivery: o.delivery_date ? fmtDate(o.delivery_date) : '',
        overdue: isOverdue,
      };
    };
    const recentForMobile = mapRevisionCases(recentWithParents, toRecentItem).slice(0, 6);

    return (
      <>
        <LabMobileDashboard
          liveActive={totalActiveCount}
          liveTotal={totalActiveCount + (pipelineCounts['teslim_edildi'] ?? 0)}
          liveStages={stageCounts}
          livePercent={deliveredPct}
          activeOrders={totalActiveCount}
          todayCompleted={todayDeliveredCount}
          weekCompleted={weekDoneBars.reduce((a, b) => a + b, 0)}
          overdueCount={overdueOrders.length}
          pendingApprovalsCount={pendingCount}
          weekBars={weekBars}
          weekDoneBars={weekDoneBars}
          weekRange={weekRange}
          weekTotal={weekBars.reduce((a, b) => a + b, 0)}
          delayed={delayedItems}
          recentOrders={recentForMobile}
          onNewOrder={() => useNewOrderModalStore.getState().setOpen(true)}
          onScan={() => require('../../../core/store/scanStore').useScanStore.getState().setOpen(true)}
          onApprovals={() => router.push('/(lab)/approvals' as any)}
          onNotifications={() => setNotificationsOpen(true)}
          onProfile={() => router.push('/(lab)/profile' as any)}
          onOpenOrder={(id: string) => {
            const found = delayedItems.find((x: any) => x.id === id);
            if (found) router.push(`/(lab)/order/${(found as any)._id}` as any);
          }}
          onOpenOrderById={(dbId: string) => router.push(`/(lab)/order/${dbId}` as any)}
          onAllOrders={() => router.push('/(lab)/all-orders' as any)}
          refreshing={refreshing || loading}
          onRefresh={handleRefresh}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onOpenOrder={(dbId: string) => router.push(`/(lab)/order/${dbId}` as any)}
          panel="lab"
          approvals={notifApprovals}
          overdue={notifOverdue}
          upcoming={notifUpcoming}
        />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  DESKTOP RENDER (mevcut, dokunulmadı)
  // ══════════════════════════════════════════════════════════════
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        padding: isDesktop ? 10 : 16,
        paddingTop: isDesktop ? 10 : insets.top + 8,
        paddingBottom: 120,
      }}
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
              // Farsça glifler daha uzun → satır kutusunu gevşet (aksi halde üst/alt kırpılır)
              lineHeight: isRTL(i18n.language) ? (isDesktop ? 82 : 60) : (isDesktop ? 56 : 42),
              color: INK,
            }}>
              {t('dashboard.greetingWord')}{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>{firstName}</Text>
            </Text>

            {/* Stat pills row */}
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label={t('dashboard.stages.production')} value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label={t('dashboard.delivered')} value={`${deliveryPct}%`} bg={P} color={INK} />
              <StatPill label={t('dashboard.stages.ready')} value={`${readyPct}%`} bg="rgba(0,0,0,0.08)" color={INK} />
              {overdueOrders.length > 0 && (
                <StatPill label={t('dashboard.overdueLabel')} value={`${overdueOrders.length}`} bg="rgba(217,75,75,0.12)" color="#9C2E2E" />
              )}
              <FaceScanQuickAction accentColor={P} compact />
            </View>
          </View>

          {/* Right: big stats */}
          <View className="flex-row" style={{ gap: 32, alignItems: 'flex-end' }}>
            <BigStat value={totalActiveCount} label={t('dashboard.activeOrders')} />
            <BigStat value={provas.length} label={t('dashboard.tryin')} />
            <BigStat value={totalCaseCount} label={t('dashboard.totalCases')} />
          </View>
        </View>
      </View>

      {/* ════════ PLANLAMA BEKLEYEN SİPARİŞLER ════════
          Panel accent'ine uygun (lab = safran gold) kompakt gradient:
          tek satır + "Yeni N planlama bekliyor". Gold açık olduğu için
          metin/ikonlar koyu (INK). */}
      {triagePending.length > 0 && isManager && (
        <Pressable
          onPress={() => router.push('/(lab)/all-orders?status=alindi' as any)}
          style={{
            marginBottom: 14,
            borderRadius: 20,
            overflow: 'hidden',
            // @ts-ignore web gradient — panel safran gold
            backgroundImage: `linear-gradient(135deg, ${P} 0%, ${DS.lab.primaryDeep} 100%)`,
            backgroundColor: P,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <Inbox size={18} color={INK} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <View className="flex-row items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: INK }} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: INK, letterSpacing: 0.7, textTransform: 'uppercase', opacity: 0.75 }}>Yeni iş</Text>
                <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.5, lineHeight: 24, color: INK, marginLeft: 4 }}>
                  {triagePending.length}
                </Text>
                <Text style={{ fontSize: 13, color: INK, marginLeft: 2, opacity: 0.8 }}>sipariş geldi — planlamayı başlat</Text>
              </View>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={14} color={INK} strokeWidth={1.8} />
            </View>
          </View>
        </Pressable>
      )}

      {/* Legacy verbose card — completely disabled (kept commented for reference) */}
      {false && (
        <View
          style={{
            marginBottom: 14,
            borderRadius: 20,
            backgroundColor: '#FFF7ED',
            borderWidth: 1,
            borderColor: 'rgba(217,119,6,0.30)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(217,119,6,0.15)' }}>
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#D97706',
            }}>
              <ListChecks size={20} color="#FFF" strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C5E0E', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Planlama bekliyor · {triagePending.length} sipariş
              </Text>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK, marginTop: 2, lineHeight: 28 }}>
                Yeni gelen iş emirleri
              </Text>
              <Text style={{ fontSize: 12, color: '#7C4A0E', marginTop: 4 }}>
                Aşamaları planla, ilk istasyona ata, üretime başla.
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(lab)/all-orders?status=alindi' as any)}
              style={{
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(217,119,6,0.30)',
                flexDirection: 'row', alignItems: 'center', gap: 5,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9C5E0E' }}>Tümünü gör</Text>
              <ArrowUpRight size={12} color="#9C5E0E" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* List */}
          <View>
            {triagePending.slice(0, 3).map((o, idx) => {
              const created = o.created_at ? new Date(o.created_at) : null;
              const ageH = created ? Math.floor((Date.now() - created.getTime()) / 3_600_000) : null;
              const ageLabel = ageH == null ? '' :
                ageH < 1 ? 'Az önce' :
                ageH < 24 ? `${ageH} saat önce` :
                `${Math.floor(ageH / 24)} gün önce`;
              const doctorName = (o.doctor as any)?.full_name ?? '—';

              return (
                <Pressable
                  key={o.id}
                  onPress={() => router.push(`/(lab)/order/${o.id}` as any)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: 'rgba(217,119,6,0.10)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 12,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(217,119,6,0.14)',
                    borderWidth: 1, borderColor: 'rgba(217,119,6,0.22)',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C5E0E' }}>
                      #{(o.order_number ?? '').toString().slice(-4)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: INK }} numberOfLines={1}>
                        {o.patient_name ?? '—'}
                      </Text>
                      {o.is_urgent && (
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>!</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: '#7C4A0E', marginTop: 2 }} numberOfLines={1}>
                      {o.work_type} · {doctorName} · {ageLabel}
                    </Text>
                  </View>

                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: '#D97706',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFF' }}>Planla</Text>
                    <ArrowUpRight size={11} color="#FFF" strokeWidth={2} />
                  </View>
                </Pressable>
              );
            })}

            {triagePending.length > 3 && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(217,119,6,0.10)', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: '#7C4A0E', fontStyle: 'italic' }}>
                  + {triagePending.length - 3} sipariş daha planlama bekliyor
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ════════ 4-CARD GRID ════════ */}
      <View
        className={isDesktop ? 'flex-row' : ''}
        style={{ gap: 14, marginBottom: 14 }}
      >
        {/* Card 1: Aktif Vaka — dark top + white bottom + animations */}
        <AnimatedAktifVakaCard
          isDesktop={isDesktop}
          pipelineCounts={{
            ...pipelineCounts,
            // Gruplandırılmış sayımlar — tek statüs yerine birleşik göster
            alindi:          (pipelineCounts['alindi'] ?? 0)
                           + (pipelineCounts['kutu_atandi'] ?? 0)
                           + (pipelineCounts['atama_bekleniyor'] ?? 0)
                           + (pipelineCounts['tasarim_onayi_bekleniyor'] ?? 0),
            uretimde:        (pipelineCounts['uretimde'] ?? 0)
                           + (pipelineCounts['asamada'] ?? 0),
            teslimata_hazir: (pipelineCounts['teslimata_hazir'] ?? 0)
                           + (pipelineCounts['kurye_bekleniyor'] ?? 0)
                           + (pipelineCounts['kuryede'] ?? 0),
          }}
          latestOrder={latestOrder}
          planningCount={triagePending.length}
          router={router}
        />

        {/* Card 2: Sipariş Trendi (admin paneliyle aynı hatched pill chart) */}
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.015 * 18, color: INK }}>Sipariş Trendi</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -0.025 * 42, lineHeight: 42, marginTop: 8, color: INK }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: DS.ink[400] }}> bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>
                Son 6 aylık trend
                {(monthly[monthly.length - 1]?.teeth ?? 0) > 0
                  ? ` · ${monthly[monthly.length - 1]?.teeth} diş`
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(lab)/all-orders' as any)}
              className="items-center justify-center rounded-full"
              style={{ width: 32, height: 32, backgroundColor: DS.ink[100] }}
            >
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ flex: 1, minHeight: 140 }}>
            <ProductionBarChart data={monthly} />
          </View>
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

        {/* Card 4: Hızlı İşlem CTA — "Yeni sipariş oluştur" (görevler ile yer değişti) */}
        <View style={{ flex: isDesktop ? 1.4 : undefined }}>
          <AnimatedCTACard onPress={() => router.push('/(lab)/new-order' as any)} isDesktop={isDesktop} />
        </View>
      </View>

      {/* ════════ BOTTOM ROW — Weekly + Bugünkü Görevler ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        {/* Weekly strip */}
        <WeeklyStrip
          weekDays={weekDays}
          weekCounts={weekCounts}
          weekDone={weekDone}
          weekTeeth={weekTeeth}
          onPress={() => router.push('/(lab)/all-orders' as any)}
        />

        {/* Bugünkü Görevler — Dark (CTA ile yer değişti) */}
        <View style={{ flex: isDesktop ? 1 : undefined, marginTop: isDesktop ? 0 : 14 }}>
          <TasksCard tasks={taskItems} />
        </View>
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
          : recentRows.map((order: any, idx: number) => {
              const onHold  = (order as any).hold_status === 'on_hold';
              const overdue = order.delivery_date < today && order.status !== 'teslim_edildi' && !onHold;
              const isLast  = idx === recentRows.length - 1;
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
                  {/* Vaka grubu: anchor üstte, eski üyeler altında girintili + ok
                      (siparişler listesiyle aynı dil — flattenRevisionCases bayrakları) */}
                  <View style={{ flex: 1.2, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: (order as any).__revChild ? 14 : 0 }}>
                    {(order as any).__revChild && (
                      <CornerDownRight size={12} color="#9C5E0E" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: P }} numberOfLines={1}>#{order.order_number}</Text>
                      {(order as any).__revChild ? (
                        <Text style={{ fontSize: 8.5, fontWeight: '700', color: '#9C5E0E', letterSpacing: 0.4 }}>REVİZYON</Text>
                      ) : (order as any).__revParent ? (
                        <Text style={{ fontSize: 8.5, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.4 }}>ORİJİNAL</Text>
                      ) : null}
                    </View>
                  </View>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    {/* Klinik logosu varsa o, yoksa hekim baş harfleri */}
                    <View
                      className="items-center justify-center rounded-full"
                      style={{ width: 28, height: 28, overflow: 'hidden',
                        backgroundColor: (order as any).clinic_logo_url ? '#FFFFFF' : hexA(P, 0.1),
                        borderWidth: 1, borderColor: (order as any).clinic_logo_url ? 'rgba(0,0,0,0.08)' : hexA(P, 0.15) }}
                    >
                      {(order as any).clinic_logo_url ? (
                        <Image source={{ uri: (order as any).clinic_logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(drName)}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{drName}</Text>
                  </View>
                  {isDesktop && (
                    <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500] }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: '#9C5E0E' }}>Revizyon - </Text>
                    )}{order.work_type || '--'}</Text>
                  )}
                  <View style={{ flex: 1.4 }}>
                    <StatusBadge status={order.status} holdStatus={(order as any).hold_status} />
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

      {/* Stok & Maliyet — müdür panelinde gösterilmez (yönetici stoğu ayrı sayfadan yönetir) */}
      {stockSummary && !isManager && (
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
                {(Number(stockSummary.materialCostMtd) || 0).toLocaleString('tr-TR')} ₺
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>Materyal Maliyeti</Text>
            </View>

            <View className="rounded-xl" style={{
              flex: 1, padding: 12, gap: 4,
              backgroundColor: stockSummary.wasteCostMtd > 0 ? 'rgba(217,75,75,0.06)' : DS.ink[50],
              borderWidth: 1, borderColor: stockSummary.wasteCostMtd > 0 ? 'rgba(217,75,75,0.2)' : 'rgba(0,0,0,0.04)',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: stockSummary.wasteCostMtd > 0 ? '#9C2E2E' : INK }}>
                {stockSummary.wasteCostMtd > 0 ? '-' : ''}{(Number(stockSummary.wasteCostMtd) || 0).toLocaleString('tr-TR')} ₺
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
