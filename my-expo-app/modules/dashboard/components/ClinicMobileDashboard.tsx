// modules/dashboard/components/ClinicMobileDashboard.tsx
// Klinik mobil Özet — Admin mobil Özet ile AYNI düzen (kullanıcı kararı 2026-11-17):
//   başlık (Özet + tarih · karşılama) → Bugün şeridi → değerlendirme / yüz tarama
//   → Canlı üretim → okunmamış mesajlar → sipariş trendi → son siparişler.
// Paylaşılan parçalar admin'den gelir (TodayStrip, LiveProductionCard); renkler klinik
// panelinin (zümrüt). "Yeni vaka" kartı yok: sağ alttaki "+" düğmesi aynı işi yapıyor.

import React from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { useTranslation } from 'react-i18next';
import { isRTL, fmtWeekdayDayMonth } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl } from 'react-native';
import { useNavScrollProps } from '../../../core/ui/mobile/navScroll';
import { useNeonNavy } from '../../../core/ui/HeroGlow';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, CalendarClock, FileCheck, CheckCircle, ChevronRight, ChevronLeft, TrendingUp, TrendingDown,
} from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { useAuthStore } from '../../../core/store/authStore';
import { FaceScanQuickAction, useFaceScanAvailable } from '../../orders/components/FaceScanQuickAction';
import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { PendingReviewsCard } from '../../reviews/components/PendingReviewsCard';
import { LiveProductionCard, TodayStrip } from '../../admin/components/AdminMobileDashboard';

const CLINIC = MOBILE_PANEL_THEMES.klinik;

