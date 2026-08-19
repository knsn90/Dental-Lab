// modules/dashboard/components/LabMobileDashboard.tsx
// Aydın Lab Mobile handoff — lab (üretim) mobile dashboard.
// Sections: greeting → CTA → aktif üretim (dark) → KPI 2-grid → week strip
//           → geciken vakalar / positive empty state

import React from 'react';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { useTranslation } from 'react-i18next';
import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl, Image } from 'react-native';
import Svg, { Defs, Pattern, Rect, Line, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { HeroGlowOverlay } from '../../../core/ui/mobile/HeroGlowOverlay';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QrCode, Flame, CheckCircle2, ClipboardList, Bell, AlertTriangle, User,
} from 'lucide-react-native';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { useAuthStore } from '../../../core/store/authStore';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';

const LAB = MOBILE_PANEL_THEMES.lab;

// Hafta şeridi kolon etiketleri — ilk harf gösterilir; çeviri sonrası ilk harf
// alınır (fa: دوشنبه → د), Türkçe görünüm birebir korunur.
const WEEK_STRIP_DAYS = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];

// Desktop ile aynı format: "Pazartesi, 12 Mayıs"
function todayLabel(lng?: string): string {
  return new Date().toLocaleDateString(localeTag(lng), { weekday: 'long', day: 'numeric', month: 'long' });
}

export interface LabDelayedCase {
  id: string;        // order_number
  patient: string;   // patient name
  workType: string;  // implant / kron vb.
  remain: string;    // +1g 3sa veya QC
  kind: 'qc' | 'delay';
}

