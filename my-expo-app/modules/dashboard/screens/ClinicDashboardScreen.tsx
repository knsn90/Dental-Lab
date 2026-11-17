/**
 * ClinicDashboardScreen — Patterns design language (matching Lab/Admin layout)
 *
 * Layout:
 *   Admin Özet düzeni (2026-11-17):
 *   1. Hero — selamlama + pill'ler + müdahale sayıları (Geciken · Bugün çıkacak · Onay bekleyen)
 *   2. Bugünkü işler · Sipariş trendi | Canlı üretim · Mali durum
 *   3. Son siparişler
 *   4. Hekim performansı · Bu hafta
 *
 * Theme: DS.clinic (Zümrüt #32BB78)
 * Patterns NativeWind — NO StyleSheet.create().
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { weekdayOffset, fmtWeekdayDayMonth } from '../../../core/i18n';
import {
  View, Text, ScrollView, Pressable, Platform,
  useWindowDimensions, RefreshControl,
  StyleSheet,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Package, Plus, Clock, CheckCircle, Activity, Users,
  Calendar, TrendingUp, AlertTriangle, ArrowUpRight, ArrowUpLeft,
  ArrowRight, ArrowLeft, Check, Layers, CornerDownRight, CornerDownLeft,
  ChevronRight, ChevronLeft,
} from '../../../core/ui/icons';
import i18n, { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useAuthStore } from '../../../core/store/authStore';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { useClinicOrders } from '../../clinic/hooks/useClinicOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../../orders/constants';
import { WorkOrderStatus } from '../../../lib/types';
import { DS } from '../../../core/theme/dsTokens';
import { useNeonNavy } from '../../../core/ui/HeroGlow';
import { useInkUI } from '../../../core/theme/inkScale';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { FaceScanQuickAction } from '../../orders/components/FaceScanQuickAction';
import { titleCaseTR } from '../../../core/utils/textCase';
import { PendingReviewsCard } from '../../reviews/components/PendingReviewsCard';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { shortClinicName } from '../../../core/utils/clinicName';
import { fetchClinicBalances } from '../../invoices/api';
import { useClinicBillingAccess } from '../../clinic/useClinicBillingAccess';
import type { ClinicBalance } from '../../invoices/types';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { rateToBase } from '../../../core/money/rateCache';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { resolveOrderStatus, richOrderFields } from '../components/RecentOrdersMobile';
import { mapRevisionCases, flattenRevisionCases } from '../../orders/revisionGroups';
import { useRevisionParents } from '../../orders/hooks/useRevisionParents';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isDueOn } from '../../../core/metrics/orderDefs';
import { DashRow, DashHalf, DashCell } from '../components/DashGrid';
import { LiveProductionCard } from '../../admin/components/AdminMobileDashboard';

// ── Display font ──
const SERIF = {
  fontFamily: DS.font.display as string,
  fontWeight: '300' as const,
};

// ── Theme: Clinic sage green ──
const P     = DS.clinic.primary;     // #32BB78
const P_DEEP = DS.clinic.primaryDeep; // #0C8F56
const SURFACE_ALT = DS.clinic.surfaceAlt; // #2F313F
// INK artık tema-farkında: bileşenlerde `U.ink[900]` (useInkUI) kullanılıyor.
const INK   = DS.ink[900];


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
/** RTL'de "ileri" oku sola bakar. */


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

function StatPill({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  const U = useInkUI();
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.66 }}>{label}</Text>
      <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
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
      <Text style={numStyle}>{value}</Text>
      <Text style={{ fontSize: DS.size.micro, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.06 * DS.size.micro, marginTop: 4 }}>{label}</Text>
    </Wrap>
  );
}


// ── Canlı üretim — Admin Özet'teki LiveProductionCard'ın AYNISI (tek tanım) ──
// Renk panelden: useNeonNavy(P) açık temada düz zümrüt, koyuda derin ton + nabız.
function ClinicLiveProductionCard({ pipelineCounts, active, delivered, total, pct, router }: {
  pipelineCounts: Record<string, number>; active: number; delivered: number; total: number; pct: number; router: any;
}) {
  const nn = useNeonNavy(P);
  const go = (status: string) => () => router.push(`/(clinic)/orders?status=${status}` as any);
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
      onOpenAll={() => router.push('/(clinic)/orders' as any)}
      stages={[
        { key: 'alindi', label: autoT('Alındı'), n: pipelineCounts['alindi'] ?? 0, tone: 'strong', onPress: go('alindi') },
        { key: 'uretimde', label: autoT('Üretimde'), n: pipelineCounts['uretimde'] ?? 0, tone: 'mid', onPress: go('uretimde') },
        { key: 'kalite_kontrol', label: autoT('Kalite Kontrol'), n: pipelineCounts['kalite_kontrol'] ?? 0, tone: 'soft', onPress: go('kalite_kontrol') },
        { key: 'teslimata_hazir', label: autoT('Hazır'), n: pipelineCounts['teslimata_hazir'] ?? 0, tone: 'ready', onPress: go('teslimata_hazir') },
      ]}
    />
  );
}

