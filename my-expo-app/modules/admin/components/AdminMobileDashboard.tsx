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
import { autoT } from '../../../core/i18n/autoTranslate';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { fmtWeekdayDayMonth, isRTL } from '../../../core/i18n';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl, Image, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, QrCode, FileCheck, ClipboardList, User as UserIcon,
  AlertTriangle, CalendarClock, Clock, ChevronRight, ChevronLeft, TrendingUp, TrendingDown,
} from '../../../core/ui/icons';
import { useMobileTokens, MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useNeonNavy, NeonPulse } from '../../../core/ui/HeroGlow';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI } from '../../../core/theme/inkScale';
import { prefersReducedMotion } from '../../../core/ui/mobile/navScroll';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { useAuthStore } from '../../../core/store/authStore';

import { RecentOrdersMobile, type RecentOrderItem } from '../../dashboard/components/RecentOrdersMobile';
import { RadialGlow } from '../../../core/ui/gradients';

import { ScanCalendarCard } from '../../scans/components/ScanCalendarCard';
import { TopClinicsCard } from '../../clinicSummary/components/TopClinicsCard';
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
  /** Beklemedeki iş sayısı (prova hariç) — Aktif sipariş KPI alt satırına eklenir. */
  heldCount?:        number;
  pendingApprovalsCount?: number;
  /** Üye trendi: son aylar (masaüstü "Üye Trendi" kartıyla aynı dizi; son eleman bu ay) */
  memberTrend?: { label: string; count: number; cene?: number; adet?: number }[];
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
  /** Bugünkü Görevler kartı (masaüstüyle aynı bileşen) — Bugün şeridinin altına oturur */
  tasksSlot?: React.ReactNode;
  /** Faturalanmamış teslim hatırlatması — Son Siparişler'in üstüne oturur */
  unbilledSlot?: React.ReactNode;
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
  const U = useInkUI();

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
  const held    = props.heldCount ?? 0;

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
          {/* Büyük başlık = sayfanın ADI (Özet). Tarih ve karşılama tek küçük satırda;
              eskiden en büyük yazı "Hoş geldin, Kaan." idi ve sayfanın adı hiçbir
              yerde yazmıyordu (2026-11-14). */}
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 30, fontWeight: '500', color: T.ink, letterSpacing: -0.6, lineHeight: 34,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }}
          >
            {t('nav.items.summary')}
          </Text>
          <Text style={{ fontSize: 14, color: T.ink2, marginTop: 4, lineHeight: 19 }} numberOfLines={1}>
            {`${adminTodayLabel(t)} · ${String(greeting).replace(/[.!]+$/, '')}`}
          </Text>
          {/* Alt satır yalnız iş yokken çıkar; bugün çıkacak / geciken sayıları
              hemen alttaki Bugün şeridinde. */}
          {live.active <= 0 ? (
            <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>{t('admin.dashboard.noOrdersToday')}</Text>
          ) : null}
        </View>

        {/* Top action icons — global TopActionBar (layout level) sağ üstte sabit */}
      </View>

      {/* "Yeni iş emri oluştur" kartı KALDIRILDI (2026-11-14): sağ alttaki "+"
          düğmesi aynı işi yapıyor; kart ekranın en değerli yerinde onu tekrar
          ediyordu. "Bugün N teslim" bilgisi karşılama satırına taşındı. */}

      {/* ═══ Bugün şeridi — yöneticinin ilk bakacağı üç sayı ═══
           Her kutu Siparişler'i o filtreyle açar (liste zaten ?filter= okuyor).
           Sıfırsa kutu sönük ve dokunulmaz; sayı varsa tonlanır. */}
      <TodayStrip
        items={[
          { key: 'overdue', label: autoT('Geciken'), n: overdue, tone: 'danger', icon: AlertTriangle,
            onPress: () => router.push('/(admin)/orders?filter=overdue' as any) },
          { key: 'today', label: autoT('Bugün çıkacak'), n: props.liveDueToday ?? 0, tone: 'info', icon: CalendarClock,
            onPress: () => router.push('/(admin)/orders?filter=today' as any) },
          { key: 'hold', label: autoT('Beklemede'), n: held, tone: 'warning', icon: Clock,
            onPress: () => router.push('/(admin)/orders?filter=hold' as any) },
          // Eskiden ayrı bir karttı ("0 · Bekleyen yok" için 64px); aynı türden sayı → şeritte.
          { key: 'approvals', label: t('admin.dashboard.pendingApprovals'), n: pendingApprovals, tone: 'info', icon: FileCheck,
            onPress: () => props.onApprovals?.() },
        ]}
      />

      {props.tasksSlot ? (
        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>{props.tasksSlot}</View>
      ) : null}

      {/* ═══ Canlı üretim ═══
           Hızlı İşlem kartıyla AYNI dil (useNeonNavy): açık temada DÜZ panel
           accent'i — gradyan yok, her panel kendi rengi; koyu temada lacivert
           yüzey + neon nabız. Metin/halka mürekkebi accent kontrastından gelir
           (safran gibi AÇIK accent'lerde otomatik koyu ink). */}
      <LiveProductionCard
        nn={nn}
        active={live.active}
        delivered={live.delivered}
        total={live.total}
        pct={live.pct}
        activeLabel={t('admin.dashboard.activeOrders')}
        title={t('admin.dashboard.liveProduction')}
        rateLabel={t('admin.dashboard.deliveryRate')}
        onOpenAll={props.onAllOrders}
        stages={[
          { key: 'alindi', label: t('admin.status.received'), n: live.stages.alindi, tone: 'strong',
            onPress: () => router.push('/(admin)/orders?status=alindi' as any) },
          { key: 'uretimde', label: t('admin.status.production'), n: live.stages.uretim, tone: 'mid',
            onPress: () => router.push('/(admin)/orders?status=uretimde' as any) },
          { key: 'kalite_kontrol', label: autoT('Kalite Kontrol'), n: live.stages.kk, tone: 'soft',
            onPress: () => router.push('/(admin)/orders?status=kalite_kontrol' as any) },
          { key: 'teslimata_hazir', label: t('admin.status.ready'), n: live.stages.hazir, tone: 'ready',
            onPress: () => router.push('/(admin)/orders?status=teslimata_hazir' as any) },
        ]}
      />

      {/* ═══ Tarama programı (modül açıksa; TEK HAFTALIK şerit, dokunulan günün ajandası altta) ═══ */}
      <ScanCalendarCard compact style={{ marginHorizontal: 16, marginBottom: 16 }} />

      {/* ═══ Üye trendi — masaüstü "Üye Trendi" kartının mobil karşılığı (hatched pill kolonları) ═══ */}
      {trend.length > 0 && (
      <Pressable
        onPress={() => router.push('/(admin)/work-stats' as any)}
        accessibilityRole="button"
        style={{
        marginHorizontal: 16, marginBottom: 16,
        padding: 14, borderRadius: 20,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        {/* Başlık: büyük sayı + geçen aya göre fark. Açıklama satırları grafiğin ALTINA
            indi (eskiden başlıkla grafik arasında iki satır duruyordu). Silindirler aynı. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: T.ink }}>{t('admin.dashboard.memberTrend')}</Text>
          {isRTL() ? <ChevronLeft size={18} color={T.ink3} strokeWidth={2} /> : <ChevronRight size={18} color={T.ink3} strokeWidth={2} />}
        </View>
        {(() => {
          const cur = trend[trend.length - 1]?.count ?? 0;
          const prev = trend.length > 1 ? trend[trend.length - 2].count : null;
          const diff = prev == null ? null : cur - prev;
          const tone = diff == null || diff === 0 ? U.chipTones.neutral : diff > 0 ? U.chipTones.success : U.chipTones.warning;
          const DiffIcon = diff != null && diff < 0 ? TrendingDown : TrendingUp;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
              <Text style={{
                fontSize: 34, fontWeight: '400', color: T.ink, letterSpacing: -0.7, lineHeight: 38,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>{cur}</Text>
              <Text style={{ fontSize: 14, color: T.ink2, flexShrink: 1 }} numberOfLines={1}>{t('admin.dashboard.membersThisMonth')}</Text>
              <View style={{ flex: 1 }} />
              {diff != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: tone.bg }}>
                  {diff !== 0 ? <DiffIcon size={13} color={tone.fg} strokeWidth={2} /> : null}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: tone.fg }} numberOfLines={1}>
                    {`${diff > 0 ? '+' : ''}${diff} · ${autoT('Geçen aya göre')}`}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })()}
        {(() => {
          // Ölçek: dönemin kendi tepesi. Dolu accent + kapsül etiket BU AYDA (son
          // sütun): başlık "N üye bu ay" diyor, vurgu da aynı ayı göstermeli.
          // Eskiden en yüksek ay vurgulanıyordu → başlık Kasım, koyu sütun Ekim.
          const max = Math.max(1, ...trend.map((m) => m.count));
          const peak = trend.length - 1;
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
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.hairline }}>
          <Text style={{ fontSize: 12, color: T.ink3, lineHeight: 17 }}>
            {t('admin.dashboard.toothMemberNote')}
            {(() => {
              // Çene/adet işleri üyeye katılmaz; bu ayınkiler ayrıca yazılır.
              const last = trend[trend.length - 1];
              const parts: string[] = [];
              if (last?.cene) parts.push(`${last.cene} ${autoT('çene')}`);
              if (last?.adet) parts.push(`${last.adet} ${autoT('adet')}`);
              return parts.length ? `\n${autoT('Bu ay ayrıca')} ${parts.join(' · ')}` : '';
            })()}
          </Text>
        </View>
      </Pressable>
      )}

      {/* ═══ En çok iş gönderen klinikler (kompakt) ═══ */}
      <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <TopClinicsCard compact />
      </View>

      {props.unbilledSlot ? (
        <View style={{ marginHorizontal: 16 }}>{props.unbilledSlot}</View>
      ) : null}

      {/* ═══ Son Siparişler — desktop tablonun mobil karşılığı ═══ */}
      <RecentOrdersMobile
        rich
        heading={autoT('Son siparişler')}
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

// ─── Canlı üretim — akış kartı ──────────────────────────────────────────────
// Kartın merkezi ÜRETİM AKIŞI: tek büyük sayı (aktif sipariş) + süreç sırasını
// izleyen orantılı çubuk (Alındı → Üretimde → KK → Hazır) + dokunulabilir dört
// sütun. Teslim oranı (tüm zamanlar; "canlı" değil) alta, ince çubuklu tek satıra
// indi; "74/90" onun yanında anlam kazanır. Eskiden kartın en büyük öğesi o
// orandı, canlı sayılar 9px etiketli küçük dairelerdeydi (2026-11-14).
type LiveTone = 'strong' | 'mid' | 'soft' | 'ready';
// Mobil ve masaüstü Özet AYNI kartı çizer (tek tanım). `fill`: ızgara hücresini
// doldurur, dış boşluk yok, masaüstü köşe yarıçapı.
export function LiveProductionCard({ nn, active, delivered, total, pct, title, activeLabel, rateLabel, stages, onOpenAll, fill }: {
  fill?: boolean;
  nn: ReturnType<typeof useNeonNavy>;
  active: number; delivered: number; total: number; pct: number;
  title: string; activeLabel: string; rateLabel: string;
  stages: { key: string; label: string; n: number; tone: LiveTone; onPress: () => void }[];
  onOpenAll?: () => void;
}) {
  const T = useMobileTokens();
  const rtl = isRTL();
  // "Hazır" tek iyi haber → yeşil. Açık (safran gibi) accent'te ink koyudur; yeşilin koyu tonu kullanılır.
  const inkIsLight = nn.ink.toUpperCase().startsWith('#F') || nn.ink.toLowerCase().includes('255');
  const READY = inkIsLight ? '#7BD8AC' : '#1F6B47';
  const toneColor = (tone: LiveTone, n: number): string => {
    if (n <= 0) return hexA(nn.ink, 0.38);
    if (tone === 'ready') return READY;
    return tone === 'strong' ? nn.ink : tone === 'mid' ? hexA(nn.ink, 0.62) : hexA(nn.ink, 0.42);
  };
  // Çubuk açılışta soldan dolar (yalnız transform; hareketi azalt açıksa anında).
  const grow = React.useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  React.useEffect(() => {
    if (prefersReducedMotion()) { grow.setValue(1); return; }
    Animated.timing(grow, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [grow]);
  // Canlı nabzı (başlık yanındaki nokta) + çubuğun üstünden geçen yavaş ışık.
  // Yalnız transform/opacity; hareketi azalt açıksa ikisi de durur.
  const pulse = React.useRef(new Animated.Value(0)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;
  const [barW, setBarW] = React.useState(0);
  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(400),
    ]));
    p.start();
    return () => p.stop();
  }, [pulse]);
  React.useEffect(() => {
    sweep.stopAnimation(); sweep.setValue(0);
    if (prefersReducedMotion() || active <= 0 || barW === 0) return;
    const l = Animated.loop(Animated.sequence([
      Animated.delay(1400),
      Animated.timing(sweep, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [sweep, active, barW]);
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  const HeadWrap: any = onOpenAll ? Pressable : View;
  const radius = fill ? 28 : 24;
  return (
    <View style={{
      ...(fill ? { flex: 1, minHeight: '100%' as any } : { marginHorizontal: 16, marginBottom: 16 }),
      borderRadius: radius, padding: fill ? 22 : 18, overflow: 'hidden', ...nn.surface,
    }}>
      {!nn.flat && <NeonPulse radius={radius} color={nn.glow} />}
      <HeadWrap
        {...(onOpenAll ? { onPress: onOpenAll, accessibilityRole: 'button', accessibilityLabel: `${title}, ${active} ${activeLabel}` } : {})}
        style={Platform.OS === 'web' && onOpenAll ? ({ cursor: 'pointer' } as any) : undefined}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Animated.View style={{
              width: 7, height: 7, borderRadius: 4, backgroundColor: READY,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
            }} />
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: nn.ink }}>{title}</Text>
          </View>
          {onOpenAll ? <Chevron size={18} color={nn.inkFaint} strokeWidth={2} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <AnimatedNumber
            value={active}
            duration={800}
            style={{
              fontSize: 44, fontWeight: '400', color: nn.ink, letterSpacing: -0.9, lineHeight: 46,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }}
          />
          <Text style={{ fontSize: 15, color: nn.inkSoft }}>{activeLabel}</Text>
        </View>
      </HeadWrap>

      {/* Akış çubuğu — genişlik sayıyla orantılı; sıfır aşama ince ve silik ama YERİNDE */}
      <View onLayout={(e) => setBarW(e.nativeEvent.layout.width)} style={{ marginTop: 18, height: 10, borderRadius: 5, overflow: 'hidden' }}>
        <Animated.View style={{
          flexDirection: 'row', gap: 3, height: 10,
          transformOrigin: rtl ? 'right center' : 'left center',
          transform: [{ scaleX: grow }],
        } as any}>
          {stages.map((st) => (
            <View key={st.key} style={{
              flex: st.n > 0 ? st.n : 0.5, minWidth: 6, borderRadius: 5,
              backgroundColor: st.n > 0 ? toneColor(st.tone, st.n) : hexA(nn.ink, 0.18),
            }} />
          ))}
        </Animated.View>
        {barW > 0 && active > 0 && !prefersReducedMotion() ? (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: 56,
            backgroundColor: hexA(nn.ink, 0.55),
            opacity: sweep.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.85, 0.85, 0] }),
            transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-56, barW] }) }, { skewX: '-20deg' }],
          }} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {stages.map((st, i) => {
          const c = toneColor(st.tone, st.n);
          return (
            <Pressable
              key={st.key}
              onPress={st.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${st.label}, ${st.n}`}
              style={{ flex: 1, minWidth: 0, paddingVertical: 2, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
            >
              <AnimatedNumber
                value={st.n}
                duration={700}
                delay={i * 80}
                style={{
                  fontSize: 22, fontWeight: '500', color: c, lineHeight: 27,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{ fontSize: 12, color: st.n > 0 && st.tone !== 'ready' ? nn.inkSoft : c, lineHeight: 15 }} numberOfLines={2}>
                {st.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: hexA(nn.ink, 0.16),
      }}>
        <Text style={{ fontSize: 12, color: nn.inkSoft }} numberOfLines={1}>{rateLabel}</Text>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: hexA(nn.ink, 0.18), overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 4, borderRadius: 2, backgroundColor: hexA(nn.ink, 0.78) }} />
        </View>
        <Text style={{ fontSize: 12, color: nn.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {`%${pct} · ${delivered}/${total}`}
        </Text>
      </View>
    </View>
  );
}

type TodayTone = 'danger' | 'info' | 'warning';
// Durum şeridi — masaüstü Özet'in büyük sayılarıyla (BigStat) AYNI dil: kart yok,
// ince büyük rakam, altında büyük harfli küçük etiket, bölmeler arasında saç teli
// ayraç (kullanıcı kararı 2026-11-14). Sayı varsa rakam tonlanır ve bölme
// Siparişler'i o filtreyle açar; sıfır bölme nötr ve dokunulmaz.
function TodayStrip({ items }: {
  items: { key: string; label: string; n: number; tone: TodayTone; icon: any; onPress: () => void }[];
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const SIZE = 34;   // masaüstü BigStat 40; telefonda dört bölme için bir kademe küçük (kullanıcı kararı)
  return (
    // Dört bölme: etiketler iki satıra sarabilir ("BUGÜN ÇIKACAK", "ONAY BEKLEYEN");
    // rakamlar üstte hizalı kalsın diye bölmeler üstten hizalanır.
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, marginBottom: 18 }}>
      {items.map((it, i) => {
        const on = it.n > 0;
        // Object style ZORUNLU (fonksiyon-stilli Pressable native'de stili düşürüyor).
        const Wrap: any = on ? Pressable : View;
        return (
          <React.Fragment key={it.key}>
            {i > 0 ? <View style={{ width: 1, height: 46, backgroundColor: T.hairline, marginHorizontal: 8 }} /> : null}
            <Wrap
              {...(on ? { onPress: it.onPress, accessibilityRole: 'button' } : {})}
              accessibilityLabel={`${it.label}, ${it.n}`}
              style={{ flex: 1, minWidth: 0, ...(Platform.OS === 'web' && on ? ({ cursor: 'pointer' } as any) : {}) }}
            >
              <AnimatedNumber
                value={it.n}
                duration={800}
                delay={i * 80}
                style={{
                  fontSize: SIZE, fontWeight: '300', letterSpacing: -0.025 * SIZE, lineHeight: SIZE,
                  color: on ? U.chipTones[it.tone].fg : T.ink,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{ fontSize: 10, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 13, marginTop: 4 }} numberOfLines={2}>
                {it.label}
              </Text>
            </Wrap>
          </React.Fragment>
        );
      })}
    </View>
  );
}

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
