// modules/dashboard/components/LabMobileDashboard.tsx
// Lab (üretim) mobil Özet — Admin mobil Özet ile AYNI düzen (kullanıcı kararı 2026-11-17):
//   başlık (Özet + tarih · karşılama) → Bugün şeridi → Canlı üretim → tarama programı
//   → sipariş trendi → en çok iş gönderenler (yönetici) → son siparişler.
// Paylaşılan parçalar admin'den gelir (TodayStrip, LiveProductionCard); renkler lab
// panelinin (safran). "Yeni iş emri" kartı yok: sağ alttaki "+" düğmesi aynı işi yapıyor.

import React from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { useTranslation } from 'react-i18next';
import { isRTL, fmtWeekdayDayMonth } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl } from 'react-native';
import { useNavScrollProps } from '../../../core/ui/mobile/navScroll';
import { useNeonNavy } from '../../../core/ui/HeroGlow';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, CalendarClock, Clock, FileCheck, ChevronRight, ChevronLeft, TrendingUp, TrendingDown,
} from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { useAuthStore } from '../../../core/store/authStore';
import { RecentOrdersMobile, type RecentOrderItem } from './RecentOrdersMobile';
import { ScanCalendarCard } from '../../scans/components/ScanCalendarCard';
import { TopClinicsCard } from '../../clinicSummary/components/TopClinicsCard';
import { LiveProductionCard, TodayStrip } from '../../admin/components/AdminMobileDashboard';

const LAB = MOBILE_PANEL_THEMES.lab;

export interface LabDelayedCase {
  id: string;
  _id?: string;
  patient: string;
  workType: string;
  remain: string;
  kind?: 'delay' | 'hold';
  days?: number;
}

export interface LabMobileDashboardProps {
  greeting?: string;
  // Live production
  liveActive?: number;
  /** Teslim oranının paydası: arşiv ve iptal hariç tüm siparişler. */
  liveTotal?: number;
  /** Teslim oranının payı: teslim edilen sipariş sayısı. */
  liveDelivered?: number;
  liveStages?: { alindi: number; uretim: number; kk: number; hazir: number };
  livePercent?: number;       // teslim oranı (liveDelivered / liveTotal)
  /** Bugün teslim edilmesi gereken açık iş sayısı (Bugün şeridi) */
  liveDueToday?: number;
  overdueCount?: number;
  /** Beklemedeki iş sayısı (prova hariç) */
  heldCount?: number;
  pendingApprovalsCount?: number;
  /** Sipariş trendi: son aylar (masaüstü "Sipariş Trendi" kartıyla aynı dizi; son eleman bu ay) */
  orderTrend?: { label: string; count: number; teeth?: number }[];
  /** En çok iş gönderen klinikler kartı (yönetici) */
  showTopClinics?: boolean;
  recentOrders?: RecentOrderItem[];
  // Actions
  onApprovals?: () => void;
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
  const { t } = useTranslation();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Floating navbar scroll farkındalığı (bkz. core/ui/mobile/navScroll.ts)
  const navScrollProps = useNavScrollProps();
  // Canlı üretim yüzeyi: açık temada düz safran + mürekkep siyah, koyuda safranın derin tonu
  const nn = useNeonNavy(LAB.primary);

  const firstName = displayFirstName((profile?.full_name ?? '').trim());
  const greeting = props.greeting ?? (firstName ? t('dashboard.greetingName', { name: firstName }) : t('dashboard.greeting'));