export interface ClinicMobileDashboardProps {
  greeting?: string;
  clinicName?: string;
  // Canlı üretim
  liveActive?: number;
  /** Teslim oranının paydası (masaüstü Canlı kartıyla aynı) */
  liveTotal?: number;
  /** Teslim oranının payı: teslim edilen sipariş sayısı */
  liveDelivered?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;
  /** Bugün teslimi beklenen açık iş sayısı (Bugün şeridi) */
  liveDueToday?: number;
  overdueCount?: number;
  pendingApprovalsCount?: number;
  /** Sipariş trendi: son aylar (masaüstü "Sipariş Trendi" ile aynı dizi; son eleman bu ay) */
  orderTrend?: { label: string; count: number; teeth?: number }[];
  recentOrders?: RecentOrderItem[];
  // Actions
  onApprovals?: () => void;
  onOpenOrderById?: (dbId: string) => void;
  onAllOrders?: () => void;
  // Refresh
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ClinicMobileDashboard(props: ClinicMobileDashboardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { t } = useTranslation();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Floating navbar scroll farkındalığı (bkz. core/ui/mobile/navScroll.ts)
  const navScrollProps = useNavScrollProps();
  // Canlı üretim yüzeyi: açık temada düz zümrüt, koyuda zümrütün derin tonu + nabız
  const nn = useNeonNavy(CLINIC.primary);
  // Bekleyen değerlendirme sayısı — rozet satırının alt boşluğunu belirler.
  const [pendingReviews, setPendingReviews] = React.useState(0);
  const faceScanOk = useFaceScanAvailable();

  const clinic = props.clinicName ?? (profile as any)?.clinic_name ?? autoT('Kliniğiniz');
  const greeting = props.greeting ?? `${autoT('Merhaba,')} ${clinic}`;

  const active = props.liveActive ?? 0;
  const stages = props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 };
  const trend = props.orderTrend ?? [];
  const goStatus = (status: string) => () => router.push(`/(clinic)/orders?status=${status}` as any);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={CLINIC.primary} />}
      {...navScrollProps}
    >
      {/* ═══ Başlık — sayfanın ADI (Özet); tarih ve karşılama tek küçük satırda (admin ile aynı) ═══ */}
      <View style={{
        paddingHorizontal: PAGE_PADDING,
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
      }}>
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
          {`${fmtWeekdayDayMonth(new Date())} · ${String(greeting).replace(/[.!]+$/, '')}`}
        </Text>
        {active <= 0 ? (
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>{t('admin.dashboard.noOrdersToday')}</Text>
        ) : null}
      </View>

      {/* ═══ Bugün şeridi — müdahale gerektiren dört sayı; sayı varsa listeyi o filtreyle açar ═══ */}
      <TodayStrip
        items={[
          { key: 'overdue', label: autoT('Geciken'), n: props.overdueCount ?? 0, tone: 'danger', icon: AlertTriangle,
            onPress: () => router.push('/(clinic)/orders?filter=overdue' as any) },
          { key: 'today', label: autoT('Bugün çıkacak'), n: props.liveDueToday ?? 0, tone: 'info', icon: CalendarClock,
            onPress: () => router.push('/(clinic)/orders?filter=today' as any) },
          { key: 'approvals', label: autoT('Onay bekleyen'), n: props.pendingApprovalsCount ?? 0, tone: 'warning', icon: FileCheck,
            onPress: () => props.onApprovals?.() },
          { key: 'ready', label: autoT('Teslime hazır'), n: stages.hazir, tone: 'info', icon: CheckCircle,
            onPress: goStatus('teslimata_hazir') },
        ]}
      />

      {/* ═══ Değerlendirilecek işler + yüz tarama (iOS) — masaüstü hero satırıyla aynı ═══
          Kartlar kendi verisini yükler; boşken satır yer kaplamaz. */}
      <View style={{
        marginHorizontal: PAGE_PADDING,
        marginBottom: pendingReviews > 0 || faceScanOk ? 16 : 0,
        flexDirection: 'row', flexWrap: 'wrap', gap: 10,
      }}>
        <PendingReviewsCard raterRole="clinic" compact onCount={setPendingReviews} />
        {faceScanOk ? <FaceScanQuickAction accentColor={CLINIC.primary} compact /> : null}
      </View>

      {/* ═══ Canlı üretim — Admin Özet ile aynı kart, klinik renkleri ═══ */}
      <LiveProductionCard
        nn={nn}
        active={active}
        delivered={props.liveDelivered ?? 0}
        total={props.liveTotal ?? 0}
        pct={props.livePercent ?? 0}
        activeLabel={autoT('Aktif sipariş')}
        title={autoT('Canlı üretim')}
        rateLabel={autoT('Teslim Oranı')}
        onOpenAll={props.onAllOrders}
        stages={[
          { key: 'alindi', label: autoT('Alındı'), n: stages.alindi, tone: 'strong', onPress: goStatus('alindi') },
          { key: 'uretimde', label: autoT('Üretimde'), n: stages.uretim, tone: 'mid', onPress: goStatus('uretimde') },
          { key: 'kalite_kontrol', label: autoT('Kalite Kontrol'), n: stages.kk, tone: 'soft', onPress: goStatus('kalite_kontrol') },
          { key: 'teslimata_hazir', label: autoT('Hazır'), n: stages.hazir, tone: 'ready', onPress: goStatus('teslimata_hazir') },
        ]}
      />

      {/* ═══ Okunmamış mesajlar (varsa) ═══ */}
      <UnreadMessagesCard
        accent={CLINIC.primary}
        onOpenOrder={(id) => router.push(`/(clinic)/order/${id}` as any)}
        onOpenInbox={() => router.push('/(clinic)/messages' as any)}
      />

      {/* ═══ Sipariş trendi — admin "Üye trendi" kartıyla aynı yapı, zümrüt ═══ */}
      {trend.length > 0 && (
        <Pressable
          onPress={props.onAllOrders}
          accessibilityRole="button"
          style={{
            marginHorizontal: 16, marginBottom: 16,
            padding: 14, borderRadius: 20,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: T.ink }}>{autoT('Sipariş Trendi')}</Text>
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
                <Text style={{ fontSize: 14, color: T.ink2, flexShrink: 1 }} numberOfLines={1}>{autoT('üye bu ay')}</Text>
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
            // Vurgu BU AYDA (son sütun) — başlıktaki sayıyla aynı ay (admin kararı).
            const max = Math.max(1, ...trend.map((m) => m.count));
            const peak = trend.length - 1;
            const FILL_LIGHT = `${CLINIC.primary}66`;
            const FILL_DARK  = CLINIC.primary;
            const RAIL_BG    = `${CLINIC.primary}14`;
            const STRIPE_BG  = `repeating-linear-gradient(135deg, ${CLINIC.primary}22 0 6px, transparent 6px 12px)`;
            // Zümrüt beyaz zeminde soluk → sayı kapsülünde zümrüt 600
            const PEAK_TEXT  = isDark ? CLINIC.primary : '#0C8F56';
            return (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 128, paddingHorizontal: 2 }}>
                {trend.map((m, i) => {
                  const pct = m.count > 0 ? Math.min(Math.max((m.count / max) * 100, 8), 100) : 0;
                  const hi = i === peak && m.count > 0;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                      <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                        {m.count > 0 ? (
                          hi ? (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '700', color: PEAK_TEXT }}>{m.count}</Text>
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
                          <HatchFill color={CLINIC.primary} />
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
              {/* Klinik trendi diş (üye) sayar — masaüstü kartıyla aynı açıklama */}
              {autoT('Her diş 1 üye · Son 6 ay')}
            </Text>
          </View>
        </Pressable>
      )}

      {/* ═══ Son siparişler — desktop tablonun mobil karşılığı (paylaşılan bileşen) ═══ */}
      <RecentOrdersMobile
        rich
        heading={autoT('Son siparişler')}
        items={props.recentOrders ?? []}
        accent={CLINIC.primary}
        accentDark={CLINIC.accentDark}
        onOpenOrder={(id) => props.onOpenOrderById?.(id)}
        onAllOrders={props.onAllOrders}
      />
    </ScrollView>
  );
}
