import i18n, { localeTag, isRTL } from '../../../core/i18n';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { weekdayOffset, fmtWeekdayDayMonth } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
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
 * Theme: DS.clinic (Zümrüt #32BB78) — doctor & clinic share the same green
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Platform,
  useWindowDimensions, RefreshControl,
  Animated, Easing, StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity,
  Calendar, TrendingUp, AlertTriangle, ArrowUpRight, ArrowUpLeft,
  ArrowRight, ArrowLeft, Check, Layers, CornerDownRight, CornerDownLeft,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { supabase } from '../../../core/api/supabase';
import { useOrders } from '../../orders/hooks/useOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { NumberTickerX } from '../../../core/ui/NumberTickerX';
import { AlertPillX } from '../../../core/ui/AlertPillX';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { FaceScanQuickAction } from '../../orders/components/FaceScanQuickAction';
import { PendingReviewsCard } from '../../reviews/components/PendingReviewsCard';
import { resolveOrderStatus } from '../components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../orders/revisionGroups';
import { useRevisionParents } from '../../orders/hooks/useRevisionParents';

// ── Display font — Patterns: Inter Tight Light (300) ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Theme: Doctor sage green (same as clinic) ──
const P     = DS.clinic.primary;      // #32BB78
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
const MONTHS_FULL_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS_FULL_TR = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];

/**
 * Grafik ay kısaltması — sözlükten çözülür (şablon dizesine gömüldüğü için
 * render anındaki otomatik çeviri yetişmez, burada eager çevrilir).
 * Aralık istisnası: 'Ara' anahtarı sözlükte "Ara(ma)" ile çakışıyor, o yüzden
 * TR dışı dillerde tam ay adı anahtarı kullanılır.
 */
function monthLabel(m: number): string {
  if (m === 11) return i18n.language === 'tr' ? 'Ara' : autoT('Aralık');
  return autoT(MONTHS_TR[m]);
}
/** Hafta şeridi gün harfi — aktif dilin gün adının ilk harfi (TR'de Pz→P). */
function dayInitial(dow: number): string {
  return autoT(DAYS_FULL_TR[dow]).charAt(0);
}
/** RTL'de "ileri" oku sola bakar. */
function fwdArrow(): string { return isRTL() ? '←' : '→'; }

const PIPELINE_STAGES = [
  { key: 'alindi',          label: 'Alındı'   },
  { key: 'uretimde',        label: 'Üretimde' },
  { key: 'kalite_kontrol',  label: 'KK'       },
  { key: 'teslimata_hazir', label: 'Hazır'    },
] as const;

// ── Helpers ──
function getTodayLabel() {
  const now = new Date();
  return fmtWeekdayDayMonth(now);
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

function getWeekDays(): { label: string; date: string; isToday: boolean; dow: number }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  // Hafta başlangıcı bölgeye bağlı: TR/AB Pazartesi, İran Cumartesi (weekdayOffset).
  monday.setDate(now.getDate() - weekdayOffset(dayOfWeek));
  const result: { label: string; date: string; isToday: boolean; dow: number }[] = [];
  const todayISO = todayStr();
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    result.push({ label: `${autoT(DAYS_FULL_TR[d.getDay()])} ${d.getDate()}`, date: iso, isToday: iso === todayISO, dow: d.getDay() });
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

function StatPill({ label, value, bg, color }: { label: string; value: string | number; bg: string; color: string }) {
  const isNum = typeof value === 'number';
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>{label}</Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        {isNum
          ? <NumberTickerX value={value as number} duration={700} style={{ fontSize: 11, fontWeight: '500', color }} />
          : <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>}
      </View>
    </View>
  );
}