  const active = props.liveActive ?? 0;
  const stages = props.liveStages ?? { alindi: 0, uretim: 0, kk: 0, hazir: 0 };
  const trend = props.orderTrend ?? [];
  const goStatus = (status: string) => () => router.push(`/(lab)/all-orders?status=${status}` as any);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={LAB.primary} />}
      {...navScrollProps}
    >
      {/* ═══ Başlık — sayfanın ADI (Özet); tarih ve karşılama tek küçük satırda (admin ile aynı) ═══ */}
      <View style={{
        paddingHorizontal: 20,
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
            onPress: () => router.push('/(lab)/all-orders?filter=overdue' as any) },
          { key: 'today', label: autoT('Bugün çıkacak'), n: props.liveDueToday ?? 0, tone: 'info', icon: CalendarClock,
            onPress: () => router.push('/(lab)/all-orders?filter=today' as any) },
          { key: 'hold', label: autoT('Beklemede'), n: props.heldCount ?? 0, tone: 'warning', icon: Clock,
            onPress: () => router.push('/(lab)/all-orders?filter=hold' as any) },
          { key: 'approvals', label: t('admin.dashboard.pendingApprovals'), n: props.pendingApprovalsCount ?? 0, tone: 'info', icon: FileCheck,
            onPress: () => props.onApprovals?.() },
        ]}
      />

      {/* ═══ Canlı üretim — Admin Özet ile aynı kart, lab renkleri ═══ */}
      <LiveProductionCard
        nn={nn}
        active={active}
        delivered={props.liveDelivered ?? 0}
        total={props.liveTotal ?? 0}
        pct={props.livePercent ?? 0}
        activeLabel={t('admin.dashboard.activeOrders')}
        title={t('admin.dashboard.liveProduction')}
        rateLabel={t('admin.dashboard.deliveryRate')}
        onOpenAll={props.onAllOrders}
        stages={[
          { key: 'alindi', label: t('admin.status.received'), n: stages.alindi, tone: 'strong', onPress: goStatus('alindi') },
          { key: 'uretimde', label: t('admin.status.production'), n: stages.uretim, tone: 'mid', onPress: goStatus('uretimde') },
          { key: 'kalite_kontrol', label: autoT('Kalite Kontrol'), n: stages.kk, tone: 'soft', onPress: goStatus('kalite_kontrol') },
          { key: 'teslimata_hazir', label: t('admin.status.ready'), n: stages.hazir, tone: 'ready', onPress: goStatus('teslimata_hazir') },
        ]}
      />

      {/* ═══ Tarama programı (modül açıksa) ═══ */}
      <ScanCalendarCard compact style={{ marginHorizontal: 16, marginBottom: 16 }} />

      {/* ═══ Sipariş trendi — admin "Üye trendi" kartıyla aynı yapı, safran ═══ */}
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
                <Text style={{ fontSize: 14, color: T.ink2, flexShrink: 1 }} numberOfLines={1}>{autoT('bu ay')}</Text>
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
            const FILL_LIGHT = `${LAB.primary}66`;
            const FILL_DARK  = LAB.primary;
            const RAIL_BG    = `${LAB.primary}14`;
            const STRIPE_BG  = `repeating-linear-gradient(135deg, ${LAB.primary}22 0 6px, transparent 6px 12px)`;
            // Safran beyaz zeminde okunmaz → sayı kapsülünde lab'ın koyu amber metni
            const PEAK_TEXT  = isDark ? LAB.primary : '#9C5E0E';
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
            );
          })()}
          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.hairline }}>
            <Text style={{ fontSize: 12, color: T.ink3, lineHeight: 17 }}>
              {autoT('Son 6 aylık trend')}
              {(trend[trend.length - 1]?.teeth ?? 0) > 0 ? ` · ${trend[trend.length - 1]?.teeth} ${autoT('diş')}` : ''}
            </Text>
          </View>
        </Pressable>
      )}

      {/* ═══ En çok iş gönderen klinikler (kompakt) — yönetici ═══ */}
      {props.showTopClinics ? (
        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <TopClinicsCard compact scoreMode={false} />
        </View>
      ) : null}

      {/* ═══ Son siparişler — desktop tablonun mobil karşılığı (paylaşılan bileşen) ═══ */}
      <RecentOrdersMobile
        rich
        heading={autoT('Son siparişler')}
        items={props.recentOrders ?? []}
        accent={LAB.primary}
        accentDark={LAB.accentDark}
        onOpenOrder={(id) => props.onOpenOrderById?.(id)}
        onAllOrders={props.onAllOrders}
      />
    </ScrollView>
  );
}
