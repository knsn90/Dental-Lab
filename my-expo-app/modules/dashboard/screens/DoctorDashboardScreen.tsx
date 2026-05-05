/**
 * DoctorDashboardScreen — Patterns design language (matching Lab/Admin layout)
 *
 * Layout:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. Pending approvals banner (unique to doctor)
 *   3. 4-card grid (AnimatedAktifVaka, Sipariş Trendi, PercentRing, TasksCard)
 *   4. Bottom row — WeeklyStrip + AnimatedCTACard
 *   5. Extra sections — Orders table, Status dist, Work type
 *
 * Theme: DS.clinic (Sage #6BA888) — doctor & clinic share the same green
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions, RefreshControl,
  Animated, Easing,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity,
  Calendar, TrendingUp, AlertTriangle, ArrowUpRight,
  ArrowRight, Check, Layers,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { useOrders } from '../../orders/hooks/useOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';

// ── Display font — Patterns: Inter Tight Light (300) ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Theme: Doctor sage green (same as clinic) ──
const P     = DS.clinic.primary;      // #6BA888
const P_DEEP = DS.clinic.primaryDeep; // #4D8A6B
const SURFACE_ALT = DS.clinic.surfaceAlt; // #0F2A1F
const INK   = DS.ink[900];

const CLR = {
  green:  DS.clinic.success,
  orange: DS.clinic.warning,
  red:    DS.clinic.danger,
  blue:   DS.clinic.info,
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
function hexA(hex: string, alpha: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return hex; }
}

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
    result.push({ label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`, date: iso, isToday: iso === todayISO });
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
  return {
    scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }),
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
  };
}

function PulseDot({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  const { scale, opacity } = usePulse({ duration: 1400 });
  return (
    <Animated.View style={{
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, transform: [{ scale }], opacity,
    }} pointerEvents="none" />
  );
}

// ══════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View className="bg-white overflow-hidden"
      style={[{ borderRadius: DS.radius.xl, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }, style]}
    >{children}</View>
  );
}

function CardHeader({ title, right, display }: { title: string; right?: React.ReactNode; display?: boolean }) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
      {display ? (
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK }}>{title}</Text>
      ) : (
        <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>{title}</Text>
      )}
      {right}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' };
  return (
    <View className="flex-row items-center self-start rounded-full"
      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.bg, gap: 4 }}>
      <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

function StatPill({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>{label}</Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
      </View>
    </View>
  );
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: INK }}>{value}</Text>
      <Text style={{ fontSize: DS.size.micro, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

// ── PercentRingHero ──
function PercentRingHero({ value: targetValue, size = 200, darkText = false }: { value: number; size?: number; darkText?: boolean }) {
  const animatedValue = useCountUp(targetValue, 1400);
  const value = animatedValue;
  const outerStroke = Math.max(8, Math.round(size * 0.12));
  const innerStroke = outerStroke - 6;
  const r = (size - outerStroke - Math.max(3, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const id = `pr-hero-doc-${targetValue}-${size}`;
  const outerPillColor = darkText ? P + '30' : P + '22';
  const innerTrackColor = darkText ? 'rgba(0,0,0,0.06)' : P + '15';
  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);
  const knobR = innerStroke * 0.85;
  const knobColor = darkText ? INK : '#FFFFFF';
  const textColor = darkText ? INK : '#FFFFFF';
  const pctColor = darkText ? DS.ink[400] : P;
  const displayValue = Math.round(value);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={P} stopOpacity="0.95" />
            <Stop offset="100%" stopColor={P_DEEP} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={outerPillColor} strokeWidth={outerStroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={innerTrackColor} strokeWidth={innerStroke} fill="none" />
        {value > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={innerStroke} fill="none"
            strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
        {value > 0 && value < 100 && size >= 56 && (
          <>
            <Circle cx={knobX} cy={knobY} r={knobR + Math.max(2, innerStroke * 0.4)} fill={knobColor} fillOpacity={0.18} />
            <Circle cx={knobX} cy={knobY} r={knobR} fill={knobColor} />
          </>
        )}
      </Svg>
      {value > 0 && value < 100 && size >= 100 && (
        <PulseDot color={knobColor} size={knobR * 2.6} x={knobX} y={knobY} />
      )}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontFamily: DS.font.display as string, fontWeight: '300', fontSize: size * 0.28, color: textColor, letterSpacing: size * 0.28 * -0.04, lineHeight: size * 0.28 }}>{displayValue}</Text>
          {size >= 56 && <Text style={{ fontFamily: DS.font.display as string, fontWeight: '400', fontSize: size * 0.13, color: pctColor, marginLeft: 3, lineHeight: size * 0.13 }}>%</Text>}
        </View>
      </View>
    </View>
  );
}

// ── Animated Aktif Vaka Card ──
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, latestOrder, router }: {
  isDesktop: boolean; pipelineCounts: Record<string, number>; latestOrder: any; router: any;
}) {
  const dotAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(400),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(breatheAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breatheAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [dotAnim, glowAnim, breatheAnim]);

  const dotOpacity = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Card style={{ flex: isDesktop ? 1.1 : undefined, marginBottom: isDesktop ? 0 : 14 }}>
      <View style={{
        flex: 1,
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(180deg, ${DS.ink[700]} 0%, ${DS.ink[900]} 100%)`,
        backgroundColor: SURFACE_ALT,
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, position: 'relative', overflow: 'hidden',
      }}>
        <Animated.View style={{
          position: 'absolute', width: 160, height: 160, borderRadius: 80,
          backgroundColor: P, opacity: glowOpacity, transform: [{ scale: glowScale }],
        }} pointerEvents="none" />

        <View className="absolute rounded-full" style={{
          top: 14, left: 14, paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: `${P}E6`, flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', opacity: dotOpacity }} />
          <Text style={{ fontSize: 10, fontWeight: '500', color: '#FFF', letterSpacing: 0.5 }}>CANLI</Text>
        </View>

        <View className="flex-row items-center" style={{ gap: 12 }}>
          {PIPELINE_STAGES.map((stage) => {
            const count = pipelineCounts[stage.key] ?? 0;
            const active = count > 0;
            return (
              <Pressable key={stage.key} onPress={() => router.push('/(doctor)/orders' as any)} className="items-center" style={{ gap: 4 }}>
                <Animated.View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: active ? hexA(P, 0.2) : 'rgba(255,255,255,0.06)',
                  borderWidth: active ? 1.5 : 1, borderColor: active ? P : 'rgba(255,255,255,0.1)',
                  alignItems: 'center', justifyContent: 'center',
                  transform: active ? [{ scale: breatheScale }] : [],
                }}>
                  <Text style={{ ...SERIF, fontSize: 16, letterSpacing: -0.5, color: active ? '#FFF' : 'rgba(255,255,255,0.3)' }}>{count}</Text>
                </Animated.View>
                <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{stage.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {latestOrder ? (
          <Pressable onPress={() => router.push(`/(doctor)/order/${latestOrder.id}` as any)} style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: INK }} numberOfLines={1}>
              {latestOrder.patient_name ?? latestOrder.work_type ?? 'Sipariş'}
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

// ── Production Bar Chart ──
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
            <View style={{ width: '100%', height: `${h}%` as any, backgroundColor: isHighlight ? P : INK, borderRadius: 4, minHeight: 4 }} />
            <Text style={{ fontSize: 9, color: DS.ink[400], textTransform: 'uppercase' }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Animated Overdue Alert Card ──
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
        transform: [{ scale: scaleAnim }], position: 'relative',
      }}>
        <Animated.View style={{
          position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: 80,
          backgroundColor: '#EF4444', opacity: glowOpacity, transform: [{ scale: glowScale }],
        }} pointerEvents="none" />
        <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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

// ── Weekly Calendar Strip ──
function WeeklyStrip({ weekDays, weekCounts, onPress }: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>; onPress: () => void;
}) {
  const totalProduction = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const first = weekDays[0]; const last = weekDays[6];
  const fd = new Date(first.date); const ld = new Date(last.date);
  const rangeLabel = `${fd.getDate()}–${ld.getDate()} ${MONTHS_TR[ld.getMonth()]} ${ld.getFullYear()}`;

  return (
    <Card style={{ padding: 18, flex: 2 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>Bu hafta</Text>
        <Text style={{ fontSize: 12, color: DS.ink[400] }}>{rangeLabel}</Text>
        <View style={{ flex: 1 }} />
        <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(P, 0.1) }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: P }}>Toplam {totalProduction}</Text>
        </View>
      </View>
      <View className="flex-row" style={{ gap: 8, flex: 1 }}>
        {weekDays.map((day, i) => {
          const count = weekCounts[day.date] ?? 0;
          return (
            <Pressable key={i} onPress={onPress} style={{
              flex: 1, backgroundColor: day.isToday ? INK : DS.ink[50],
              borderRadius: 14, padding: 12, gap: 8, position: 'relative',
            }}>
              <Text style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.5, textTransform: 'uppercase', color: day.isToday ? '#FFF' : INK }}>{day.label}</Text>
              <Text style={{ ...SERIF, fontSize: 24, letterSpacing: -0.48, lineHeight: 24, color: day.isToday ? '#FFF' : INK }}>{count}</Text>
              <Text style={{ fontSize: 9, opacity: 0.5, color: day.isToday ? '#FFF' : INK }}>sipariş</Text>
              {day.isToday && <View className="absolute rounded-full" style={{ top: 10, right: 10, width: 6, height: 6, backgroundColor: P }} />}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// ── Animated CTA Card ──
function AnimatedCTACard({ onPress, isDesktop }: { onPress: () => void; isDesktop: boolean }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(floatAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(arrowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(arrowAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [floatAnim, glowAnim, arrowAnim]);

  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.28] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const arrowX = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  return (
    <Pressable onPress={onPress}
      onHoverIn={() => Animated.spring(scaleAnim, { toValue: 1.02, friction: 8, tension: 200, useNativeDriver: true }).start()}
      onHoverOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start()}
      style={{ flex: 1 }}>
      <Animated.View style={{
        flex: 1, borderRadius: DS.radius.xl, padding: 22, position: 'relative', overflow: 'hidden',
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(135deg, ${P} 0%, ${P_DEEP} 100%)`,
        backgroundColor: P, minHeight: isDesktop ? undefined : 160,
        transform: [{ scale: scaleAnim }],
      }}>
        <Animated.View style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.18)', transform: [{ translateY: floatY }] }} />
        <Animated.View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,1)', opacity: glowOpacity, transform: [{ scale: glowScale }] }} pointerEvents="none" />
        <View style={{ position: 'relative' }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: '#FFF', marginBottom: 14 }}>Hızlı işlem</Text>
          <Text style={{ ...SERIF, fontSize: 32, letterSpacing: -0.64, lineHeight: 35, color: '#FFF', marginBottom: 16 }}>Yeni sipariş{'\n'}oluştur</Text>
          <View className="flex-row items-center self-start rounded-full" style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF', gap: 8 }}>
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

// ── Tasks Card (dark) ──
function TasksCard({ tasks }: { tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] }) {
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <View style={{
      backgroundColor: SURFACE_ALT,
      // @ts-ignore web gradient
      backgroundImage: `linear-gradient(135deg, ${SURFACE_ALT} 0%, ${P_DEEP}33 100%)`,
      borderRadius: DS.radius.xl, padding: 22, flex: 1, gap: 0,
    }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Bugünkü görevler</Text>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{doneCount}/{tasks.length}</Text>
      </View>
      <View style={{ gap: 10, flex: 1 }}>
        {tasks.map((t, i) => {
          const IconComp = t.icon;
          return (
            <Pressable key={i} onPress={t.onPress} className="flex-row items-center" style={{
              gap: 10, paddingBottom: 10,
              borderBottomWidth: i < tasks.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.08)',
            }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <IconComp size={14} color="#FFF" strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: '#FFF', textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.4 : 1 }}>{t.label}</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t.time}</Text>
              </View>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: t.done ? P : 'transparent',
                borderWidth: t.done ? 0 : 1.5, borderColor: t.done ? undefined : 'rgba(255,255,255,0.2)',
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

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export function DoctorDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, []);

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const today = todayStr();

  // ── Derived stats ──
  const total = orders.length;
  const active = orders.filter(o => o.status !== 'teslim_edildi').length;
  const overdueList = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const overdueCount = overdueList.length;
  const delivered = orders.filter(o => o.status === 'teslim_edildi').length;
  const thisMonthNew = orders.filter(o => {
    const d = new Date(o.created_at); d.setHours(0, 0, 0, 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Pipeline counts
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_KEYS.forEach(k => { counts[k] = orders.filter(o => o.status === k).length; });
    return counts;
  }, [orders]);

  const totalPipe = Object.values(pipelineCounts).reduce((s, v) => s + v, 0) || 1;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct = Math.round(((pipelineCounts['teslim_edildi'] ?? 0) / totalPipe) * 100);

  // Monthly trend
  const monthly = useMemo(() => {
    const bars: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const y = d.getFullYear(), m = d.getMonth();
      bars.push({
        label: MONTHS_TR[m],
        count: orders.filter(o => { const c = new Date(o.created_at); return c.getFullYear() === y && c.getMonth() === m; }).length,
      });
    }
    return bars;
  }, [orders]);

  // Week counts
  const weekDays = getWeekDays();
  const weekCounts = useMemo(() => {
    const wc: Record<string, number> = {};
    weekDays.forEach(wd => { wc[wd.date] = orders.filter(o => o.created_at?.startsWith(wd.date)).length; });
    return wc;
  }, [orders]);

  // Latest active order
  const recentOrders = useMemo(() =>
    orders.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 8),
    [orders]);
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi') ?? recentOrders[0];

  // Upcoming deliveries
  const upcoming = useMemo(() => orders
    .filter(o => o.status !== 'teslim_edildi')
    .filter(o => { const d = new Date(o.delivery_date + 'T00:00:00'); return d.getTime() >= Date.now() - 86400000; })
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 5), [orders]);

  // Tasks
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];
  overdueList.slice(0, 2).forEach(o => {
    taskItems.push({ icon: Clock as React.FC<any>, label: `${o.patient_name ?? o.work_type ?? 'Sipariş'} · gecikmiş`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(doctor)/order/${o.id}` as any) });
  });
  upcoming.slice(0, 2).forEach(o => {
    taskItems.push({ icon: Package as React.FC<any>, label: `${o.patient_name ?? 'Sipariş'} · teslim`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(doctor)/order/${o.id}` as any) });
  });
  if (taskItems.length === 0) {
    taskItems.push({ icon: CheckCircle as React.FC<any>, label: 'Bekleyen görev yok', time: '', done: true, onPress: undefined });
  }

  // Pending design approvals
  const [pendingApprovals, setPendingApprovals] = useState<{ id: string; order_number: string; token: string; patient_name: string | null }[]>([]);
  const loadApprovals = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, patient_name, doctor_approval_token')
      .eq('doctor_id', profile.id)
      .eq('doctor_approval_status', 'pending')
      .not('doctor_approval_token', 'is', null);
    setPendingApprovals(((data ?? []) as any[]).map(r => ({
      id: r.id, order_number: r.order_number, token: r.doctor_approval_token, patient_name: r.patient_name,
    })));
  }, [profile?.id]);
  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // Status distribution
  const byStatus = useMemo(() =>
    STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: orders.filter(o => o.status === k).length })),
    [orders]);

  // Work type
  const byWorkType = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { if (o.work_type) map[o.work_type] = (map[o.work_type] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
  }, [orders]);

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: isDesktop ? 10 : 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
    >
      {/* ════════ HERO ════════ */}
      <View className="mb-5">
        <View className={`${isDesktop ? 'flex-row justify-between items-end' : ''}`} style={{ gap: 32, paddingTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{
              ...SERIF, fontSize: isDesktop ? 56 : 40,
              letterSpacing: -0.025 * (isDesktop ? 56 : 40),
              lineHeight: isDesktop ? 56 : 42, color: INK,
            }}>
              Merhaba,{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>Dr. {firstName}</Text>
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label="Aktif" value={`${active}`} bg={P} color="#FFF" />
              {overdueCount > 0 && <StatPill label="Geciken" value={`${overdueCount}`} bg="rgba(217,75,75,0.12)" color="#9C2E2E" />}
              <StatPill label="Bu ay" value={`${thisMonthNew}`} bg="rgba(0,0,0,0.08)" color={INK} />
            </View>
          </View>
          <View className="flex-row" style={{ gap: 32, alignItems: 'flex-end' }}>
            <BigStat value={total} label="Toplam sipariş" />
            <BigStat value={active} label="Aktif" />
            <BigStat value={delivered} label="Teslim" />
          </View>
        </View>
      </View>

      {/* ════════ PENDING APPROVALS BANNER ════════ */}
      {pendingApprovals.length > 0 && (
        <Pressable
          onPress={() => {
            if (pendingApprovals.length === 1) router.push(`/doctor-approval/${pendingApprovals[0].token}` as any);
            else router.push('/(doctor)/orders' as any);
          }}
          style={{
            backgroundColor: CLR.purple, borderRadius: DS.radius.xl,
            padding: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14,
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={20} color="#FFF" strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{pendingApprovals.length} tasarım onayınızı bekliyor</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {pendingApprovals.slice(0, 2).map(p => p.order_number + (p.patient_name ? ' · ' + p.patient_name : '')).join(' · ')}
            </Text>
          </View>
          <ArrowUpRight size={16} color="#FFF" strokeWidth={1.8} />
        </Pressable>
      )}

      {/* ════════ OVERDUE ALERT ════════ */}
      {overdueCount > 0 && (
        <AnimatedOverdueCard count={overdueCount} onPress={() => router.push('/(doctor)/orders' as any)} />
      )}

      {/* ════════ 4-CARD GRID ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        <AnimatedAktifVakaCard isDesktop={isDesktop} pipelineCounts={pipelineCounts} latestOrder={latestOrder} router={router} />

        <Card style={{ flex: isDesktop ? 1.2 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.27, color: INK }}>Sipariş Trendi</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -1.05, lineHeight: 42, marginTop: 8, color: INK }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: DS.ink[400] }}> bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>Son 6 aylık trend</Text>
            </View>
            <Pressable onPress={() => router.push('/(doctor)/orders' as any)} className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: DS.ink[100] }}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          {monthly.length > 0 && <View style={{ flex: 1, minHeight: 120 }}><ProductionBarChart data={monthly} /></View>}
        </Card>

        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 14 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>Teslim Oranı</Text>
            <Pressable onPress={() => router.push('/(doctor)/orders' as any)}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <PercentRingHero value={deliveryPct} size={140} darkText />
          <Text style={{ fontSize: 9, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.72, marginTop: 10 }}>Teslim</Text>
          <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.ink[100] }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: DS.ink[500] }}>{pipelineCounts['uretimde'] ?? 0} üretimde</Text>
            </View>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(P, 0.15) }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: P }}>{pipelineCounts['teslimata_hazir'] ?? 0} hazır</Text>
            </View>
          </View>
        </Card>

        <View style={{ flex: isDesktop ? 1.4 : undefined }}>
          <TasksCard tasks={taskItems} />
        </View>
      </View>

      {/* ════════ BOTTOM ROW — Weekly + CTA ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        <WeeklyStrip weekDays={weekDays} weekCounts={weekCounts} onPress={() => router.push('/(doctor)/orders' as any)} />
        <AnimatedCTACard onPress={() => router.push('/(doctor)/new-order' as any)} isDesktop={isDesktop} />
      </View>

      {/* ════════ ORDERS TABLE ════════ */}
      <Card style={{ marginBottom: 14 }}>
        <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK }}>Son Siparişler</Text>
          <Pressable onPress={() => router.push('/(doctor)/orders' as any)}>
            <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>Tümünü Gör →</Text>
          </Pressable>
        </View>
        <View className="flex-row items-center" style={{ paddingHorizontal: 20, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', backgroundColor: DS.ink[50] }}>
          <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>No</Text>
          <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Hasta</Text>
          {isDesktop && <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>İş Tipi</Text>}
          <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Durum</Text>
          {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'right' }}>Teslim</Text>}
        </View>
        {recentOrders.length === 0
          ? <Text className="p-6 text-center" style={{ fontSize: 13, color: DS.ink[400] }}>Yükleniyor...</Text>
          : recentOrders.map((order, idx) => {
              const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
              const isLast = idx === recentOrders.length - 1;
              return (
                <Pressable key={order.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : undefined,
                }} onPress={() => router.push(`/(doctor)/order/${order.id}` as any)}>
                  <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '800', color: P }} numberOfLines={1}>#{order.order_number}</Text>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(order.patient_name)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{order.patient_name || '—'}</Text>
                  </View>
                  {isDesktop && <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500] }} numberOfLines={1}>{order.work_type || '--'}</Text>}
                  <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                  {isDesktop && <Text style={{ flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'right', color: overdue ? '#9C2E2E' : DS.ink[400] }}>{fmtDate(order.delivery_date)}</Text>}
                </Pressable>
              );
            })
        }
      </Card>

      {/* ════════ EXTRA: Status + Work Type ════════ */}
      {(byStatus.length > 0 || byWorkType.length > 0) && (
        <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
          <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
            <CardHeader title="Statü Dağılımı" display />
            <View style={{ gap: 12 }}>
              {byStatus.map(item => {
                const pct = Math.round((item.count / (total || 1)) * 100);
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
          {byWorkType.length > 0 && (
            <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22 }}>
              <CardHeader title="İş Tipi Dağılımı" display />
              <View style={{ gap: 10 }}>
                {byWorkType.map((w, i) => {
                  const max = Math.max(...byWorkType.map(d => d.count), 1);
                  const palette = [P, CLR.blue, CLR.purple, CLR.teal, CLR.orange];
                  return (
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
                  );
                })}
              </View>
            </Card>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
