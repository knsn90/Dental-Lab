/**
 * AdminDashboard — Patterns design language (matching Lab dashboard layout)
 *
 * Layout:
 *   1. Hero — Serif greeting + stat pills + big numbers
 *   2. 4-card grid (AnimatedAktifVaka, Sipariş Trendi, PercentRing, AnimatedCTACard) — eşit sütunlar (DashGrid)
 *   3. Second row — TasksCard + tarama widget'ı (yarımlar)
 *   4. Extra sections — Orders table, Finance | Status dist, Work type | WeeklyStrip
 *
 * Theme: DS.exec (kobalt #002A5C)
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { HatchFill } from '../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../core/util/personName';
import { autoT } from '../../core/i18n/autoTranslate';
import { useOrderMetrics } from '../../core/metrics/useOrderMetrics';
import { useLabToday, cachedLabTz } from '../../core/metrics/useLabToday';
import { labTodayOf, isOverdueOrder } from '../../core/metrics/orderDefs';
import { METRIC_HINTS } from '../../core/metrics/metricHints';
import { GlassTooltip } from '../../core/ui/GlassTooltip';
import { useOverdueClinics } from '../../modules/dashboard/hooks/useOverdueClinics';
import { overdueClinicLine } from '../../modules/dashboard/lib/overdueClinicLine';
import { useFinancePeriod, useLabReceivables } from '../../core/metrics/useFinanceMetrics';
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
  AlertTriangle, ArrowUpRight, ArrowUpLeft, ArrowRight, ArrowLeft, Check, Trophy, Inbox, Receipt, CornerDownRight,
  Wallet,
  PlusCircle, Pause,
} from '../../core/ui/icons';
import { useStockAlert } from '../../core/hooks/useStockAlert';
import { useTranslation } from 'react-i18next';
import { localeTag, isRTL, weekdayOffset, fmtWeekdayDayMonth } from '../../core/i18n';
import { supabase } from '../../core/api/supabase';
import { useRealtimeRefresh } from '../../core/hooks/useRealtimeRefresh';
import { DS } from '../../core/theme/dsTokens';
import { HERO_NAVY, prefersReducedMotion, useAccentTones, useNeonNavy, NeonPulse } from '../../core/ui/HeroGlow';
import { onAccentInk } from '../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useIsDesktop } from '../../core/layout/PatternsShell';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';
import { HomeB1, type PriorityOrder, type KpiItem, defaultInsight } from '../../core/ui/HomeB1';
import { AlertPillX } from '../../core/ui/AlertPillX';
import { AdminMobileDashboard } from '../../modules/admin/components/AdminMobileDashboard';
import { resolveOrderStatus } from '../../modules/dashboard/components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../modules/orders/revisionGroups';
import { useRevisionParents } from '../../modules/orders/hooks/useRevisionParents';
import { useHeldOrders, type HeldOrder } from '../../modules/orders/hooks/useHeldOrders';
import { isLongHold, daysBetween } from '../../modules/orders/holdDates';
import { holdCategoryLabel } from '../../modules/orders/holdCategories';
import { ResumeOrderModal } from '../../modules/orders/components/ResumeOrderModal';
import { HoldOrderModal } from '../../modules/orders/components/HoldOrderModal';
import { NumberTickerX } from '../../core/ui/NumberTickerX';
import { PipelineFlowRow } from '../../core/ui/PipelineFlowRow';
import { type CurrencyTotal } from '../../core/money/aggregations';
import { formatMoney, useBaseCurrency, type Currency } from '../../core/money/currency';
import { useDashboardCache } from '../../core/store/dashboardCacheStore';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { FaceScanQuickAction } from '../../modules/orders/components/FaceScanQuickAction';
import { serviceUnitQty, serviceUnitLabel, resolveUnitForWorkType, workTypeGroupLabel, unitShares, memberBucketOf } from '../../core/util/serviceUnits';
import { ScanCalendarCard, useScanCardVisible } from '../../modules/scans/components/ScanCalendarCard';
import { DashRow, DashHalf, DashCell } from '../../modules/dashboard/components/DashGrid';

// ── Display font — Patterns: Inter Tight Light (300), tight tracking ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Shorthand aliases from DS tokens ──
const P   = DS.exec.primary;      // #002A5C kobalt (AÇIK tema)

/**
 * Panel mavisi — koyu temada kobalt (#002A5C) parlak/eski duruyor; yerine yeni
 * lacivert paletin açık tonu (#004B87) kullanılır. Grafik, halka, rozet ve
 * ikonların hepsi bundan beslenir ki sayfa tek bir mavi konuşsun.
 */
function usePanelBlue(): string {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return isDark ? HERO_NAVY.light : P;
}
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
  DS.exec.primaryDeep,   // #001F3F lacivert · 8.23:1
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
  // Kurye işi teslim aldı ve yolda — 'teslimata_hazir' ile KARIŞTIRMA
  // (2026-09-24: hazır işler "Kuryeye Teslim Edildi" görünüyordu).
  kurye_bekleniyor:{ labelKey: 'admin.status.waitingCourier', color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kuryede:         { labelKey: 'admin.status.withCourier',    color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  teslim_edildi:   { labelKey: 'admin.status.delivered',   color: DS.ink[400],  bg: 'rgba(0,0,0,0.04)' },
};
const STATUS_KEYS = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];
/** order_metrics().by_status → dağılım kovaları. Eskiden yalnız 5 statü sayılıyordu;
 *  kutu/atama/tasarım onayı/kurye durumları dağılımdan düşüyordu (denetim Y2). İptal yok. */
const STATUS_BUCKET: Record<string, string> = {
  alindi: 'alindi', kutu_atandi: 'alindi', atama_bekleniyor: 'alindi', tasarim_onayi_bekleniyor: 'alindi',
  uretimde: 'uretimde', asamada: 'uretimde', kalite_kontrol: 'kalite_kontrol',
  teslimata_hazir: 'teslimata_hazir', kurye_bekleniyor: 'teslimata_hazir', kuryede: 'teslimata_hazir',
  teslim_edildi: 'teslim_edildi',
};

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
function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} TL`;
  }
}
/** Yarı saydam bir rengi OPAK zemine karıştırır — cam yerine düz yüzey gerekiyorsa. */
function mixOn(base: string, overlay: string, alpha: number): string {
  const px = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [br, bg, bb] = px(base), [or_, og, ob] = px(overlay);
  const mix = (b: number, o: number) => Math.round(b + (o - b) * alpha);
  return `#${[mix(br, or_), mix(bg, og), mix(bb, ob)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
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
/** Yerel takvim günü (YYYY-MM-DD). toISOString UTC gününü verir: TR'de 00:00–03:00
 *  arası açılan sipariş bir önceki güne yazılıyordu, gece yarısından sonra hafta kayıyordu. */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(t: (k: string) => string): { label: string; date: string; isToday: boolean }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  // Hafta başlangıcı bölgeye bağlı: TR/AB Pazartesi, İran Cumartesi (weekdayOffset).
  monday.setDate(now.getDate() - weekdayOffset(dayOfWeek));
  const result: { label: string; date: string; isToday: boolean }[] = [];
  const todayISO = localISO(now);
  const daysShort = t('admin.days.short').split(', ');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = localISO(d);
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
  const T = useMobileTokens();
  return (
    <View
      className="overflow-hidden"
      style={[{ backgroundColor: T.card, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: T.hairline }, style]}
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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const live = segments.filter(s => s.pct > 0.0001);
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : DS.ink[100], gap: 2, marginTop: 16 }}>
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
  const T = useMobileTokens();
  return (
    // flex:1 → ızgara hücresini doldurur; yan yana kartlar eş boy kalır
    <Card style={{ padding: 20, flex: 1 }}>
      {/* Başlık solda · toplam sağda — koyu bant yok, kart bağırmıyor */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {plain
            ? <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.5, color: T.ink, ...NUM }}>{value}</Text>
            : value}
          {unit ? <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink3 }}>{unit}</Text> : null}
        </View>
      </View>

      <Spine segments={segments} />

      <View style={{ marginTop: 8 }}>{children}</View>

      {zeros && zeros.length > 0 ? (
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
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
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color ?? 'transparent' }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: T.ink2 }} numberOfLines={1}>{label}</Text>
      {plain
        ? <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, ...NUM }}>{value}</Text>
        : value}
      {meta ? (
        <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink3, minWidth: 36, textAlign: 'end' as any, ...NUM }}>{meta}</Text>
      ) : null}
    </View>
  );
}

/** Card header — display serif or uppercase micro */
function CardHeader({ title, right, display }: { title: string; right?: React.ReactNode; display?: boolean }) {
  const T = useMobileTokens();
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
      {display ? (
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: T.ink }}>{title}</Text>
      ) : (
        <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: T.ink3 }}>
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
  const T = useMobileTokens();
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>
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
  const T = useMobileTokens();
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 2, backgroundColor: T.hairline }} />;
}

