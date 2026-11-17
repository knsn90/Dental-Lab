import i18n, { localeTag, isRTL } from '../../../core/i18n';
import { HatchFill } from '../../../core/ui/HatchFill';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity,
  Calendar, TrendingUp, AlertTriangle, ArrowUpRight, ArrowUpLeft,
  ArrowRight, ArrowLeft, Check, Layers, CornerDownRight, CornerDownLeft,
  ChevronRight, ChevronLeft,
} from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { supabase } from '../../../core/api/supabase';
import { useOrders } from '../../orders/hooks/useOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { DS } from '../../../core/theme/dsTokens';
import { useNeonNavy } from '../../../core/ui/HeroGlow';
import { useInkUI } from '../../../core/theme/inkScale';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { NumberTickerX } from '../../../core/ui/NumberTickerX';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { FaceScanQuickAction } from '../../orders/components/FaceScanQuickAction';
import { PendingReviewsCard } from '../../reviews/components/PendingReviewsCard';
import { resolveOrderStatus, richOrderFields } from '../components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../orders/revisionGroups';
import { useRevisionParents } from '../../orders/hooks/useRevisionParents';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isOverdueOrder, isDueOn } from '../../../core/metrics/orderDefs';
import { DashRow, DashHalf, DashCell } from '../components/DashGrid';
import { LiveProductionCard } from '../../admin/components/AdminMobileDashboard';

// ── Display font — Patterns: Inter Tight Light (300) ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Theme: Doctor sage green (same as clinic) ──
const P     = DS.clinic.primary;      // #32BB78
const P_DEEP = DS.clinic.primaryDeep; // #0C8F56
const SURFACE_ALT = DS.clinic.surfaceAlt; // #2F313F
// INK artık tema-farkında: bileşenlerde `U.ink[900]` (useInkUI) kullanılıyor.
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
  teslimata_hazir: { label: 'Teslime Hazır',       color: '#1F6B47',   bg: 'rgba(45,154,107,0.12)' },
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




// ══════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const T = useMobileTokens();
  return (
    <View className="overflow-hidden"
      style={[{ backgroundColor: T.card, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: T.hairline }, style]}
    >{children}</View>
  );
}

function CardHeader({ title, right, display }: { title: string; right?: React.ReactNode; display?: boolean }) {
  const U = useInkUI();
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
      {display ? (
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>{title}</Text>
      ) : (
        <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500] }}>{title}</Text>
      )}
      {right}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const U = useInkUI();
  const c = STATUS_CFG[status] ?? { label: status, color: U.ink[500], bg: U.hairline };
  return (
    <View className="flex-row items-center self-start rounded-full"
      style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.bg, gap: 4 }}>
      <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

function StatPill({ label, value, bg, color }: { label: string; value: string | number; bg: string; color: string }) {
  const U = useInkUI();
  const isNum = typeof value === 'number';
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * 11 }}>{label}</Text>
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
  const U = useInkUI();
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 2, backgroundColor: U.fieldBorder }} />;
}

