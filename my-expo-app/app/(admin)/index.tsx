/**
 * AdminDashboard — Patterns design language (matching Lab dashboard layout)
 *
 * Layout:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. 4-card grid (AnimatedAktifVaka, Sipariş Trendi, PercentRing, TasksCard)
 *   3. Bottom row — WeeklyStrip + AnimatedCTACard
 *   4. Extra sections — Orders table, Finance, Status dist, Work type
 *
 * Theme: DS.exec (kobalt #4771AB)
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  useWindowDimensions, Animated,
  Platform, RefreshControl, Easing, StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity, Users,
  CreditCard, Calendar, BarChart3, Layers, TrendingUp,
  AlertTriangle, ArrowUpRight, ArrowRight, Check, Trophy, Inbox, Receipt, CornerDownRight,
  Wallet,
} from 'lucide-react-native';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../core/i18n';
import { supabase } from '../../core/api/supabase';
import { useRealtimeRefresh } from '../../core/hooks/useRealtimeRefresh';
import { DS } from '../../core/theme/dsTokens';
import { useIsDesktop } from '../../core/layout/PatternsShell';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';
import { HomeB1, type PriorityOrder, type KpiItem, defaultInsight } from '../../core/ui/HomeB1';
import { AlertPillX } from '../../core/ui/AlertPillX';
import { AdminMobileDashboard } from '../../modules/admin/components/AdminMobileDashboard';
import { resolveOrderStatus } from '../../modules/dashboard/components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../modules/orders/revisionGroups';
import { useRevisionParents } from '../../modules/orders/hooks/useRevisionParents';
import { NumberTickerX } from '../../core/ui/NumberTickerX';
import { groupByCurrency, type CurrencyTotal } from '../../core/money/aggregations';
import { formatMoney, useBaseCurrency, type Currency } from '../../core/money/currency';
import { useDashboardCache } from '../../core/store/dashboardCacheStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { FaceScanQuickAction } from '../../modules/orders/components/FaceScanQuickAction';
import { serviceUnitQty, serviceUnitLabel, resolveUnitForWorkType } from '../../core/util/serviceUnits';

// ── Display font — Patterns: Inter Tight Light (300), tight tracking ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Shorthand aliases from DS tokens ──
const P   = DS.exec.primary;      // #4771AB kobalt
const INK = DS.ink[900];          // #0A0A0A

const CLR = {
  green:  DS.exec.success,   // #2D9A6B
  orange: DS.exec.warning,   // #E89B2A
  red:    DS.exec.danger,    // #D94B4B
  blue:   DS.exec.info,      // #4A8FC9
};

// İş tipi renkleri ANLAMSIZ — statü renkleri gibi bir şey ifade etmezler; tek işleri
// satırı spine segmentine bağlamak. Kurallar:
//   1. Hepsi DS token'ı — hardcode hue yok (eski '#7C3AED' / '#0D9488' elendi).
//   2. Hepsi beyaz VE spine track (ink[100]) üstünde ≥3:1 — WCAG 1.4.11 non-text.
//      7px nokta ve 8px şerit satırın tek görsel kimliği, soluk ton = görünmez satır.
//   3. Statünün semantik hue'larından uzak (turuncu=üretim, yeşil=teslim, kırmızı=
//      gecikme) — iki kart yan yana dururken anlam çakışmasın.
// Tek-hue rampa denendi ve ELENDİ: 5 adımın 3'ü 3:1'in altına düşüyor (2.82 / 2.02 /
// 1.58) ve son adımlar birbirinden ayırt edilemiyor. Tek hue 5 erişilebilir adım
// taşıyamıyor; kontrollü kategorik palet tek çözüm.
const WORKTYPE_RAMP = [
  DS.exec.primaryDeep,   // #314F7E lacivert · 8.23:1
  DS.teal.primaryDeep,   // #197872 koyu teal · 5.29:1
  DS.plum.primary,       // #8B5CB8 erik moru · 4.86:1
  DS.exec.info,          // #4A8FC9 açık mavi · 3.46:1
  DS.plum.primaryDeep,   // #6B3F94 koyu erik · 7.60:1
];

const STATUS_CFG: Record<string, { labelKey: string; color: string; bg: string }> = {
  alindi:          { labelKey: 'admin.status.received',          color: DS.ink[500],  bg: 'rgba(0,0,0,0.05)' },
  asamada:         { labelKey: 'admin.status.production',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  uretimde:        { labelKey: 'admin.status.production',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { labelKey: 'admin.status.qualityControl',  color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  teslimata_hazir: { labelKey: 'admin.status.readyForDelivery', color: '#1F6B47',   bg: 'rgba(45,154,107,0.12)' },
  teslim_edildi:   { labelKey: 'admin.status.delivered',   color: DS.ink[400],  bg: 'rgba(0,0,0,0.04)' },
};
const STATUS_KEYS = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];

const PIPELINE_STAGES = [
  { key: 'alindi',          labelKey: 'admin.status.received'   },
  { key: 'uretimde',        labelKey: 'admin.status.production' },
  { key: 'kalite_kontrol',  labelKey: 'admin.status.qcShort'       },
  { key: 'teslimata_hazir', labelKey: 'admin.status.ready'    },
] as const;

// ── Helpers ──
function getTodayLabel(t: (k: string) => string) {
  const now = new Date();
  const days   = t('admin.days.long').split(', ');
  const months = t('admin.months.long').split(', ');
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
function getWeekDays(t: (k: string) => string): { label: string; date: string; isToday: boolean }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const result: { label: string; date: string; isToday: boolean }[] = [];
  const todayISO = todayStr();
  const daysShort = t('admin.days.short').split(', ');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    result.push({
      label: `${daysShort[d.getDay()]} ${d.getDate()}`,
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

// ══════════════════════════════════════════════════════════════════
// Hallmark · component: dashboard-cards · genre: modern-minimal
// theme: design-system (CLAUDE.md · DS.exec kobalt) — katalog teması YOK,
// kilitli sistem kazanır. Diversification askıda (system-managed project).
//
// "Spine" — üç kart TEK cihaz paylaşır: tepede bir yığılmış şerit, altında
// bar'sız satırlar. Bir bütünün parçaları için N ayrı bar çizmek "toplamı
// %100 eder" ilişkisini yok ediyordu; tek spine onu geri getiriyor.
// Sıfır satırları tek soluk satıra toplanır (statü kartının %60'ı ölü
// şeritti). Sayı sütunları tabular-nums ile dikeyde hizalanır.
// ══════════════════════════════════════════════════════════════════

/** Sayı sütunları dikeyde hizalansın — orantılı rakamlar sütunu kaydırıyor. */
const NUM = { fontVariant: ['tabular-nums'] as any };

/** Yığılmış şerit — segmentler pay oranında yer kaplar (flex = pay).
 *  flexBasis 0 + flexGrow=pay ⇒ segment genişliği doğrudan payın kendisi. */
function Spine({ segments }: { segments: { color: string; pct: number }[] }) {
  const live = segments.filter(s => s.pct > 0.0001);
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: DS.ink[100], gap: 2, marginTop: 16 }}>
      {live.map((s, i) => <View key={i} style={{ flex: s.pct, backgroundColor: s.color }} />)}
    </View>
  );
}