// ── Üretim Süresi Bar Chart (admin paneli ile aynı pill design) ──
function ProductionBarChart({ data }: { data: { label: string; count: number }[] }) {
  const U = useInkUI();
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
                  // @ts-ignore web
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

// ── Weekly Calendar Strip (admin paneli ile aynı: hatched pill + alınan/tamamlanan overlay) ──
function WeeklyStrip({ weekDays, weekCounts, weekDone, onPress }: {
  weekDays: { label: string; date: string; isToday: boolean; dow: number }[];
  weekCounts: Record<string, number>;
  weekDone: Record<string, number>;
  onPress: () => void;
}) {
  const U = useInkUI();
  const totalReceived  = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const totalCompleted = Object.values(weekDone).reduce((a, b) => a + b, 0);
  const SCALE_MAX = 20;

  const SAGE_LIGHT = `${P}55`;
  const SAGE_DARK  = P;
  const RAIL_BG    = `${P}08`;
  const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P}14 0 6px, transparent 6px 12px)`;

  return (
    <Card style={{ padding: 18, flex: 1 }}>
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: U.ink[900] }}>Bu hafta</Text>
        <View style={{ flex: 1 }} />
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_LIGHT }} />
            <Text style={{ fontSize: 11, color: U.ink[500] }}>Alınan {totalReceived} iş</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SAGE_DARK }} />
            <Text style={{ fontSize: 11, color: U.ink[500] }}>Teslim edilen {totalCompleted} iş</Text>
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
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[100] }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE_DARK }}>{ratio}%</Text>
                    </View>
                  ) : !empty ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: day.isToday ? U.ink[900] : U.ink[500] }}>
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
                  {/* Native: CSS gradyanı yok → SVG tarama */}
                  <HatchFill color={P} />
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
  const U = useInkUI();
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
          <Text style={{ ...SERIF, fontSize: 26, letterSpacing: -0.5, color: U.ink[900] }}>
            Statü Dağılımı
          </Text>
          <Text style={{ fontSize: 13, color: U.ink[500], marginTop: 3 }}>
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
              <Text style={{ ...SERIF, fontSize: 40, letterSpacing: -1, lineHeight: 44, color: U.ink[900] }}>{total}</Text>
              <Text style={{ fontSize: 12, color: U.ink[500], marginTop: -2 }}>Toplam</Text>
            </View>
          </View>

          {top && top.count > 0 && (
            <View
              className="rounded-2xl"
              style={{ marginTop: 16, backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline, padding: 14 }}
            >
              <Text style={{ fontSize: 11, color: U.ink[500] }}>En yüksek oran</Text>
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
              style={{ borderWidth: 1, borderColor: U.hairline, padding: 14, backgroundColor: U.surface }}
            >
              <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: U.ink[800] }} numberOfLines={1}>{item.label}</Text>
                <View className="flex-row items-center" style={{ gap: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: U.ink[900] }}>{item.count}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F6B47', width: 38, textAlign: 'end' as any }}>%{item.pct}</Text>
                </View>
              </View>
              <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: U.ink[100] }}>
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
  const U = useInkUI();
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
      <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
        <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Mali Durum</Text>
        <Pressable onPress={onPress}>
          <Text style={{ fontSize: 13, color: P, fontWeight: '700' }}>Finans →</Text>
        </Pressable>
      </View>

      <View style={{ padding: 20, gap: 16 }}>
        {/* Bakiye hero */}
        <View>
          <Text style={{ fontSize: 11, color: U.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>
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
            <View className="flex-row" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: U.ink[100] }}>
              {ag.map(a => a.v > 0 ? <View key={a.k} style={{ flex: a.v / agTotal, backgroundColor: a.c }} /> : null)}
            </View>
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {ag.filter(a => a.v > 0).map(a => (
                <View key={a.k} className="flex-row items-center" style={{ gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: a.c }} />
                  <Text style={{ fontSize: 10, color: U.ink[500] }}>{a.k}: {own(a.v)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Kesilen / Ödenen */}
        <View className="flex-row" style={{ gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: U.ink[50], borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 10, color: U.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Kesilen</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: U.ink[900], marginTop: 3 }}>{own(billed, fin?.total_billed_original)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: hexA(P, 0.08), borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 10, color: U.ink[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Tahsil Edilen</Text>
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
  const U = useInkUI();
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

  const firstName = displayFirstName(profile?.full_name);
  const clinicName = shortClinicName(profile?.clinic_name) || 'Kliniğiniz';
  // Mali durum (cari hesap) — RLS kliniği kendi satırına kısıtlar. Faturayı görme yetkisi yoksa
  // (my_clinic_billing_access) kart hiç çizilmez: RLS'li sıfır bakiye yanıltıcı olurdu.
  const billingAccess = useClinicBillingAccess();
  const [finance, setFinance] = useState<ClinicBalance | null>(null);
  useEffect(() => {
    if (billingAccess !== true) { setFinance(null); return; }
    let alive = true;
    (async () => {
      const { data } = await fetchClinicBalances();
      if (alive) setFinance((data ?? [])[0] ?? null);
    })();
    return () => { alive = false; };
  }, [billingAccess]);
  // Tek tanım (2026-10-26): bugün lab gününde (isOrderOverdue de aynı saat dilimini kullanır).
  const today = useLabToday();

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

  // Bugün teslimi beklenen açık işler — Admin Özet'teki "Bugün çıkacak" ile aynı tanım
  const dueTodayCount = useMemo(() => orders.filter(o => isDueOn(o as any, today)).length, [orders, today]);
  // Hekim tasarım onayı bekleyen siparişler. Eskiden 'onay_bekliyor' statüsü aranıyordu;
  // böyle bir statü yok → sayı hep 0'dı (2026-11-17). Kaynak hekim panelindekiyle aynı.
  const pendingApprovals = useMemo(
    () => orders.filter(o => (o as any).doctor_approval_status === 'pending' && (o as any).status !== 'iptal'),
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
      bars.push({ label: monthLabel(m), count: memberCount });
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
  overdueList.slice(0, 3).forEach(o => {
    const drName = (o as any).doctor_profile?.full_name ?? 'Sipariş';
    taskItems.push({ icon: Clock as React.FC<any>, label: `${drName} · ${autoT('gecikmiş')}`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(clinic)/order/${o.id}` as any) });
  });
  upcoming.slice(0, 3).forEach(o => {
    const drName = (o as any).doctor_profile?.full_name ?? 'Sipariş';
    taskItems.push({ icon: Package as React.FC<any>, label: `${drName} · ${autoT('teslim')}`, time: fmtDate(o.delivery_date), done: false, onPress: () => router.push(`/(clinic)/order/${o.id}` as any) });
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

    // Canlı kart aşamaları — pipelineCounts zaten asamada→uretimde, kargoda→hazır katlar;
    // burada olmayan anahtarlar ('onay_bekliyor', 'asamada', 'kargoda') okunmaz.
    const stageCounts = {
      alindi: pipelineCounts['alindi'] ?? 0,
      uretim: pipelineCounts['uretimde'] ?? 0,
      kk:     pipelineCounts['kalite_kontrol'] ?? 0,
      hazir:  pipelineCounts['teslimata_hazir'] ?? 0,
    };

    // Notifications
    const notifApprovals = pendingApprovals.slice(0, 5).map((o: any) => ({
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
      const st = resolveOrderStatus(o.status, o.hold_status, (o as any).hold_category);
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
        ...richOrderFields(o, today, isOverdue),
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
          // Canlı kart masaüstüyle AYNI tanım: teslim edilen / tüm siparişler (pipeline)
          liveActive={activeCount}
          liveTotal={pipeCount}
          liveDelivered={deliveredPipe}
          liveStages={stageCounts}
          livePercent={deliveryPct}
          liveDueToday={dueTodayCount}
          overdueCount={overdueCount}
          pendingApprovalsCount={pendingApprovals.length}
          orderTrend={monthly}
          onApprovals={() => router.push('/(clinic)/approvals' as any)}
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
              lineHeight: isDesktop ? 32 : 28, color: U.ink[900],
            }}>
              Merhaba,{' '}
              <Text style={{ fontStyle: 'italic', color: U.ink[400] }}>{clinicName}</Text>
            </Text>
            <Text style={{ fontSize: 14, color: U.ink[500], marginTop: 4 }}>
              Yetkili: <Text style={{ fontWeight: '600', color: U.ink[700] }}>{profile?.full_name ?? firstName}</Text>
            </Text>
            <View className="flex-row flex-wrap items-center" style={{ gap: 14, marginTop: 14 }}>
              <StatPill label="Üretim" value={`${productionPct}%`} bg={U.ink[900]} color={U.onDarkPill} />
              <StatPill label="Aktif" value={`${activeCount}`} bg={P} color="#FFF" />
              {/* "Geciken" burada yok — aşağıdaki kırmızı aksiyon pill'i aynı sayıyı
                  hem söylüyor hem tıklanabilir yapıyor; iki kez yazmak gürültü. */}
              <StatPill label="Bu ay" value={`${thisMonthNew}`} bg={U.chipNeutral} color={U.ink[900]} />
              {/* Geciken + değerlendirilecek AYNI satırda: eşit ölçülü rozetler. */}
              <PendingReviewsCard raterRole="clinic" compact />
              <FaceScanQuickAction accentColor={P} compact />
            </View>

          </View>
          {/* Kart yok — üç sayı serbest dursun; aralarında yalnız saç teli
              kalınlığında bir ayraç. alignSelf: sol kolon daha uzun olduğunda
              KPI bloğu tepede kalıp altında boşluk bırakıyordu. */}
          <View className="flex-row" style={{ gap: 24, alignItems: 'flex-end', alignSelf: 'flex-end' }}>
            {/* Müdahale sayıları (Admin Özet ile aynı dil): sıfırdan büyükse tonlanır ve listeyi açar */}
            <BigStat value={overdueCount} label={autoT('Geciken')} tone="danger"
              onPress={() => router.push('/(clinic)/orders?filter=overdue' as any)} />
            <StatDivider />
            <BigStat value={dueTodayCount} label={autoT('Bugün çıkacak')} tone="info"
              onPress={() => router.push('/(clinic)/orders?filter=today' as any)} />
            <StatDivider />
            <BigStat value={pendingApprovals.length} label={autoT('Onay bekleyen')} tone="warning"
              onPress={() => router.push('/(clinic)/approvals' as any)} />
          </View>
        </View>
      </View>

      {/* ════════ BİRİNCİ SIRA — Admin Özet düzeni (2026-11-17): bugünkü işler ·
          sipariş trendi | canlı üretim · mali durum. Teslim oranı halkası ve "Yeni sipariş"
          kartı kaldırıldı (admin'de de kalktı); teslim oranı Canlı kartın altında,
          yeni sipariş kenar menüde. ════════ */}
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
                <Text style={{ fontSize: 14, color: U.ink[400] }}> üye bu ay</Text>
              </Text>
              <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 4 }}>Her diş 1 üye · Son 6 ay</Text>
            </View>
            <Pressable onPress={() => router.push('/(clinic)/orders' as any)} className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: U.ink[100] }}>
              {isRTL() ? <ArrowUpLeft size={14} color={U.ink[500]} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={U.ink[500]} strokeWidth={1.8} />}
            </Pressable>
          </View>
          {monthly.length > 0 && <View style={{ flex: 1, minHeight: 120 }}><ProductionBarChart data={monthly} /></View>}
        </Card>
          </DashCell>
        </DashHalf>
        <DashHalf gap={16}>
          <DashCell motion={2}>
            <ClinicLiveProductionCard pipelineCounts={pipelineCounts} active={activeCount} delivered={deliveredPipe} total={pipeCount} pct={deliveryPct} router={router} />
          </DashCell>
          {/* Mali durum üst sırada, Bu hafta alt sırada (kullanıcı kararı 2026-11-17).
              Fatura yetkisi yoksa kart çizilmez; Canlı kart yarımı tek başına doldurur. */}
          {billingAccess === true ? (
            <DashCell motion={3}>
              <ClinicFinanceCard fin={finance} isDesktop={isDesktop} onPress={() => router.push('/(clinic)/finance' as any)} />
            </DashCell>
          ) : null}
        </DashHalf>
      </DashRow>

      {/* ════════ ORDERS TABLE ════════ */}
      <Card style={{ marginBottom: 16 }}>
        {/* Sade başlık (Admin Özet ile aynı): dolgulu bant tablo verisiyle yarışıyordu */}
        <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 }}>
          <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Son Siparişler</Text>
          <Pressable onPress={() => router.push('/(clinic)/orders' as any)}>
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
          ? <Text className="p-6 text-center" style={{ fontSize: 13, color: U.ink[400] }}>{loading ? 'Yükleniyor...' : 'Henüz sipariş yok'}</Text>
          : recentRows.map((order: any, idx: number) => {
              const overdue = order.delivery_date < today && order.status !== 'teslim_edildi' && order.status !== 'iptal';
              const isLast = idx === recentRows.length - 1;
              const drName = (order as any).patient_name ? titleCaseTR((order as any).patient_name) : '--';
              return (
                <Pressable key={order.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 13, gap: 8, minHeight: 54,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: U.hairlineSoft,
                  backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : undefined,
                }} onPress={() => router.push(`/(clinic)/order/${order.id}` as any)}>
                  <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: order.__revChild ? 14 : 0 }}>
                    {order.__revChild && (isRTL()
                      ? <CornerDownLeft size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} />
                      : <CornerDownRight size={12} color={(order as any).__continuation ? '#3563A8' : '#9C5E0E'} strokeWidth={2} />)}
                    <Text style={{ fontSize: 12, fontWeight: '800', color: P, flexShrink: 1, textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>#{order.order_number}</Text>
                  </View>
                  <View className="flex-row items-center" style={{ flex: 2, gap: 8 }}>
                    <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: hexA(P, 0.1), borderWidth: 1, borderColor: hexA(P, 0.15) }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: P }}>{initials(drName)}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{drName}</Text>
                  </View>
                  {isDesktop && <Text style={{ flex: 2, fontSize: 11, color: U.ink[500], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{(order as any).__revChild && (
                      <Text style={{ fontWeight: '700', color: (order as any).__continuation ? '#3563A8' : '#9C5E0E' }}>{`${(order as any).__continuation ? autoT('Devam') : autoT('Revizyon')} - `}</Text>
                    )}{order.work_type || '--'}</Text>}
                  <View style={{ flex: 1.4 }}><StatusBadge status={order.status} /></View>
                  {isDesktop && <Text style={{ flex: 1, fontSize: 11, fontWeight: overdue ? '700' : '500', textAlign: 'end' as any, color: overdue ? '#9C2E2E' : U.ink[400] }}>{fmtDate(order.delivery_date)}</Text>}
                </Pressable>
              );
            })
        }
      </Card>

      {/* ════════ ALT SIRA — Hekim performansı · Bu hafta (ortak ızgara, eşit yarımlar) ════════ */}
      {(
        <DashRow gap={16} style={{ marginBottom: 16 }}>
          <DashHalf gap={16}>
            {byDoctor.length > 0 ? (
              <DashCell motion={0}>
          <Card style={{ flex: 1 }}>
            <View className="flex-row items-center justify-between" style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
              <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Hekim Performansı</Text>
              <Pressable onPress={() => router.push('/(clinic)/doctors' as any)}>
                <Text style={{ fontSize: 13, color: U.isDark ? P : P_DEEP, fontWeight: '700' }}>Hekimler →</Text>
              </Pressable>
            </View>
            {byDoctor.map((d, i) => {
              const isLast = i === byDoctor.length - 1;
              return (
                <View key={d.id} className="flex-row items-center" style={{
                  paddingHorizontal: 20, paddingVertical: 12, gap: 12,
                  borderBottomWidth: !isLast ? 1 : 0, borderBottomColor: U.hairlineSoft,
                }}>
                  <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: P }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>{initials(d.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900], textAlign: isRTL() ? 'right' : undefined }} numberOfLines={1}>{d.name}</Text>
                    <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                      {d.total} {autoT('sipariş')} · {d.active} {autoT('aktif')}{d.overdue > 0 ? ` · ${d.overdue} ${autoT('gecikti')}` : ''}
                    </Text>
                  </View>
                  <View className="rounded-full" style={{ paddingHorizontal: 10, paddingVertical: 3, backgroundColor: hexA(P, 0.1) }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: P }}>{d.total}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
              </DashCell>
            ) : null}
          </DashHalf>
          <DashHalf gap={16}>
            <DashCell motion={1}>
              <WeeklyStrip weekDays={weekDays} weekCounts={weekCounts} weekDone={weekDone} onPress={() => router.push('/(clinic)/orders' as any)} />
            </DashCell>
          </DashHalf>
        </DashRow>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