/** Admin Özet'teki müdahale sayılarıyla aynı: sayı sıfırdan büyükse tonlanır ve listeyi açar. */
function BigStat({ value, label, tone, onPress }: {
  value: string | number; label: string;
  tone?: 'danger' | 'info' | 'warning';
  onPress?: () => void;
}) {
  const U = useInkUI();
  const isNum = typeof value === 'number';
  const on = isNum && (value as number) > 0;
  const numStyle = { ...SERIF, fontSize: DS.size.h2, letterSpacing: -0.025 * DS.size.h2, lineHeight: DS.size.h2, color: on && tone ? U.chipTones[tone].fg : U.ink[900] };
  // Object style ZORUNLU (fonksiyon-stilli Pressable native'de stili düşürüyor)
  const Wrap: any = on && onPress ? Pressable : View;
  return (
    <Wrap
      {...(on && onPress ? { onPress, accessibilityRole: 'button' } : {})}
      accessibilityLabel={`${label}, ${value}`}
      style={{ alignItems: 'flex-end', ...(Platform.OS === 'web' && on && onPress ? ({ cursor: 'pointer' } as any) : {}) }}
    >
      {isNum
        ? <NumberTickerX value={value as number} duration={900} style={numStyle} />
        : <Text style={numStyle}>{value}</Text>}
      <Text style={{ fontSize: DS.size.micro, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>{label}</Text>
    </Wrap>
  );
}

// ── PercentRingHero ──

// ── Animated Aktif Vaka Card ──
// ── Canlı üretim — Admin Özet'teki LiveProductionCard'ın AYNISI (tek tanım) ──
// Renk panelden: useNeonNavy(P) açık temada düz zümrüt, koyuda derin ton + nabız.
function DoctorLiveProductionCard({ pipelineCounts, active, delivered, total, pct, router }: {
  pipelineCounts: Record<string, number>; active: number; delivered: number; total: number; pct: number; router: any;
}) {
  const nn = useNeonNavy(P);
  const go = (status: string) => () => router.push(`/(doctor)/orders?status=${status}` as any);
  return (
    <LiveProductionCard
      fill
      nn={nn}
      active={active}
      delivered={delivered}
      total={total}
      pct={pct}
      title={autoT('Canlı üretim')}
      activeLabel={autoT('Aktif sipariş')}
      rateLabel={autoT('Teslim Oranı')}
      onOpenAll={() => router.push('/(doctor)/orders' as any)}
      stages={[
        { key: 'alindi', label: autoT('Alındı'), n: pipelineCounts['alindi'] ?? 0, tone: 'strong', onPress: go('alindi') },
        { key: 'uretimde', label: autoT('Üretimde'), n: pipelineCounts['uretimde'] ?? 0, tone: 'mid', onPress: go('uretimde') },
        { key: 'kalite_kontrol', label: autoT('Kalite Kontrol'), n: pipelineCounts['kalite_kontrol'] ?? 0, tone: 'soft', onPress: go('kalite_kontrol') },
        { key: 'teslimata_hazir', label: autoT('Hazır'), n: pipelineCounts['teslimata_hazir'] ?? 0, tone: 'ready', onPress: go('teslimata_hazir') },
      ]}
    />
  );
}

// ── Production Bar Chart ──
// Admin panel ile aynı: hatched-rail pill kolonları (sage panel coral yerine sage)
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const U = useInkUI();
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
              {/* HER ayın değeri yazılır. Eskiden etiket yalnız EN YÜKSEK ayda vardı,
                  diğer aylar sayısız kalıyordu — kullanıcı "neden her ayın sayısı yok?"
                  diye sordu (18.09.2026). Lab panosundaki kalıpla aynı: sabit yükseklikli
                  etiket zonu, çubuğu itmez, tabanlar hizalı kalır. */}
              <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                {d.count > 0 ? (
                  isHighlight ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[100] }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: FILL_DARK }}>{d.count}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400] }}>{d.count}</Text>
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
                <HatchFill color={P} />
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
              color: isHighlight ? U.ink[900] : U.ink[400],
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
  const U = useInkUI();
  const totalReceived = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20;

  const FILL_LIGHT = `${P}55`; // sage soft
  const FILL_DARK  = P;
  // Rail + stripe panel temalı (sage)
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: U.ink[900] }}>Bu hafta</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: FILL_DARK }} />
          <Text style={{ fontSize: 11, color: U.ink[500] }}>Toplam {totalReceived}</Text>
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
                  <View style={{ marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[100] }}>
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
                  {/* Native: CSS gradyanı yok → SVG tarama */}
                  <HatchFill color={P} />
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
                color: day.isToday ? U.ink[900] : U.ink[400],
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

