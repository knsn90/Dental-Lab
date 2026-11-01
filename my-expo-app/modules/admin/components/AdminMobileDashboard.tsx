// modules/admin/components/AdminMobileDashboard.tsx
// Admin/exec dashboard — same design system as doctor & teknisyen.
// Sections:
//   1) Greeting + top action icons (Onaylar · QR · Bell)
//   2) Primary CTA — animated "Yeni Sipariş" card
//   3) Canlı üretim (dark hero) with animated Ring + stages
//   4) KPI 2-grid (Aylık gelir · Aktif sipariş) with AnimatedNumber
//   5) Tarama programı (modül açıksa) · Üye trendi (son 6 ay; kullanıcı: "bu hafta yerine üye trendi")
//   6) Geciken vakalar list OR positive empty state

import React from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { fmtWeekdayDayMonth, isRTL } from '../../../core/i18n';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, QrCode, FileCheck, ClipboardList, User as UserIcon,
} from '../../../core/ui/icons';
import { useMobileTokens, MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { HERO_NAVY, useNeonNavy, NeonPulse } from '../../../core/ui/HeroGlow';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { NewOrderCTACard } from '../../../core/ui/mobile/NewOrderCTACard';
import { useAuthStore } from '../../../core/store/authStore';

import { RecentOrdersMobile, type RecentOrderItem } from '../../dashboard/components/RecentOrdersMobile';
import { RadialGlow } from '../../../core/ui/gradients';

import { ScanCalendarCard } from '../../scans/components/ScanCalendarCard';
const EXEC = MOBILE_PANEL_THEMES.exec;

/**
 * KPI kartlarının 3D illüstrasyonları (admin mobil).
 * Şeffaf PNG; hem açık hem koyu temada aynı görsel kullanılır — arkasındaki
 * accent ışıma temaya göre değişir. İkon kuralının (flat 2D line) istisnası:
 * bunlar ikon değil, karta gömülü ürün illüstrasyonu.
 *
 * ÖLÇEK NOTU: kutular bilerek FARKLI (64x58 vs 65x68). Aynı piksel kutusunda
 * onay-bekleyen görseli daha "dolu" (alfa kaplaması %82) kalırken freze görseli
 * boşluklu (%68) → biri iri, öteki cılız görünüyordu. Kutular, alfa-ağırlıklı
 * mürekkep alanları eşitlenecek şekilde (~3050 px²) ve her görselin KENDİ en/boy
 * oranında verildi; böylece optik ağırlık eşit, alt hizaları da birebir aynı.
 */
const KPI_ART = {
  approvals:  require('../../../assets/images/kpi-3d-approvals.png'),
  production: require('../../../assets/images/kpi-3d-production.png'),
  newOrder:   require('../../../assets/images/kpi-3d-new-order.png'),
  messages:   require('../../../assets/images/kpi-3d-messages.png'),
  recent:     require('../../../assets/images/kpi-3d-recent-orders.png'),
} as const;

// Desktop ile aynı format: "Pazartesi, 12 Mayıs"
function adminTodayLabel(t: (key: string) => string): string {
  const d = new Date();
  const days   = t('admin.days.long').split(', ');
  const months = t('admin.months.long').split(', ');
  return fmtWeekdayDayMonth(d);
}

export interface AdminMobileDashboardProps {
  greeting?: string;
  bgName?: string;
  todayLabel?: string;
  // Live production
  liveActive?:   number;
  /** Halkanın paydası: arşiv ve iptal hariç tüm siparişler (masaüstü "Teslim Oranı" ile aynı). */
  liveTotal?:    number;
  /** Halkanın payı: teslim edilen sipariş sayısı (masaüstü "Teslim Oranı" ile aynı). */
  liveDelivered?: number;
  /** Bugün teslim edilmesi gereken açık iş sayısı (kicker) */
  liveDueToday?: number;
  liveStages?:   { alindi: number; uretim: number; kk: number; hazir: number };
  /** Halka yüzdesi = teslim oranı (liveDelivered / liveTotal) — kullanıcı: "halkayı teslim oranıyla değiştir" */
  livePercent?:  number;
  liveTimer?:    string;
  // KPI
  monthlyRevenue?:   string;
  monthlyDelta?:     string;
  activeOrders?:     number;
  productionCount?:  number;
  overdueCount?:     number;
  pendingApprovalsCount?: number;
  /** Üye trendi: son aylar (masaüstü "Üye Trendi" kartıyla aynı dizi; son eleman bu ay) */
  memberTrend?: { label: string; count: number }[];
  // Delayed
  recentOrders?: RecentOrderItem[];
  // Actions
  onNewOrder?:     () => void;
  onScan?:         () => void;
  onApprovals?:    () => void;
  onProfile?:      () => void;
  onMessages?:     () => void;
  onNotifications?: () => void;
  onOpenOrder?:    (id: string) => void;
  onOpenOrderById?: (dbId: string) => void;
  onAllOrders?:    () => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}


/** 3B görsel kabının yığın sırası. YALNIZ web'de: iOS (Fabric) zIndex'i katman
 *  derinliği olarak uyguluyor; görsel kendi kabından çıkıp sabit üst başlığın
 *  (logo + şerit) ÜSTÜNE biniyordu (build 69, 2026-10-21). */
const ART_Z = Platform.OS === 'web' ? { zIndex: 2 } : {};
export function AdminMobileDashboard(props: AdminMobileDashboardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const insets = useSafeAreaInsets();
  const neon = '#38BDF8';
  // "neon navy" — Hızlı İşlem kartıyla AYNI imza yüzeyi (tek kaynak: useNeonNavy).
  // Açık temada DÜZ panel accent'i → her panel kendi rengiyle konuşur; koyu
  // temada lacivert yüzey + nabız atan neon kenar.
  const panel = usePanelTheme();
  const nn = useNeonNavy(panel.primary);

  const firstName = displayFirstName(profile?.full_name);
  const greeting  = props.greeting ?? (firstName ? t('dashboard.greetingName', { name: firstName }) : t('dashboard.greeting'));

  const live = {
    active: props.liveActive ?? 0,
    total:  props.liveTotal ?? 0,
    delivered: props.liveDelivered ?? 0,
    stages: props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 },
    pct:    props.livePercent ?? 0,
    timer:  props.liveTimer ?? '00:00:00',
  };
  const trend   = props.memberTrend ?? [];
  const pendingApprovals = props.pendingApprovalsCount ?? 0;
  const overdue = props.overdueCount ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={EXEC.primary} />}
    >
      {/* ═══ Greeting + top icons ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 10.5, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase',
            color: T.ink3,
          }}>
            {adminTodayLabel(t)}
          </Text>
          <Text style={{
            fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.5, lineHeight: 32,
            marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {greeting}
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            {live.active > 0
              ? t('admin.dashboard.ordersSummary', {
                  active: live.active,
                  overdue: overdue > 0 ? `, ${t('admin.dashboard.overdueCount', { count: overdue })}` : '',
                })
              : t('admin.dashboard.noOrdersToday')}
          </Text>
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* ═══ Primary CTA — animated "Yeni Sipariş" card ═══ */}
      {!!props.onNewOrder && (
        <NewOrderCTACard
          accentColor={EXEC.primary}
          onPress={props.onNewOrder}
          // Eskiden "BUGÜN {toplam} SİPARİŞ" yazıyordu ama sayı TÜM siparişlerdi (denetim);
          // artık bugün teslim edilecek açık iş sayısı.
          kicker={(props.liveDueToday ?? 0) > 0 ? t('admin.cta.dueToday', { count: props.liveDueToday }) : t('admin.cta.newOrder')}
          title={t('admin.cta.createNewOrder')}
          art={KPI_ART.newOrder}
          // 3D görsel lacivert/mavi → kart da lacivert gradyan (HERO_NAVY)
          gradient={{ from: HERO_NAVY.light, to: HERO_NAVY.from, angle: 135 }}
        />
      )}

      {/* ═══ Canlı üretim ═══
           Hızlı İşlem kartıyla AYNI dil (useNeonNavy): açık temada DÜZ panel
           accent'i — gradyan yok, her panel kendi rengi; koyu temada lacivert
           yüzey + neon nabız. Metin/halka mürekkebi accent kontrastından gelir
           (safran gibi AÇIK accent'lerde otomatik koyu ink). */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18, overflow: 'hidden',
        ...nn.surface,
      }}>
        {!nn.flat && <NeonPulse radius={24} color={nn.glow} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: nn.ink,
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${hexA(nn.ink, 0.30)}` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: nn.inkSoft, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('admin.dashboard.liveProduction')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: nn.inkFaint, fontFamily: T.mono }}>
            {live.delivered}/{live.total}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <View style={{ alignItems: 'center', gap: 6 }}>
          <Ring value={live.pct} size={108} stroke={9} color={nn.ink} track={hexA(nn.ink, 0.22)} animatedEndDot sweep>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <AnimatedNumber
                value={live.pct}
                duration={900}
                style={{
                  fontSize: 32, fontWeight: '400', color: nn.ink, letterSpacing: -0.8, lineHeight: 34,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{
                fontSize: 14, color: nn.ink, fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          {/* yüzdenin ne olduğu: kart "canlı üretim" başlığını taşıyor */}
          <Text style={{ fontSize: 9.5, fontWeight: '600', color: nn.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
            {t('admin.dashboard.deliveryRate')}
          </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { l: t('admin.status.received'), n: live.stages.alindi },
                { l: t('admin.status.production'), n: live.stages.uretim },
                { l: t('admin.status.qcShort'),     n: live.stages.kk },
                { l: t('admin.status.ready'),  n: live.stages.hazir },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: s.n > 0 ? nn.ink : hexA(nn.ink, 0.18),
                    backgroundColor: s.n > 0 ? hexA(nn.ink, 0.14) : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AnimatedNumber
                      value={s.n}
                      duration={700}
                      delay={i * 80}
                      style={{
                        fontSize: 17, fontWeight: '500', color: s.n > 0 ? nn.ink : nn.inkFaint,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 9, color: nn.inkFaint, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {s.l}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ═══ KPI 2-grid ═══ */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16, ...ART_Z }}>
        {/* Onay bekleyen — "Aylık gelir" placeholder'ının yerine geldi (o kart hiç
            bağlanmamıştı, hep '—' gösteriyordu). Veri zaten yükleniyor; kart
            dokunulabilir ve onaylar ekranına gider. Kasıtlı olarak BEYAZ kalır:
            yanındaki "Aktif sipariş" kartı dolu/koyu olduğu için ikisi birden
            dolu olursa grid ağırlaşıyor. */}
        <Kpi
          label={t('admin.dashboard.pendingApprovals')}
          numericValue={pendingApprovals}
          sub={pendingApprovals > 0
            ? t('admin.dashboard.approvalsActionNeeded')
            : t('admin.dashboard.approvalsClear')}
          accent={EXEC.primary}
          icon={FileCheck}
          art={KPI_ART.approvals}
          artSize={{ w: 64, h: 58 }}
          onPress={props.onApprovals}
        />

        <Kpi
          label={t('admin.dashboard.activeOrders')}
          numericValue={props.activeOrders ?? 0}
          delta={`${props.productionCount ?? 0} ${t('admin.dashboard.inProduction')}`}
          sub={t('admin.dashboard.overdueCount', { count: overdue })}
          // Aktif > 0 ise highlight et
          dark={(props.activeOrders ?? 0) > 0}
          accent={EXEC.primary}
          icon={ClipboardList}
          art={KPI_ART.production}
          artSize={{ w: 65, h: 68 }}
        />
      </View>

      {/* ═══ Tarama programı (modül açıksa; ay görünümü, dokunulan günün ajandası altta) ═══ */}
      <ScanCalendarCard style={{ marginHorizontal: 16, marginBottom: 16 }} />

      {/* ═══ Üye trendi — masaüstü "Üye Trendi" kartının mobil karşılığı (hatched pill kolonları) ═══ */}
      {trend.length > 0 && (
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        padding: 14, borderRadius: 20,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('admin.dashboard.memberTrend')}
          </Text>
          <Text style={{ fontSize: 11, color: T.ink3 }}>
            <Text style={{ color: T.ink, fontWeight: '600' }}>{trend[trend.length - 1]?.count ?? 0}</Text> {t('admin.dashboard.membersThisMonth')}
          </Text>
        </View>
        <Text style={{ fontSize: 10.5, color: T.ink3, marginBottom: 12 }}>{t('admin.dashboard.toothMemberNote')}</Text>
        {(() => {
          // Ölçek: dönemin kendi tepesi; en yüksek ay dolu accent + kapsül etiket, diğerleri soluk
          const max = Math.max(1, ...trend.map((m) => m.count));
          const peak = trend.reduce((best, m, i) => (m.count > trend[best].count ? i : best), 0);
          const FILL_LIGHT = `${EXEC.primary}55`;
          const FILL_DARK  = EXEC.primary;
          const RAIL_BG    = `${EXEC.primary}08`;
          const STRIPE_BG  = `repeating-linear-gradient(135deg, ${EXEC.primary}14 0 6px, transparent 6px 12px)`;
          return (
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
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: FILL_DARK }}>{m.count}</Text>
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
                        <HatchFill color={EXEC.primary} />
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
          );
        })()}
      </View>
      )}

      {/* ═══ Son Siparişler — desktop tablonun mobil karşılığı ═══ */}
      <RecentOrdersMobile
        art={KPI_ART.recent}
        items={props.recentOrders ?? []}
        accent={EXEC.primary}
        accentDark={EXEC.accentDark}
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
              top: 7, end: 7,
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

function hexA(hex: string, alpha: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return hex; }
}

function onAccentInk(accent: string): string {
  const h = (accent || '#000000').replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF';
}

// ── Renk mix yardımcıları (KPI fill kartı için zengin gradient) ──────────────
function _mix(hex: string, target: number, t: number): string {
  const h = (hex || '#000000').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = cl(r + (tr - r) * t), ng = cl(g + (tg - g) * t), nb = cl(b + (tb - b) * t);
  return '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('');
}
const deepen  = (hex: string, t: number) => _mix(hex, 0x000000, t);
const lighten = (hex: string, t: number) => _mix(hex, 0xFFFFFF, t);

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon, art, artSize, onPress }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any; art?: any; artSize?: { w: number; h: number }; onPress?: () => void }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const rtl = isRTL();
  const acc = accent ?? '#004B87';
  // 3D görsel varken accent DOLGU kullanılmaz: mavi illüstrasyon kobalt gradyanın
  // üstünde eziliyor. Kart nötr yüzeyde kalır, görsel öne çıkar (referans tasarım).
  const fill = !!dark && !art;
  // Fill (highlight) kartı: flat/muddy coral yerine zengin gradient (parlak→derin
  // terracotta) + derin zemine göre seçilen ink. Daha canlı, kontrastı yüksek.
  const fillDeep = deepen(acc, 0.24);
  const fillTop  = lighten(acc, 0.10);
  const onAcc = onAccentInk(fill ? fillDeep : acc);
  const valueColor = fill ? onAcc : T.ink;
  const labelColor = fill ? `${onAcc}C2` : T.ink3;
  const subColor = fill ? `${onAcc}B0` : T.ink3;
  const deltaColorFinal = fill ? onAcc : (deltaColor ?? T.ink2);
  const iconBg = fill ? `${onAcc}2E` : `${acc}1A`;
  const iconColor = fill ? onAcc : acc;
  // Dokunulabilir varyant: object style ZORUNLU (NativeWind v4 fonksiyon-stilli
  // Pressable'da backgroundColor'ı native'de düşürüyor).
  const Wrap: any = onPress ? Pressable : View;
  // Görsel kartın SONUNA (RTL'de başına) yaslanır, kenardan hafif taşar; kart
  // overflow:hidden olduğu için taşan kısım kırpılır → gömülü/derinlikli durur.
  const artEdge = rtl ? { left: -6 } : { right: -6 };
  const card = (
    <Wrap
      {...(onPress ? { onPress, android_ripple: { color: `${acc}1A` } } : {})}
      style={{
      flex: 1, borderRadius: 22, padding: art ? 14 : 16, overflow: 'hidden',
      minHeight: art ? 112 : undefined,
      backgroundColor: fill ? fillDeep : T.card,
      borderWidth: fill ? 0 : 1, borderColor: T.hairline,
      ...(onPress && Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
      ...(fill && Platform.OS === 'web'
        ? ({ backgroundImage: `linear-gradient(150deg, ${fillTop} 0%, ${acc} 48%, ${fillDeep} 100%)` } as any)
        : {}),
      ...(fill && Platform.OS === 'web'
        ? ({ boxShadow: `0 10px 24px -8px ${deepen(acc, 0.12)}66` } as any)
        : {}),
    }}>
      {/* Görselin arkasında yumuşak accent ışıma — koyu temada derinlik,
          açık temada görselin beyaz zemine oturmasını sağlar. (Kart içinde kalır.) */}
      {!!art && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -10, width: 100, height: 100, ...(rtl ? { left: -24 } : { right: -24 }) }}>
          <RadialGlow color={isDark ? '#4C86D6' : acc} opacity={isDark ? 0.30 : 0.13} stopAt={64} />
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
        {/* 3D görsel varken ikon rozeti çizilmez — görselin üstünde kalıyor. */}
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
        // Görselin üstüne binmesin (dar kartta yan yana sığmıyor → alt alta)
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
    </Wrap>
  );

  if (!art) return card;
  // 3D görsel kartın SINIRINI AŞAR (alta + yana taşar) → kartın üstünde duruyormuş
  // hissi. Bu yüzden kartın kendisi kırpılırken görsel kardeş katman olarak çizilir.
  return (
    <View style={{ flex: 1, ...ART_Z }}>
      {card}
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 6, width: artSize?.w ?? 66, height: artSize?.h ?? 66, ...artEdge }}>
        <Image source={art} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
}