function BigStat({ value, label }: { value: string | number; label: string }) {
  const isNum = typeof value === 'number';
  const T = useMobileTokens();
  const numStyle = { ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: T.ink };
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {isNum
        ? <NumberTickerX value={value as number} duration={900} style={numStyle} />
        : <Text style={numStyle}>{value}</Text>}
      <Text style={{ fontSize: DS.size.micro, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

// ── PercentRingHero — gradient arc + knob + pulse ──
function PercentRingHero({
  value: targetValue, size = 200, weight = '300', animate = true, darkText = false,
}: { value: number; size?: number; weight?: '200' | '300' | '400' | '500' | '600' | '700'; animate?: boolean; darkText?: boolean }) {
  const PB = usePanelBlue();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const animatedValue = useCountUp(targetValue, animate ? 1400 : 0);
  const value = animate ? animatedValue : targetValue;

  const outerStroke = Math.max(8, Math.round(size * 0.12));
  const innerStroke = outerStroke - 6;
  const r = (size - outerStroke - Math.max(3, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;

  const lightColor = PB;
  const deepColor = DS.exec.primaryDeep;
  const id = `pr-hero-exec-${targetValue}-${size}`;

  const outerPillColor = darkText ? lightColor + '30' : lightColor + '22';
  const innerTrackColor = darkText ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : lightColor + '15';

  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);
  const knobR = innerStroke * 0.85;
  const showKnob = size >= 56;
  const showPulse = size >= 100;
  const displayValue = Math.round(value);

  const knobColor = darkText ? T.ink : '#FFFFFF';
  const textColor = darkText ? T.ink : '#FFFFFF';
  const pctColor = darkText ? T.ink3 : lightColor;

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

// ── Animated Aktif Vaka Card — pulsing CANLI dot + glow + breathing circles ──
function AnimatedAktifVakaCard({ isDesktop, pipelineCounts, latestOrder, router }: {
  isDesktop: boolean;
  pipelineCounts: Record<string, number>;
  latestOrder: any;
  router: any;
}) {
  const PB = usePanelBlue();
  // Akış izi rengi PANELE uyar: mavi panelde lacivert ailenin açık ucu,
  // zümrüt/safran panelde accent'in açılmış tonu.
  const accentTone = useAccentTones(PB);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { t } = useTranslation();
  const T = useMobileTokens();
  const dotAnim = useRef(new Animated.Value(0)).current;
  // Akış kuyruğu: aşamalar arasındaki çizgide soldan sağa ilerleyen ışık.
  const flowAnim = useRef(new Animated.Value(0)).current;
  // Aşama başına "değişim parıltısı" — sayı DEĞİŞİNCE tetiklenir, boşta durur.
  const flashAnims = useRef(PIPELINE_STAGES.map(() => new Animated.Value(0))).current;
  const prevCounts = useRef<number[]>(PIPELINE_STAGES.map(st => pipelineCounts[st.key] ?? 0));

  // Geometri sabit: 4 daire (40px) + 12px boşluk → çizgi ilk/son dairenin
  // merkezleri arasında uzanır. Ölçüm gerekmiyor, layout deterministik.
  // Kartın daire hizasındaki zemin tonu (ink700→ink900 dikey gradyanın ortası).
  const CARD_MID = '#1B1B1B';
  const FLOW = isDark ? '#38BDF8' : PB;
  const CIRCLE = 40, GAP = 12, STEP = CIRCLE + GAP;
  const LINE_W = STEP * (PIPELINE_STAGES.length - 1);
  // İşin BEKLEDİĞİ aşama: dolu olan son aşama (yoksa akış durur).
  const activeIdx = PIPELINE_STAGES.reduce((acc, st, i) => ((pipelineCounts[st.key] ?? 0) > 0 ? i : acc), -1);
  const hasFlow = activeIdx >= 0 && !prefersReducedMotion();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();
  }, [dotAnim]);

  useEffect(() => {
    // Akış yoksa (hiçbir aşamada iş yok) hareket de yok — kart dürüstçe susar.
    flowAnim.stopAnimation();
    flowAnim.setValue(0);
    if (!hasFlow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flowAnim, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flowAnim, hasFlow, activeIdx]);

  useEffect(() => {
    // Sayı değiştiğinde YALNIZ o daire tepki verir (realtime nabzı).
    PIPELINE_STAGES.forEach((st, i) => {
      const v = pipelineCounts[st.key] ?? 0;
      if (v === prevCounts.current[i]) return;
      prevCounts.current[i] = v;
      if (prefersReducedMotion()) return;
      flashAnims[i].setValue(0);
      Animated.sequence([
        Animated.spring(flashAnims[i], { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }),
        Animated.timing(flashAnims[i], { toValue: 0, duration: 420, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    });
  }, [pipelineCounts, flashAnims]);

  const dotOpacity = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  // Kuyruk aktif aşamada DURAKLAR: yolun ortasında bekleyip parlar, sonra
  // sona ilerler. "İş şu an burada" bilgisini hareketin kendisi söyler.
  const activeX = Math.max(0, activeIdx) * STEP;
  // Duraklama noktası dairenin SOL KENARI (merkezi değil): merkeze durursa
  // izin çoğu dairenin arkasında kalıp kısa bir çubuk gibi görünüyordu.
  const holdX = Math.max(0, activeX - CIRCLE / 2 - 2);
  const flowX = flowAnim.interpolate({
    inputRange: [0, 0.34, 0.62, 1],
    outputRange: [0, holdX, holdX, LINE_W],
  });
  const flowOpacity = flowAnim.interpolate({
    inputRange: [0, 0.10, 0.34, 0.62, 0.90, 1],
    outputRange: [0, 0.55, 1, 1, 0.55, 0],
  });

  return (
    <Card style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 14 }}>
      {/* Dark section */}
      <View style={{
        flex: 1,
        // @ts-ignore web gradient
        // Bilinçli KOYU hero bandı — iki temada da siyah.
        backgroundImage: 'linear-gradient(180deg, #1A1A1A 0%, #0A0A0A 100%)',
        backgroundColor: '#0A0A0A',
        alignItems: 'center', justifyContent: 'center',
        minHeight: 160, position: 'relative',
        overflow: 'hidden',
      }}>

        {/* CANLI badge */}
        <View className="absolute rounded-full" style={{
          top: 14, start: 14,
          paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: `${PB}E6`,
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

        <PipelineFlowRow
          stages={PIPELINE_STAGES.map(st => ({ key: st.key, label: t(st.labelKey) }))}
          counts={pipelineCounts}
          accent={PB}
          flowColor={accentTone.ink}
          cardMid={CARD_MID}
          onPressStage={() => router.push('/(admin)/orders' as any)}
          renderValue={(count, active) => (
            <NumberTickerX
              value={count}
              duration={800}
              style={{ ...SERIF, fontSize: 16, letterSpacing: -0.5, color: active ? '#FFF' : 'rgba(255,255,255,0.3)' } as any}
            />
          )}
        />
      </View>

      {/* White section — latest order info */}
      <View style={{ padding: 16 }}>
        {latestOrder ? (
          <Pressable
            onPress={() => router.push(`/(admin)/order/${latestOrder.id}` as any)}
            style={{ gap: 2 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: T.ink }} numberOfLines={1}>
              {latestOrder.doctor_name ?? 'Sipariş'}
            </Text>
            <Text style={{ fontSize: 11, color: T.ink3, marginBottom: 10 }} numberOfLines={1}>
              #{latestOrder.order_number} · {latestOrder.work_type ?? ''}
            </Text>
            <StatusBadge status={latestOrder.status} />
          </Pressable>
        ) : (
          <Text style={{ fontSize: 13, color: T.ink3 }}>{t('common.loading')}</Text>
        )}
      </View>
    </Card>
  );
}

// ── Production Bar Chart — hatched-rail pill columns (admin coral) ──
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const PB = usePanelBlue();
  const T = useMobileTokens();
  const max = Math.max(...data.map(d => d.count), 1);
  const highestIdx = data.reduce((best, d, i) => d.count > data[best].count ? i : best, 0);

  const FILL_LIGHT = `${PB}55`;   // panel soft (semi-transparent)
  const FILL_DARK  = PB;
  const RAIL_BG    = `${PB}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${PB}14 0 6px, transparent 6px 12px)`;

  return (
    <View className="flex-row items-end" style={{ flex: 1, gap: 10, minHeight: 120, paddingHorizontal: 2 }}>
      {data.map((d, i) => {
        const pct = d.count > 0 ? Math.min(Math.max((d.count / max) * 100, 8), 100) : 0;
        const isHighlight = i === highestIdx && d.count > 0;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
            <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* HER ayın değeri yazılır — eskiden yalnız en yüksek ayda pill vardı,
                  diğer aylar sayısız kalıyordu. Klinik/Lab panolarıyla aynı kalıp:
                  SABİT yükseklikli etiket zonu; çubuğu itmez, tabanlar hizalı kalır.
                  (Rail'in height:'100%' olması bu zonla birlikte taşma yapıyordu →
                  flex:1'e alındı.) */}
              <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                {d.count > 0 ? (
                  isHighlight ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: FILL_DARK }}>{d.count}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3 }}>{d.count}</Text>
                  )
                ) : null}
              </View>
              <View
                style={{
                  width: '100%',
                  flex: 1,
                  borderRadius: 999,
                  backgroundColor: RAIL_BG,
                  // @ts-ignore web hatched bg
                  backgroundImage: STRIPE_BG,
                  overflow: 'hidden',
                  position: 'relative' as any,
                }}
              >
                {/* Native: CSS gradyanı yok → SVG tarama */}
                <HatchFill color={PB} />
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
              color: isHighlight ? T.ink : T.ink3,
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
  weekDays, weekCounts, weekDone, extra, onPress,
}: {
  weekDays: { label: string; date: string; isToday: boolean }[];
  weekCounts: Record<string, number>;
  weekDone: Record<string, number>;
  extra?: { cene: number; adet: number };
  onPress: () => void;
}) {
  const PB = usePanelBlue();
  const { t } = useTranslation();
  const T = useMobileTokens();
  const totalReceived  = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const totalCompleted = Object.values(weekDone).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20; // fixed 1..20 jobs scale

  // Panel palette — soft panel = received, deep panel = completed
  const SAGE_LIGHT = `${PB}55`;   // panel soft (semi-transparent)
  const SAGE_DARK  = PB;
  const RAIL_BG    = `${PB}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${PB}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1.5 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: T.ink }}>{t('admin.dashboard.thisWeek')}</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_LIGHT }} />
            <Text style={{ fontSize: 11, color: T.ink3 }}>{t('admin.dashboard.receivedMembers')} </Text>
            <NumberTickerX value={totalReceived} duration={700} style={{ fontSize: 11, color: T.ink3 } as any} />
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_DARK }} />
            <Text style={{ fontSize: 11, color: T.ink3 }}>{t('admin.dashboard.deliveredMembers')} </Text>
            <NumberTickerX value={totalCompleted} duration={700} style={{ fontSize: 11, color: T.ink3 } as any} />
          </View>
        </View>
      </View>

      {/* Çene/adet işleri üyeye katılmaz — bu haftakiler ayrı not. */}
      {(() => {
        const parts: string[] = [];
        if (extra?.cene) parts.push(`${extra.cene} ${autoT('çene')}`);
        if (extra?.adet) parts.push(`${extra.adet} ${autoT('adet')}`);
        return parts.length
          ? <Text style={{ fontSize: 11, color: T.ink2, fontWeight: '600', marginTop: -6, marginBottom: 10 }}>{`${autoT('Bu hafta ayrıca')} ${parts.join(' · ')}`}</Text>
          : null;
      })()}

      {/* Bars */}
      <View className="flex-row items-end" style={{ gap: 10, flex: 1, minHeight: 140, paddingHorizontal: 2 }}>
        {weekDays.map((day, i) => {
          const received  = weekCounts[day.date] ?? 0;
          const completed = weekDone[day.date] ?? 0;
          const receivedPct  = received > 0  ? Math.min(Math.max((received / SCALE_MAX) * 100, 8), 100) : 0;
          const completedRel = received > 0 ? Math.min((completed / received) * 100, 100) : 0;
          const empty = received === 0;
          return (
            <Pressable
              key={i}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}
            >
              {/* Pill column — hatched rail always visible */}
              <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {/* HER günün alınan üye sayısı — aylık trend grafiğiyle aynı kalıp:
                    SABİT yükseklikli değer zonu (çubuğu itmez, tabanlar hizalı).
                    Eskiden burada yalnız BUGÜNÜN tamamlanma yüzdesi vardı, diğer
                    günler sayısız kalıyordu. */}
                <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                  {!empty && (
                    day.isToday ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE_DARK }}>{received}</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3 }}>{received}</Text>
                    )
                  )}
                </View>
                <View
                  style={{
                    width: '100%',
                    flex: 1,
                    borderRadius: 999,
                    backgroundColor: RAIL_BG,
                    // @ts-ignore web hatched bg
                    backgroundImage: STRIPE_BG,
                    overflow: 'hidden',
                    position: 'relative' as any,
                  }}
                >
                  {/* Native: CSS gradyanı yok → SVG tarama */}
                  <HatchFill color={PB} />
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
                color: day.isToday ? T.ink : T.ink3,
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

// ── Hızlı İşlem kartı — "kontrol paneli" düzeni ─────────────────────────────
// Düzen: üstte kimlik + ilerleme halkası + eylem pill'i · ortada iki büyük
// metrik · altında knob'lu ilerleme çubuğu · en altta accent şeritli mini liste.
// Koyu temada siyah→lacivert gradyan + üstten yayılan ışık + neon mavi kenar;
// açık temada panelin kobalt→amber gradyanı korunur (yalnız DÜZEN ortak).
// ── Hızlı İşlem kartı — CTA ────────────────────────────────────────────────
// İÇERİK sade kalır (kicker + başlık + "Başla" pill'i). Yalnız YÜZEY tema-farkında:
// koyu temada siyah→lacivert gradyan, üstten yayılan ışık ve neon mavi kenar;
// açık temada panelin kobalt→amber gradyanı korunur.
function AnimatedCTACard({ onPress, isDesktop }: { onPress: () => void; isDesktop: boolean }) {
  const PB = usePanelBlue();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { t } = useTranslation();
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Neon kenar + üstteki ışık için yavaş nefes (yalnız opaklık/ölçek → compositor).
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Tek hareket: eylem okunun nazik dürtüsü — kart bir CTA, davet etmeli.
    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    ).start();

  }, [arrowAnim]);

  const arrowX = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, isRTL() ? -6 : 6] });
  const handleHoverIn  = () => Animated.spring(scaleAnim, { toValue: 1.02, friction: 8, tension: 200, useNativeDriver: true }).start();
  const handleHoverOut = () => Animated.spring(scaleAnim, { toValue: 1,    friction: 8, tension: 200, useNativeDriver: true }).start();

  const neon = '#38BDF8';
  // Hızlı İşlem kartı HER İKİ temada da koyu/neon dilde (kullanıcı kararı):
  // açık temadaki mavi→turuncu gradyan yerine koyu temanın lacivert yüzeyi.
  // "neon navy" — CTA kartlarının imza yüzeyi (tek kaynak: useNeonNavy).
  const nn = useNeonNavy(PB);
  const surface: any = nn.surface;


  return (
    <Pressable onPress={onPress} onHoverIn={handleHoverIn} onHoverOut={handleHoverOut} style={{ flex: 1 }}>
      <Animated.View style={{
        flex: 1,
        borderRadius: DS.radius.xl,
        padding: 22,
        position: 'relative',
        overflow: 'hidden',
        minHeight: isDesktop ? undefined : 160,
        transform: [{ scale: scaleAnim }],
        ...surface,
      }}>
        {!nn.flat && <NeonPulse radius={DS.radius.xl} color={nn.glow} />}
        <View style={{ position: 'relative' }}>
          <Text style={{
            fontSize: 11, fontWeight: '500', letterSpacing: 0.1 * 11,
            textTransform: 'uppercase', color: nn.inkSoft, marginBottom: 14,
          }}>
            {t('admin.dashboard.quickAction')}
          </Text>
          <Text style={{
            ...SERIF, fontSize: 32, letterSpacing: -0.02 * 32, lineHeight: 35,
            color: nn.ink, marginBottom: 16,
          }}>
            {t('admin.dashboard.newOrder')}
          </Text>
          <View
            className="flex-row items-center self-end rounded-full"
            style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: nn.pillBg, gap: 8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: nn.pillInk }}>{t('admin.buttons.start')}</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              {isRTL() ? <ArrowLeft size={14} color={nn.pillInk} strokeWidth={2} /> : <ArrowRight size={14} color={nn.pillInk} strokeWidth={2} />}
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}


// ── Bugünkü Görevler — koyu kart ──
const TASKS_SURFACE = '#3A4554';
/** Görev kartı satırı. `action` = satırın sağında küçük eylem kapsülü (Devam ettir,
 *  Hekimi bekliyor) — satıra dokunmak yine `onPress` (detaya git) yapar. */
type TaskItem = {
  icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void;
  action?: { label: string; tip: string; onPress: () => void };
};

function TasksCard({
  tasks,
}: {
  tasks: TaskItem[];
}) {
  const PB = usePanelBlue();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { t } = useTranslation();
  const doneCount = tasks.filter(task => task.done).length;
  return (
    <View style={{
      backgroundColor: isDark ? HERO_NAVY.from : TASKS_SURFACE,
      // @ts-ignore web gradient
      backgroundImage: isDark
        ? `linear-gradient(135deg, ${HERO_NAVY.from} 0%, ${HERO_NAVY.to} 100%)`
        : `linear-gradient(135deg, ${TASKS_SURFACE} 0%, ${DS.exec.primaryDeep}33 100%)`,
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
              {task.action ? (
                // Kart her iki temada koyu → kapsül beyaz-alfa zemin + beyaz metin
                <GlassTooltip title={task.action.label} text={task.action.tip}>
                  <Pressable
                    onPress={(e: any) => { e?.stopPropagation?.(); task.action!.onPress(); }}
                    accessibilityRole="button"
                    accessibilityLabel={task.action.label}
                    style={({ pressed }: any) => ({
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                      backgroundColor: pressed ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.10)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
                      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
                    })}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: '#FFF' }}>{task.action.label}</Text>
                  </Pressable>
                </GlassTooltip>
              ) : (
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: task.done ? PB : 'transparent',
                  borderWidth: task.done ? 0 : 1.5,
                  borderColor: task.done ? undefined : 'rgba(255,255,255,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {task.done && <Check size={10} color="#FFF" strokeWidth={2.5} />}
                </View>
              )}
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

  // Birim başına ayrı seçim: baskın birimden (genelde "üye") ilk 5, diğer
  // birimlerden en iyi 2'şer. Böylece çene/adet bazlı işler — gece plağı,
  // model baskısı — tek bir üyelik işin gölgesinde kaybolmaz.
  const byUnit = new Map<string, typeof data>();
  for (const d of data) {
    const u = serviceUnitLabel(d.unit);
    if (!byUnit.has(u)) byUnit.set(u, []);
    byUnit.get(u)!.push(d);
  }
  const unitsBySize = Array.from(byUnit.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([u]) => u);
  const rows = unitsBySize
    .flatMap((u, i) => (byUnit.get(u) ?? []).slice(0, i === 0 ? 5 : 2))
    .sort((a, b) => b.count - a.count)
    .slice(0, WORKTYPE_RAMP.length);
  // Yüzde her satırın KENDİ birimi içindeki payıdır (üye üyeye, çene çeneye);
  // farklı birimleri tek paydada toplamak anlamsızdı (48 üye / 342 "karışık").
  const shares = unitShares(data);
  const shareOf = (w: (typeof data)[number]) => shares[data.indexOf(w)] ?? 0;
  const live  = rows.filter(w => w.count > 0);
  // Şerit: her birim eşit pay alır, birimin içinde satırlar kendi payıyla bölünür.
  // Tek birim varken bu doğrudan satırın yüzdesidir.
  const liveUnits = new Set(live.map(w => serviceUnitLabel(w.unit))).size || 1;
  const zeros = rows.filter(w => w.count === 0).map(w => w.label);

  // Birim başına kırılım: "47 üye · 4 çene · 2 adet"
  const perUnit = new Map<string, number>();
  for (const w of data) {
    const u = serviceUnitLabel(w.unit);
    perUnit.set(u, (perUnit.get(u) ?? 0) + w.count);
  }
  const unitBreakdown = Array.from(perUnit.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([u, n]) => `${n} ${autoT(u)}`)   // birim tek başına çevrilmeli — birleşik dize sözlüğe takılmaz
    .join(' · ');
  return (
    <SpineCard
      title={t('admin.dashboard.workTypeDistribution')}
      // Başlıkta TEK toplam YOK — birimler toplanamaz.
      // Eskiden "87 Üye" yazıyordu ama o 87'nin içinde çene bazlı plaklar ve
      // adet bazlı model/tasarım işleri de diş sayılarak toplanmıştı.
      // Artık her birim kendi kırılımında: "47 üye · 4 çene · 2 adet".
      value={unitBreakdown}
      segments={live.map((w) => ({ color: WORKTYPE_RAMP[rows.indexOf(w)], pct: shareOf(w) / liveUnits }))}
      zeros={zeros}
    >
      {live.map(w => (
        <SpineRow
          key={w.label}
          color={WORKTYPE_RAMP[rows.indexOf(w)]}
          label={w.label}
          value={w.count}
          // Satırın kendi birimi — "13 üye", "4 çene", "2 adet".
          meta={`${serviceUnitLabel(w.unit)} · ${Math.round(shareOf(w) * 100)}%`}
        />
      ))}
    </SpineCard>
  );
}

// ── Finance Card ──
/** Üye Trendi alt notu: bu ayın çene/adet işleri (üye sayısına KATILMAZ). Yoksa ''. */
function extraUnitsNote(m?: { cene?: number; adet?: number }): string {
  const parts: string[] = [];
  if (m?.cene) parts.push(`${m.cene} ${autoT('çene')}`);
  if (m?.adet) parts.push(`${m.adet} ${autoT('adet')}`);
  return parts.length ? `${autoT('Bu ay ayrıca')} ${parts.join(' · ')}` : '';
}

function FinanceCard({ monthly, pending, paid }: { monthly: CurrencyTotal[]; pending: CurrencyTotal[]; paid: number }) {
  const { t } = useTranslation();
  const T = useMobileTokens();
  const baseCurrency = useBaseCurrency();

  /** Para satırı — katı per-currency: her dilim kendi biriminde, asla baz'a çevrilmez. */
  const ccyLine = (slicesRaw: CurrencyTotal[], size: number) => {
    const slices = Array.isArray(slicesRaw) ? slicesRaw : [];
    const st = { fontSize: size, fontWeight: '700' as const, color: T.ink, ...NUM };
    return slices.length === 0
      ? <Text style={st}>{formatMoney(0, baseCurrency, { fractionDigits: 0 })}</Text>
      : <View style={{ alignItems: 'flex-end' }}>{slices.map(s => (
          <Text key={s.currency} style={st} numberOfLines={1}>
            {formatMoney(s.total, s.currency, { fractionDigits: 0 })}
          </Text>
        ))}</View>;
  };

  // Tahsil oranı yalnız tek döviz varken hesaplanır; dövizler birbirine toplanmaz
  // (tek tanım 2026-10-26 — eskiden ₺0 + 615 € tek orana katılıyordu).
  const mArr = Array.isArray(monthly) ? monthly : [];
  const pArr = Array.isArray(pending) ? pending : [];
  const sameCcy      = new Set([...mArr, ...pArr].map(c => c.currency)).size <= 1;
  const totalMonthly = mArr.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const totalPending = pArr.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const grandTotal   = sameCcy ? totalMonthly + totalPending : 0;
  const collectRatio = grandTotal > 0 ? totalMonthly / grandTotal : 0;
  const collectPct   = Math.round(collectRatio * 100);
  const pctText      = (p: number) => (sameCcy ? `${p}%` : '—');

  return (
    <SpineCard
      title={t('admin.dashboard.financialSummary')}
      value={pctText(collectPct)}
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
        meta={pctText(collectPct)}
      />
      <SpineRow
        color={CLR.orange}
        label={t('admin.dashboard.pendingInvoice')}
        value={ccyLine(pending, 13)}
        meta={pctText(100 - collectPct)}
      />
      {/* Nokta yok — bu bir sayaç, spine'daki paya dahil değil. */}
      <SpineRow
        label={t('admin.dashboard.paidInvoiceCount')}
        value={<NumberTickerX value={paid} duration={700} style={{ fontSize: 13, fontWeight: '700', color: T.ink, ...NUM } as any} />}
      />
    </SpineCard>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const PB = usePanelBlue();
  // Tarama programı kartı görünürken alt satır bölünür (sol: hafta + görevler, sağ: takvim)
  const scanCard = useScanCardVisible().visible;
  const { t, i18n } = useTranslation();
  const router    = useRouter();
  const isDesktop = useIsDesktop();
  const insets    = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const firstName = displayFirstName(profile?.full_name);

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
  const [canSeeStaff, setCanSeeStaff]     = useState(false);
  const [todayDelivery, setTodayDelivery] = useState(cache?.todayDelivery ?? 0);
  const [byStatus, setByStatus]           = useState<{ label: string; count: number; key: string }[]>(cache?.byStatus ?? []);
  // `unit` = hizmetin sayım birimi (üye/çene/adet…). Kart satır başına bunu
  // gösteriyor; birimler toplanmadığı için tipte taşınması şart.
  const [byWorkType, setByWorkType]       = useState<{ label: string; count: number; unit?: string | null }[]>(cache?.byWorkType ?? []);
  const [monthly, setMonthly]             = useState<{ label: string; count: number; cene?: number; adet?: number }[]>(cache?.monthly ?? []);
  const [recentOrders, setRecentOrders]   = useState<any[]>(cache?.recentOrders ?? []);
  const [upcoming, setUpcoming]           = useState<any[]>(cache?.upcoming ?? []);
  const [hovered, setHovered]             = useState<string | null>(null);
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>(cache?.pipelineCounts ?? {});
  // Planlama bekleyen = status 'alindi' VE triaged_at NULL (planlanmamış). pipelineCounts['alindi']
  // planlanmışları da sayıyordu → planlanmış sipariş "planlamayı başlat" olarak kalıyordu.
  const [planningPending, setPlanningPending] = useState<number>(0);
  const [weekCounts, setWeekCounts]       = useState<Record<string, number>>(cache?.weekCounts ?? {});
  const [weekDone, setWeekDone]           = useState<Record<string, number>>(cache?.weekDone ?? {});
  const [weekExtra, setWeekExtra]         = useState<{ cene: number; adet: number }>({ cene: 0, adet: 0 });

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
  // Vadesi geçmiş alacak KLİNİK bazında (avans düşülmüş) — sabah "kime hatırlatayım" kararı.
  const { rows: overdueClinics, refetch: refetchOverdueClinics } = useOverdueClinics();
  // Finans özeti (tek tanım): bu ay tahsilat = makbuz günü + makbuzsuz ödeme; bekleyen =
  // lab alacağı (avans düşülmüş). İkisi de döviz başına, toplanmaz.
  const finToday = useLabToday();
  const { rows: finPeriodRows } = useFinancePeriod(`${finToday.slice(0, 8)}01`, finToday);
  const { rows: finRecvRows } = useLabReceivables();
  useEffect(() => {
    setFinMonthly(finPeriodRows.filter(r => r.collections !== 0)
      .map(r => ({ currency: r.currency as Currency, total: r.collections, count: 0 })));
  }, [finPeriodRows]);
  useEffect(() => {
    setFinPending(finRecvRows.filter(r => r.receivable !== 0)
      .map(r => ({ currency: r.currency as Currency, total: r.receivable, count: 0 })));
  }, [finRecvRows]);
  const loadUnbilled = useCallback(async () => {
    try {
      // Finans yetkisi yoksa fatura bağı RLS'te gizli: görünüm her teslimatı faturasız
      // gösterirdi. Kart boş kalır.
      const { data: canFin } = await supabase.rpc('lab_can_view_finance');
      if (canFin !== true) {
        setUnbilledCount(0); setUnbilledClinics(0); setUnbilledTotals({}); setUnbilledRows([]);
        return;
      }
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
  useEffect(() => { loadUnbilled(); }, [loadUnbilled]);

  // ── Data loaders (mirroring Lab dashboard pattern) ──

  // Tek tanım (2026-10-26): statü dağılımı, aktif, geciken, bugün gelen/teslim ve
  // "bu ay gelen" order_metrics()'ten. Burada yalnız planlama bekleyen sayılır.
  const { data: metrics, refetch: refetchMetrics } = useOrderMetrics();
  // Beklemedeki işler (madde 13): rozet sayısı order_metrics.on_hold'dan, satırlar
  // useHeldOrders'tan (aynı paylaşılan gerçek zamanlı kanal).
  const { rows: heldRows, refetch: refetchHeld } = useHeldOrders();
  const heldCount = metrics?.on_hold ?? heldRows.length;
  const [resumeTarget, setResumeTarget] = useState<HeldOrder | null>(null);
  const [awaitTarget, setAwaitTarget] = useState<any | null>(null);
  useEffect(() => {
    if (!metrics) return;
    const counts: Record<string, number> = {};
    STATUS_KEYS.forEach(k => { counts[k] = 0; });
    Object.entries(metrics.by_status).forEach(([st, n]) => {
      const b = STATUS_BUCKET[st];
      if (b) counts[b] += n;
    });
    setPipelineCounts(counts);
    setByStatus(STATUS_KEYS.map(k => ({ key: k, label: STATUS_CFG[k]?.labelKey ? t(STATUS_CFG[k].labelKey) : k, count: counts[k] })));
    setTotalOrders(metrics.created_this_month);
    setOverdue(metrics.overdue);
    setTodayDelivery(metrics.due_today);
    setTodayOrders(metrics.created_today);
  }, [metrics, t]);
  const totalActive = metrics?.active ?? cache?.totalActive ?? 0;

  const loadPipeline = useCallback(async () => {
    try {
      refetchMetrics();
      // Planlama bekleyen: yalnız triaged_at NULL olan 'alindi' siparişler (planlanmamış).
      const planRes = await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'alindi')
        .is('triaged_at', null)
        .or('is_archived.is.null,is_archived.eq.false');
      setPlanningPending(planRes.count ?? 0);
    } catch (e) { if ((e as any)?.code !== '42501') console.error('[AdminDashboard] loadPipeline error:', e); }
  }, [refetchMetrics]);

  const loadRecent = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_orders')
      // hold_status + revizyon alanları: durum etiketi ve vaka gruplaması için
      // gerekli (bu sorgu ikisini de seçmiyordu → revizyonlar köksüz görünüyordu)
      .select('id, order_number, work_type, status, hold_status, hold_category, is_archived, delivery_date, created_at, doctor_id, patient_name, revision_of_id, revision_no, continues_order_id')
      .order('created_at', { ascending: false })
      .limit(8);
    // 42501 = oturum kapandıktan sonra (anon) gelen "permission denied" — çıkışta
    // yarışan bu sorgu beklenen bir durum; gürültü yapmasın (dev LogBox'ta kırmızı kutu).
    if (error) { if ((error as any)?.code !== '42501') console.error('[AdminDashboard] loadRecent error:', error); return; }
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
      status: o.status, hold_status: o.hold_status ?? null, hold_category: o.hold_category ?? null,
      delivery_date: o.delivery_date, is_urgent: o.is_urgent ?? false,
      revision_of_id: o.revision_of_id ?? null,
      revision_no: o.revision_no ?? null,
      continues_order_id: o.continues_order_id ?? null,
      patient_name: o.patient_name ?? null,
      doctor_name: nameMap[o.doctor_id] ?? '--',
      clinic_logo_url: logoOf[clinicOf[o.doctor_id] ?? ''] ?? null,
      // "Hekimi bekliyor" penceresi: açılış günü tabanı + hekim/klinik bildirimi
      created_at: o.created_at ?? null,
      doctor_id: o.doctor_id ?? null,
      clinic_id: clinicOf[o.doctor_id] ?? null,
    })));
  }, []);

  const loadExtra = useCallback(async () => {
    const today = labTodayOf(cachedLabTz());
    // İlk kova ayın 1'inden başlar — eskiden "bugünden 5 ay geri" alınıyordu,
    // ilk ay yarım sayılıyordu (Haziran 36 yerine 8).
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // Sorgular paralel. Bugün gelen sayısı order_metrics()'ten.
    const [mainRes, upcomingRes, servicesRes] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id, work_type, status, delivery_date, created_at, tooth_numbers')
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false }),
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
      const monthBuckets: { y: number; m: number; count: number; cene: number; adet: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), count: 0, cene: 0, adet: 0 });
      }
      const wc: Record<string, number> = {};
      const wcDone: Record<string, number> = {};
      weekDays.forEach(wd => { wc[wd.date] = 0; wcDone[wd.date] = 0; });
      let weekCene = 0, weekAdet = 0;
      // Hizmet adı → birim eşlemi (küçük harf, kırpılmış). service_id üretimde
      // boş olduğu için isimle eşleşiyoruz (bkz. serviceUnits.ts notu).
      const unitByService = new Map<string, string | null>(
        (servicesRes.data ?? []).map((s: any) => [
          String(s.name ?? '').trim().toLocaleLowerCase('tr-TR'),
          s.unit ?? null,
        ]),
      );
      const wtMap: Record<string, { count: number; unit: string | null }> = {};

      for (const o of data) {
        const teeth = Array.isArray((o as any).tooth_numbers) ? (o as any).tooth_numbers.length : 0;
        const c = o.created_at ? new Date(o.created_at) : null;
        if (c && teeth > 0) {
          const y = c.getFullYear(), m = c.getMonth();
          // Üye Trendi işin KENDİ biriminde: çene/adet işleri ayrı sayaçta
          // (tek gece plağı 16 "üye" görünüyordu). İptaller sayılmaz.
          const oUnit = o.work_type ? resolveUnitForWorkType(String(o.work_type), unitByService) : null;
          const bucket = memberBucketOf(oUnit);
          if (o.status !== 'iptal') for (const mb of monthBuckets) {
            if (mb.y === y && mb.m === m) {
              if (bucket === 'uye') mb.count += teeth;
              else if (bucket === 'cene') mb.cene += serviceUnitQty(oUnit, o.tooth_numbers ?? []);
              else mb.adet += 1;
              break;
            }
          }
          // Haftalık şerit de aynı kural: yalnız üye birimli işler çubukta;
          // çene/adet işleri haftalık notta. İptaller sayılmaz.
          const isoDay = localISO(c);
          if (o.status !== 'iptal' && wc[isoDay] !== undefined) {
            if (bucket === 'uye') {
              wc[isoDay] += teeth;
              if (o.status === 'teslim_edildi') wcDone[isoDay] += teeth;
            } else if (bucket === 'cene') weekCene += serviceUnitQty(oUnit, o.tooth_numbers ?? []);
            else weekAdet += 1;
          }
        }
        // İptal edilen işler dağılımı şişirmesin (Üye Trendi ile aynı kural).
        if (o.work_type && teeth > 0 && o.status !== 'iptal') {
          // work_type diş başına tekrarlı olabilir ("X, X, X…") — tekilleştir
          // ve çekirdek ada indir: "X ( Sprint Ray )" ile eski "X" aynı satırda toplanır.
          const wt = workTypeGroupLabel(String(o.work_type));
          if (!wt) continue;
          // Miktar İŞİN KENDİ BİRİMİNDE. Eskiden burada koşulsuz `teeth`
          // toplanıyordu; gece plağı gibi ÇENE bazlı işler de diş sayıldığı için
          // tek plak 16 "üye" görünüp listenin başına geçiyordu.
          const unit = resolveUnitForWorkType(String(o.work_type), unitByService);
          wtMap[wt] = {
            count: (wtMap[wt]?.count ?? 0) + serviceUnitQty(unit, o.tooth_numbers ?? []),
            unit,
          };
        }
      }

      setMonthly(monthBuckets.map(b => ({ label: monthsShort[b.m], count: b.count, cene: b.cene, adet: b.adet })));
      setWeekCounts(wc);
      setWeekDone(wcDone);
      setWeekExtra({ cene: weekCene, adet: weekAdet });
      // slice YOK — seçimi kart yapar. Burada kesince farklı BİRİMLER aynı
      // sıralamada yarışıyordu: gece plağı "2 çene" ile 30/24/14 üyelik işlerin
      // altında kalıp listeye hiç giremiyordu (ve başlıktaki birim kırılımı da
      // zaten kesilmiş 5 satırdan hesaplandığı için "çene" hiç görünmüyordu).
      setByWorkType(
        Object.entries(wtMap)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([label, v]) => ({ label, count: v.count, unit: v.unit })),
      );
    }

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
    const [doctorRes, labRes, canView, canManage] = await Promise.all([
      // Hekimler `doctors` tablosunda (kliniklere bağlı) — profiles user_type='doctor'
      // sadece uygulamaya giriş yapan hekimleri sayıyordu, çoğu hekimi kaçırıyordu.
      // PASİF kayıtlar sayılmaz: işten ayrılmış hekim / kapatılmış lab kullanıcısı
      // sayaçta görünüyordu. is_active NULL olan ESKİ kayıtlar aktif sayılır —
      // aksi halde geçmiş veri sessizce sayıdan düşerdi.
      supabase.from('doctors').select('id', { count: 'exact', head: true })
        .or('is_active.is.null,is_active.eq.true'),
      // Tek tanım (2026-10-26): "Aktif personel" = Ekip'teki aktif personel kayıtları (employees),
      // giriş hesabı değil. Personeli görme yetkisi yoksa RLS yalnız kendi satırını verir → kart gizlenir.
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.rpc('has_permission', { p_key: 'view_employees' }),
      supabase.rpc('has_permission', { p_key: 'manage_employees' }),
    ]);
    setDoctors(doctorRes.count ?? 0);
    setLabUsers(labRes.count ?? 0);
    setCanSeeStaff(canView.data === true || canManage.data === true);
  }, []);

  const loadFinance = useCallback(async () => {
    try {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      // Bu ay tahsilat ve bekleyen tutar useFinancePeriod / useLabReceivables'tan
      // (tek tanım). Burada yalnız ödenen fatura adedi sayılır.
      const invRes = await supabase.from('invoices').select('status').eq('status', 'odendi').gte('created_at', monthStart.toISOString());
      if (invRes.data) setFinPaidCount(invRes.data.length);
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
        pipelineCounts, byStatus, totalOrders, totalActive,
        monthly, weekCounts, weekDone, byWorkType, overdue: overdueCount, todayDelivery, todayOrders,
        recentOrders, upcoming, totalDoctors, totalLabUsers, finMonthly, finPending, finPaidCount,
      });
    }, 200);
    return () => clearTimeout(t);
  }, [
    pipelineCounts, byStatus, totalOrders, totalActive, monthly, weekCounts, weekDone, byWorkType,
    overdueCount, todayDelivery, todayOrders, recentOrders, upcoming,
    totalDoctors, totalLabUsers, finMonthly, finPending, finPaidCount, setCache,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRecent(), loadPipeline(), loadExtra(), loadProfiles(), loadFinance(), refetchOverdueClinics(), refetchHeld()]);
    setRefreshing(false);
  };

  // Canlı: sipariş/aşama/profil değişiminde özet sayaçlarını debounce'lu tazele (spinner'sız).
  useRealtimeRefresh('admin_dashboard_rt', ['work_orders', 'order_stages', 'profiles'], () => {
    Promise.all([loadRecent(), loadPipeline(), loadExtra(), loadProfiles(), loadFinance()]);
  });

  const today = useLabToday();

  // Derived stats
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
  const taskItems: TaskItem[] = [];
  // UX: 1. satır = YAPILACAK İŞ (fiil önde), 2. satır = kararı veren bağlam.
  const taskNo = (no?: string | null) => (no ? `#${no}` : 'sipariş');
  const daysLate = (d?: string | null) => {
    if (!d) return null;
    const diff = Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000);
    return diff > 0 ? diff : null;
  };

  // Overdue orders as tasks
  // Tek tanım: iptal/arşiv/beklemedeki gecikmez (Geciken rozetiyle aynı kural).
  const overdueOrdersFromRecent = recentOrders.filter(o => isOverdueOrder(o as any, today));
  overdueOrdersFromRecent.slice(0, 2).forEach(o => {
    const late = daysLate(o.delivery_date);
    taskItems.push({
      icon: Clock as React.FC<any>,
      label: `${autoT('Gecikmiş teslimat')} · ${taskNo(o.order_number)}`,
      time: late ? `${late} ${autoT('gün gecikti')} · ${fmtDate(o.delivery_date)}` : fmtDate(o.delivery_date),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
      // Süre doldu ama iş hekimin onayını/parçasını bekliyor → tek dokunuşla beklemeye al.
      // created_at önbellekteki eski satırda yoksa (taze yükleme gelene kadar) gösterilmez.
      action: (o as any).created_at ? {
        label: autoT('Hekimi bekliyor'),
        tip: autoT('Gecikmiş işi beklemeye alır; hekim onayı ya da parça gelene kadar gecikme sayacı durur'),
        onPress: () => setAwaitTarget(o),
      } : undefined,
    });
  });

  // Uzun süredir beklemede → unutulmasın: kategori · no, kaç gündür (+ neden)
  const holdAgeOf = (r: HeldOrder) =>
    r.hold_started_at ? daysBetween(labTodayOf(cachedLabTz(), new Date(r.hold_started_at)), today) : 0;
  const longHolds = heldRows.filter(r => r.hold_started_at && isLongHold(holdAgeOf(r)));
  longHolds.slice(0, 2).forEach(r => {
    taskItems.push({
      icon: Pause as React.FC<any>,
      label: `${autoT(holdCategoryLabel(r.hold_category))} · ${taskNo(r.order_number)}`,
      time: [`${holdAgeOf(r)} ${autoT('gündür')}`, r.hold_reason?.trim() || null].filter(Boolean).join(' · '),
      done: false,
      onPress: () => router.push(`/(admin)/order/${r.id}` as any),
      action: {
        label: autoT('Devam ettir'),
        tip: autoT('Beklemeyi seçilen günde kapatır; hekim/klinik kaynaklıysa teslim tarihi ötelenir'),
        onPress: () => setResumeTarget(r),
      },
    });
  });
  if (longHolds.length > 2) {
    taskItems.push({
      icon: Pause as React.FC<any>,
      label: `+${longHolds.length - 2} ${autoT('bekleyen iş daha')}`,
      time: autoT('Beklemede'),
      done: false,
      onPress: () => router.push('/(admin)/orders?filter=hold' as any),
    });
  }
  const afterHoldChange = () => { refetchHeld(); refetchMetrics(); loadRecent(); };

  // Upcoming deliveries as tasks
  upcoming.slice(0, 2).forEach(o => {
    taskItems.push({
      icon: Package as React.FC<any>,
      label: `${autoT('Teslime hazırla')} · ${taskNo(o.order_number)}`,
      time: `${fmtDate(o.delivery_date)} ${autoT('teslim')}`,
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Today's orders as tasks
  const todayOrdersFromRecent = recentOrders.filter(o => o.delivery_date === today && o.status !== 'teslim_edildi');
  todayOrdersFromRecent.slice(0, 1).forEach(o => {
    taskItems.push({
      icon: Calendar as React.FC<any>,
      label: `${autoT('Bugün teslim et')} · ${taskNo(o.order_number)}`,
      time: o.patient_name ?? t('admin.dashboard.today'),
      done: false,
      onPress: () => router.push(`/(admin)/order/${o.id}` as any),
    });
  });

  // Teslim edildi ama faturası kesilmedi → sipariş detayında fatura kesilir
  unbilledRows.forEach((u: any) => {
    taskItems.push({
      icon: Receipt as React.FC<any>,
      label: `${autoT('Fatura kes')} · ${taskNo(u.order_number)}`,
      time: u.delivered_at
        ? `${fmtDate(String(u.delivered_at).slice(0, 10))} ${autoT('tarihinde teslim edildi')}`
        : 'Teslim edildi, faturası yok',
      done: false,
      onPress: () => router.push(`/(admin)/order/${u.work_order_id}` as any),
    });
  });

  // Vadesi geçmiş alacak → kime ödeme hatırlatılacak (klinik bazında, avans düşülmüş;
  // hatırlatmanın göndereceği tutarla aynı). En çok geciken 3 klinik.
  overdueClinics.slice(0, 3).forEach((c) => {
    taskItems.push({
      icon: Wallet as React.FC<any>,
      label: `${autoT('Ödeme hatırlat')} · ${c.clinic_name}`,
      time: overdueClinicLine(c),
      done: false,
      onPress: () => router.push(`/(admin)/statement/${c.clinic_id}` as any),
    });
  });
  // 3'ten fazlası gizlenmesin: kalanlar Cari listesinde (aynı tutar, aynı sıra).
  if (overdueClinics.length > 3) {
    taskItems.push({
      icon: Wallet as React.FC<any>,
      label: `+${overdueClinics.length - 3} ${autoT('klinik daha')}`,
      time: autoT('Cari Hesap'),
      done: false,
      onPress: () => router.push('/(admin)/finance?tab=clinic_balance' as any),
    });
  }

  if (lowStockCount > 0) {
    taskItems.push({
      icon: AlertTriangle as React.FC<any>,
      label: `${autoT('Stok siparişi ver')} · ${lowStockCount} ${autoT('kalem')}`,
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
      const remainLabel = days <= 0 ? 'Bugün' : days === 1 ? 'Yarın' : `${days}${autoT('g sonra')}`;
      return {
        id: String(o.order_number ?? o.id).slice(-6),
        _id: o.id,
        patient: o.patient_name ?? 'Hasta',
        workType: o.work_type ?? '—',
        remainLabel,
      };
    });

    const notifHeld = longHolds.slice(0, 5).map(r => ({
      id: String(r.order_number ?? r.id).slice(-6),
      _id: r.id,
      patient: r.patient_name ?? 'Hasta',
      days: holdAgeOf(r),
      subtitle: autoT(holdCategoryLabel(r.hold_category)),
    }));

    // Son Siparişler — mobil kart listesi (başlık = hekim adı; admin lab'ı yönetir)
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status, (o as any).hold_category);
      const isOverdue = isOverdueOrder(o, today);
      const drName = o.doctor_name || '—';
      const ptName = (o.patient_name && String(o.patient_name).trim()) ? String(o.patient_name).trim() : '';
      return {
        id: String(o.id),
        no: String(o.order_number ?? ''),
        title: ptName || drName,           // birincil: HASTA (yoksa hekim)
        subtitle: ptName ? drName : '',    // ikincil: HEKİM
        initials: initials(ptName || drName),
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
          liveTotal={pipeCount}
          liveDueToday={todayDelivery}
          // Aşamalar masaüstü CANLI kartıyla AYNI kaynaktan (pipelineCounts) — eskiden sabit 0/aktif/0/0 gidiyordu
          liveStages={{
            alindi: pipelineCounts['alindi'] ?? 0,
            uretim: pipelineCounts['uretimde'] ?? 0,
            kk:     pipelineCounts['kalite_kontrol'] ?? 0,
            hazir:  pipelineCounts['teslimata_hazir'] ?? 0,
          }}
          // Halka = masaüstü "Teslim Oranı" (teslim edilen / arşiv-iptal hariç tümü)
          liveDelivered={deliveredPipe}
          livePercent={deliveryPct}
          liveTimer={new Date().toLocaleTimeString(localeTag(i18n.language), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          monthlyRevenue={'—'}
          monthlyDelta={undefined}
          activeOrders={totalActive}
          productionCount={totalActive}
          overdueCount={overdueCount}
          heldCount={heldCount}
          pendingApprovalsCount={notifApprovals.length}
          memberTrend={monthly}
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
          held={notifHeld}
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PB} />}
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
              color: T.ink,
            }}>
              {t('dashboard.greetingName', { name: '' }).replace(/\s*\.?\s*$/, '')}{' '}
              <Text style={{ fontStyle: 'italic', color: T.ink3 }}>{firstName}</Text>
            </Text>

            {/* Stat pills row */}
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label={t('admin.dashboard.production')} value={`${productionPct}%`} bg={isDark ? 'rgba(255,255,255,0.14)' : INK} color={isDark ? (T.ink as string) : '#FFF'} />
              <GlassTooltip title={t('admin.dashboard.active')} text={autoT(METRIC_HINTS.active)}>
                <StatPill label={t('admin.dashboard.active')} value={totalActive} bg={PB} color="#FFF" />
              </GlassTooltip>
              <GlassTooltip title={t('admin.dashboard.newToday')} text={autoT(METRIC_HINTS.newToday)}>
                <StatPill label={t('admin.dashboard.newToday')} value={todayOrders} bg={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'} color={T.ink} />
              </GlassTooltip>
              {/* Geciken + planlanacak AYNI satırda: StatPill ile eşit ölçülü
                  rozetler. İkinci bir şerit yok; renk tek başına yeter. */}
              {overdueCount > 0 && (
                <GlassTooltip title={t('admin.dashboard.overdue')} text={autoT(METRIC_HINTS.overdue)}>
                  <AlertPillX
                    icon={AlertTriangle}
                    count={overdueCount}
                    label={t('admin.dashboard.overdue')}
                    color={CLR.red}
                    labelColor="#9C2E2E"
                    pulse
                    onPress={() => router.push('/(admin)/orders?filter=overdue' as any)}
                  />
                </GlassTooltip>
              )}
              {/* Beklemede: gecikme sayılmaz ama unutulmasın — Geciken ile aynı ölçü */}
              {heldCount > 0 && (
                <GlassTooltip title={autoT('Beklemede')} text={autoT(METRIC_HINTS.onHold)}>
                  <AlertPillX
                    icon={Pause}
                    count={heldCount}
                    label={autoT('Beklemede')}
                    color={DS.exec.warning}
                    labelColor={isDark ? '#F0C078' : '#9C5E0E'}
                    onPress={() => router.push('/(admin)/orders?filter=hold' as any)}
                  />
                </GlassTooltip>
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
              <FaceScanQuickAction accentColor={PB} compact />
            </View>

          </View>

          {/* Right: big stats — kart yok, aralarında yalnız saç teli ayraç.
              alignSelf: sol kolon daha uzun olduğunda KPI bloğu tepede kalıp
              altında boşluk bırakıyordu. */}
          <View className="flex-row" style={{ gap: 24, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            <GlassTooltip title={t('admin.dashboard.newThisMonth')} text={autoT(METRIC_HINTS.newThisMonth)}>
              <BigStat value={totalOrders} label={t('admin.dashboard.newThisMonth')} />
            </GlassTooltip>
            <StatDivider />
            <BigStat value={totalDoctors} label={t('admin.dashboard.doctor')} />
            <StatDivider />
            {canSeeStaff && (
              <GlassTooltip title={t('admin.dashboard.activeStaff')} text={autoT(METRIC_HINTS.activeStaff)}>
                <BigStat value={totalLabUsers} label={t('admin.dashboard.activeStaff')} />
              </GlassTooltip>
            )}
          </View>
        </View>
      </View>

      {/* ════════ 4-CARD GRID — eşit sütunlar; alt sıra aynı ızgarada hizalı (DashGrid) ════════ */}
      <DashRow gap={16} style={{ marginBottom: 16 }}>
        <DashHalf gap={16}>
        {/* Card 1: Aktif Vaka — dark top + white bottom + animations */}
        <DashCell>
        <AnimatedAktifVakaCard
          isDesktop={isDesktop}
          pipelineCounts={pipelineCounts}
          latestOrder={latestOrder}
          router={router}
        />
        </DashCell>

        {/* Card 2: Sipariş Trendi (bar chart) */}
        <DashCell>
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, marginBottom: isDesktop ? 0 : 16 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.015 * 18, color: T.ink }}>{t('admin.dashboard.memberTrend')}</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -0.025 * 42, lineHeight: 42, marginTop: 8, color: T.ink }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: T.ink3 }}> {t('admin.dashboard.membersThisMonth')}</Text>
              </Text>
              <Text style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>{t('admin.dashboard.toothMemberNote')}</Text>
              {!!extraUnitsNote(monthly[monthly.length - 1]) && (
                <Text style={{ fontSize: 11, color: T.ink2, fontWeight: '600', marginTop: 2 }}>{extraUnitsNote(monthly[monthly.length - 1])}</Text>
              )}
            </View>
            <Pressable
              onPress={() => router.push('/(admin)/work-stats' as any)}
              className="items-center justify-center rounded-full"
              style={{ width: 32, height: 32, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : DS.ink[100] }}
            >
              {isRTL() ? <ArrowUpLeft size={14} color={T.ink3} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={T.ink3} strokeWidth={1.8} />}
            </Pressable>
          </View>
          {monthly.length > 0 && (
            <View style={{ flex: 1, minHeight: 120 }}>
              <ProductionBarChart data={monthly} />
            </View>
          )}
        </Card>
        </DashCell>
        </DashHalf>

        <DashHalf gap={16}>
        {/* Card 3: Üretim Ring — PercentRingHero on white bg */}
        <DashCell>
        <Card style={{ flex: isDesktop ? 1 : undefined, padding: 22, alignItems: 'center', marginBottom: isDesktop ? 0 : 16 }}>
          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink }}>{t('admin.dashboard.deliveryRate')}</Text>
            <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
              {isRTL() ? <ArrowUpLeft size={14} color={T.ink3} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={T.ink3} strokeWidth={1.8} />}
            </Pressable>
          </View>
          {/* Halka → teslim edilen siparişler (tıklanan rakam kendi listesini açar) */}
          <Pressable
            onPress={() => router.push('/(admin)/orders?status=teslim_edildi' as any)}
            accessibilityRole="button"
            style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
          >
            <PercentRingHero value={deliveryPct} size={140} darkText />
          </Pressable>
          {/* Yüzde tek başına "neyin %11'i?" sorusunu bırakıyordu — payı/paydayı yaz. */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2, marginTop: 10 }}>
            {t('admin.dashboard.ordersOfTotal', { done: deliveredPipe, total: pipeCount })}
          </Text>
          <Text style={{ fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.08 * 9, marginTop: 3 }}>
            {t('admin.dashboard.deliveredAllTime')}
          </Text>
          {/* Mini pipeline stats */}
          <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
            <Pressable
              onPress={() => router.push('/(admin)/orders?status=uretimde' as any)}
              accessibilityRole="button"
              style={({ hovered, pressed }: any) => ({ alignItems: 'center', borderRadius: 999, opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}), paddingHorizontal: 10, paddingVertical: 4, backgroundColor: isDark ? (hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)') : (hovered ? DS.ink[200] : DS.ink[100]) })}
            >
              <Text style={{ fontSize: 10, fontWeight: '500', color: T.ink3 }}>
                {pipelineCounts['uretimde'] ?? 0} {t('admin.dashboard.inProduction')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(admin)/orders?status=teslimata_hazir' as any)}
              accessibilityRole="button"
              style={({ hovered, pressed }: any) => ({ alignItems: 'center', borderRadius: 999, opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}), paddingHorizontal: 10, paddingVertical: 4, backgroundColor: hexA(PB, hovered ? 0.25 : 0.15) })}
            >
              <Text style={{ fontSize: 10, fontWeight: '500', color: PB }}>
                {pipelineCounts['teslimata_hazir'] ?? 0} {t('admin.status.ready')}
              </Text>
            </Pressable>
          </View>
        </Card>
        </DashCell>

        {/* Card 4: Yeni Sipariş CTA — Hero */}
        <DashCell>
        <View style={{ flex: 1 }}>
          <AnimatedCTACard onPress={() => router.push('/(admin)/new-order' as any)} isDesktop={isDesktop} />
        </View>
        </DashCell>
        </DashHalf>
      </DashRow>

      {/* ════════ İKİNCİ SIRA — Bugünkü Görevler + tarama widget'ı (yarımlar).
          "Bu hafta" en altta, İş Tipi Dağılımı'nın yanında (kullanıcı isteği). ════════ */}
      <DashRow gap={16} style={{ marginBottom: 16 }}>
        <DashHalf gap={16}>
          <DashCell><TasksCard tasks={taskItems} /></DashCell>
        </DashHalf>
        {scanCard ? (
          <DashHalf gap={16}>
            <DashCell><ScanCalendarCard style={{ flex: 1 }} /></DashCell>
          </DashHalf>
        ) : null}
      </DashRow>

      {/* ════════ EXTRA SECTIONS (below fold) ════════ */}

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 80 }}>
          <ActivityIndicator color={PB} size="large" />
        </View>
      ) : (
        <>
          {/* Son Siparişler — Patterns table */}
          <Card style={{ marginBottom: 16 }}>
            {/* Kart başlığı — düz panel accent'i (navy). Metin luminance ile seçilir. */}
            <View className="flex-row items-center justify-between" style={{ padding: 20, backgroundColor: PB }}>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: onAccentInk(PB) }}>{t('admin.dashboard.recentOrders')}</Text>
              <Pressable onPress={() => router.push('/(admin)/orders' as any)}>
                <Text style={{ fontSize: 13, color: onAccentInk(PB), fontWeight: '700' }}>{t('admin.dashboard.viewAll')}</Text>
              </Pressable>
            </View>

            {/* Kolon şeridi — navy başlığın ALTINDA sakin ton kalır; iki accent
                bandı üst üste gelince tablo ağırlaşıyordu. */}
            <View
              className="flex-row items-center"
              style={{
                paddingHorizontal: 20, paddingVertical: 11,
                borderBottomWidth: 1, borderBottomColor: T.hairline,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : DS.ink[50],
              }}
            >
              <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.no')}</Text>
              <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.doctor')}</Text>
              {isDesktop && <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.workType')}</Text>}
              <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('admin.table.status')}</Text>
              {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'end' as any }}>{t('admin.table.delivery')}</Text>}
            </View>

            {recentOrders.length === 0
              ? <Text className="p-6 text-center" style={{ fontSize: 13, color: T.ink3 }}>{loading ? t('common.loading') : t('admin.dashboard.noOrders')}</Text>
              : recentRows.map((order: any, idx: number) => {
                  const overdue = isOverdueOrder(order as any, today);
                  const isLast  = idx === recentRows.length - 1;
                  return (
                    <Pressable
                      key={order.id}
                      className="flex-row items-center"
                      style={{
                        paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                        borderBottomWidth: !isLast ? 1 : 0,
                        borderBottomColor: T.hairline,
                        backgroundColor: overdue
                          ? 'rgba(217,75,75,0.06)'
                          : hovered === order.id
                            ? hexA(PB, 0.06)   // mercan yerine panel accent'i — tema dışı pembe kalkti
                            : undefined,
                      }}
                      onPress={() => router.push(`/(admin)/order/${order.id}` as any)}
                      // @ts-ignore web hover
                      onMouseEnter={() => setHovered(order.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {/* Vaka grubu: orijinal üstte, revizyonlar altında girintili
                          (siparişler sayfasıyla aynı dil) */}
                      <View className="flex-row items-center" style={{ flex: 1.2, minWidth: 0, gap: 6, paddingStart: (order as any).__revChild ? 14 : 0 }}>
                        {(order as any).__revChild && <CornerDownRight size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} style={{ flexShrink: 0 }} />}
                        <View style={{ minWidth: 0 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: PB }} numberOfLines={1}>#{order.order_number}</Text>
                          {(order as any).__revChild ? (
                            <Text style={{ fontSize: 8.5, fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E', letterSpacing: 0.4 }}>{(order as any).__continuation ? 'DEVAM' : 'REVİZYON'}</Text>
                          ) : (order as any).__revParent ? (
                            <Text style={{ fontSize: 8.5, fontWeight: '700', color: T.ink3, letterSpacing: 0.4 }}>ORİJİNAL</Text>
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
                            backgroundColor: (order as any).clinic_logo_url ? T.card : hexA(PB, 0.1),
                            borderWidth: 1, borderColor: (order as any).clinic_logo_url ? T.hairline : hexA(PB, 0.15) }}
                        >
                          {(order as any).clinic_logo_url ? (
                            <Image source={{ uri: (order as any).clinic_logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 9, fontWeight: '800', color: PB }}>{initials((order as any).patient_name || order.doctor_name)}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }} numberOfLines={1}>{(order as any).patient_name || order.doctor_name}</Text>
                          {(order as any).patient_name ? (
                            <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>{order.doctor_name}</Text>
                          ) : null}
                        </View>
                      </View>
                      {isDesktop && (
                        <Text style={{ flex: 2, fontSize: 11, color: T.ink3 }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E' }}>{(order as any).__continuation ? 'Devam - ' : 'Revizyon - '}</Text>
                    )}{order.work_type || '--'}</Text>
                      )}
                      <View style={{ flex: 1.4 }}>
                        <StatusBadge status={order.status} />
                      </View>
                      {isDesktop && (
                        <Text style={{
                          flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'end' as any,
                          color: overdue ? '#9C2E2E' : T.ink3,
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
                <Text style={{ fontSize: 12, color: T.ink2, marginTop: 2 }}>
                  <NumberTickerX value={unbilledCount} duration={600} style={{ fontWeight: '700', color: T.ink } as any} />
                  {` ${t('admin.dashboard.orders')}`}
                  <NumberTickerX value={unbilledClinics} duration={600} style={{ fontWeight: '700', color: T.ink } as any} />
                  {` ${t('admin.dashboard.clinicEstimated')}`}
                  <Text style={{ fontWeight: '700', color: T.ink }}>
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

          {/* Finans + Statü, altında İş Tipi + Bu hafta — aynı ızgara, sıra içinde eş boy */}
          <DashRow gap={16} style={{ marginBottom: 16 }}>
            <DashHalf gap={16}>
              <DashCell><FinanceCard monthly={finMonthly} pending={finPending} paid={finPaidCount} /></DashCell>
            </DashHalf>
            <DashHalf gap={16}>
              <DashCell><StatusDistCard byStatus={byStatus} /></DashCell>
            </DashHalf>
          </DashRow>
          <DashRow gap={16} style={{ marginBottom: 16 }}>
            {byWorkType.length > 0 ? (
              <DashHalf gap={16}>
                <DashCell><WorkTypeCard data={byWorkType} /></DashCell>
              </DashHalf>
            ) : null}
            <DashHalf gap={16}>
              <DashCell>
                <WeeklyStrip
                  weekDays={weekDays}
                  weekCounts={weekCounts}
                  weekDone={weekDone}
                  extra={weekExtra}
                  onPress={() => router.push('/(admin)/orders' as any)}
                />
              </DashCell>
            </DashHalf>
          </DashRow>
        </>
      )}

      <View style={{ height: 40 }} />

      {resumeTarget && (
        <ResumeOrderModal
          visible
          order={{
            id: resumeTarget.id,
            order_number: resumeTarget.order_number,
            created_at: resumeTarget.created_at,
            delivery_date: resumeTarget.delivery_date ?? '',
            hold_started_at: resumeTarget.hold_started_at ?? resumeTarget.created_at,
            hold_responsible: resumeTarget.hold_responsible,
            hold_category: resumeTarget.hold_category,
            hold_reason: resumeTarget.hold_reason,
          }}
          onClose={() => setResumeTarget(null)}
          onDone={() => { setResumeTarget(null); afterHoldChange(); }}
        />
      )}
      {awaitTarget && (
        <HoldOrderModal
          visible
          mode="awaitDoctor"
          order={{
            id: awaitTarget.id,
            order_number: awaitTarget.order_number ?? null,
            created_at: awaitTarget.created_at,
            doctor_id: awaitTarget.doctor_id ?? null,
            clinicId: awaitTarget.clinic_id ?? null,
          }}
          onClose={() => setAwaitTarget(null)}
          onDone={() => { setAwaitTarget(null); afterHoldChange(); }}
        />
      )}
    </ScrollView>
  );
}