export interface LabMobileDashboardProps {
  greeting?: string;
  todayLabel?: string;
  // Live production
  liveActive?: number;
  liveTotal?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;       // production rate
  // KPI
  activeOrders?: number;
  todayCompleted?: number;
  weekCompleted?: number;
  overdueCount?: number;
  pendingApprovalsCount?: number;
  avgDurationHours?: number | null;
  // Week
  weekBars?: number[];     // her gün alınan sipariş sayısı (Pa→Pz)
  weekDoneBars?: number[]; // her gün tamamlanan (opsiyonel — verilmezse sadece "Alınan" çubuğu)
  weekRange?: string;
  weekTotal?: number;
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

export function LabMobileDashboard(props: LabMobileDashboardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const rtl = isRTL(i18n.language);

  const rawName = (profile?.full_name ?? '').trim();
  const firstName = displayFirstName(rawName);
  const greeting = props.greeting ?? (firstName ? t('dashboard.greetingName', { name: firstName }) : t('dashboard.greeting'));

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
  };
  const week    = props.weekBars ?? [0,0,0,0,0,0,0];
  const delayed = props.delayed  ?? [];
  const recent  = props.recentOrders ?? [];
  const overdue = props.overdueCount ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={LAB.primary} />}
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
            {t('dashboard.todayLine', { total: live.total, active: live.active })}{overdue > 0 ? t('dashboard.todayOverdue', { overdue }) : ''}.
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
        />
      )}

      {/* ═══ Aktif üretim card (saffron gradient zemin) ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: '#C26A12',
        overflow: 'hidden',
      }}>
        {/* Arka plan görseli — saffron gradient */}
        <Image
          source={require('../../../assets/images/efficiency-bg-saffron.png')}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.92, ...({ pointerEvents: 'none' } as any) }}
        />
        {/* Panel saffron tint — turuncu görseli panelin sarı-saffron tonuna çeker */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: LAB.primary, opacity: 0.34 }} />
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
            {live.active}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
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
          sub={props.avgDurationHours != null ? `${autoT('ort')} ${Math.round(props.avgDurationHours)}${autoT('sa')}` : undefined}
          deltaColor={overdue > 0 ? T.ruby : T.jade}
          icon={ClipboardList}
        />
        <Kpi
          label={t('dashboard.doneToday')}
          numericValue={props.todayCompleted ?? 0}
          delta={(props.weekCompleted ?? 0) > 0 ? t('dashboard.thisWeekCount', { count: props.weekCompleted }) : t('dashboard.weekDash')}
          dark={(props.todayCompleted ?? 0) > 0}
          accent={LAB.primary}
          icon={CheckCircle2}
        />
      </View>

      {/* ═══ Mesajlar kartı — okunmamışı öne çıkarır (panel accent) ═══ */}
      <UnreadMessagesCard
        accent={LAB.primary}
        showClinicLogo
        onOpenOrder={(id) => router.push(`/(lab)/order/${id}` as any)}
        onOpenInbox={() => router.push('/(lab)/messages' as any)}
      />

      {/* ═══ Week strip — desktop "Bu hafta" tasarımıyla aynı dil (hatched pill bars) ═══ */}
      {(() => {
        const SCALE_MAX = 20; // 1..20 sipariş skalası
        const LIGHT_BAR = `${LAB.primary}55`; // Alınan — sage soft
        const DARK_BAR  = LAB.primary;         // Tamamlanan — sage solid
        const RAIL_BG   = `${LAB.primary}14`;  // hafif görünür rail bg (was 08, çok solgun)
        // @ts-ignore web — diagonal hatched rail (panel-themed)
        const STRIPE_BG = `repeating-linear-gradient(135deg, ${LAB.primary}14 0 6px, transparent 6px 12px)`;
        const totalReceived  = props.weekTotal ?? week.reduce((a, b) => a + b, 0);
        const weekDone = props.weekDoneBars ?? [0,0,0,0,0,0,0];
        const totalCompleted = weekDone.reduce((a, b) => a + b, 0);

        return (
          <View style={{
            marginHorizontal: 16, marginBottom: 16,
            padding: 16, borderRadius: 20,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
          }}>
            {/* Header — title + legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{
                fontSize: 15, fontWeight: '500', color: T.ink,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>
                {t('dashboard.thisWeek')}
              </Text>
              <View style={{ flex: 1 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LIGHT_BAR }} />
                <Text style={{ fontSize: 11, color: T.ink3 }}>{t('dashboard.received')} </Text>
                <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '600' }}>{totalReceived}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DARK_BAR }} />
                <Text style={{ fontSize: 11, color: T.ink3 }}>{t('dashboard.completed')} </Text>
                <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '600' }}>{totalCompleted}</Text>
              </View>
            </View>

            {/* Bars */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 140, paddingHorizontal: 2 }}>
              {WEEK_STRIP_DAYS.map((d, i) => {
                const received  = week[i] ?? 0;
                const completed = weekDone[i] ?? 0;
                const isToday   = i === 6;
                const receivedPct  = received > 0  ? Math.min(Math.max((received / SCALE_MAX) * 100, 8), 100) : 0;
                const completedRel = received > 0 ? Math.min((completed / received) * 100, 100) : 0;
                const empty = received === 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
                    {/* Pill column — hatched rail */}
                    <View style={{ width: '100%', maxWidth: 44, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <View
                        style={{
                          width: '100%', height: '100%',
                          borderRadius: 999,
                          backgroundColor: RAIL_BG,
                          // @ts-ignore web
                          backgroundImage: STRIPE_BG,
                          overflow: 'hidden',
                          position: 'relative' as any,
                        }}
                      >
                        {/* Native: SVG diagonal stripes */}
                        {Platform.OS !== 'web' && (
                          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <Svg width="100%" height="100%" preserveAspectRatio="none">
                              <Defs>
                                <Pattern id={`stripe-${i}`} patternUnits="userSpaceOnUse" width={12} height={12} patternTransform="rotate(135)">
                                  <Rect x="0" y="0" width="12" height="12" fill="transparent" />
                                  <Line x1="0" y1="0" x2="0" y2="12" stroke={LAB.primary} strokeWidth={5} strokeOpacity={0.28} />
                                </Pattern>
                              </Defs>
                              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#stripe-${i})`} />
                            </Svg>
                          </View>
                        )}
                        {!empty && (
                          <View
                            style={{
                              position: 'absolute',
                              left: 0, right: 0, bottom: 0,
                              height: `${receivedPct}%`,
                              borderRadius: 999,
                              backgroundColor: LIGHT_BAR,
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
                                  backgroundColor: DARK_BAR,
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
                      fontWeight: isToday ? '700' : '500',
                      color: isToday ? T.ink : T.ink3,
                      textTransform: 'uppercase',
                      letterSpacing: 0.55,
                    }}>
                      {autoT(d).charAt(0)}
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
        {delayed.length > 0 && (
          <Pressable onPress={() => router.push('/(lab)/orders' as any)}>
            <Text style={{ fontSize: 12, color: LAB.accentDark, fontWeight: '500' }}>Tümü →</Text>
          </Pressable>
        )}
      </View>

      {/* Positive empty state */}
      {delayed.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
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
      {delayed.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {delayed.slice(0, 3).map(o => {
            const Icon = o.kind === 'qc' ? AlertTriangle : Flame;
            const iconBg = o.kind === 'qc' ? `${LAB.primary}22` : T.rubySoft;
            const iconColor = o.kind === 'qc' ? LAB.accentDark : T.ruby;
            const valueColor = o.kind === 'qc' ? LAB.accentDark : T.ruby;
            return (
              <Pressable key={o.id} onPress={() => props.onOpenOrder?.(o.id)}>
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
                      {o.kind === 'qc' ? t('dashboard.qc') : t('dashboard.delay')}
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

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any }) {
  const T = useMobileTokens();
  const isDarkMode = useThemeModeStore(s => s.resolvedDark);
  const acc = accent ?? '#F5C24B';

  // Vurgulu kart (dark) = accent-dolu (her panel kendi rengi). Dark mode'da accent-ring.
  const fill = !!dark && !isDarkMode;
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

  return (
    <View style={{
      flex: 1, borderRadius: 24, padding: 16,
      backgroundColor: bg, borderWidth, borderColor,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: labelColor, letterSpacing: 1, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <AnimatedNumber
          value={numericValue}
          duration={800}
          style={{
            fontSize: 34, fontWeight: '400', color: valueColor, letterSpacing: -1,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}
        />
        {!!Icon && (
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} color={iconColor} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        {!!delta && (
          <Text style={{ fontSize: 11, fontWeight: '600', color: deltaColorFinal }}>
            {delta}
          </Text>
        )}
        {!!sub && (
          <Text style={{ fontSize: 10.5, color: subColor }}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
}