/** Hero KPI'ları arasındaki saç teli ayraç — sayı bloğu kadar yüksek. */
function StatDivider() {
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 2, backgroundColor: 'rgba(0,0,0,0.10)' }} />;
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  const isNum = typeof value === 'number';
  const numStyle = { ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: INK };
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {isNum
        ? <NumberTickerX value={value as number} duration={900} style={numStyle} />
        : <Text style={numStyle}>{value}</Text>}
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
          {size >= 56 && <Text style={{ fontFamily: DS.font.display as string, fontWeight: '400', fontSize: size * 0.13, color: pctColor, marginStart: 3, lineHeight: size * 0.13 }}>%</Text>}
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

        <View className="absolute rounded-full" style={{
          top: 14, ...(isRTL() ? { right: 14 } : { left: 14 }), paddingHorizontal: 10, paddingVertical: 4,
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
            <Text style={{ fontSize: 15, fontWeight: '500', color: INK, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>
              {latestOrder.patient_name ?? latestOrder.work_type ?? 'Sipariş'}
            </Text>
            <Text style={{ fontSize: 11, color: DS.ink[500], marginBottom: 10, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>
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
// Admin panel ile aynı: hatched-rail pill kolonları (sage panel coral yerine sage)
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);

  const FILL_LIGHT = `${P}55`;  // sage soft (semi-transparent)
  const FILL_DARK  = P;          // sage primary
  // Rail + stripe panel temalı (sage)
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
                  // @ts-ignore web hatched bg
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
                      // @ts-ignore web
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

// ── Weekly Calendar Strip — Admin panel ile aynı: hatched pill kolonları ──
function WeeklyStrip({ weekDays, weekCounts, onPress }: {
  weekDays: { label: string; date: string; isToday: boolean; dow: number }[];
  weekCounts: Record<string, number>; onPress: () => void;
}) {
  const totalReceived = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20;

  const FILL_LIGHT = `${P}55`; // sage soft
  const FILL_DARK  = P;
  // Rail + stripe panel temalı (sage)
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1.5 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>Bu hafta</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: FILL_DARK }} />
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>Toplam {totalReceived}</Text>
        </View>
      </View>

      {/* Bars */}
      <View className="flex-row items-end" style={{ gap: 10, flex: 1, minHeight: 140, paddingHorizontal: 2 }}>
        {weekDays.map((day, i) => {
          const count = weekCounts[day.date] ?? 0;
          const pct = count > 0 ? Math.min(Math.max((count / SCALE_MAX) * 100, 8), 100) : 0;
          const empty = count === 0;
          return (
            <Pressable
              key={i}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}
            >
              <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {day.isToday && count > 0 && (
                  <View style={{ marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: FILL_DARK }}>{count}</Text>
                  </View>
                )}
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 999,
                    backgroundColor: RAIL_BG,
                    // @ts-ignore web hatched bg
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
                        height: `${pct}%`,
                        borderRadius: 999,
                        backgroundColor: day.isToday ? FILL_DARK : FILL_LIGHT,
                        // @ts-ignore web
                        transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                      } as any}
                    />
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
                {dayInitial(day.dow)}
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
  // RTL'de "ileri" hareketi sola doğrudur.
  const arrowX = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, isRTL() ? -6 : 6] });

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
            position: 'absolute', top: -20, ...(isRTL() ? { left: -20 } : { right: -20 }),
            width: 140, height: 140, borderRadius: 70,
            backgroundColor: '#ABEFC7',
            opacity: 0.55,
            transform: [{ translateY: floatY }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(18px)', mixBlendMode: 'screen', willChange: 'transform' } as any) : {}),
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -40, ...(isRTL() ? { left: -40 } : { right: -40 }),
            width: 180, height: 180, borderRadius: 90,
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
            position: 'absolute', bottom: -60, ...(isRTL() ? { right: -40 } : { left: -40 }),
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
              {isRTL() ? <ArrowLeft size={14} color={INK} strokeWidth={2} /> : <ArrowRight size={14} color={INK} strokeWidth={2} />}
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

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export function DoctorDashboardScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const insets = useSafeAreaInsets();
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, []);

  // "Dr." önekini önce sök — full_name genelde "Dr. Ahmet" biçiminde tutuluyor,
  // yoksa ilk kelime "Dr." çıkıp altta tekrar "Dr." eklenince "Dr. Dr." oluyordu.
  const stripDrRe = /^\s*(dr\.?|doktor|prof\.?\s*dr\.?|doç\.?\s*dr\.?)\s*\.?\s*/i;
  let cleanName = (profile?.full_name ?? '').trim();
  while (stripDrRe.test(cleanName)) cleanName = cleanName.replace(stripDrRe, '').trim();
  const firstName = displayFirstName(cleanName);
  const today = todayStr();

  // ── Derived stats (orders üzerinde TEK pass — eskiden N×status filtre vardı) ──
  const weekDays = getWeekDays();
  const derived = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const curMonth = now.getMonth(), curYear = now.getFullYear();
    const todayMs = Date.now() - 86400000;

    let active = 0, delivered = 0, thisMonthNew = 0;
    const overdueList: typeof orders = [];
    const pipelineCounts: Record<string, number> = {};
    STATUS_KEYS.forEach(k => { pipelineCounts[k] = 0; });

    const monthBuckets: { y: number; m: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), count: 0 });
    }

    const weekCounts: Record<string, number> = {};
    weekDays.forEach(wd => { weekCounts[wd.date] = 0; });

    const workTypeMap: Record<string, number> = {};
    const upcomingTmp: typeof orders = [];
    const pendingApprovals: { id: string; order_number: string; token: string; patient_name: string | null }[] = [];

    for (const o of orders) {
      if (o.status === 'teslim_edildi') delivered++;
      else if (o.status !== 'iptal') active++;
      if (isOrderOverdue(o.delivery_date, o.status, (o as any).hold_status)) overdueList.push(o);

      if (o.status && pipelineCounts[o.status] !== undefined) pipelineCounts[o.status]++;

      const c = o.created_at ? new Date(o.created_at) : null;
      if (c) {
        if (c.getMonth() === curMonth && c.getFullYear() === curYear) thisMonthNew++;
        const y = c.getFullYear(), m = c.getMonth();
        for (const mb of monthBuckets) {
          if (mb.y === y && mb.m === m) { mb.count++; break; }
        }
        const isoDay = o.created_at?.slice(0, 10);
        if (isoDay && weekCounts[isoDay] !== undefined) weekCounts[isoDay]++;
      }
      if (o.work_type) {
        // work_type diş başına tekrarlı olabilir ("X, X, X…") — tekilleştir
        const wt = Array.from(new Set(String(o.work_type).split(',').map((s: string) => s.trim()).filter(Boolean))).join(', ');
        workTypeMap[wt] = (workTypeMap[wt] ?? 0) + 1;
      }

      // upcoming: not delivered + delivery_date >= yesterday
      if (o.status !== 'teslim_edildi' && o.status !== 'iptal' && o.delivery_date) {
        const dd = new Date(o.delivery_date + 'T00:00:00').getTime();
        if (dd >= todayMs) upcomingTmp.push(o);
      }

      // pending design approvals (from orders, no separate query)
      const oo = o as any;
      if (oo.doctor_approval_status === 'pending' && oo.doctor_approval_token) {
        pendingApprovals.push({
          id: o.id, order_number: o.order_number,
          token: oo.doctor_approval_token, patient_name: o.patient_name ?? null,
        });
      }
    }

    const monthly = monthBuckets.map(b => ({ label: monthLabel(b.m), count: b.count }));
    const byWorkType = Object.entries(workTypeMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
    const upcoming = upcomingTmp.sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)).slice(0, 5);
    const recentOrders = orders.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 8);

    return {
      total: orders.length, active, delivered, overdueList, overdueCount: overdueList.length, thisMonthNew,
      pipelineCounts, monthly, weekCounts, byWorkType, upcoming, recentOrders, pendingApprovals,
    };
  }, [orders, weekDays]);

  const { total, active, delivered, overdueList, overdueCount, thisMonthNew, pipelineCounts, monthly, weekCounts, byWorkType, upcoming, recentOrders, pendingApprovals } = derived;
  // pipeCount: yüzdenin gerçek paydası (0 olabilir) — "1 / 9" bağlamı bundan yazılır.
  // totalPipe yalnız bölme güvenliği için 1'e düşürülmüş hâli.
  const pipeCount = Object.values(pipelineCounts).reduce((s, v) => s + v, 0);
  const totalPipe = pipeCount || 1;
  const deliveredPipe = pipelineCounts['teslim_edildi'] ?? 0;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct = Math.round((deliveredPipe / totalPipe) * 100);

  // latestOrder: derived recentOrders'tan
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi' && o.status !== 'iptal') ?? recentOrders[0];

  // Tasks
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];
  overdueList.slice(0, 2).forEach(o => {
    taskItems.push({ icon: Clock as React.FC<any>, label: `${o.patient_name ?? o.work_type ?? autoT('Sipariş')} · ${autoT('gecikmiş')}`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(doctor)/order/${o.id}` as any) });
  });
  upcoming.slice(0, 2).forEach(o => {
    taskItems.push({ icon: Package as React.FC<any>, label: `${o.patient_name ?? autoT('Sipariş')} · ${autoT('teslim')}`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(doctor)/order/${o.id}` as any) });
  });
  if (taskItems.length === 0) {
    taskItems.push({ icon: CheckCircle as React.FC<any>, label: 'Bekleyen görev yok', time: '', done: true, onPress: undefined });
  }

  // pendingApprovals: derived'dan; ayrı query yok.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPulse = require('../../../core/store/uiOverlayStore').useUiOverlayStore((s: any) => s.notificationsPulse);
  useEffect(() => { if (notificationsPulse > 0) setNotificationsOpen(true); }, [notificationsPulse]);

  // Status distribution — pipelineCounts'tan türetildi (yeni tarama yok)
  const byStatus = useMemo(() =>
    STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.label ?? k, count: pipelineCounts[k] ?? 0 })),
    [pipelineCounts]);

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Aydın Lab Handoff (DoctorMobileDashboard)
  // ══════════════════════════════════════════════════════════════
  // Revizyon alt-listesi: penceredeki revizyonun ebeveyni pencere dışındaysa ek
  // sorguyla tamamlanır. Hook KOŞULSUZ çağrılmalı → isDesktop dalından önce.
  const revParents = useRevisionParents(recentOrders);
  const recentWithParents = revParents.length ? [...recentOrders, ...revParents] : recentOrders;
  // Masaüstü tablo için vaka sırası (anchor + altında eski revizyonlar)
  const recentRows = flattenRevisionCases(recentWithParents);

  if (!isDesktop) {
    const { DoctorMobileDashboard } = require('../components/DoctorMobileDashboard');

    // Live stages — hekim için "alındı / üretim / KK / hazır" sayımı
    const stageCounts = {
      alindi: (pipelineCounts['alindi']      ?? 0) + (pipelineCounts['onay_bekliyor'] ?? 0),
      uretim: (pipelineCounts['uretimde']    ?? 0) + (pipelineCounts['asamada']        ?? 0),
      kk:     (pipelineCounts['kalite_kontrol'] ?? 0),
      hazir:  (pipelineCounts['hazir']       ?? 0) + (pipelineCounts['kargoda']        ?? 0),
    };
    const deliveredPct = total > 0 ? Math.round((delivered / total) * 100) : 0;

    // Week — Pa..Pz ordering: weekDays is Mon-Sun, we need Sun-Sat for "today is last" UX
    // Pattern from Admin: ['Pa', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] with i===6 as today
    // Just compute counts in same shape: last 7 days ending today
    const weekBars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const dateStr = d.toISOString().slice(0, 10);
      weekBars.push(orders.filter(o => o.created_at?.startsWith(dateStr)).length);
    }
    const weekTotal = weekBars.reduce((a, b) => a + b, 0);

    // Delayed / pending list
    const delayedItems = [
      ...pendingApprovals.slice(0, 2).map(a => ({
        id: String(a.order_number ?? a.id).slice(-6),
        patient: a.patient_name ?? 'Hasta',
        workType: 'Tasarım onayı bekliyor',
        remain: 'Onay',
        kind: 'pending_approval' as const,
        _id: a.id,
      })),
      ...overdueList.slice(0, 3).map((o: any) => {
        const due = new Date(o.delivery_date + 'T00:00:00');
        const days = Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
        return {
          id: String(o.order_number ?? o.id).slice(-6),
          patient: o.patient_name ?? o.work_type ?? 'Sipariş',
          workType: o.work_type ?? '—',
          remain: i18n.language === 'tr' ? `${days}g geç` : `${days} ${autoT('gün gecikti')}`,
          kind: 'delay' as const,
          _id: o.id,
        };
      }),
    ].slice(0, 3);

    // Week range label (Pazartesi-Pazar)
    const wkStart = new Date(); wkStart.setDate(wkStart.getDate() - 6);
    const weekRange = `${wkStart.getDate()} ${monthLabel(wkStart.getMonth())} ${fwdArrow()} ${new Date().getDate()} ${monthLabel(new Date().getMonth())}`;

    // Build notification lists
    const { NotificationsSheet } = require('../../../core/ui/mobile/NotificationsSheet');
    const fmtRemain = (deliveryDate: string): string => {
      const due = new Date(deliveryDate + 'T00:00:00').getTime();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.ceil((due - today.getTime()) / 86400000);
      if (days <= 0) return 'Bugün';
      if (days === 1) return 'Yarın';
      if (days <= 7) return i18n.language === 'tr' ? `${days}g sonra` : `${days} ${autoT('gün sonra')}`;
      return new Date(due).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
    };
    const notifApprovals = pendingApprovals.map(a => ({
      id: String(a.order_number ?? a.id),
      _id: a.id,
      patient: a.patient_name ?? 'Hasta',
      workType: 'Tasarım onayı bekliyor',
    }));
    const notifOverdue = overdueList.slice(0, 8).map((o: any) => {
      const due = new Date(o.delivery_date + 'T00:00:00').getTime();
      const days = Math.max(1, Math.floor((Date.now() - due) / 86400000));
      return {
        id: String(o.order_number ?? o.id),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        daysLate: days,
      };
    });
    const notifUpcoming = upcoming.slice(0, 8).map((o: any) => ({
      id: String(o.order_number ?? o.id),
      _id: o.id,
      patient: o.patient_name ?? 'Hasta',
      workType: o.work_type ?? '—',
      remainLabel: fmtRemain(o.delivery_date),
    }));
    const totalNotifs = notifApprovals.length + notifOverdue.length + notifUpcoming.length;

    // Son Siparişler — mobil kart listesi (başlık = hasta adı; hekim siparişi verir)
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status);
      const isOverdue = !!o.delivery_date && o.delivery_date < today && o.status !== 'teslim_edildi';
      const pName = o.patient_name || '—';
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
        <DoctorMobileDashboard
          recentOrders={recentForMobile}
          onOpenOrderById={(dbId: string) => router.push(`/(doctor)/order/${dbId}` as any)}
          onAllOrders={() => router.push('/(doctor)/orders' as any)}
          clinicName={profile?.full_name ?? 'Klinik'}
          liveActive={active}
          liveTotal={total}
          liveStages={stageCounts}
          livePercent={deliveredPct}
          activeOrders={active}
          overdueCount={overdueCount}
          thisMonthNew={thisMonthNew}
          pendingApprovalsCount={totalNotifs}
          weekBars={weekBars}
          weekRange={weekRange}
          weekTotal={weekTotal}
          delayed={delayedItems}
          onNewOrder={() => useNewOrderModalStore.getState().setOpen(true)}
          onScan={() => require('../../../core/store/scanStore').useScanStore.getState().setOpen(true)}
          onApprovals={() => router.push('/(doctor)/orders?filter=approval' as any)}
          onCalendar={() => router.push('/(doctor)/orders' as any)}
          onMessages={() => router.push('/(doctor)/messages' as any)}
          onNotifications={() => setNotificationsOpen(true)}
          onProfile={() => router.push('/(doctor)/profile' as any)}
          onOpenOrder={(displayId: string) => {
            const found = delayedItems.find(x => x.id === displayId);
            if (found) router.push(`/(doctor)/order/${(found as any)._id}` as any);
          }}
          refreshing={loading}
          onRefresh={refetch}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onOpenOrder={(dbId: string) => router.push(`/(doctor)/order/${dbId}` as any)}
          panel="doctor"
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
        // Sayfa kenarı tek kaynaktan (PAGE_PADDING = 16). Desktop'ta 10'du,
        // sağ kenar diğer ekranlardan dar duruyordu.
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
              Merhaba{firstName ? ',' : ''}{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>{firstName ? `${autoT('Dt.')} ${firstName}` : autoT('Dt.')}</Text>
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 12 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label="Aktif" value={active} bg={P} color="#FFF" />
              <StatPill label="Bu ay" value={thisMonthNew} bg="rgba(0,0,0,0.08)" color={INK} />
              {/* Geciken + değerlendirilecek AYNI satırda: StatPill ile eşit
                  ölçülü rozetler. İkinci bir şerit yok; renk tek başına yeter. */}
              {overdueCount > 0 && (
                <AlertPillX
                  icon={AlertTriangle}
                  count={overdueCount}
                  label="Geciken"
                  color={CLR.red}
                  labelColor="#9C2E2E"
                  pulse
                  onPress={() => router.push('/(doctor)/orders' as any)}
                />
              )}
              <PendingReviewsCard raterRole="doctor" compact />
              <FaceScanQuickAction accentColor={P} compact />
            </View>

          </View>
          {/* Kart yok — üç sayı serbest dursun; aralarında yalnız saç teli
              kalınlığında bir ayraç: gruplandığı belli olsun ama kutulanmasın.
              alignSelf inline: sol kolon (selamlama + pill'ler) daha uzun
              olduğunda KPI bloğu tepede kalıp altında boşluk bırakıyordu;
              hero'nun tabanına yapışsın ki alttaki karta mesafesi tam 16 olsun. */}
          <View className="flex-row" style={{ gap: 24, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            <BigStat value={total} label="Toplam" />
            <StatDivider />
            <BigStat value={active} label="Aktif" />
            <StatDivider />
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
          {isRTL() ? <ArrowUpLeft size={16} color="#FFF" strokeWidth={1.8} /> : <ArrowUpRight size={16} color="#FFF" strokeWidth={1.8} />}
        </Pressable>
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
              {isRTL() ? <ArrowUpLeft size={14} color={DS.ink[500]} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />}
            </Pressable>
          </View>
          {monthly.length > 0 && <View style={{ flex: 1, minHeight: 120 }}><ProductionBarChart data={monthly} /></View>}
        </Card>

        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 14 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>Teslim Oranı</Text>
            <Pressable onPress={() => router.push('/(doctor)/orders' as any)}>
              {isRTL() ? <ArrowUpLeft size={14} color={DS.ink[500]} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />}
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
          {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'end' as any }}>Teslim</Text>}
        </View>
        {recentOrders.length === 0
          ? <Text className="p-6 text-center" style={{ fontSize: 13, color: DS.ink[400] }}>Yükleniyor...</Text>
          : recentRows.map((order: any, idx: number) => {
              const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
              const isLast = idx === recentRows.length - 1;
              return (
                <Pressable key={order.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : undefined,
                }} onPress={() => router.push(`/(doctor)/order/${order.id}` as any)}>
                  {/* Vaka grubu: eski üyeler anchor'ın altında girintili */}
                  <View style={{ flex: 1.2, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingStart: order.__revChild ? 14 : 0 }}>
                    {order.__revChild && (isRTL()
                      ? <CornerDownLeft size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} style={{ flexShrink: 0 }} />
                      : <CornerDownRight size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} style={{ flexShrink: 0 }} />)}
                    <Text style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800', color: P, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>#{order.order_number}</Text>
                  </View>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(order.patient_name)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: INK, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{order.patient_name || '—'}</Text>
                  </View>
                  {isDesktop && <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E' }}>{(order as any).__continuation ? 'Devam - ' : 'Revizyon - '}</Text>
                    )}{order.work_type || '--'}</Text>}
                  <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                  {isDesktop && <Text style={{ flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'end' as any, color: overdue ? '#9C2E2E' : DS.ink[400] }}>{fmtDate(order.delivery_date)}</Text>}
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
                      <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: cfg?.color ?? INK, marginEnd: 8 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>{item.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: INK }}>{item.count}</Text>
                      <Text style={{ fontSize: 10, color: DS.ink[400], marginStart: 6, width: 28, textAlign: 'end' as any }}>{pct}%</Text>
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
                        <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: palette[i], marginEnd: 8 }} />
                        <Text style={{ flex: 1, fontSize: 11, color: INK, fontWeight: '500', textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{w.label}</Text>
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
