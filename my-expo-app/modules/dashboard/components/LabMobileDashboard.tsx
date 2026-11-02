// modules/dashboard/components/LabMobileDashboard.tsx
// Aydın Lab Mobile handoff — lab (üretim) mobile dashboard.
// Sections: greeting → CTA → aktif üretim (halka = teslim oranı) → KPI 2-grid → tarama programı
//           → sipariş trendi (masaüstü kartının mobil karşılığı) → geciken vakalar / positive empty state

import React from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { useTranslation } from 'react-i18next';
import { localeTag, isRTL } from '../../../core/i18n';
import { RadialGlow } from '../../../core/ui/gradients';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl, Image } from 'react-native';
import { useNavScrollProps } from '../../../core/ui/mobile/navScroll';
import Svg, { Defs, Rect, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { HeroGlowOverlay } from '../../../core/ui/mobile/HeroGlowOverlay';
import { deepenForDark, lightenForDark } from '../../../core/ui/HeroGlow';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QrCode, Flame, CheckCircle2, ClipboardList, Bell, AlertTriangle, User, Pause,
} from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { useAuthStore } from '../../../core/store/authStore';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';

import { ScanCalendarCard } from '../../scans/components/ScanCalendarCard';
const LAB = MOBILE_PANEL_THEMES.lab;

/**
 * Lab mobil özet kartlarının 3D illüstrasyonları (safran paleti).
 * Admin'deki lacivert setin lab karşılığı; ikon değil kart kimliği (bkz. CLAUDE.md
 * İkon Kuralı istisnası). Kutu ölçüleri alfa-ağırlıklı mürekkep alanı eşitlenerek
 * (~3050 px²) ve her görselin KENDİ en/boy oranında verildi → optik ağırlık eşit.
 */
