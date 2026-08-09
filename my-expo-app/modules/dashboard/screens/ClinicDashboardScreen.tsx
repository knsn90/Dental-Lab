/**
 * ClinicDashboardScreen — Patterns design language (matching Lab/Admin layout)
 *
 * Layout:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. 4-card grid (AnimatedAktifVaka, Sipariş Trendi, PercentRing, TasksCard)
 *   3. Bottom row — WeeklyStrip + AnimatedCTACard
 *   4. Extra sections — Orders table, Hekim performansı, Status dist
 *
 * Theme: DS.clinic (Zümrüt #32BB78)
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Platform,
  useWindowDimensions, RefreshControl,
  Animated, Easing, StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity, Users,
  Calendar, TrendingUp, AlertTriangle, ArrowUpRight,
  ArrowRight, Check, Layers, CornerDownRight,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { useClinicOrders } from '../../clinic/hooks/useClinicOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { FaceScanQuickAction } from '../../orders/components/FaceScanQuickAction';
import { titleCaseTR } from '../../../core/utils/textCase';
import { PendingReviewsCard } from '../../reviews/components/PendingReviewsCard';
import { AlertPillX } from '../../../core/ui/AlertPillX';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { shortClinicName } from '../../../core/utils/clinicName';
import { fetchClinicBalances } from '../../invoices/api';
import type { ClinicBalance } from '../../invoices/types';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { rateToBase } from '../../../core/money/rateCache';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { resolveOrderStatus } from '../components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../orders/revisionGroups';
import { useRevisionParents } from '../../orders/hooks/useRevisionParents';

// ── Display font ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Theme: Clinic sage green ──
const P     = DS.clinic.primary;     // #32BB78
const P_DEEP = DS.clinic.primaryDeep; // #0C8F56
const SURFACE_ALT = DS.clinic.surfaceAlt; // #2F313F
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
  atama_bekleniyor:{ label: 'Atama Bekliyor',  color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' },
  asamada:         { label: 'Üretimde',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  uretimde:        { label: 'Üretimde',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  kurye_bekleniyor:{ label: 'Kurye Bekleniyor',color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  kuryede:         { label: 'Kuryede',         color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  iptal:           { label: 'İptal',           color: '#B91C1C',   bg: 'rgba(220,38,38,0.10)' },
  teslimata_hazir: { label: 'Kuryeye Teslim Edildi', color: '#1F6B47',   bg: 'rgba(45,154,107,0.12)' },
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
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
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
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.66 }}>{label}</Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
      </View>
    </View>
  );
}

/** Hero KPI'ları arasındaki saç teli ayraç — sayı bloğu kadar yüksek. */
function StatDivider() {
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 2, backgroundColor: 'rgba(0,0,0,0.10)' }} />;
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ ...SERIF, fontSize: DS.size.h2, letterSpacing: -1, lineHeight: DS.size.h2, color: INK }}>{value}</Text>
      <Text style={{ fontSize: DS.size.micro, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.66, marginTop: 4 }}>{label}</Text>
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
  const id = `pr-hero-clinic-${targetValue}-${size}`;
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
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, planningWaitingCount, latestOrder, router }: {
  isDesktop: boolean; pipelineCounts: Record<string, number>; planningWaitingCount?: number; latestOrder: any; router: any;
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
  // Bulanıklık ışığı geniş alana yayıp kontrastı düşürüyor; parıltı aralığı
  // 0–0.12'den 0–0.30'a çıkarıldı, yoksa kart soluk/ölü görünüyor.
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.30] });
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
        <View className="absolute" style={{
          top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <View className="rounded-full" style={{
            paddingHorizontal: 10, paddingVertical: 4,
            backgroundColor: `${P}E6`, flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', opacity: dotOpacity }} />
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#FFF', letterSpacing: 0.5 }}>CANLI</Text>
          </View>
          {(planningWaitingCount ?? 0) > 0 && (
            <View className="rounded-full" style={{
              paddingHorizontal: 10, paddingVertical: 4,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
              flexDirection: 'row', alignItems: 'center', gap: 5,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] as any }}>
                {planningWaitingCount}
              </Text>
              <Text style={{ fontSize: 9.5, fontWeight: '500', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                planlama bekliyor
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          {PIPELINE_STAGES.map((stage) => {
            const count = pipelineCounts[stage.key] ?? 0;
            const active = count > 0;
            return (
              <Pressable key={stage.key} onPress={() => router.push('/(clinic)/orders' as any)} className="items-center" style={{ gap: 4 }}>
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
          <Pressable onPress={() => router.push(`/(clinic)/order/${latestOrder.id}` as any)} style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: INK }} numberOfLines={1}>
              {(latestOrder as any).doctor_profile?.full_name ?? latestOrder.patient_name ?? 'Sipariş'}
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

// ── Üretim Süresi Bar Chart (admin paneli ile aynı pill design) ──
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
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
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
            <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
              {isHighlight && (
                <View style={{ marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: FILL_DARK }}>{d.count}</Text>
                </View>
              )}
              <View
                style={{
                  width: '100%',
                  height: '100%',
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
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Weekly Calendar Strip (admin paneli ile aynı: hatched pill + alınan/tamamlanan overlay) ──
function WeeklyStrip({ weekDays, weekCounts, weekDone, onPress }: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  weekDone: Record<string, number>;
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
    <Card style={{ padding: 18, flex: 2 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>Bu hafta</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_LIGHT }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>Alınan {totalReceived} iş</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_DARK }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>Teslim edilen {totalCompleted} iş</Text>
          </View>
        </View>
      </View>

      <View className="flex-row items-end" style={{ gap: 10, flex: 1, minHeight: 140, paddingHorizontal: 2 }}>
        {weekDays.map((day, i) => {
          const received  = weekCounts[day.date] ?? 0;
          const completed = weekDone[day.date] ?? 0;
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
                {/* Sabit yükseklikli etiket zonu — dolu bar üst legend ile çakışmasın */}
                <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                  {showLabel ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE_DARK }}>{ratio}%</Text>
                    </View>
                  ) : !empty ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: day.isToday ? INK : DS.ink[500] }}>
                      {received}
                    </Text>
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
        {/* Yüzen ışık lekeleri — web'de BULANIK (aurora hissi).
            `filter` yalnız web'de var; native'de RN desteklemiyor, orada net
            daire olarak kalır. Bulanıklık kenara taştığı için kartın
            `overflow: hidden`'ı onu kırpar — istenen davranış.
            `willChange: transform` şart: bulanık katman her karede yeniden
            rasterleştirilirse animasyon pahalıya gelir; katman terfi edilince
            tarayıcı yalnız transform'u uygular. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: 70,
            backgroundColor: '#ABEFC7',
            opacity: 0.55,
            transform: [{ translateY: floatY }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(18px)', mixBlendMode: 'screen', willChange: 'transform' } as any) : {}),
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90,
            backgroundColor: 'rgba(255,255,255,1)',
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(30px)', mixBlendMode: 'screen', willChange: 'transform, opacity' } as any) : {}),
          }}
        />
        {/* Karşı köşede ikinci, daha geniş leke — tek leke bulanıklaşınca kart
            tek renkli bir zemine dönüyordu; bu, aurora'daki renk dalgalanmasının
            yerini tutan derinliği geri veriyor. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', bottom: -60, left: -40,
            width: 200, height: 200, borderRadius: 100,
            backgroundColor: '#74E1A8',
            opacity: 0.42,
            transform: [{ translateY: Animated.multiply(floatY, -1) }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(40px)', mixBlendMode: 'screen', willChange: 'transform' } as any) : {}),
          }}
        />
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
// Zemin SURFACE_ALT'ın (#2F313F) %10 beyazla karışmış hâli: yandaki kartlarla
// ağırlık yarışına girmesin diye açıldı. SURFACE_ALT'a dokunulmadı — o rengi
// AnimatedAktifVakaCard da kullanıyor.
const TASKS_SURFACE = '#444652';
function TasksCard({ tasks }: { tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] }) {
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <View style={{
      backgroundColor: TASKS_SURFACE,
      // @ts-ignore web gradient
      backgroundImage: `linear-gradient(135deg, ${TASKS_SURFACE} 0%, ${P_DEEP}33 100%)`,
      borderRadius: DS.radius.xl, padding: 22, flex: 1, gap: 0,
    }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Bugünkü İşler</Text>
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

// ── Statü Dağılımı — daire solda + şeritler sağda (Hekim Performansı yanında) ──
const STATUS_DONUT_COLORS: Record<string, string> = {
  alindi:          '#22C55E',
  uretimde:        '#F59E0B',
  kalite_kontrol:  '#3B82F6',
  teslimata_hazir: '#10B981',
  teslim_edildi:   '#15803D',
};

function StatusDistributionCard({
  byStatus, total, isDesktop,
}: {
  byStatus: { key: string; label: string; count: number }[];
  total: number;
  isDesktop: boolean;
}) {
  const segments = byStatus.map(s => ({
    ...s,
    pct: total > 0 ? Math.round((s.count / total) * 100) : 0,
    color: STATUS_DONUT_COLORS[s.key] ?? P,
  }));
  const top = [...segments].sort((a, b) => b.count - a.count)[0];

  // Donut geometri — r=38, çevre = 2πr
  const R = 38;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = segments.map(s => {
    const frac = total > 0 ? s.count / total : 0;
    const dash = frac * C;
    const rot  = acc * 360 - 90;
    acc += frac;
    return { dash, rot, color: s.color, show: s.count > 0 };
  });

  const DONUT = 150;

  return (
    <Card style={{ flex: isDesktop ? 1 : undefined, padding: 24, marginBottom: isDesktop ? 0 : 14 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between" style={{ marginBottom: 20, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...SERIF, fontSize: 26, letterSpacing: -0.5, color: INK }}>
            Statü Dağılımı
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 3 }}>
            Toplam {total} sipariş
          </Text>
        </View>
        <View
          className="rounded-xl"
          style={{
            paddingHorizontal: 13, paddingVertical: 7,
            borderWidth: 1, borderColor: hexA(P, 0.35), backgroundColor: hexA(P, 0.10),
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F6B47' }}>Tüm Zamanlar</Text>
        </View>
      </View>

      {/* Body — daire solda, şeritler sağda */}
      <View className="flex-row" style={{ gap: 16 }}>
        {/* Sol: yeşil gradient kutu içinde donut + en yüksek oran */}
        <View
          className="rounded-3xl"
          style={{
            width: 210, padding: 18,
            // @ts-ignore web gradient — yeşil → beyaz
            backgroundImage: `linear-gradient(180deg, ${hexA(P, 0.14)} 0%, #FFFFFF 100%)`,
            backgroundColor: hexA(P, 0.06),
          }}
        >
          <View style={{ width: DONUT, height: DONUT, alignSelf: 'center', position: 'relative' }}>
            <Svg viewBox="0 0 100 100" width={DONUT} height={DONUT}>
              <Circle cx={50} cy={50} r={R} fill="none" stroke="#E8F5E9" strokeWidth={10} />
              {arcs.map((a, i) => a.show ? (
                <Circle
                  key={i}
                  cx={50} cy={50} r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={10}
                  strokeLinecap="butt"
                  strokeDasharray={`${a.dash} ${C}`}
                  transform={`rotate(${a.rot} 50 50)`}
                />
              ) : null)}
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...SERIF, fontSize: 40, letterSpacing: -1, lineHeight: 44, color: INK }}>{total}</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: -2 }}>Toplam</Text>
            </View>
          </View>

          {top && top.count > 0 && (
            <View
              className="rounded-2xl"
              style={{ marginTop: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14 }}
            >
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>En yüksek oran</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F6B47', marginTop: 2 }}>
                {top.label} (%{top.pct})
              </Text>
            </View>
          )}
        </View>

        {/* Sağ: statü şeritleri */}
        <View style={{ flex: 1, gap: 10 }}>
          {segments.map(item => (
            <View
              key={item.key}
              className="rounded-2xl"
              style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, backgroundColor: '#FFF' }}
            >
              <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[800] }} numberOfLines={1}>{item.label}</Text>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: INK }}>{item.count}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F6B47', width: 38, textAlign: 'right' }}>%{item.pct}</Text>
                </View>
              </View>
              <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: DS.ink[100] }}>
                <View className="rounded-full" style={{ height: 8, backgroundColor: item.color, width: `${item.pct}%` as any }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

// ── Mali Durum kartı — kliniğin lab ile cari hesabı (baz ₺) ──
const fmtMoney = (n: number | null | undefined) =>
  baseSymbol() + (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
/** ₺ yanına orijinal döviz "(€420)" — tek TL dışı para birimi varsa. */
const origSuffix = (cur?: string | null, amt?: number | null) => {
  const v = Number(amt) || 0;
  if (!cur || cur === 'TRY' || v <= 0) return '';
  const sym = CURRENCY_META[cur as Currency]?.symbol ?? cur;
  return ` (${sym}${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })})`;
};

function ClinicFinanceCard({ fin, isDesktop, onPress }: { fin: ClinicBalance | null; isDesktop: boolean; onPress: () => void }) {
  const balance = Number(fin?.balance ?? 0);
  const overdue = Number(fin?.overdue_amount ?? 0);
  const billed = Number(fin?.total_billed ?? 0);
  const paid = Number(fin?.total_paid ?? 0);
  const owes = balance > 0.01;
  // KATI per-currency: kliniğin parası baz değilse kendi para biriminde göster (₺/≈ yok).
  // Orijinali olan alanlar (balance/billed/paid) doğrudan; olmayanlar (aging/overdue) kurla türetilir.
  const baseCur = getBaseCurrency();
  const fcur = fin?.currency || baseCur;
  const isForeign = !!fin?.currency && fin.currency !== baseCur;
  const fSym = CURRENCY_META[fcur as Currency]?.symbol ?? fcur;
  // Orijinali olmayan alanları (aging/overdue) gerçek orijinal toplama ORANLA ölçekle
  // (güncel kurla bölmek hero €420 ↔ aging €423 gibi drift yaratıyordu). balance_original
  // varsa onu kullan; yoksa kur-türevine düş.
  const balOrig = Math.abs(Number(fin?.balance_original ?? 0));
  const scale = isForeign
    ? (Math.abs(balance) > 0.01 && balOrig > 0 ? balOrig / Math.abs(balance) : 1 / (rateToBase(fcur) || 1))
    : 1;
  const own = (baseAmt: number, origAmt?: number | null) => {
    if (!isForeign) return fmtMoney(baseAmt);
    const v = origAmt != null && Number(origAmt) !== 0
      ? Number(origAmt)
      : Number(baseAmt) * scale;
    return fSym + (Number(v) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  };
  const balColor = owes ? '#9C2E2E' : '#1F6B47';
  // Aging stacked bar (varsa)
  const ag = [
    { k: 'Güncel', v: Number(fin?.aging_current ?? 0), c: hexA(P, 0.55) },
    { k: '1–30',   v: Number(fin?.aging_30 ?? 0),      c: '#E89B2A' },
    { k: '31–60',  v: Number(fin?.aging_60 ?? 0),      c: '#D98324' },
    { k: '61+',    v: Number(fin?.aging_90 ?? 0),      c: '#D94B4B' },
  ];
  const agTotal = ag.reduce((s, a) => s + a.v, 0);

  return (
    <Card style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 14, padding: 0, overflow: 'hidden' }}>
      <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK }}>Mali Durum</Text>
        <Pressable onPress={onPress}>
          <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>Finans →</Text>
        </Pressable>
      </View>

      <View style={{ padding: 20, gap: 16 }}>
        {/* Bakiye hero */}
        <View>
          <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {owes ? 'Güncel Borç' : 'Bakiye'}
          </Text>
          <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -1.05, lineHeight: 46, color: balColor, marginTop: 4 }}>
            {own(Math.abs(balance), Math.abs(Number(fin?.balance_original ?? 0)))}
          </Text>
          {overdue > 0.01 && (
            <View className="flex-row items-center" style={{ gap: 5, marginTop: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#D94B4B' }} />
              <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '600' }}>{own(overdue)} gecikmiş</Text>
            </View>
          )}
        </View>

        {/* Aging stacked bar */}
        {agTotal > 0.01 && (
          <View style={{ gap: 6 }}>
            <View className="flex-row" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: DS.ink[100] }}>
              {ag.map(a => a.v > 0 ? <View key={a.k} style={{ flex: a.v / agTotal, backgroundColor: a.c }} /> : null)}
            </View>
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {ag.filter(a => a.v > 0).map(a => (
                <View key={a.k} className="flex-row items-center" style={{ gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: a.c }} />
                  <Text style={{ fontSize: 10, color: DS.ink[500] }}>{a.k}: {own(a.v)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Kesilen / Ödenen */}
        <View className="flex-row" style={{ gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: DS.ink[50], borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 10, color: DS.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Kesilen</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: INK, marginTop: 3 }}>{own(billed, fin?.total_billed_original)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: hexA(P, 0.08), borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 10, color: DS.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Tahsil Edilen</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1F6B47', marginTop: 3 }}>{own(paid, fin?.total_paid_original)}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export function ClinicDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useClinicOrders();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const insets = useSafeAreaInsets();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPulse = require('../../../core/store/uiOverlayStore').useUiOverlayStore((s: any) => s.notificationsPulse);
  useEffect(() => { if (notificationsPulse > 0) setNotificationsOpen(true); }, [notificationsPulse]);
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, []);

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const clinicName = shortClinicName(profile?.clinic_name) || 'Kliniğiniz';
  // Kliniğe kayıtlı hekim sayısı (doctors tablosu, clinic_id) — "Hekim" KPI'ı.
  // Önceki mantık siparişlerden sayıyordu (yanlış); kayıtlı hekim doğrusu budur.
  const clinicId = (profile as any)?.clinic_id ?? null;
  const [doctorsCount, setDoctorsCount] = useState(0);
  useEffect(() => {
    if (!clinicId) { setDoctorsCount(0); return; }
    let alive = true;
    (async () => {
      const { count } = await supabase
        .from('doctors')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId);
      if (alive) setDoctorsCount(count ?? 0);
    })();
    return () => { alive = false; };
  }, [clinicId]);
  // Mali durum (cari hesap) — RLS kliniği kendi satırına kısıtlar
  const [finance, setFinance] = useState<ClinicBalance | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await fetchClinicBalances();
      if (alive) setFinance((data ?? [])[0] ?? null);
    })();
    return () => { alive = false; };
  }, []);
  const today = todayStr();

  // ── Derived stats ──
  const total = orders.length;
  const activeCount = orders.filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal').length;
  const overdueList = orders.filter(o => isOrderOverdue(o.delivery_date, o.status, (o as any).hold_status));
  const overdueCount = overdueList.length;
  const delivered = orders.filter(o => o.status === 'teslim_edildi').length;
  const thisMonthNew = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return orders.filter(o => {
      const d = new Date(o.created_at); d.setHours(0, 0, 0, 0);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [orders]);

  // Pipeline counts — pipeline'da 'uretimde' bucket'ı work_orders.status='uretimde' VE
  // 'asamada' (triaj sonrası aşama akışında) işleri kapsar. Aynı şekilde 'alindi' bucket'ı
  // henüz planlanması onaylanmamış (triage_approved_at IS NULL) tüm işleri içerir.
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_KEYS.forEach(k => { counts[k] = 0; });
    for (const o of orders) {
      const s: string = (o as any).status;
      if (s === 'asamada' || s === 'uretimde') counts['uretimde'] = (counts['uretimde'] ?? 0) + 1;
      else if (s === 'kargoda') counts['teslimata_hazir'] = (counts['teslimata_hazir'] ?? 0) + 1;
      else if (counts[s] != null) counts[s] = counts[s] + 1;
    }
    return counts;
  }, [orders]);

  // Planlama bekleyen (triage_approved_at IS NULL ve henüz teslim edilmemiş) — CANLI rozetinde göstermek için
  const planningWaitingCount = useMemo(
    () => orders.filter(o => !(o as any).triage_approved_at && (o as any).status !== 'teslim_edildi' && (o as any).status !== 'iptal').length,
    [orders],
  );

  // pipeCount: yüzdenin gerçek paydası (0 olabilir) — "1 / 9" bağlamı bundan yazılır.
  const pipeCount = Object.values(pipelineCounts).reduce((s, v) => s + v, 0);
  const totalPipe = pipeCount || 1;
  const deliveredPipe = pipelineCounts['teslim_edildi'] ?? 0;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct = Math.round((deliveredPipe / totalPipe) * 100);

  // Monthly trend — her diş 1 üye olarak sayılır (tooth_numbers.length toplamı)
  const monthly = useMemo(() => {
    const bars: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const y = d.getFullYear(), m = d.getMonth();
      const memberCount = orders
        .filter(o => { const c = new Date(o.created_at); return c.getFullYear() === y && c.getMonth() === m; })
        .reduce((sum, o) => sum + (Array.isArray((o as any).tooth_numbers) ? (o as any).tooth_numbers.length : 0), 0);
      bars.push({ label: MONTHS_TR[m], count: memberCount });
    }
    return bars;
  }, [orders]);

  // Week counts
  const weekDays = getWeekDays();
  // Her diş 1 üye sayılır — tooth_numbers.length toplamı
  const teethOf = (o: any) => Array.isArray(o?.tooth_numbers) ? o.tooth_numbers.length : 0;
  const weekCounts = useMemo(() => {
    const wc: Record<string, number> = {};
    weekDays.forEach(wd => {
      wc[wd.date] = orders
        .filter(o => o.created_at?.startsWith(wd.date))
        .reduce((sum, o) => sum + teethOf(o), 0);
    });
    return wc;
  }, [orders]);
  // Tamamlanan = o gün ALINAN (created) siparişlerden artık 'teslim_edildi' olanların
  // diş sayısı (cohort mantığı — lab Özet ile aynı). work_orders'ta completed_at YOK;
  // eski kod olmayan kolonlar yüzünden created_at'e düşüp tamamlananları yanlış güne
  // yazıyordu. Aynı cohort kullanılınca günlük tamamlanma oranı da doğru olur.
  const weekDone = useMemo(() => {
    const wd: Record<string, number> = {};
    weekDays.forEach(day => {
      wd[day.date] = orders
        .filter(o => o.status === 'teslim_edildi' && o.created_at?.startsWith(day.date))
        .reduce((sum, o) => sum + teethOf(o), 0);
    });
    return wd;
  }, [orders]);

  // Recent orders
  const recentOrders = useMemo(() =>
    orders.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 8),
    [orders]);
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi' && o.status !== 'iptal') ?? recentOrders[0];

  // Upcoming deliveries
  const upcoming = useMemo(() => orders
    .filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal')
    .filter(o => { const d = new Date(o.delivery_date + 'T00:00:00'); return d.getTime() >= Date.now() - 86400000; })
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 5), [orders]);

  // Hekim bazında dağılım
  const byDoctor = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; active: number; overdue: number }>();
    for (const o of orders) {
      const docId = o.doctor_id;
      const docName = (o as any).doctor_profile?.full_name ?? 'Bilinmeyen hekim';
      if (!map.has(docId)) map.set(docId, { id: docId, name: docName, total: 0, active: 0, overdue: 0 });
      const row = map.get(docId)!;
      row.total += 1;
      if (o.status !== 'teslim_edildi' && o.status !== 'iptal') row.active += 1;
      if (isOrderOverdue(o.delivery_date, o.status, (o as any).hold_status)) row.overdue += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [orders]);

  // Unique doctor count
  const doctorCount = byDoctor.length;

  // Tasks
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];
  overdueList.slice(0, 2).forEach(o => {
    const drName = (o as any).doctor_profile?.full_name ?? 'Sipariş';
    taskItems.push({ icon: Clock as React.FC<any>, label: `${drName} · gecikmiş`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(clinic)/order/${o.id}` as any) });
  });
  upcoming.slice(0, 2).forEach(o => {
    const drName = (o as any).doctor_profile?.full_name ?? 'Sipariş';
    taskItems.push({ icon: Package as React.FC<any>, label: `${drName} · teslim`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(clinic)/order/${o.id}` as any) });
  });
  if (taskItems.length === 0) {
    taskItems.push({ icon: CheckCircle as React.FC<any>, label: 'Bekleyen görev yok', time: '', done: true, onPress: undefined });
  }

  // Status distribution
  const byStatus = useMemo(() =>
    STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: orders.filter(o => o.status === k).length })),
    [orders]);

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Variant B Home (B1)
  // ══════════════════════════════════════════════════════════════
  // Revizyon alt-listesi: penceredeki revizyonun ebeveyni pencere dışındaysa ek
  // sorguyla tamamlanır. Hook KOŞULSUZ çağrılmalı → isDesktop dalından önce.
  const revParents = useRevisionParents(recentOrders);
  const recentWithParents = revParents.length ? [...recentOrders, ...revParents] : recentOrders;
  // Masaüstü tablo için vaka sırası (anchor + altında eski revizyonlar)
  const recentRows = flattenRevisionCases(recentWithParents);

  if (!isDesktop) {
    const { ClinicMobileDashboard } = require('../components/ClinicMobileDashboard');
    const { NotificationsSheet } = require('../../../core/ui/mobile/NotificationsSheet');

    // Stage counts
    const stageCounts = {
      alindi: (pipelineCounts['alindi']         ?? 0) + (pipelineCounts['onay_bekliyor'] ?? 0),
      uretim: (pipelineCounts['uretimde']       ?? 0) + (pipelineCounts['asamada']        ?? 0),
      kk:     (pipelineCounts['kalite_kontrol'] ?? 0),
      hazir:  (pipelineCounts['teslimata_hazir'] ?? 0) + (pipelineCounts['kargoda']       ?? 0),
    };
    const deliveredPct = total > 0 ? Math.round((delivered / total) * 100) : 0;

    // Week bars
    const weekBars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const iso = d.toISOString().slice(0, 10);
      weekBars.push(orders.filter((o: any) => o.created_at?.startsWith(iso)).length);
    }
    const monthsShort = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const wkStart = new Date(); wkStart.setDate(wkStart.getDate() - 6);
    const weekRange = `${wkStart.getDate()} ${monthsShort[wkStart.getMonth()]} → ${new Date().getDate()} ${monthsShort[new Date().getMonth()]}`;
    const thisMonthCount = orders.filter((o: any) => {
      const d = new Date(o.created_at); d.setHours(0,0,0,0);
      const n = new Date(); n.setHours(0,0,0,0);
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    }).length;

    // Delayed cases
    const delayedItems = overdueList.slice(0, 3).map((o: any) => {
      const due = new Date(o.delivery_date + 'T00:00:00').getTime();
      const days = Math.max(1, Math.floor((Date.now() - due) / 86400000));
      return {
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        doctorName: (o as any).doctor_name ?? undefined,
        remain: `${days}g geç`,
        kind: 'delay' as const,
      };
    });

    // Notifications
    const notifApprovals = orders
      .filter((o: any) => o.status === 'onay_bekliyor')
      .slice(0, 5)
      .map((o: any) => ({
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: 'Onay bekliyor',
      }));
    const notifOverdue = overdueList.slice(0, 5).map((o: any) => {
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

    // Son Siparişler — mobil kart listesi (başlık = hasta adı; klinik siparişi verir)
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status);
      const isOverdue = !!o.delivery_date && o.delivery_date < today && o.status !== 'teslim_edildi' && o.status !== 'iptal';
      const pName = o.patient_name ? titleCaseTR(o.patient_name) : '—';
      return {
        id: String(o.id),
        no: String(o.order_number ?? ''),
        title: pName,
        initials: initials(pName),
        workType: o.work_type || '—',
        statusLabel: st.label,
        statusColor: st.color,
        statusBg: st.bg,
        delivery: o.delivery_date ? fmtDate(o.delivery_date) : '',
        overdue: isOverdue,
      };
    };
    // Gruplama slice'tan ÖNCE: 6 satır = 6 VAKA (aynı vakanın üyeleri yer yemesin)
    const recentForMobile = mapRevisionCases(recentWithParents, toRecentItem).slice(0, 6);

    return (
      <>
        <ClinicMobileDashboard
          recentOrders={recentForMobile}
          onOpenOrderById={(dbId: string) => router.push(`/(clinic)/order/${dbId}` as any)}
          onAllOrders={() => router.push('/(clinic)/orders' as any)}
          clinicName={clinicName}
          liveActive={activeCount}
          liveTotal={total}
          liveStages={stageCounts}
          livePercent={deliveredPct}
          activeOrders={activeCount}
          overdueCount={overdueCount}
          thisMonthNew={thisMonthCount}
          pendingApprovalsCount={notifApprovals.length}
          doctorsCount={doctorsCount}
          weekBars={weekBars}
          weekRange={weekRange}
          weekTotal={weekBars.reduce((a, b) => a + b, 0)}
          delayed={delayedItems}
          onNewOrder={() => useNewOrderModalStore.getState().setOpen(true)}
          onScan={() => require('../../../core/store/scanStore').useScanStore.getState().setOpen(true)}
          onApprovals={() => router.push('/(clinic)/orders?filter=approval' as any)}
          onMessages={() => router.push('/(clinic)/messages' as any)}
          onNotifications={() => setNotificationsOpen(true)}
          onProfile={() => router.push('/(clinic)/profile' as any)}
          onOpenOrder={(id: string) => {
            const found = delayedItems.find((x: any) => x.id === id);
            if (found) router.push(`/(clinic)/order/${(found as any)._id}` as any);
          }}
          refreshing={loading}
          onRefresh={refetch}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onOpenOrder={(dbId: string) => router.push(`/(clinic)/order/${dbId}` as any)}
          panel="klinik"
          approvals={notifApprovals}
          overdue={notifOverdue}
          upcoming={[]}
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
        // Sayfa kenarı tek kaynaktan (PAGE_PADDING = 16). Desktop'ta 10'du.
        paddingHorizontal: PAGE_PADDING,
        paddingTop: isDesktop ? 10 : insets.top + 8,
        paddingBottom: 120,
      }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
    >
      {/* ════════ HERO ════════ */}
      {/* Alt boşluk 16 — hero ile altındaki ilk kart arasındaki mesafe sabit. */}
      <View style={{ marginBottom: 16 }}>
        <View className={`${isDesktop ? 'flex-row justify-between items-end' : ''}`} style={{ gap: 32, paddingTop: 8 }}>
          <View style={{ flex: 1 }}>
            {/* Selamlama sayfanın konusu değil; bilgi öndedir. 56/40 → 28/24. */}
            <Text style={{
              ...SERIF, fontSize: isDesktop ? 28 : 24,
              letterSpacing: -0.025 * (isDesktop ? 28 : 24),
              lineHeight: isDesktop ? 32 : 28, color: INK,
            }}>
              Merhaba,{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>{clinicName}</Text>
            </Text>
            <Text style={{ fontSize: 14, color: DS.ink[500], marginTop: 4 }}>
              Yetkili: <Text style={{ fontWeight: '600', color: DS.ink[700] }}>{profile?.full_name ?? firstName}</Text>
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label="Aktif" value={`${activeCount}`} bg={P} color="#FFF" />
              {/* "Geciken" burada yok — aşağıdaki kırmızı aksiyon pill'i aynı sayıyı
                  hem söylüyor hem tıklanabilir yapıyor; iki kez yazmak gürültü. */}
              <StatPill label="Bu ay" value={`${thisMonthNew}`} bg="rgba(0,0,0,0.08)" color={INK} />
              {/* Geciken + değerlendirilecek AYNI satırda: eşit ölçülü rozetler. */}
              {overdueCount > 0 && (
                <AlertPillX
                  icon={AlertTriangle}
                  count={overdueCount}
                  label="Geciken"
                  color={CLR.red}
                  labelColor="#9C2E2E"
                  pulse
                  onPress={() => router.push('/(clinic)/orders' as any)}
                />
              )}
              <PendingReviewsCard raterRole="clinic" compact />
              <FaceScanQuickAction accentColor={P} compact />
            </View>

          </View>
          {/* Kart yok — üç sayı serbest dursun; aralarında yalnız saç teli
              kalınlığında bir ayraç. alignSelf: sol kolon daha uzun olduğunda
              KPI bloğu tepede kalıp altında boşluk bırakıyordu. */}
          <View className="flex-row" style={{ gap: 24, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            <BigStat value={total} label="Toplam" />
            <StatDivider />
            <BigStat value={doctorsCount} label="Hekim" />
            <StatDivider />
            <BigStat value={delivered} label="Teslim" />
          </View>
        </View>
      </View>

      {/* ════════ 4-CARD GRID ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        <AnimatedAktifVakaCard isDesktop={isDesktop} pipelineCounts={pipelineCounts} planningWaitingCount={planningWaitingCount} latestOrder={latestOrder} router={router} />

        <Card style={{ flex: isDesktop ? 1.2 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 14 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.27, color: INK }}>Sipariş Trendi</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -1.05, lineHeight: 42, marginTop: 8, color: INK }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: DS.ink[400] }}> üye bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>Her diş 1 üye · Son 6 ay</Text>
            </View>
            <Pressable onPress={() => router.push('/(clinic)/orders' as any)} className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: DS.ink[100] }}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          {monthly.length > 0 && <View style={{ flex: 1, minHeight: 120 }}><ProductionBarChart data={monthly} /></View>}
        </Card>

        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 14 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>Teslim Oranı</Text>
            <Pressable onPress={() => router.push('/(clinic)/orders' as any)}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <PercentRingHero value={deliveryPct} size={140} darkText />
          {/* Yüzde tek başına "neyin %11'i?" sorusunu bırakıyordu — payı/paydayı yaz. */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700], marginTop: 10 }}>
            {deliveredPipe} / {pipeCount} sipariş
          </Text>
          <Text style={{ fontSize: 9, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.72, marginTop: 3 }}>
            Teslim edilen · tüm zamanlar
          </Text>
          <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.ink[100] }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: DS.ink[500] }}>{pipelineCounts['uretimde'] ?? 0} üretimde</Text>
            </View>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(P, 0.15) }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: P }}>{pipelineCounts['teslimata_hazir'] ?? 0} hazır</Text>
            </View>
          </View>
        </Card>

        {/* Hızlı İşlem CTA — "Yeni sipariş oluştur" (görevler ile yer değişti) */}
        <View style={{ flex: isDesktop ? 1.4 : undefined }}>
          <AnimatedCTACard onPress={() => router.push('/(clinic)/new-order' as any)} isDesktop={isDesktop} />
        </View>
      </View>

      {/* ════════ BOTTOM ROW — Weekly + Bugünkü Görevler ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        <WeeklyStrip weekDays={weekDays} weekCounts={weekCounts} weekDone={weekDone} onPress={() => router.push('/(clinic)/orders' as any)} />
        {/* Bugünkü Görevler — Dark (CTA ile yer değişti) */}
        <View style={{ flex: isDesktop ? 1 : undefined, marginTop: isDesktop ? 0 : 14 }}>
          <TasksCard tasks={taskItems} />
        </View>
      </View>

      {/* ════════ ORDERS TABLE ════════ */}
      <Card style={{ marginBottom: 14 }}>
        <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK }}>Son Siparişler</Text>
          <Pressable onPress={() => router.push('/(clinic)/orders' as any)}>
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
          ? <Text className="p-6 text-center" style={{ fontSize: 13, color: DS.ink[400] }}>{loading ? 'Yükleniyor...' : 'Henüz sipariş yok'}</Text>
          : recentRows.map((order: any, idx: number) => {
              const overdue = order.delivery_date < today && order.status !== 'teslim_edildi' && order.status !== 'iptal';
              const isLast = idx === recentRows.length - 1;
              const drName = (order as any).patient_name ? titleCaseTR((order as any).patient_name) : '--';
              return (
                <Pressable key={order.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : undefined,
                }} onPress={() => router.push(`/(clinic)/order/${order.id}` as any)}>
                  <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: order.__revChild ? 14 : 0 }}>
                    {order.__revChild && <CornerDownRight size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} />}
                    <Text style={{ fontSize: 12, fontWeight: '800', color: P, flexShrink: 1 }} numberOfLines={1}>#{order.order_number}</Text>
                  </View>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(drName)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{drName}</Text>
                  </View>
                  {isDesktop && <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500] }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E' }}>{(order as any).__continuation ? 'Devam - ' : 'Revizyon - '}</Text>
                    )}{order.work_type || '--'}</Text>}
                  <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                  {isDesktop && <Text style={{ flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'right', color: overdue ? '#9C2E2E' : DS.ink[400] }}>{fmtDate(order.delivery_date)}</Text>}
                </Pressable>
              );
            })
        }
      </Card>

      {/* ════════ EXTRA: Hekim Performansı + Mali Durum (Statü Dağılımı yerine) ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 14, marginBottom: 14 }}>
        {/* Hekim Performansı */}
        {byDoctor.length > 0 && (
          <Card style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 14 }}>
            <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: INK }}>Hekim Performansı</Text>
              <Pressable onPress={() => router.push('/(clinic)/doctors' as any)}>
                <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>Hekimler →</Text>
              </Pressable>
            </View>
            {byDoctor.map((d, i) => {
              const isLast = i === byDoctor.length - 1;
              return (
                <View key={d.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 12, gap: 12,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)',
                }}>
                  <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: P }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>{initials(d.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{d.name}</Text>
                    <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                      {d.total} sipariş · {d.active} aktif{d.overdue > 0 ? ` · ${d.overdue} gecikti` : ''}
                    </Text>
                  </View>
                  <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: hexA(P, 0.1) }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: P }}>{d.total}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
        {/* Mali Durum — Statü Dağılımı yerine finansa özel kart */}
        <ClinicFinanceCard fin={finance} isDesktop={isDesktop} onPress={() => router.push('/(clinic)/finance' as any)} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