function SpineCard({ title, value, unit, segments, zeros, children }: {
  title:     string;
  /** string/number ise display tipografisiyle sarılır; ReactNode olduğu gibi basılır. */
  value:     string | number | React.ReactNode;
  unit?:     string;
  segments:  { color: string; pct: number }[];
  /** Sıfır olan kalemler — tek soluk satırda toplanır. */
  zeros?:    string[];
  children:  React.ReactNode;
}) {
  const plain = typeof value === 'string' || typeof value === 'number';
  return (
    <Card style={{ padding: 20 }}>
      {/* Başlık solda · toplam sağda — koyu bant yok, kart bağırmıyor */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {plain
            ? <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900], ...NUM }}>{value}</Text>
            : value}
          {unit ? <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[400] }}>{unit}</Text> : null}
        </View>
      </View>

      <Spine segments={segments} />

      <View style={{ marginTop: 8 }}>{children}</View>

      {zeros && zeros.length > 0 ? (
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 4 }}>
          {zeros.join(' · ')} — 0
        </Text>
      ) : null}
    </Card>
  );
}

/** Spine satırı — nokta (spine segmentine bağlar) + etiket + değer + oran.
 *  Kendi barı YOK; oranı tepedeki spine taşıyor. */
function SpineRow({ color, label, value, meta }: {
  /** Yoksa satır spine'da temsil edilmiyor demektir (ör. salt sayaç). */
  color?: string;
  label:  string;
  value:  string | number | React.ReactNode;
  meta?:  string;
}) {
  const plain = typeof value === 'string' || typeof value === 'number';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color ?? 'transparent' }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[700] }} numberOfLines={1}>{label}</Text>
      {plain
        ? <Text style={{ fontSize: 13, fontWeight: '700', color: INK, ...NUM }}>{value}</Text>
        : value}
      {meta ? (
        <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[400], minWidth: 36, textAlign: 'right', ...NUM }}>{meta}</Text>
      ) : null}
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
  const { t } = useTranslation();
  const c = STATUS_CFG[status] ?? { labelKey: '', color: DS.ink[500], bg: 'rgba(0,0,0,0.05)' };
  const label = c.labelKey ? t(c.labelKey) : status;
  return (
    <View
      className="flex-row items-center self-start rounded-full"
      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.bg, gap: 4 }}
    >
      <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{label}</Text>
    </View>
  );
}

/** Stat Pill (hero) */
function StatPill({ label, value, bg, color }: { label: string; value: string | number; bg: string; color: string }) {
  const isNum = typeof value === 'number';
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>
        {label}
      </Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        {isNum
          ? <NumberTickerX value={value as number} duration={700} style={{ fontSize: 11, fontWeight: '500', color }} />
          : <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>}
      </View>
    </View>
  );
}

/** Big Stat — Patterns hero right side */
/** Hero KPI'ları arasındaki saç teli ayraç — sayı bloğu kadar yüksek. */
function StatDivider() {
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 2, backgroundColor: 'rgba(0,0,0,0.10)' }} />;
}

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
  const { t } = useTranslation();
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
  // Bulanıklık ışığı geniş alana yayıp kontrastı düşürüyor; parıltı aralığı
  // 0–0.12'den 0–0.30'a çıkarıldı, yoksa kart soluk/ölü görünüyor.
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.30] });
  const glowScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Card style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 14 }}>
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
            {t('admin.status.live')}
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
                  <NumberTickerX
                    value={count}
                    duration={800}
                    style={{
                      ...SERIF, fontSize: 16, letterSpacing: -0.5,
                      color: active ? '#FFF' : 'rgba(255,255,255,0.3)',
                    } as any}
                  />
                </Animated.View>
                <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                  {t(stage.labelKey)}
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
          <Text style={{ fontSize: 13, color: DS.ink[400] }}>{t('common.loading')}</Text>
        )}
      </View>
    </Card>
  );
}

// ── Production Bar Chart — hatched-rail pill columns (admin coral) ──
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);

  const FILL_LIGHT = `${P}55`;   // panel soft (semi-transparent)
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