const LAB_ART = {
  newOrder:  require('../../../assets/images/kpi-3d-lab-new-order.png'),
  active:    require('../../../assets/images/kpi-3d-lab-active.png'),
  doneToday: require('../../../assets/images/kpi-3d-lab-done-today.png'),
  messages:  require('../../../assets/images/kpi-3d-lab-messages.png'),
  recent:    require('../../../assets/images/kpi-3d-lab-recent-orders.png'),
} as const;
// Koyu temada Hızlı İşlem kartıyla ortak neon dili — lacivert yerine PANELİN
// safran'ı: siyah→derin safran gradyan + safranın neon karşılığıyla kenar/glow.
const LAB_DEEP  = deepenForDark(LAB.primary, 0.42);
const LAB_DEEP2 = deepenForDark(LAB.primary, 0.30);
const LAB_NEON  = lightenForDark(LAB.primary, 0.18);
function hexA(hex: string, a: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

// Desktop ile aynı format: "Pazartesi, 12 Mayıs"
function todayLabel(lng?: string): string {
  return new Date().toLocaleDateString(localeTag(lng), { weekday: 'long', day: 'numeric', month: 'long' });
}

export interface LabDelayedCase {
  id: string;        // order_number
  patient: string;   // patient name
  workType: string;  // implant / kron vb.
  remain: string;    // +1g 3sa veya QC; beklemede: "N gündür"
  /** 'hold' = uzun süredir beklemede (gecikme sayılmaz; dokununca detay → Devam ettir) */
  kind: 'qc' | 'delay' | 'hold';
}

export interface LabMobileDashboardProps {
  greeting?: string;
  todayLabel?: string;
  // Live production
  liveActive?: number;
  /** Halkanın paydası: arşiv ve iptal hariç tüm siparişler (masaüstü "Üretim · Teslim" halkasıyla aynı). */
  liveTotal?: number;
  /** Halkanın payı: teslim edilen sipariş sayısı. */
  liveDelivered?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;       // teslim oranı (liveDelivered / liveTotal)
  // KPI
  activeOrders?: number;
  todayCompleted?: number;
  weekCompleted?: number;
  overdueCount?: number;
  /** Beklemedeki iş sayısı (prova hariç) — Aktif KPI alt satırı. */
  heldCount?: number;
  pendingApprovalsCount?: number;
  avgDurationHours?: number | null;
  /** Sipariş trendi: son aylar (masaüstü "Sipariş Trendi" kartıyla aynı dizi; son eleman bu ay) */
  orderTrend?: { label: string; count: number; teeth?: number }[];
  // Lists
  delayed?: LabDelayedCase[];
  recentOrders?: RecentOrderItem[];
  // Actions
  onNewOrder?: () => void;
  onScan?: () => void;
  onApprovals?: () => void;
  onNotifications?: () => void;
  onProfile?: () => void;
  onOpenOrder?: (id: string) => void;
  onOpenOrderById?: (dbId: string) => void;
  onAllOrders?: () => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}


/** 3B görsel kabının yığın sırası. YALNIZ web'de: iOS (Fabric) zIndex'i katman
 *  derinliği olarak uyguluyor; görsel kendi kabından çıkıp sabit üst başlığın
 *  (logo + şerit) ÜSTÜNE biniyordu (build 69, 2026-10-21). */
const ART_Z = Platform.OS === 'web' ? { zIndex: 2 } : {};
export function LabMobileDashboard(props: LabMobileDashboardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  // Floating navbar scroll farkındalığı — aşağı okurken bar geri çekilir,
  // yukarı kaydırınca açılır (bkz. core/ui/mobile/navScroll.ts).
  const navScrollProps = useNavScrollProps();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const rtl = isRTL(i18n.language);

  const rawName = (profile?.full_name ?? '').trim();
  const firstName = displayFirstName(rawName);
  const greeting = props.greeting ?? (firstName ? t('dashboard.greetingName', { name: firstName }) : t('dashboard.greeting'));

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    delivered: props.liveDelivered ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
  };
  const trend   = props.orderTrend ?? [];
  const delayed = props.delayed  ?? [];
  const recent  = props.recentOrders ?? [];
  const overdue = props.overdueCount ?? 0;
  const held    = props.heldCount ?? 0;
  // Geciken satırlar en çok 3, uzun bekleyenler en çok 2 — ayrı kotalar; olumlu boş
  // durum yalnız GECİKEN yoksa çizilir (bekleme gecikme değildir).
  const lateRows = delayed.filter(o => o.kind !== 'hold');
  const holdRows = delayed.filter(o => o.kind === 'hold');
  const listRows = [...lateRows.slice(0, 3), ...holdRows.slice(0, 2)];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={LAB.primary} />}
      {...navScrollProps}
    >
      {/* ═══ Greeting + top icons ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        // Notch-aware: sabit 88 yerine insets+72 → logo ile çakışmaz (her cihazda ~27px gap)
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 10.5, fontWeight: '500', letterSpacing: 1.3, textTransform: 'uppercase',
            color: T.ink3,
          }}>
            {todayLabel(i18n.language)}
          </Text>
          <Text style={{
            fontSize: 30, fontWeight: '300', color: T.ink, letterSpacing: -0.6, lineHeight: 36,
            marginTop: 6,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {greeting}
          </Text>
          <Text style={{ fontSize: 13, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            {t('dashboard.todayLine', { active: live.active })}{overdue > 0 ? t('dashboard.todayOverdue', { overdue }) : ''}.
          </Text>
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* ═══ Primary CTA — "Yeni iş emri" ═══ */}
      {!!props.onNewOrder && (
        <NewOrderCTACard
          accentColor={LAB.primary}
          onPress={props.onNewOrder}
          kicker={(props.weekCompleted ?? 0) > 0 ? t('dashboard.weekDoneKicker', { count: props.weekCompleted }) : t('dashboard.newOrderKicker')}
          art={LAB_ART.newOrder}
        />
      )}

      {/* ═══ Aktif üretim card (saffron gradient zemin) ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: isDark ? LAB_DEEP : '#C26A12',
        overflow: 'hidden',
        ...(isDark ? { borderWidth: 1, borderColor: hexA(LAB_NEON, 0.26) } : {}),
        ...(isDark && Platform.OS === 'web' ? {
          backgroundImage:
            `radial-gradient(120% 78% at 50% -10%, ${hexA(LAB_NEON, 0.30)} 0%, ${hexA(LAB_DEEP2, 0.55)} 42%, rgba(0,0,0,0) 76%), ` +
            `linear-gradient(160deg, #0A0A0A 0%, ${LAB_DEEP} 62%, ${LAB_DEEP2} 100%)`,
          boxShadow: `0 0 18px ${hexA(LAB_NEON, 0.35)}, inset 0 0 22px ${hexA(LAB_NEON, 0.10)}`,
        } as any : {}),
      }}>
        {/* Arka plan görseli — yalnız AÇIK temada; koyuda siyah→safran gradyan var */}
        {!isDark && (
          <Image
            source={require('../../../assets/images/efficiency-bg-saffron.png')}
            resizeMode="cover"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.92, ...({ pointerEvents: 'none' } as any) }}
          />
        )}
        {/* Panel saffron tint — turuncu görseli panelin sarı-saffron tonuna çeker */}
        {!isDark && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: LAB.primary, opacity: 0.34 }} />
        )}
        {/* Beyaz dikey sheen — üstte hafif ışık */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id="lab-prod-sheen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.10" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#lab-prod-sheen)" />
          </Svg>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: LAB.primary,
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${LAB.primary}30` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('dashboard.activeProduction')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>
            {live.delivered}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
          <Ring value={live.pct} size={108} stroke={9} color={LAB.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <AnimatedNumber
                value={live.pct}
                duration={900}
                style={{
                  fontSize: 36, fontWeight: '300', color: T.onDark, letterSpacing: -1, lineHeight: 38,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{
                fontSize: 15, color: LAB.primary, fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          {/* yüzdenin ne olduğu: masaüstü "Üretim" kartındaki teslim halkasıyla aynı değer */}
          <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.onDark2, letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
            {t('admin.dashboard.deliveryRate')}
          </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { l: t('dashboard.stages.received'),   n: live.stages.alindi },
                { l: t('dashboard.stages.production'), n: live.stages.uretim },
                { l: t('dashboard.stages.qc'),         n: live.stages.kk },
                { l: t('dashboard.stages.ready'),      n: live.stages.hazir },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: s.n > 0 ? LAB.primary : 'rgba(255,255,255,0.14)',
                    backgroundColor: s.n > 0 ? `${LAB.primary}1F` : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AnimatedNumber
                      value={s.n}
                      duration={700}
                      delay={i * 80}
                      style={{
                        fontSize: 17, fontWeight: '500', color: s.n > 0 ? T.onDark : T.onDark3,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 9, color: T.onDark3, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {s.l}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ═══ KPI 2-grid ═══ */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Kpi
          label={t('dashboard.activeOrders')}
          numericValue={props.activeOrders ?? 0}
          delta={overdue > 0 ? t('dashboard.overdueCount', { count: overdue }) : t('dashboard.noOverdue')}
          sub={held > 0
            ? t('dashboard.heldCount', { count: held })
            : props.avgDurationHours != null ? `${autoT('ort')} ${Math.round(props.avgDurationHours)}${autoT('sa')}` : undefined}
          deltaColor={overdue > 0 ? T.ruby : T.jade}
          icon={ClipboardList}
          art={LAB_ART.active}
          artSize={{ w: 68, h: 66 }}
        />
        <Kpi
          label={t('dashboard.doneToday')}
          numericValue={props.todayCompleted ?? 0}
          delta={(props.weekCompleted ?? 0) > 0 ? t('dashboard.thisWeekCount', { count: props.weekCompleted }) : t('dashboard.weekDash')}
          dark={(props.todayCompleted ?? 0) > 0}
          accent={LAB.primary}
          icon={CheckCircle2}
          art={LAB_ART.doneToday}
          artSize={{ w: 61, h: 63 }}
        />
      </View>

      {/* ═══ Tarama programı (modül açıksa; ay görünümü, dokunulan günün ajandası altta) ═══ */}
      <ScanCalendarCard style={{ marginHorizontal: 16, marginBottom: 16 }} />

      {/* ═══ Sipariş trendi — masaüstü "Sipariş Trendi" kartının mobil karşılığı (hatched pill kolonları) ═══ */}
      {trend.length > 0 && (() => {
        const last = trend[trend.length - 1];
        const max = Math.max(1, ...trend.map((m) => m.count));
        const peak = trend.reduce((best, m, i) => (m.count > trend[best].count ? i : best), 0);
        const FILL_LIGHT = `${LAB.primary}55`;
        const FILL_DARK  = LAB.primary;
        const RAIL_BG    = `${LAB.primary}14`;
        const STRIPE_BG  = `repeating-linear-gradient(135deg, ${LAB.primary}14 0 6px, transparent 6px 12px)`;
        return (
          <View style={{
            marginHorizontal: 16, marginBottom: 16,
            padding: 14, borderRadius: 20,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                {autoT('Sipariş Trendi')}
              </Text>
              <Text style={{ fontSize: 11, color: T.ink3 }}>
                <Text style={{ color: T.ink, fontWeight: '600' }}>{last?.count ?? 0}</Text> {autoT('bu ay')}
              </Text>
            </View>
            <Text style={{ fontSize: 10.5, color: T.ink3, marginBottom: 12 }}>
              {autoT('Son 6 aylık trend')}{(last?.teeth ?? 0) > 0 ? ` · ${last?.teeth} ${autoT('diş')}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 128, paddingHorizontal: 2 }}>
              {trend.map((m, i) => {
                const pct = m.count > 0 ? Math.min(Math.max((m.count / max) * 100, 8), 100) : 0;
                const hi = i === peak && m.count > 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                    {/* sabit yükseklikli etiket zonu: çubukların tabanı hizalı kalır */}
                    <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                      {m.count > 0 ? (
                        hi ? (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: T.ink }}>{m.count}</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 10, fontWeight: '700', color: T.ink3 }}>{m.count}</Text>
                        )
                      ) : null}
                    </View>
                    <View style={{ width: '100%', maxWidth: 40, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <View style={{
                        width: '100%', height: '100%', borderRadius: 999,
                        backgroundColor: RAIL_BG,
                        ...(Platform.OS === 'web' ? { backgroundImage: STRIPE_BG } as any : {}),
                        overflow: 'hidden', position: 'relative' as any,
                      }}>
                        {/* Native: CSS gradyanı yok → SVG tarama */}
                        <HatchFill color={LAB.primary} />
                        {pct > 0 && (
                          <View style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${pct}%`, borderRadius: 999,
                            backgroundColor: hi ? FILL_DARK : FILL_LIGHT,
                            ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                          } as any} />
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: hi ? '700' : '500', color: hi ? T.ink : T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* ═══ Geciken vakalar — list or positive empty state ═══ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{
          fontSize: 15, fontWeight: '500', color: T.ink, letterSpacing: -0.2,
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          {t('dashboard.overdueCases')}
        </Text>
        {listRows.length > 0 && (
          <Pressable onPress={() => router.push('/(lab)/orders' as any)}>
            <Text style={{ fontSize: 12, color: LAB.accentDark, fontWeight: '500' }}>Tümü →</Text>
          </Pressable>
        )}
      </View>

      {/* Positive empty state */}
      {lateRows.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: holdRows.length > 0 ? 8 : 16,
          padding: 16, borderRadius: 18,
          backgroundColor: isDark ? `${LAB.primary}1F` : `${LAB.primary}14`,
          borderWidth: 1, borderColor: isDark ? `${LAB.primary}44` : `${LAB.primary}28`,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: isDark ? `${LAB.primary}33` : `${LAB.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={18} color={LAB.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              {t('dashboard.noOverdueCases')}
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              Üretim hattı temiz, tüm vakalar zamanında.
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      {listRows.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {listRows.map(o => {
            const hold = o.kind === 'hold';
            const Icon = o.kind === 'qc' ? AlertTriangle : hold ? Pause : Flame;
            const holdFg = isDark ? '#F0C078' : '#9C5E0E';
            const iconBg = o.kind === 'qc' ? `${LAB.primary}22` : hold ? (isDark ? 'rgba(232,155,42,0.22)' : 'rgba(232,155,42,0.14)') : T.rubySoft;
            const iconColor = o.kind === 'qc' ? LAB.accentDark : hold ? holdFg : T.ruby;
            const valueColor = o.kind === 'qc' ? LAB.accentDark : hold ? holdFg : T.ruby;
            return (
              <Pressable key={`${o.kind}-${o.id}`} onPress={() => props.onOpenOrder?.(o.id)}>
                {({ pressed }: any) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: 18,
                  backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
                  opacity: pressed ? 0.92 : 1,
                }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: iconBg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={iconColor} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{o.patient}</Text>
                      {/* Sipariş no Latin başlar → RNW dir="auto" ile LTR olur; RTL'de hizayı sabitle */}
                      <Text style={{ fontSize: 10, color: T.ink3, fontFamily: T.mono, flexShrink: 0, textAlign: rtl ? 'right' : undefined }}>{o.id}</Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                      {o.workType}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '600', color: valueColor,
                      ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                    }}>
                      {o.remain}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {o.kind === 'qc' ? t('dashboard.qc') : hold ? t('dashboard.hold') : t('dashboard.delay')}
                    </Text>
                  </View>
                </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ═══ Son Siparişler — desktop tablonun mobil karşılığı (paylaşılan bileşen) ═══ */}
      <RecentOrdersMobile
        art={LAB_ART.recent}
        items={recent}
        accent={LAB.primary}
        accentDark={LAB.accentDark}
        onOpenOrder={(id) => props.onOpenOrderById?.(id)}
        onAllOrders={props.onAllOrders}
      />
    </ScrollView>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function TopIconButton({ icon: Icon, onPress, badgeDot }:
  { icon: any; onPress?: () => void; badgeDot?: boolean }) {
  const T = useMobileTokens();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {({ pressed }: any) => (
        <View style={{
          width: 40, height: 40, borderRadius: 14,
          backgroundColor: T.card,
          borderWidth: 1, borderColor: T.hairline,
          alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          opacity: pressed ? 0.7 : 1,
        }}>
          <Icon size={18} color={T.ink} strokeWidth={1.8} />
          {badgeDot && (
            <View style={{
              position: 'absolute',
              // `end:` inline stili bu projede güvenilir değil → yönü açıkça seç
              top: 7, ...(isRTL() ? { left: 7 } : { right: 7 }),
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: T.ruby,
              borderWidth: 1.5, borderColor: T.card,
            }} />
          )}
        </View>
      )}
    </Pressable>
  );
}

// Okunabilir ink — accent açıksa (safran) koyu, koyuysa beyaz metin
function onAccentInk(accent: string): string {
  const h = (accent || '#000000').replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF';
}

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon, art, artSize }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any; art?: any; artSize?: { w: number; h: number } }) {
  const T = useMobileTokens();
  const isDarkMode = useThemeModeStore(s => s.resolvedDark);
  const rtl = isRTL();
  const acc = accent ?? '#F5C24B';

  // Vurgulu kart (dark) = accent-dolu (her panel kendi rengi). Dark mode'da accent-ring.
  // 3D görsel varken accent DOLGU kullanılmaz: safran görsel safran zeminde kayboluyor.
  const fill = !!dark && !isDarkMode && !art;
  const onAcc = onAccentInk(acc);

  const bg = fill ? acc : T.card;
  const borderColor = (!!dark && isDarkMode) ? `${acc}55` : T.hairline;
  const borderWidth = fill ? 0 : 1;
  const labelColor = fill ? `${onAcc}AA` : T.ink3;
  const valueColor = fill ? onAcc : T.ink;
  const deltaColorFinal = fill ? `${onAcc}DD` : (deltaColor ?? T.ink2);
  const subColor = fill ? `${onAcc}AA` : T.ink3;
  const iconBg = fill ? `${onAcc}26` : `${acc}1A`;
  const iconColor = fill ? onAcc : acc;

  const artEdge = rtl ? { left: -6 } : { right: -6 };
  const card = (
    <View style={{
      flex: 1, borderRadius: art ? 22 : 24, padding: art ? 14 : 16, overflow: 'hidden',
      minHeight: art ? 112 : undefined,
      backgroundColor: bg, borderWidth, borderColor,
    }}>
      {/* Görselin arkasında yumuşak accent ışıma (kart içinde kalır) */}
      {!!art && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -16, width: 100, height: 100, ...(rtl ? { left: -24 } : { right: -24 }) }}>
          <RadialGlow color={acc} opacity={isDarkMode ? 0.26 : 0.16} stopAt={64} />
        </View>
      )}
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: labelColor, letterSpacing: 1, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: art ? 4 : 8 }}>
        <AnimatedNumber
          value={numericValue}
          duration={800}
          style={{
            fontSize: art ? 30 : 34, fontWeight: '400', color: valueColor, letterSpacing: -1,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}
        />
        {/* 3D görsel varken ikon rozeti çizilmez */}
        {!!Icon && !art && (
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} color={iconColor} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={{
        flexDirection: art ? 'column' : 'row',
        alignItems: art ? (rtl ? 'flex-end' : 'flex-start') : 'center',
        justifyContent: art ? 'flex-end' : 'space-between',
        gap: art ? 1 : 0,
        marginTop: art ? 'auto' : 8,
        ...(art ? (rtl ? { paddingStart: 46 } : { paddingEnd: 46 }) : {}),
      }}>
        {!!delta && (
          <Text numberOfLines={1} style={{ fontSize: art ? 10.5 : 11, fontWeight: '600', color: deltaColorFinal }}>
            {delta}
          </Text>
        )}
        {!!sub && (
          <Text numberOfLines={1} style={{ fontSize: art ? 10 : 10.5, color: subColor }}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );

  if (!art) return card;
  // Görsel kartın SINIRINI kontrollü aşar (yandan 6px), alt kenarla arasında 6px pay.
  return (
    <View style={{ flex: 1, ...ART_Z }}>
      {card}
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 6, width: artSize?.w ?? 66, height: artSize?.h ?? 66, ...artEdge }}>
        <Image source={art} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
}
