// modules/station/components/TechnicianDesktopDashboard.tsx
// Teknisyen masaüstü Özet — mobil Özet'in AYNI parçaları iki sütunda:
//   sol (iş):    mesai · aktif işler · sıradakiler
//   sağ (durum): verimlilik + son 7 gün · son tamamlananlar · performansım
// Parçalar TechnicianMobileDashboard'dan gelir; iki ekran birlikte güncellenir.

import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { ChevronRight, ChevronLeft, CheckCircle2, Plus } from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useAuthStore } from '../../../core/store/authStore';
import { RecentCompletedList } from '../../orders/components/RecentCompletedList';
import { MyPerformanceCard } from './MyPerformanceCard';
import { ShiftStatusCard, useTodayShift, shiftNotStarted } from './ShiftStatusCard';
import {
  TechStatStrip, ActiveJobCard, QueueCard, EfficiencyWeekCard,
  type TechnicianMobileDashboardProps,
} from './TechnicianMobileDashboard';

const TECH = MOBILE_PANEL_THEMES.teknisyen;

export function TechnicianDesktopDashboard(props: TechnicianMobileDashboardProps & { onNewOrder?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const accentInk = isDark ? '#93C5FD' : TECH.primary;

  const activeNow  = props.activeNow ?? 0;
  const todayCount = props.todayCompleted ?? 0;
  const efficiency = Number.isFinite(props.efficiencyPct as number) ? Math.max(0, Math.min(100, props.efficiencyPct as number)) : 0;
  const week  = props.weekBars ?? [0, 0, 0, 0, 0, 0, 0];
  const jobs  = props.activeJobs ?? [];
  const queue = props.queue ?? [];
  const loading = !!props.loading;
  const urgentCount = [...jobs, ...queue].filter(j => j.isUrgent || j.isCritical || j.status === 'yeniden').length;
  const weekTotal = week.reduce((a, b) => a + b, 0);
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const lateCount = [...jobs, ...queue].filter(j => !!j.deliveryDate && (j.deliveryDate as string) < todayKey).length;
  const returnedCount = queue.filter(j => j.status === 'yeniden').length;
  const shiftRow = useTodayShift(loading);
  const shiftFirst = shiftNotStarted(shiftRow);

  const firstName = displayFirstName(profile?.full_name, 'Teknisyen');
  const goJobs = () => router.push('/(station)/jobs' as any);
  const goHistory = () => router.push('/(station)/history' as any);
  const web = (o: object) => (Platform.OS === 'web' ? (o as any) : {});

  return (
    <View style={{ gap: 16 }}>
      {/* ═══ Üst satır — sayfa adı + tarih · karşılama | büyük sayılar ═══ */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
        <View style={{ flex: 1, minWidth: 260 }}>
          {/* Tarih kabuğun sayfa başlığında (kenar menüyle aynı hizada); burada karşılama
              — admin masaüstü Özet ile aynı: ad italik ve soluk. */}
          <Text
            style={{ fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.7, lineHeight: 32, ...web({ fontFamily: T.display }) }}
            accessibilityRole="header"
            numberOfLines={1}
          >
            {String(t('dashboard.greetingName', { name: '' })).replace(/\s*\.?\s*$/, '')}{' '}
            <Text style={{ fontStyle: 'italic', color: T.ink3 }}>{firstName}</Text>
          </Text>

          {/* İstatistik hapları — admin Özet ile aynı dil, teknisyene özel sayılar */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 14, opacity: loading ? 0.35 : 1 }}>
            <StatPill label={autoT('Firesiz iş')} value={`${Math.round(efficiency)}%`} bg={isDark ? 'rgba(255,255,255,0.14)' : '#0A0A0A'} color={isDark ? (T.ink as string) : '#FFFFFF'} />
            <StatPill label={autoT('Son 7 gün')} value={weekTotal} bg={TECH.primary} color="#FFFFFF" />
            <StatPill
              label={autoT('Ort. süre')}
              value={props.avgDurationHours != null && props.avgDurationHours > 0 ? `${props.avgDurationHours.toFixed(1)} ${autoT('sa')}` : '—'}
              bg={isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'} color={T.ink as string}
            />
            {lateCount > 0 ? (
              <StatPill strong label={autoT('Geciken')} value={lateCount} bg={U.chipTones.danger.bg} color={U.chipTones.danger.fg} labelColor={U.chipTones.danger.fg} onPress={goJobs} />
            ) : null}
            {returnedCount > 0 ? (
              <StatPill strong label={autoT('Geri dönen')} value={returnedCount} bg={U.chipTones.warning.bg} color={U.chipTones.warning.fg} labelColor={U.chipTones.warning.fg} onPress={goJobs} />
            ) : null}
          </View>
        </View>
        {props.onNewOrder ? (
          <Pressable
            onPress={props.onNewOrder}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16,
              borderRadius: 999, backgroundColor: TECH.primary, ...web({ cursor: 'pointer' }),
            }}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>{autoT('Yeni sipariş')}</Text>
          </Pressable>
        ) : null}
        <View style={{ width: 440, maxWidth: '100%', opacity: loading ? 0.35 : 1 }}>
          <TechStatStrip
            flush
            items={[
              { key: 'active', label: t('station.mobile.activeJob'), n: activeNow, tone: 'info', onPress: goJobs },
              { key: 'queue', label: autoT('Sırada'), n: queue.length, onPress: goJobs },
              { key: 'urgent', label: autoT('Acil'), n: urgentCount, tone: 'danger', onPress: goJobs },
              { key: 'today', label: t('station.mobile.completedToday'), n: todayCount, onPress: goHistory },
            ]}
          />
        </View>
      </View>

      {props.loadError ? (
        <View style={{
          paddingHorizontal: 16, paddingVertical: 12, borderRadius: 28, backgroundColor: U.chipTones.danger.bg,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Veriler yüklenemedi')}</Text>
            <Text style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{autoT('Bağlantını kontrol edip tekrar dene')}</Text>
          </View>
          <Pressable
            onPress={props.onRetry}
            accessibilityRole="button"
            style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, ...web({ cursor: 'pointer' }) }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{autoT('Tekrar dene')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        {/* ═══ Sol sütun — iş ═══ */}
        <View style={{ flex: 1.55, minWidth: 420, gap: 16 }}>
          {shiftFirst && shiftRow !== undefined ? <ShiftStatusCard flush accentColor={TECH.primary} row={shiftRow} /> : null}

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2 }}>{t('station.mobile.myActiveJobs')}</Text>
              <Pressable onPress={goJobs} hitSlop={10} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, ...web({ cursor: 'pointer' }) }}>
                <Text style={{ fontSize: 13, color: accentInk, fontWeight: '600' }}>{t('common.all')}</Text>
                {isRTL() ? <ChevronLeft size={14} color={accentInk} strokeWidth={2} /> : <ChevronRight size={14} color={accentInk} strokeWidth={2} />}
              </Pressable>
            </View>

            {loading && jobs.length === 0 ? (
              <View style={{ padding: 16, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, gap: 10 }}>
                <View style={{ width: 96, height: 22, borderRadius: 11, backgroundColor: T.hairline }} />
                <View style={{ width: '40%', height: 18, borderRadius: 6, backgroundColor: T.hairline }} />
                <View style={{ width: '60%', height: 12, borderRadius: 6, backgroundColor: T.hairline }} />
              </View>
            ) : null}

            {!loading && jobs.length === 0 ? (
              <View style={{ padding: 16, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${TECH.primary}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={18} color={accentInk} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>{t('station.mobile.noActiveJobNow')}</Text>
                  <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
                    {queue.length > 0 ? autoT('Sıradaki işlerden birine başlayabilirsin') : t('station.mobile.newJobWillAppear')}
                  </Text>
                </View>
              </View>
            ) : null}

            {jobs.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {jobs.slice(0, 4).map(j => (
                  <View key={j.id} style={{ flex: 1, minWidth: 280 }}>
                    <ActiveJobCard job={j} onOpen={() => props.onOpenJob?.(j.id)} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {queue.length > 0 ? (
            <QueueCard flush wide max={8} jobs={queue} onOpen={(id) => props.onOpenJob?.(id)} onAll={goJobs} />
          ) : null}

          {!shiftFirst && shiftRow !== undefined ? <ShiftStatusCard flush accentColor={TECH.primary} row={shiftRow} /> : null}
        </View>

        {/* ═══ Sağ sütun — durum ═══ */}
        <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
          <EfficiencyWeekCard flush efficiency={efficiency} week={week} />
          <RecentCompletedList accentColor={TECH.primary} limit={5} surface={T.card} border={T.hairline} />
          <MyPerformanceCard accentColor={TECH.primary} surface={T.card} border={T.hairline} />
        </View>
      </View>
    </View>
  );
}

// Etiket + değer hapı — admin Özet'teki StatPill ile aynı ölçüler.
function StatPill({ label, value, bg, color, labelColor, strong, onPress }: {
  label: string; value: string | number; bg: string; color: string; labelColor?: string; strong?: boolean; onPress?: () => void;
}) {
  const T = useMobileTokens();
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      {...(onPress ? { onPress, accessibilityRole: 'button' } : {})}
      accessibilityLabel={`${label}, ${value}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...(Platform.OS === 'web' && onPress ? ({ cursor: 'pointer' } as any) : {}) }}
    >
      <Text style={{ fontSize: 11, color: labelColor ?? T.ink3, fontWeight: strong ? '700' : '400', textTransform: 'uppercase', letterSpacing: 0.66 }}>
        {label}
      </Text>
      <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color }}>{value}</Text>
      </View>
    </Wrap>
  );
}