// ── Weekly Calendar Strip ──
function WeeklyStrip({
  weekDays, weekCounts, weekDone, onPress,
}: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  weekDone: Record<string, number>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const totalReceived  = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const totalCompleted = Object.values(weekDone).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20; // fixed 1..20 jobs scale

  // Panel palette — soft panel = received, deep panel = completed
  const SAGE_LIGHT = `${P}55`;   // panel soft (semi-transparent)
  const SAGE_DARK  = P;
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1.5 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: INK }}>{t('admin.dashboard.thisWeek')}</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_LIGHT }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>{t('admin.dashboard.receivedMembers')} </Text>
            <NumberTickerX value={totalReceived} duration={700} style={{ fontSize: 11, color: DS.ink[500] } as any} />
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_DARK }} />
            <Text style={{ fontSize: 11, color: DS.ink[500] }}>{t('admin.dashboard.deliveredMembers')} </Text>
            <NumberTickerX value={totalCompleted} duration={700} style={{ fontSize: 11, color: DS.ink[500] } as any} />
          </View>
        </View>
      </View>

      {/* Bars */}
      <View className="flex-row items-end" style={{ gap: 10, flex: 1, minHeight: 140, paddingHorizontal: 2 }}>
        {weekDays.map((day, i) => {
          const received  = weekCounts[day.date] ?? 0;
          const completed = weekDone[day.date] ?? 0;
          const receivedPct  = received > 0  ? Math.min(Math.max((received / SCALE_MAX) * 100, 8), 100) : 0;
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
              {/* Pill column — hatched rail always visible */}
              <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {/* Completed label bubble */}
                {showLabel && (
                  <View style={{ marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE_DARK }}>{ratio}%</Text>
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
                        height: `${receivedPct}%`,
                        borderRadius: 999,
                        backgroundColor: SAGE_LIGHT,
                        overflow: 'hidden',
                        // @ts-ignore web
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
                            // @ts-ignore web
                            transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)',
                          } as any}
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
              {/* Day label */}
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

// ── Animated CTA Card — floating circle + shimmer glow + arrow bounce ──
function AnimatedCTACard({ onPress, isDesktop }: { onPress: () => void; isDesktop: boolean }) {
  const { t } = useTranslation();
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
        {/* Yüzen ışık lekeleri — web'de BULANIK (aurora hissi).
            Bulanıklık ışığı yaydığı için opaklıklar YÜKSELTİLDİ: ilk denemede
            eski değerlerle bırakılınca kart soluk ve cansız kaldı. Blur da
            kısıldı (26→16 / 40→30) — fazlası lekeyi tamamen düz bir sise
            çeviriyor ve kartın derinliği kayboluyor.
            `filter` yalnız web'de; native'de RN desteklemiyor, orada net daire
            kalır. Taşan bulanıklığı kartın `overflow: hidden`'ı kırpar.
            `willChange` şart: bulanık katman her karede yeniden
            rasterleştirilirse animasyon pahalıya gelir. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -20, right: -20,
            width: 140, height: 140, borderRadius: 70,
            backgroundColor: '#CFE0F5',
            opacity: 0.55,
            transform: [{ translateY: floatY }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(18px)', mixBlendMode: 'screen', willChange: 'transform' } as any) : {}),
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -40, right: -40,
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
            position: 'absolute', bottom: -60, left: -40,
            width: 200, height: 200, borderRadius: 100,
            backgroundColor: '#F2C879',
            opacity: 0.42,
            transform: [{ translateY: Animated.multiply(floatY, -1) }],
            ...(Platform.OS === 'web' ? ({ filter: 'blur(40px)', mixBlendMode: 'screen', willChange: 'transform' } as any) : {}),
          }}
        />
        {/* Content */}
        <View style={{ position: 'relative' }}>
          <Text style={{
            fontSize: 11, fontWeight: '500', letterSpacing: 0.1 * 11,
            textTransform: 'uppercase', color: '#FFF', marginBottom: 14,
          }}>
            {t('admin.dashboard.quickAction')}
          </Text>
          <Text style={{
            ...SERIF, fontSize: 32, letterSpacing: -0.02 * 32, lineHeight: 35,
            color: '#FFF', marginBottom: 16,
          }}>
            {t('admin.dashboard.newOrder')}
          </Text>
          <View
            className="flex-row items-center self-start rounded-full"
            style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF', gap: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: INK }}>{t('admin.buttons.start')}</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              <ArrowRight size={14} color={INK} strokeWidth={2} />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Bugünkü Görevler — Dark card ──
// Zemin DS.exec.surfaceAlt'ın (#243041) %10 beyazla karışmış hâli: yandaki
// kartlarla ağırlık yarışına girmesin diye açıldı. Token'a dokunulmadı.
const TASKS_SURFACE = '#3A4554';
function TasksCard({
  tasks,
}: {
  tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[];
}) {
  const { t } = useTranslation();
  const doneCount = tasks.filter(task => task.done).length;
  return (
    <View style={{
      backgroundColor: TASKS_SURFACE,
      // @ts-ignore web gradient
      backgroundImage: `linear-gradient(135deg, ${TASKS_SURFACE} 0%, ${DS.exec.primaryDeep}33 100%)`,
      borderRadius: DS.radius.xl, padding: 22,
      flex: 1, gap: 0,
    }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>{t('admin.dashboard.todaysTasks')}</Text>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{doneCount}/{tasks.length}</Text>
      </View>
      <View style={{ gap: 10, flex: 1 }}>
        {tasks.map((task, i) => {
          const IconComp = task.icon;
          return (
            <Pressable
              key={i}
              onPress={task.onPress}
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
                    textDecorationLine: task.done ? 'line-through' : 'none',
                    opacity: task.done ? 0.4 : 1,
                  }}
                >
                  {task.label}
                </Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{task.time}</Text>
              </View>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: task.done ? P : 'transparent',
                borderWidth: task.done ? 0 : 1.5,
                borderColor: task.done ? undefined : 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {task.done && <Check size={10} color="#FFF" strokeWidth={2.5} />}
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
  const { t } = useTranslation();
  const total = byStatus.reduce((s, x) => s + x.count, 0) || 1;
  const labelOf = (x: { label: string; key: string }) => {
    const k = STATUS_CFG[x.key]?.labelKey;
    return k ? t(k) : x.label;
  };
  const colorOf = (x: { key: string }) => STATUS_CFG[x.key]?.color ?? INK;
  // Sıfır statüler tam satır + boş bar yerine tek soluk satıra iner.
  const live  = byStatus.filter(x => x.count > 0);
  const zeros = byStatus.filter(x => x.count === 0).map(labelOf);
  return (
    <SpineCard
      title={t('admin.dashboard.statusDistribution')}
      value={total}
      unit={t('admin.dashboard.totalOrders')}
      segments={live.map(x => ({ color: colorOf(x), pct: x.count / total }))}
      zeros={zeros}
    >
      {live.map(x => (
        <SpineRow
          key={x.key}
          color={colorOf(x)}
          label={labelOf(x)}
          value={x.count}
          meta={`${Math.round((x.count / total) * 100)}%`}
        />
      ))}
    </SpineCard>
  );
}

// ── Work Type Card ──
function WorkTypeCard({ data }: { data: { label: string; count: number; unit?: string | null }[] }) {
  const { t } = useTranslation();
  if (!data.length) return null;
  const rows  = data.slice(0, 5);
  // `total` YALNIZ şerit oranları için — gösterilmiyor. Farklı birimlerin
  // toplamı anlamsızdır; oran hesabı için ortak bir payda gerektiği için var.
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const live  = rows.filter(w => w.count > 0);
  const zeros = rows.filter(w => w.count === 0).map(w => w.label);

  // Birim başına kırılım: "47 üye · 4 çene · 2 adet"
  const perUnit = new Map<string, number>();
  for (const w of data) {
    const u = serviceUnitLabel(w.unit);
    perUnit.set(u, (perUnit.get(u) ?? 0) + w.count);
  }
  const unitBreakdown = Array.from(perUnit.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([u, n]) => `${n} ${u}`)
    .join(' · ');
  return (
    <SpineCard
      title={t('admin.dashboard.workTypeDistribution')}
      // Başlıkta TEK toplam YOK — birimler toplanamaz.
      // Eskiden "87 Üye" yazıyordu ama o 87'nin içinde çene bazlı plaklar ve
      // adet bazlı model/tasarım işleri de diş sayılarak toplanmıştı.
      // Artık her birim kendi kırılımında: "47 üye · 4 çene · 2 adet".
      value={unitBreakdown}
      segments={live.map((w) => ({ color: WORKTYPE_RAMP[rows.indexOf(w)], pct: w.count / total }))}
      zeros={zeros}
    >
      {live.map(w => (
        <SpineRow
          key={w.label}
          color={WORKTYPE_RAMP[rows.indexOf(w)]}
          label={w.label}
          value={w.count}
          // Satırın kendi birimi — "13 üye", "4 çene", "2 adet".
          meta={`${serviceUnitLabel(w.unit)} · ${Math.round((w.count / total) * 100)}%`}
        />
      ))}
    </SpineCard>
  );
}

// ── Finance Card ──
function FinanceCard({ monthly, pending, paid }: { monthly: CurrencyTotal[]; pending: CurrencyTotal[]; paid: number }) {
  const { t } = useTranslation();
  const baseCurrency = useBaseCurrency();

  /** Para satırı — katı per-currency: her dilim kendi biriminde, asla baz'a çevrilmez. */
  const ccyLine = (slicesRaw: CurrencyTotal[], size: number) => {
    const slices = Array.isArray(slicesRaw) ? slicesRaw : [];
    const st = { fontSize: size, fontWeight: '700' as const, color: INK, ...NUM };
    return slices.length === 0
      ? <Text style={st}>{formatMoney(0, baseCurrency, { fractionDigits: 0 })}</Text>
      : <View style={{ alignItems: 'flex-end' }}>{slices.map(s => (
          <Text key={s.currency} style={st} numberOfLines={1}>
            {formatMoney(s.total, s.currency, { fractionDigits: 0 })}
          </Text>
        ))}</View>;
  };

  // UYARI (mevcut davranış korundu): bu oran para birimlerini toplayarak hesaplanıyor
  // (₺0 + 615 € → tek oran). Katı per-currency kuralına aykırı; eski donut ring de
  // aynı matematiği kullanıyordu. Ayrı bir karar gerektirir — bu redesign kapsamı değil.
  const totalMonthly = (Array.isArray(monthly) ? monthly : []).reduce((s, c) => s + (Number(c.total) || 0), 0);
  const totalPending = (Array.isArray(pending) ? pending : []).reduce((s, c) => s + (Number(c.total) || 0), 0);
  const grandTotal   = totalMonthly + totalPending;
  const collectRatio = grandTotal > 0 ? totalMonthly / grandTotal : 0;
  const collectPct   = Math.round(collectRatio * 100);

  return (
    <SpineCard
      title={t('admin.dashboard.financialSummary')}
      value={`${collectPct}%`}
      unit="tahsil"
      // Veri yokken tam turuncu şerit göstermemek için boş bırak.
      segments={grandTotal > 0 ? [
        { color: CLR.green,  pct: collectRatio },
        { color: CLR.orange, pct: 1 - collectRatio },
      ] : []}
    >
      <SpineRow
        color={CLR.green}
        label={t('admin.dashboard.monthlyCollection')}
        value={ccyLine(monthly, 13)}
        meta={`${collectPct}%`}
      />
      <SpineRow
        color={CLR.orange}
        label={t('admin.dashboard.pendingInvoice')}
        value={ccyLine(pending, 13)}
        meta={`${100 - collectPct}%`}
      />
      {/* Nokta yok — bu bir sayaç, spine'daki paya dahil değil. */}
      <SpineRow
        label={t('admin.dashboard.paidInvoiceCount')}
        value={<NumberTickerX value={paid} duration={700} style={{ fontSize: 13, fontWeight: '700', color: INK, ...NUM } as any} />}
      />
    </SpineCard>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const router    = useRouter();
  const isDesktop = useIsDesktop();
  const insets    = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  useEffect(() => { setTitle(getTodayLabel(t)); return clear; }, [setTitle, clear, t]);

  // Önceki ziyaretten cache — anında render et, arka planda taze veri çek.
  const cache = useDashboardCache(s => s.admin);
  const setCache = useDashboardCache(s => s.setAdmin);
  const hasCache = !!cache;

  const [loading, setLoading]             = useState(!hasCache);
  const [refreshing, setRefreshing]       = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPulse = require('../../core/store/uiOverlayStore').useUiOverlayStore((s: any) => s.notificationsPulse);
  useEffect(() => { if (notificationsPulse > 0) setNotificationsOpen(true); }, [notificationsPulse]);
  const [totalOrders, setTotalOrders]     = useState(cache?.totalOrders ?? 0);
  const [todayOrders, setTodayOrders]     = useState(cache?.todayOrders ?? 0);
  const [overdueCount, setOverdue]        = useState(cache?.overdue ?? 0);
  const [totalDoctors, setDoctors]        = useState(cache?.totalDoctors ?? 0);
  const [totalLabUsers, setLabUsers]      = useState(cache?.totalLabUsers ?? 0);
  const [todayDelivery, setTodayDelivery] = useState(cache?.todayDelivery ?? 0);
  const [byStatus, setByStatus]           = useState<{ label: string; count: number; key: string }[]>(cache?.byStatus ?? []);
  // `unit` = hizmetin sayım birimi (üye/çene/adet…). Kart satır başına bunu
  // gösteriyor; birimler toplanmadığı için tipte taşınması şart.
  const [byWorkType, setByWorkType]       = useState<{ label: string; count: number; unit?: string | null }[]>(cache?.byWorkType ?? []);
  const [monthly, setMonthly]             = useState<{ label: string; count: number }[]>(cache?.monthly ?? []);
  const [recentOrders, setRecentOrders]   = useState<any[]>(cache?.recentOrders ?? []);
  const [upcoming, setUpcoming]           = useState<any[]>(cache?.upcoming ?? []);
  const [hovered, setHovered]             = useState<string | null>(null);
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>(cache?.pipelineCounts ?? {});
  // Planlama bekleyen = status 'alindi' VE triaged_at NULL (planlanmamış). pipelineCounts['alindi']
  // planlanmışları da sayıyordu → planlanmış sipariş "planlamayı başlat" olarak kalıyordu.
  const [planningPending, setPlanningPending] = useState<number>(0);
  const [weekCounts, setWeekCounts]       = useState<Record<string, number>>(cache?.weekCounts ?? {});
  const [weekDone, setWeekDone]           = useState<Record<string, number>>(cache?.weekDone ?? {});

  // Finance state
  const [finMonthly, setFinMonthly]       = useState<CurrencyTotal[]>(cache?.finMonthly ?? []);
  const [finPending, setFinPending]       = useState<CurrencyTotal[]>(cache?.finPending ?? []);
  const [finPaidCount, setFinPaidCount]   = useState(cache?.finPaidCount ?? 0);

  // Faturalanmamış siparişler (Faz 3 hatırlatma)
  const [unbilledCount, setUnbilledCount]   = useState(0);
  const [unbilledClinics, setUnbilledClinics] = useState(0);
  // Para birimi → tutar (katı per-currency; tek sayıya indirgeme YOK)
  const [unbilledTotals, setUnbilledTotals] = useState<Record<string, number>>({});
  // Kritik stok sayısı — görev kartındaki "kritik stok" satırı için (realtime)
  const lowStockCount = useStockAlert();
  // Görev kartını besleyen satırlar: faturasız teslimatlar + vadesi geçmiş faturalar
  const [unbilledRows, setUnbilledRows]     = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const loadUnbilled = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('v_unbilled_work_orders')
        .select('work_order_id, order_number, clinic_id, estimated_total, totals_by_currency, delivered_at')
        .order('delivered_at', { ascending: false, nullsFirst: false });
      const rows = (data ?? []) as any[];
      setUnbilledCount(rows.length);
      setUnbilledClinics(new Set(rows.map(r => r.clinic_id).filter(Boolean)).size);
      // Para birimi başına topla — kalemler farklı dövizde olabilir; tek sayıda
      // birleştirmek (eski davranış) 7 EUR'yu ₺7 gösteriyordu.
      const byCcy: Record<string, number> = {};
      rows.forEach(r => {
        const map = (r.totals_by_currency ?? {}) as Record<string, any>;
        const entries = Object.entries(map);
        if (entries.length === 0) return;
        entries.forEach(([ccy, val]) => { byCcy[ccy] = (byCcy[ccy] ?? 0) + (Number(val) || 0); });
      });
      setUnbilledTotals(byCcy);
      setUnbilledRows(rows.slice(0, 2));
    } catch { /* skip */ }
  }, []);
  const loadOverdueInvoices = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, paid_amount, due_date, currency')
        .lt('due_date', todayStr)
        .not('status', 'in', '("odendi","iptal","taslak")')  // taslak = henüz kesilmemiş fatura
        .order('due_date', { ascending: true })
        .limit(2);
      setOverdueInvoices((data as any[]) ?? []);
    } catch { /* skip */ }
  }, []);
  useEffect(() => { loadUnbilled(); loadOverdueInvoices(); }, [loadUnbilled, loadOverdueInvoices]);

  // ── Data loaders (mirroring Lab dashboard pattern) ──

  const loadPipeline = useCallback(async () => {
    try {
      const statuses = STATUS_KEYS;
      // 'asamada' = sipariş aktif iş akışı aşamasında → "üretimde" kovasına say
      // (STATUS_KEYS'te ayrı yer yok; üretim olarak gösterilir).
      const results = await Promise.all([
        ...statuses.map(st =>
          supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', st)
        ),
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', 'asamada'),
      ]);
      const asamadaCount = results[statuses.length].count ?? 0;
      const counts: Record<string, number> = {};
      statuses.forEach((st, i) => { counts[st] = results[i].count ?? 0; });
      counts['uretimde'] = (counts['uretimde'] ?? 0) + asamadaCount;
      setPipelineCounts(counts);

      // Planlama bekleyen: yalnız triaged_at NULL olan 'alindi' siparişler (planlanmamış).
      const planRes = await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'alindi')
        .is('triaged_at', null)
        .or('is_archived.is.null,is_archived.eq.false');
      setPlanningPending(planRes.count ?? 0);

      // Toplam = work_orders'ın doğrudan (arşiv hariç) sayısı — status kovaları
      // toplamı, bilinmeyen/özel durumdaki siparişleri kaçırıyordu.
      const totalRes = await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .or('is_archived.is.null,is_archived.eq.false');
      setTotalOrders(totalRes.count ?? statuses.reduce((s, _st, i) => s + (results[i].count ?? 0), 0));

      setByStatus(statuses.map((k, i) => ({ key: k, label: STATUS_CFG[k]?.labelKey ? t(STATUS_CFG[k].labelKey) : k, count: (results[i].count ?? 0) + (k === 'uretimde' ? asamadaCount : 0) })));
    } catch (e) { console.error('[AdminDashboard] loadPipeline error:', e); }
  }, [t]);

  const loadRecent = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_orders')
      // hold_status + revizyon alanları: durum etiketi ve vaka gruplaması için
      // gerekli (bu sorgu ikisini de seçmiyordu → revizyonlar köksüz görünüyordu)
      .select('id, order_number, work_type, status, hold_status, delivery_date, doctor_id, patient_name, revision_of_id, revision_no, continues_order_id')
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) { console.error('[AdminDashboard] loadRecent error:', error); return; }
    const rows = data ?? [];
    const doctorIds = Array.from(new Set(rows.map((r: any) => r.doctor_id).filter(Boolean)));
    const nameMap: Record<string, string> = {};
    const clinicOf: Record<string, string> = {};   // doctor_id → clinic_id
    const logoOf: Record<string, string> = {};     // clinic_id → logo_url
    if (doctorIds.length) {
      // doctor_id polimorfik (doctors.id VEYA profiles.id) — iki tabloyu da çöz,
      // doctors öncelikli.
      const [docsR, profsR] = await Promise.all([
        supabase.from('doctors').select('id, full_name, clinic_id').in('id', doctorIds),
        supabase.from('profiles').select('id, full_name, clinic_id').in('id', doctorIds),
      ]);
      (docsR.data ?? []).forEach((d: any) => { nameMap[d.id] = d.full_name; });
      (profsR.data ?? []).forEach((p: any) => { if (!nameMap[p.id]) nameMap[p.id] = p.full_name; });
      // Avatar: hekim baş harfleri yerine KLİNİK LOGOSU (hangi kurumdan geldiği
      // bir bakışta belli olsun) — lab/admin panelleri.
      (docsR.data ?? []).forEach((d: any) => { if (d.clinic_id) clinicOf[d.id] = d.clinic_id; });
      (profsR.data ?? []).forEach((p: any) => { if (p.clinic_id && !clinicOf[p.id]) clinicOf[p.id] = p.clinic_id; });
      const clinicIds = Array.from(new Set(Object.values(clinicOf)));
      if (clinicIds.length) {
        const { data: cls } = await supabase.from('clinics').select('id, logo_url').in('id', clinicIds);
        (cls ?? []).forEach((c: any) => { if (c.logo_url) logoOf[c.id] = c.logo_url; });
      }
    }
    // revision_of_id + revision_no + hold_status BURADA DA TAŞINMALI: sorgu
    // çekse bile bu map onları düşürürse vaka gruplaması kurulamaz ve revizyon
    // satırı ebeveyninin altına girintili girmez (köksüz, düz satır görünür).
    setRecentOrders(rows.map((o: any) => ({
      id: o.id, order_number: o.order_number, work_type: o.work_type,
      status: o.status, hold_status: o.hold_status ?? null,
      delivery_date: o.delivery_date, is_urgent: o.is_urgent ?? false,
      revision_of_id: o.revision_of_id ?? null,
      revision_no: o.revision_no ?? null,
      continues_order_id: o.continues_order_id ?? null,
      doctor_name: nameMap[o.doctor_id] ?? '--',
      clinic_logo_url: logoOf[clinicOf[o.doctor_id] ?? ''] ?? null,
    })));
  }, []);

  const loadExtra = useCallback(async () => {
    const today = todayStr();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // 3 sorgu paralel — eskiden seri idi (~3× round-trip).
    const [mainRes, todayRes, upcomingRes, servicesRes] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id, work_type, status, delivery_date, created_at, tooth_numbers')
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`),
      supabase
        .from('work_orders')
        .select('id, order_number, status, delivery_date, doctor_id')
        .gte('delivery_date', today).lte('delivery_date', in3DaysStr)
        .neq('status', 'teslim_edildi').neq('status', 'iptal').order('delivery_date'),
      // Hizmet birimleri — "İş Tipi Dağılımı" her işi KENDİ biriminde saysın diye.
      // (Gece plağı çene, kron üye, model baskısı adet… bkz. core/util/serviceUnits)
      supabase.from('lab_services').select('name, unit'),
    ]);

    const data = mainRes.data;
    const monthsShort = t('admin.months.short').split(', ');
    if (data) {
      // Tek pass — sayaçlar diş bazlı (her tooth_numbers entry'si = 1 üye).
      const weekDays = getWeekDays(t);
      const monthBuckets: { y: number; m: number; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), count: 0 });
      }
      const wc: Record<string, number> = {};
      const wcDone: Record<string, number> = {};
      weekDays.forEach(wd => { wc[wd.date] = 0; wcDone[wd.date] = 0; });
      // Hizmet adı → birim eşlemi (küçük harf, kırpılmış). service_id üretimde
      // boş olduğu için isimle eşleşiyoruz (bkz. serviceUnits.ts notu).
      const unitByService = new Map<string, string | null>(
        (servicesRes.data ?? []).map((s: any) => [
          String(s.name ?? '').trim().toLocaleLowerCase('tr-TR'),
          s.unit ?? null,
        ]),
      );
      const wtMap: Record<string, { count: number; unit: string | null }> = {};
      let overdueN = 0, todayDeliveryN = 0;

      for (const o of data) {
        const teeth = Array.isArray((o as any).tooth_numbers) ? (o as any).tooth_numbers.length : 0;
        const c = o.created_at ? new Date(o.created_at) : null;
        if (c && teeth > 0) {
          const y = c.getFullYear(), m = c.getMonth();
          for (const mb of monthBuckets) {
            if (mb.y === y && mb.m === m) { mb.count += teeth; break; }
          }
          const isoDay = o.created_at?.slice(0, 10);
          if (isoDay && wc[isoDay] !== undefined) {
            wc[isoDay] += teeth;
            if (o.status === 'teslim_edildi') wcDone[isoDay] += teeth;
          }
        }
        if (o.work_type && teeth > 0) {
          // work_type diş başına tekrarlı olabilir ("X, X, X…") — tekilleştir
          const wt = Array.from(new Set(String(o.work_type).split(',').map((s: string) => s.trim()).filter(Boolean))).join(', ');
          // Miktar İŞİN KENDİ BİRİMİNDE. Eskiden burada koşulsuz `teeth`
          // toplanıyordu; gece plağı gibi ÇENE bazlı işler de diş sayıldığı için
          // tek plak 16 "üye" görünüp listenin başına geçiyordu.
          const unit = resolveUnitForWorkType(wt, unitByService);
          wtMap[wt] = {
            count: (wtMap[wt]?.count ?? 0) + serviceUnitQty(unit, o.tooth_numbers ?? []),
            unit,
          };
        }
        if (o.delivery_date < today && o.status !== 'teslim_edildi') overdueN++;
        if (o.delivery_date === today && o.status !== 'teslim_edildi') todayDeliveryN++;
      }

      setMonthly(monthBuckets.map(b => ({ label: monthsShort[b.m], count: b.count })));
      setWeekCounts(wc);
      setWeekDone(wcDone);
      setByWorkType(
        Object.entries(wtMap)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([label, v]) => ({ label, count: v.count, unit: v.unit })),
      );
      setOverdue(overdueN);
      setTodayDelivery(todayDeliveryN);
    }

    setTodayOrders(todayRes.count ?? 0);
    // Upcoming hekim adlarını polimorfik doctor_id'den çöz (doctors + profiles).
    const upRows = (upcomingRes.data ?? []) as any[];
    const upIds = Array.from(new Set(upRows.map(o => o.doctor_id).filter(Boolean)));
    const upNameMap: Record<string, string> = {};
    if (upIds.length) {
      const [docsR, profsR] = await Promise.all([
        supabase.from('doctors').select('id, full_name').in('id', upIds),
        supabase.from('profiles').select('id, full_name').in('id', upIds),
      ]);
      (docsR.data ?? []).forEach((d: any) => { upNameMap[d.id] = d.full_name; });
      (profsR.data ?? []).forEach((p: any) => { if (!upNameMap[p.id]) upNameMap[p.id] = p.full_name; });
    }
    setUpcoming(upRows.map(o => ({
      id: o.id, order_number: o.order_number, status: o.status,
      delivery_date: o.delivery_date, doctor_name: upNameMap[o.doctor_id] ?? '--',
    })));
  }, [t]);

  const loadProfiles = useCallback(async () => {
    // 2 count query paralel — eskiden tüm profiles satırları çekiliyordu.
    const [doctorRes, labRes] = await Promise.all([
      // Hekimler `doctors` tablosunda (kliniklere bağlı) — profiles user_type='doctor'
      // sadece uygulamaya giriş yapan hekimleri sayıyordu, çoğu hekimi kaçırıyordu.
      supabase.from('doctors').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).in('user_type', ['lab', 'lab_user', 'mesul_mudur']),
    ]);
    setDoctors(doctorRes.count ?? 0);
    setLabUsers(labRes.count ?? 0);
  }, []);

  const loadFinance = useCallback(async () => {
    try {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      // KATI per-currency: faturanın kendi para biriminde, asla baz'a çevrilip toplanmaz.
      const ccyOf = (i: any) => (i.currency || 'TRY') as Currency;
      const [invRes, pendRes] = await Promise.all([
        supabase.from('invoices').select('total, paid_amount, status, currency').gte('created_at', monthStart.toISOString()),
        // Bekleyen = kesilmiş ama tamamı tahsil edilmemiş (kesildi + kısmi ödenmiş)
        supabase.from('invoices').select('total, paid_amount, status, currency').in('status', ['kesildi', 'kismi_odendi']),
      ]);
      if (invRes.data) {
        const paid = invRes.data.filter((i: any) => i.status === 'odendi');
        setFinMonthly(groupByCurrency(paid, (i: any) => ({ amount: Number(i.total) || 0, currency: ccyOf(i) })));
        setFinPaidCount(paid.length);
      }
      if (pendRes.data) {
        // Bekleyen tutar = kalan (total - paid_amount), kendi para biriminde
        setFinPending(groupByCurrency(pendRes.data, (i: any) => ({
          amount: Math.max(0, Number(i.total ?? 0) - Number(i.paid_amount ?? 0)), currency: ccyOf(i),
        })));
      }
    } catch { /* invoices table may not exist */ }
  }, []);

  useEffect(() => {
    // İlk açılışta cache yoksa loading göster, varsa cache değerleriyle direkt
    // render et — arka planda taze veri çek. Cache yenilenince NumberTickerX
    // count-up ile yumuşak geçer.
    if (!hasCache) setLoading(true);
    loadPipeline().finally(() => setLoading(false));
    loadRecent();
    loadExtra();
    loadProfiles();
    loadFinance();
  }, [loadRecent, loadPipeline, loadExtra, loadProfiles, loadFinance, hasCache]);

  // Local state → global cache (debounced; render başına 1 yazım)
  useEffect(() => {
    const t = setTimeout(() => {
      setCache({
        pipelineCounts, byStatus, totalOrders, totalActive: totalOrders - (byStatus.find(s => s.key === 'teslim_edildi')?.count ?? 0),
        monthly, weekCounts, weekDone, byWorkType, overdue: overdueCount, todayDelivery, todayOrders,
        recentOrders, upcoming, totalDoctors, totalLabUsers, finMonthly, finPending, finPaidCount,
      });
    }, 200);
    return () => clearTimeout(t);
  }, [
    pipelineCounts, byStatus, totalOrders, monthly, weekCounts, weekDone, byWorkType,
    overdueCount, todayDelivery, todayOrders, recentOrders, upcoming,
    totalDoctors, totalLabUsers, finMonthly, finPending, finPaidCount, setCache,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRecent(), loadPipeline(), loadExtra(), loadProfiles(), loadFinance()]);
    setRefreshing(false);
  };

  // Canlı: sipariş/aşama/profil değişiminde özet sayaçlarını debounce'lu tazele (spinner'sız).
  useRealtimeRefresh('admin_dashboard_rt', ['work_orders', 'order_stages', 'profiles'], () => {
    Promise.all([loadRecent(), loadPipeline(), loadExtra(), loadProfiles(), loadFinance()]);
  });

  const today = todayStr();

  // Derived stats
  const totalActive = totalOrders - (byStatus.find(s => s.key === 'teslim_edildi')?.count ?? 0);
  // pipeCount: yüzdenin gerçek paydası (0 olabilir) — "1 / 9" bağlamı bundan yazılır.
  const pipeCount = Object.values(pipelineCounts).reduce((s, v) => s + v, 0);
  const totalPipe = pipeCount || 1;
  const deliveredPipe = pipelineCounts['teslim_edildi'] ?? 0;
  const productionPct = Math.round(((pipelineCounts['uretimde'] ?? 0) / totalPipe) * 100);
  const deliveryPct   = Math.round((deliveredPipe / totalPipe) * 100);

  // Latest active order for AnimatedAktifVakaCard
  const latestOrder = recentOrders.find(o => o.status !== 'teslim_edildi') ?? recentOrders[0];

  // Görev/aksiyon kartı — yalnız sipariş değil, bekleyen TÜM aksiyonlar burada:
  // gecikme · teslim · bugün · faturalama · tahsilat · kritik stok (aciliyet sırası).
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];
  // UX: 1. satır = YAPILACAK İŞ (fiil önde), 2. satır = kararı veren bağlam.
  const taskNo = (no?: string | null) => (no ? `#${no}` : 'sipariş');
  const daysLate = (d?: string | null) => {
    if (!d) return null;
    const diff = Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000);
    return diff > 0 ? diff : null;
  };

  // Overdue orders as tasks
  const overdueOrdersFromRecent = recentOrders.filter(o => o.delivery_date < today && o.status !== 'teslim_edildi');
  overdueOrdersFromRecent.slice(0, 2).forEach(o => {
    const late = daysLate(o.delivery_date);
    taskItems.push({
      icon: Clock as React.FC<any>,
      label: `Gecikmiş teslimat · ${taskNo(o.order_number)}`,
      time: late ? `${late} gün gecikti · ${fmtDate(o.delivery_date)}` : fmtDate(o.delivery_date),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Upcoming deliveries as tasks
  upcoming.slice(0, 2).forEach(o => {
    taskItems.push({
      icon: Package as React.FC<any>,
      label: `Teslime hazırla · ${taskNo(o.order_number)}`,
      time: `${fmtDate(o.delivery_date)} teslim`,
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Today's orders as tasks
  const todayOrdersFromRecent = recentOrders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');
  todayOrdersFromRecent.slice(0, 1).forEach(o => {
    taskItems.push({
      icon: Calendar as React.FC<any>,
      label: `Bugün teslim et · ${taskNo(o.order_number)}`,
      time: o.patient_name ?? t('admin.dashboard.today'),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Teslim edildi ama faturası kesilmedi → sipariş detayında fatura kesilir
  unbilledRows.forEach((u: any) => {
    taskItems.push({
      icon: Receipt as React.FC<any>,
      label: `Fatura kes · ${taskNo(u.order_number)}`,
      time: u.delivered_at
        ? `${fmtDate(String(u.delivered_at).slice(0, 10))} tarihinde teslim edildi`
        : 'Teslim edildi, faturası yok',
      done: false,
      onPress: () => router.push(`/(admin)/order/${u.work_order_id}` as any),
    });
  });

  // Vadesi geçmiş fatura → tahsilat (kalan tutar faturanın kendi para biriminde)
  overdueInvoices.forEach((inv: any) => {
    const remaining = formatMoney(
      (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0),
      (inv.currency ?? 'TRY') as Currency,
      { fractionDigits: 0 },
    );
    const late = daysLate(inv.due_date);
    taskItems.push({
      icon: Wallet as React.FC<any>,
      label: `Tahsilat yap · ${inv.invoice_number ?? 'fatura'}`,
      time: late ? `${remaining} kaldı · ${late} gün vadesi geçti` : `${remaining} kaldı`,
      done: false,
      onPress: () => router.push(`/(admin)/invoice/${inv.id}` as any),
    });
  });

  if (lowStockCount > 0) {
    taskItems.push({
      icon: AlertTriangle as React.FC<any>,
      label: `Stok siparişi ver · ${lowStockCount} kalem`,
      time: 'Kritik seviyenin altında',
      done: false,
      onPress: () => router.push('/(admin)/stock' as any),
    });
  }

  if (taskItems.length === 0) {
    taskItems.push(
      { icon: CheckCircle as React.FC<any>, label: t('admin.dashboard.noTasks'), time: '', done: true, onPress: undefined },
    );
  }

  const weekDays = getWeekDays(t);

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
    // Bu hafta bar değerleri — GERÇEK veri (weekCounts zaten yüklü; desktop kartı
    // da aynı kaynağı kullanıyor). Eskiden [0,0,0,0,0,0,todayOrders] stub'ıydı:
    // 6 gün hep boş görünüyor, bugünkü değer de daima son sütuna yazılıyordu.
    // weekDays Pazartesi'den başlar; etiket ve bugün indeksi de oradan gelir ki
    // sütunlarla veri hizalı olsun (i18n listesi Pazar ile başlıyor).
    const weekBars   = weekDays.map(d => weekCounts[d.date] ?? 0);
    const weekLabels = weekDays.map(d => d.label.split(' ')[0]);
    const weekTodayIndex = weekDays.findIndex(d => d.isToday);

    // Notification buckets — admin-specific
    const { NotificationsSheet } = require('../../core/ui/mobile/NotificationsSheet');
    const notifApprovals = recentOrders
      .filter((o: any) => o.status === 'onay_bekliyor')
      .slice(0, 5)
      .map((o: any) => ({
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: 'Onay bekliyor',
      }));
    const notifOverdue = overdueOrdersFromRecent.slice(0, 5).map((o: any) => {
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
    const notifUpcoming = upcoming.slice(0, 5).map((o: any) => {
      const due = new Date(o.delivery_date + 'T00:00:00').getTime();
      const tdy = new Date(); tdy.setHours(0, 0, 0, 0);
      const days = Math.ceil((due - tdy.getTime()) / 86400000);
      const remainLabel = days <= 0 ? 'Bugün' : days === 1 ? 'Yarın' : `${days}g sonra`;
      return {
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        remainLabel,
      };
    });

    // Son Siparişler — mobil kart listesi (başlık = hekim adı; admin lab'ı yönetir)
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status);
      const isOverdue = !!o.delivery_date && o.delivery_date < today && o.status !== 'teslim_edildi';
      const drName = o.doctor_name || '—';
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
    // Gruplama slice'tan ÖNCE: 6 satır = 6 VAKA (aynı vakanın üyeleri yer yemesin)
    const recentForMobile = mapRevisionCases(recentWithParents, toRecentItem).slice(0, 6);

    return (
      <View style={{ flex: 1 }}>
        <AdminMobileDashboard
          recentOrders={recentForMobile}
          onOpenOrderById={(dbId: string) => router.push(`/(admin)/order/${dbId}` as any)}
          onAllOrders={() => router.push('/(admin)/orders' as any)}
          liveActive={totalActive}
          liveTotal={totalOrders}
          liveStages={{ alindi: 0, uretim: totalActive, kk: 0, hazir: 0 }}
          livePercent={totalOrders > 0 ? Math.round((totalActive / totalOrders) * 100) : 0}
          liveTimer={new Date().toLocaleTimeString(localeTag(i18n.language), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          monthlyRevenue={'—'}
          monthlyDelta={undefined}
          activeOrders={totalActive}
          productionCount={totalActive}
          overdueCount={overdueCount}
          pendingApprovalsCount={notifApprovals.length}
          weekBars={weekBars}
          weekLabels={weekLabels}
          weekTodayIndex={weekTodayIndex}
          weekRange={`${fmtDate(weekDays[0].date)} – ${fmtDate(weekDays[6].date)}`}
          weekTotal={weekBars.reduce((a, b) => a + b, 0)}
          onNewOrder={() => useNewOrderModalStore.getState().setOpen(true)}
          onScan={() => router.push('/(admin)/scan' as any)}
          onApprovals={() => router.push('/(admin)/approvals' as any)}
          onNotifications={() => setNotificationsOpen(true)}
          onProfile={() => router.push('/(admin)/profile' as any)}
          onOpenOrder={(id) => router.push(`/(admin)/order/${id}` as any)}
          refreshing={refreshing || loading}
          onRefresh={handleRefresh}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onOpenOrder={(dbId: string) => router.push(`/(admin)/order/${dbId}` as any)}
          panel="exec"
          approvals={notifApprovals}
          overdue={notifOverdue}
          upcoming={notifUpcoming}
        />
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  DESKTOP RENDER (mevcut, dokunulmadı)
  // ══════════════════════════════════════════════════════════════
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        padding: 16,
        paddingTop: isDesktop ? 16 : insets.top + 8,
        paddingBottom: 120,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={P} />}
    >
      {/* ════════ HERO ════════ */}
      {/* Alt boşluk 16 — hero ile altındaki ilk kart arasındaki mesafe sabit. */}
      <View style={{ marginBottom: 16 }}>
        <View className={`${isDesktop ? 'flex-row justify-between items-end' : ''}`} style={{ gap: 32, paddingTop: 8 }}>
          {/* Left: greeting + stat pills */}
          <View style={{ flex: 1 }}>
            {/* Selamlama sayfanın konusu değil; bilgi öndedir. 56/40 → 28/24. */}
            <Text style={{
              ...SERIF, fontSize: isDesktop ? 28 : 24,
              letterSpacing: -0.025 * (isDesktop ? 28 : 24),
              lineHeight: isDesktop ? 32 : 28,
              color: INK,
            }}>
              {t('dashboard.greetingName', { name: '' }).replace(/\s*\.?\s*$/, '')}{' '}
              <Text style={{ fontStyle: 'italic', color: DS.ink[400] }}>{firstName}</Text>
            </Text>

            {/* Stat pills row */}
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label={t('admin.dashboard.production')} value={`${productionPct}%`} bg={INK} color="#FFF" />
              <StatPill label={t('admin.dashboard.active')} value={totalActive} bg={P} color="#FFF" />
              <StatPill label={t('admin.dashboard.today')} value={todayOrders} bg="rgba(0,0,0,0.08)" color={INK} />
              {/* Geciken + planlanacak AYNI satırda: StatPill ile eşit ölçülü
                  rozetler. İkinci bir şerit yok; renk tek başına yeter. */}
              {overdueCount > 0 && (
                <AlertPillX
                  icon={AlertTriangle}
                  count={overdueCount}
                  label={t('admin.dashboard.overdue')}
                  color={CLR.red}
                  labelColor="#9C2E2E"
                  pulse
                  onPress={() => router.push('/(admin)/orders' as any)}
                />
              )}
              {planningPending > 0 && (
                <AlertPillX
                  icon={Layers}
                  count={planningPending}
                  label={t('admin.status.toPlanShort')}
                  color={CLR.orange}
                  labelColor="#9C5E0E"
                  pulse
                  onPress={() => router.push('/(admin)/orders?status=alindi' as any)}
                />
              )}
              <FaceScanQuickAction accentColor={P} compact />
            </View>

          </View>

          {/* Right: big stats — kart yok, aralarında yalnız saç teli ayraç.
              alignSelf: sol kolon daha uzun olduğunda KPI bloğu tepede kalıp
              altında boşluk bırakıyordu. */}
          <View className="flex-row" style={{ gap: 24, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            <BigStat value={totalOrders} label={t('admin.dashboard.totalOrders')} />
            <StatDivider />
            <BigStat value={totalDoctors} label={t('admin.dashboard.doctor')} />
            <StatDivider />
            <BigStat value={totalLabUsers} label={t('admin.dashboard.labUser')} />
          </View>
        </View>
      </View>

      {/* ════════ 4-CARD GRID ════════ */}
      <View
        className={isDesktop ? 'flex-row' : ''}
        style={{ gap: 16, marginBottom: 16 }}
      >
        {/* Card 1: Aktif Vaka — dark top + white bottom + animations */}
        <AnimatedAktifVakaCard
          isDesktop={isDesktop}
          pipelineCounts={pipelineCounts}
          latestOrder={latestOrder}
          router={router}
        />

        {/* Card 2: Sipariş Trendi (bar chart) */}
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 16 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.015 * 18, color: INK }}>{t('admin.dashboard.memberTrend')}</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -0.025 * 42, lineHeight: 42, marginTop: 8, color: INK }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: DS.ink[400] }}> {t('admin.dashboard.membersThisMonth')}</Text>
              </Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>{t('admin.dashboard.toothMemberNote')}</Text>
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
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 16 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: INK }}>{t('admin.dashboard.deliveryRate')}</Text>
            <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
              <ArrowUpRight size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <PercentRingHero value={deliveryPct} size={140} darkText />
          {/* Yüzde tek başına "neyin %11'i?" sorusunu bırakıyordu — payı/paydayı yaz. */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700], marginTop: 10 }}>
            {t('admin.dashboard.ordersOfTotal', { done: deliveredPipe, total: pipeCount })}
          </Text>
          <Text style={{ fontSize: 9, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.08 * 9, marginTop: 3 }}>
            {t('admin.dashboard.deliveredAllTime')}
          </Text>
          {/* Mini pipeline stats */}
          <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: DS.ink[100] }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: DS.ink[500] }}>
                {pipelineCounts['uretimde'] ?? 0} {t('admin.dashboard.inProduction')}
              </Text>
            </View>
            <View className="items-center rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(P, 0.15) }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: P }}>
                {pipelineCounts['teslimata_hazir'] ?? 0} {t('admin.status.ready')}
              </Text>
            </View>
          </View>
        </Card>

        {/* Card 4: Yeni Sipariş CTA — Hero */}
        <View style={{ flex: isDesktop ? 1 : undefined }}>
          <AnimatedCTACard onPress={() => router.push('/(admin)/new-order' as any)} isDesktop={isDesktop} />
        </View>
      </View>

      {/* ════════ BOTTOM ROW — Weekly + Bugünkü Görevler ════════ */}
      <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 16, marginBottom: 16 }}>
        <WeeklyStrip
          weekDays={weekDays}
          weekCounts={weekCounts}
          weekDone={weekDone}
          onPress={() => router.push('/(admin)/orders' as any)}
        />
        <TasksCard tasks={taskItems} />
      </View>

      {/* ════════ EXTRA SECTIONS (below fold) ════════ */}

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 80 }}>
          <ActivityIndicator color={P} size="large" />
        </View>
      ) : (
        <>
          {/* Son Siparişler — Patterns table */}
          <Card style={{ marginBottom: 16 }}>
            <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{t('admin.dashboard.recentOrders')}</Text>
              <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
                <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>{t('admin.dashboard.viewAll')}</Text>
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
              <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.no')}</Text>
              <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.doctor')}</Text>
              {isDesktop && <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.workType')}</Text>}
              <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.status')}</Text>
              {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'right' }}>{t('admin.table.delivery')}</Text>}
            </View>

            {recentOrders.length === 0
              ? <Text className="p-6 text-center" style={{ fontSize: 13, color: DS.ink[400] }}>{loading ? t('common.loading') : t('admin.dashboard.noOrders')}</Text>
              : recentRows.map((order: any, idx: number) => {
                  const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                  const isLast  = idx === recentRows.length - 1;
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
                      {/* Vaka grubu: orijinal üstte, revizyonlar altında girintili
                          (siparişler sayfasıyla aynı dil) */}
                      <View className="flex-row items-center" style={{ flex: 1.2, minWidth: 0, gap: 6, paddingLeft: (order as any).__revChild ? 14 : 0 }}>
                        {(order as any).__revChild && <CornerDownRight size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} style={{ flexShrink: 0 }} />}
                        <View style={{ minWidth: 0 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: P }} numberOfLines={1}>#{order.order_number}</Text>
                          {(order as any).__revChild ? (
                            <Text style={{ fontSize: 8.5, fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E', letterSpacing: 0.4 }}>{(order as any).__continuation ? 'DEVAM' : 'REVİZYON'}</Text>
                          ) : (order as any).__revParent ? (
                            <Text style={{ fontSize: 8.5, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.4 }}>ORİJİNAL</Text>
                          ) : null}
                        </View>
                        {order.is_urgent && (
                          <View className="rounded" style={{ paddingHorizontal: 4, paddingVertical: 1, backgroundColor: 'rgba(217,75,75,0.1)' }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: CLR.red }}>{t('admin.status.urgent')}</Text>
                          </View>
                        )}
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
                            <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(order.doctor_name)}</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: INK }} numberOfLines={1}>{order.doctor_name}</Text>
                      </View>
                      {isDesktop && (
                        <Text style={{ flex: 2, fontSize: 11, color: DS.ink[500] }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E' }}>{(order as any).__continuation ? 'Devam - ' : 'Revizyon - '}</Text>
                    )}{order.work_type || '--'}</Text>
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

          {/* Faturalanmamış sipariş hatırlatması (Faz 3) */}
          {unbilledCount > 0 && (
            <Pressable
              onPress={() => router.push('/(admin)/finance' as any)}
              style={{
                marginBottom: 16,
                padding: 18,
                borderRadius: 18,
                backgroundColor: 'rgba(217,119,6,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(217,119,6,0.22)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: 'rgba(217,119,6,0.18)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Receipt size={20} color="#9C5E0E" strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#9C5E0E', letterSpacing: 0.2 }}>
                  {t('admin.dashboard.unbilledDeliveries')}
                </Text>
                <Text style={{ fontSize: 12, color: DS.ink[700], marginTop: 2 }}>
                  <NumberTickerX value={unbilledCount} duration={600} style={{ fontWeight: '700', color: DS.ink[800] } as any} />
                  {` ${t('admin.dashboard.orders')}`}
                  <NumberTickerX value={unbilledClinics} duration={600} style={{ fontWeight: '700', color: DS.ink[800] } as any} />
                  {` ${t('admin.dashboard.clinicEstimated')}`}
                  <Text style={{ fontWeight: '700', color: DS.ink[800] }}>
                    {Object.entries(unbilledTotals).length === 0
                      ? '—'
                      : Object.entries(unbilledTotals)
                          .sort((a, b) => b[1] - a[1])
                          .map(([ccy, amt]) => formatMoney(amt, ccy as Currency, { fractionDigits: 2 }))
                          .join(' · ')}
                  </Text>
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C5E0E', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {t('admin.dashboard.invoice')}
              </Text>
            </Pressable>
          )}

          {/* Finance + Status + Work Type — 2-column below fold */}
          <View className={isDesktop ? 'flex-row' : ''} style={{ gap: 16, marginBottom: 16 }}>
            <View style={{ flex: isDesktop ? 1 : undefined, gap: 16 }}>
              <FinanceCard monthly={finMonthly} pending={finPending} paid={finPaidCount} />
              {byWorkType.length > 0 && <WorkTypeCard data={byWorkType} />}
            </View>
            <View style={{ flex: isDesktop ? 1 : undefined, gap: 16, marginTop: isDesktop ? 0 : 16 }}>
              <StatusDistCard byStatus={byStatus} />
            </View>
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