// ── Tasks Card (dark) ──
// Zemin SURFACE_ALT'ın (#2F313F) %10 beyazla karışmış hâli: yandaki kartlarla
// ağırlık yarışına girmesin diye açıldı. SURFACE_ALT'a dokunulmadı — o rengi
// AnimatedAktifVakaCard da kullanıyor.
const TASKS_SURFACE = '#444652';
function TasksCard({ tasks, max }: { tasks: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[]; max?: number }) {
  const doneCount = tasks.filter(t => t.done).length;
  // Admin Özet ile aynı: ilk N görev, fazlası "N görev daha" ile açılır
  const [showAll, setShowAll] = useState(false);
  const visible = max && !showAll ? tasks.slice(0, max) : tasks;
  const hiddenCount = tasks.length - visible.length;
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
        {visible.map((t, i) => {
          const IconComp = t.icon;
          return (
            <Pressable key={i} onPress={t.onPress} className="flex-row items-center" style={{
              gap: 10, paddingBottom: 10,
              borderBottomWidth: i < visible.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.08)',
            }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <IconComp size={14} color="#FFF" strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '500', color: '#FFF', lineHeight: 17, textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.4 : 1 }}>{t.label}</Text>
                {t.time ? <Text numberOfLines={1} style={{ fontSize: 11.5, lineHeight: 15, color: 'rgba(255,255,255,0.62)', marginTop: 1 }}>{t.time}</Text> : null}
              </View>
              {t.done ? (
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: P, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} color="#FFF" strokeWidth={2.5} />
                </View>
              ) : (
                // Boş daire onay kutusu sanılıyordu (admin kararı) → siparişi açtığını gösteren ok
                isRTL()
                  ? <ChevronLeft size={15} color="rgba(255,255,255,0.45)" strokeWidth={2} />
                  : <ChevronRight size={15} color="rgba(255,255,255,0.45)" strokeWidth={2} />
              )}
            </Pressable>
          );
        })}
        {(hiddenCount > 0 || (max && showAll && tasks.length > max)) ? (
          <Pressable
            onPress={() => setShowAll(v => !v)}
            accessibilityRole="button"
            style={{ paddingTop: 2, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: P }}>
              {hiddenCount > 0 ? `${hiddenCount} ${autoT('görev daha')}` : autoT('Daha az göster')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ══════════════════════════════════════════════════════════════════
export function DoctorDashboardScreen() {
  const U = useInkUI();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useOrders('doctor', profile?.id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769; // kabuk (PatternsShell) ile aynı eşik — 769–899 arası mobil özet kabuğun içinde kalıyordu
  const insets = useSafeAreaInsets();
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => { setTitle(getTodayLabel()); return clear; }, []);

  // "Dr." önekini önce sök — full_name genelde "Dr. Ahmet" biçiminde tutuluyor,
  // yoksa ilk kelime "Dr." çıkıp altta tekrar "Dr." eklenince "Dr. Dr." oluyordu.
  const stripDrRe = /^\s*(dr\.?|doktor|prof\.?\s*dr\.?|doç\.?\s*dr\.?)\s*\.?\s*/i;
  let cleanName = (profile?.full_name ?? '').trim();
  while (stripDrRe.test(cleanName)) cleanName = cleanName.replace(stripDrRe, '').trim();
  const firstName = displayFirstName(cleanName);
  // Tek tanım (2026-10-26): bugün lab gününde (isOrderOverdue de aynı saat dilimini kullanır).
  const today = useLabToday();

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

  // Bugün teslimi beklenen açık işler — Admin Özet'teki "Bugün çıkacak" ile aynı tanım
  const dueTodayCount = useMemo(() => orders.filter(o => isDueOn(o as any, today)).length, [orders, today]);


  // Tasks
  const taskItems: { icon: React.FC<any>; label: string; time: string; done: boolean; onPress?: () => void }[] = [];
  overdueList.slice(0, 3).forEach(o => {
    taskItems.push({ icon: Clock as React.FC<any>, label: `${o.patient_name ?? o.work_type ?? autoT('Sipariş')} · ${autoT('gecikmiş')}`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(doctor)/order/${o.id}` as any) });
  });
  upcoming.slice(0, 3).forEach(o => {
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

    // Live stages — hekim için "alındı / üretim / KK / hazır" sayımı.
    // pipelineCounts yalnız STATUS_KEYS'i sayar; eskiden burada olmayan anahtarlar
    // ('hazir', 'kargoda') okunuyordu → "Hazır" hep 0 görünüyordu (2026-11-17).
    const stageCounts = {
      alindi: pipelineCounts['alindi'] ?? 0,
      uretim: pipelineCounts['uretimde'] ?? 0,
      kk:     pipelineCounts['kalite_kontrol'] ?? 0,
      hazir:  pipelineCounts['teslimata_hazir'] ?? 0,
    };

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

    // Son Siparişler — mobil kart listesi (başlık = hasta adı; hekim siparişi verir)
    const toRecentItem = (o: any) => {
      const st = resolveOrderStatus(o.status, o.hold_status, (o as any).hold_category);
      const isOverdue = isOverdueOrder(o, today);
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
        ...richOrderFields(o, today, isOverdue),
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
          // Canlı kart masaüstüyle AYNI tanım: teslim edilen / tüm siparişler (pipeline)
          liveActive={active}
          liveTotal={pipeCount}
          liveDelivered={deliveredPipe}
          liveStages={stageCounts}
          livePercent={deliveryPct}
          liveDueToday={dueTodayCount}
          overdueCount={overdueCount}
          // Yalnız tasarım onayları (bildirim toplamı değil)
          pendingApprovalsCount={pendingApprovals.length}
          orderTrend={monthly}
          onApprovals={() => {
            if (pendingApprovals.length === 1) router.push(`/doctor-approval/${pendingApprovals[0].token}` as any);
            else router.push('/(doctor)/approvals' as any);
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
              lineHeight: isDesktop ? 32 : 28, color: U.ink[900],
            }}>
              Merhaba{firstName ? ',' : ''}{' '}
              <Text style={{ fontStyle: 'italic', color: U.ink[400] }}>{firstName ? `${autoT('Dt.')} ${firstName}` : autoT('Dt.')}</Text>
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 12 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={U.ink[900]} color={U.onDarkPill} />
              <StatPill label="Aktif" value={active} bg={P} color="#FFF" />
              <StatPill label="Bu ay" value={thisMonthNew} bg={U.chipNeutral} color={U.ink[900]} />
              {/* Geciken + değerlendirilecek AYNI satırda: StatPill ile eşit
                  ölçülü rozetler. İkinci bir şerit yok; renk tek başına yeter. */}
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
            {/* Müdahale sayıları (Admin Özet ile aynı dil): sıfırdan büyükse tonlanır ve listeyi açar */}
            <BigStat value={overdueCount} label={autoT('Geciken')} tone="danger"
              onPress={() => router.push('/(doctor)/orders?filter=overdue' as any)} />
            <StatDivider />
            <BigStat value={dueTodayCount} label={autoT('Bugün çıkacak')} tone="info"
              onPress={() => router.push('/(doctor)/orders?filter=today' as any)} />
            <StatDivider />
            <BigStat value={pendingApprovals.length} label={autoT('Onay bekleyen')} tone="warning"
              onPress={() => {
                if (pendingApprovals.length === 1) router.push(`/doctor-approval/${pendingApprovals[0].token}` as any);
                else router.push('/(doctor)/approvals' as any);
              }} />
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
            // Mor yerine panelin kendi rengi (zümrüt 600) — renk panelden gelir
            backgroundColor: P_DEEP, borderRadius: DS.radius.xl,
            padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
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

      {/* ════════ BİRİNCİ SIRA — Admin Özet düzeni (2026-11-17): bugünkü işler ·
          sipariş trendi | canlı üretim · bu hafta. Teslim oranı halkası ve "Yeni sipariş"
          kartı kaldırıldı (admin'de de kalktı); teslim oranı Canlı kartın altında,
          yeni sipariş "+" düğmesinde. ════════ */}
      <DashRow gap={16} style={{ marginBottom: 16 }}>
        <DashHalf gap={16}>
          <DashCell motion={0}><TasksCard tasks={taskItems} max={3} /></DashCell>
          <DashCell motion={1}>
        <Card style={{ flex: 1, padding: 22 }}>
          <View className="flex-row items-start justify-between" style={{ marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.27, color: U.ink[900] }}>Sipariş Trendi</Text>
              <Text style={{ ...SERIF, fontSize: 42, letterSpacing: -1.05, lineHeight: 42, marginTop: 8, color: U.ink[900] }}>
                {monthly[monthly.length - 1]?.count ?? 0}
                <Text style={{ fontSize: 14, color: U.ink[400] }}> bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 4 }}>Son 6 aylık trend</Text>
            </View>
            <Pressable onPress={() => router.push('/(doctor)/orders' as any)} className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: U.ink[100] }}>
              {isRTL() ? <ArrowUpLeft size={14} color={U.ink[500]} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={U.ink[500]} strokeWidth={1.8} />}
            </Pressable>
          </View>
          {monthly.length > 0 && <View style={{ flex: 1, minHeight: 120 }}><ProductionBarChart data={monthly} /></View>}
        </Card>
          </DashCell>
        </DashHalf>
        <DashHalf gap={16}>
          <DashCell motion={2}>
            <DoctorLiveProductionCard pipelineCounts={pipelineCounts} active={active} delivered={deliveredPipe} total={pipeCount} pct={deliveryPct} router={router} />
          </DashCell>
          <DashCell motion={3}>
            <WeeklyStrip weekDays={weekDays} weekCounts={weekCounts} onPress={() => router.push('/(doctor)/orders' as any)} />
          </DashCell>
        </DashHalf>
      </DashRow>

      {/* ════════ ORDERS TABLE ════════ */}
      <Card style={{ marginBottom: 16 }}>
        {/* Sade başlık (Admin Özet ile aynı): dolgulu bant tablo verisiyle yarışıyordu */}
        <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 }}>
          <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Son Siparişler</Text>
          <Pressable onPress={() => router.push('/(doctor)/orders' as any)}>
            <Text style={{ fontSize: 13, color: U.isDark ? P : P_DEEP, fontWeight: '700' }}>Tümünü Gör →</Text>
          </Pressable>
        </View>
        <View className="flex-row items-center" style={{ paddingHorizontal: 20, paddingVertical: 11, borderTopWidth: 1, borderTopColor: U.hairlineSoft, borderBottomWidth: 1, borderBottomColor: U.hairlineSoft, backgroundColor: U.ink[50] }}>
          <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '600', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>No</Text>
          <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Hasta</Text>
          {isDesktop && <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>İş Tipi</Text>}
          <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Durum</Text>
          {isDesktop && <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'end' as any }}>Teslim</Text>}
        </View>
        {recentOrders.length === 0
          ? <Text className="p-6 text-center" style={{ fontSize: 13, color: U.ink[400] }}>Yükleniyor...</Text>
          : recentRows.map((order: any, idx: number) => {
              const overdue = isOverdueOrder(order as any, today);
              const isLast = idx === recentRows.length - 1;
              return (
                <Pressable key={order.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: U.hairlineSoft,
                  backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : undefined,
                }} onPress={() => router.push(`/(doctor)/order/${order.id}` as any)}>
                  {/* Vaka grubu: eski üyeler anchor'ın altında girintili */}
                  <View style={{ flex: 1.2, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingStart: order.__revChild ? 14 : 0 }}>
                    {order.__revChild && (isRTL()
                      ? <CornerDownLeft size={12} color={(order as any).__continuation ? (U.isDark ? '#93C5FD' : '#3563A8') : (U.isDark ? '#F5C77A' : '#9C5E0E')} strokeWidth={2} style={{ flexShrink: 0 }} />
                      : <CornerDownRight size={12} color={(order as any).__continuation ? (U.isDark ? '#93C5FD' : '#3563A8') : (U.isDark ? '#F5C77A' : '#9C5E0E')} strokeWidth={2} style={{ flexShrink: 0 }} />)}
                    <Text style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800', color: P, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>#{order.order_number}</Text>
                  </View>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(order.patient_name)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{order.patient_name || '—'}</Text>
                  </View>
                  {isDesktop && <Text style={{ flex: 2, fontSize: 11, color: U.ink[500], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? (U.isDark ? '#93C5FD' : '#3563A8') : (U.isDark ? '#F5C77A' : '#9C5E0E') }}>{`${(order as any).__continuation ? autoT('Devam') : autoT('Revizyon')} - `}</Text>
                    )}{order.work_type || '--'}</Text>}
                  <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                  {isDesktop && <Text style={{ flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'end' as any, color: overdue ? '#9C2E2E' : U.ink[400] }}>{fmtDate(order.delivery_date)}</Text>}
                </Pressable>
              );
            })
        }
      </Card>

      {/* ════════ ALT SIRA — Statü · İş tipi (ortak ızgara, eşit yarımlar) ════════ */}
      {(byStatus.length > 0 || byWorkType.length > 0) && (
        <DashRow gap={16} style={{ marginBottom: 16 }}>
          <DashHalf gap={16}>
            <DashCell motion={0}>
          <Card style={{ flex: 1, padding: 22 }}>
            <CardHeader title="Statü Dağılımı" display />
            <View style={{ gap: 12 }}>
              {byStatus.map(item => {
                const pct = Math.round((item.count / (total || 1)) * 100);
                const cfg = STATUS_CFG[item.key];
                return (
                  <View key={item.key}>
                    <View className="flex-row items-center" style={{ marginBottom: 5 }}>
                      <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: cfg?.color ?? U.ink[900], marginEnd: 8 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: U.ink[500], fontWeight: '500' }}>{item.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[900] }}>{item.count}</Text>
                      <Text style={{ fontSize: 10, color: U.ink[400], marginStart: 6, width: 28, textAlign: 'end' as any }}>{pct}%</Text>
                    </View>
                    <View className="rounded overflow-hidden" style={{ height: 4, backgroundColor: U.ink[100] }}>
                      <View className="rounded" style={{ height: 4, backgroundColor: cfg?.color ?? U.ink[900], width: `${pct}%` as any }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
            </DashCell>
          </DashHalf>
          <DashHalf gap={16}>
            {byWorkType.length > 0 ? (
              <DashCell motion={1}>
            <Card style={{ flex: 1, padding: 22 }}>
              <CardHeader title="İş Tipi Dağılımı" display />
              <View style={{ gap: 10 }}>
                {byWorkType.map((w, i) => {
                  const max = Math.max(...byWorkType.map(d => d.count), 1);
                  const palette = [P, CLR.blue, CLR.purple, CLR.teal, CLR.orange];
                  return (
                    <View key={i}>
                      <View className="flex-row items-center" style={{ marginBottom: 5 }}>
                        <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: palette[i], marginEnd: 8 }} />
                        <Text style={{ flex: 1, fontSize: 11, color: U.ink[900], fontWeight: '500', textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{w.label}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[500] }}>{w.count}</Text>
                      </View>
                      <View className="rounded overflow-hidden" style={{ height: 3, backgroundColor: U.ink[100] }}>
                        <View className="rounded" style={{ height: 3, backgroundColor: palette[i], width: `${Math.round((w.count / max) * 100)}%` as any, opacity: 0.7 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
              </DashCell>
            ) : null}
          </DashHalf>
        </DashRow>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
