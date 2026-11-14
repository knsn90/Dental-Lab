// modules/station/components/TechnicianMobileDashboard.tsx
// Aydın Lab Mobile handoff — teknisyen dashboard.
// Same design pattern as DoctorMobileDashboard:
//   • Greeting + top 3 action icons (QR · İşlerim · Bell)
//   • Aktif üretim (dark hero) with animated Ring + counters
//   • KPI 2-grid (dynamic dark/soft based on activity)
//   • Week strip
//   • Aktif işlerim list (or positive empty state)

import React, { useEffect, useRef, useState } from 'react';
import { HatchFill } from '../../../core/ui/HatchFill';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { useTranslation } from 'react-i18next';
import { autoT } from '../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView, Platform, RefreshControl, Animated, Easing, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, QrCode, ListChecks, Clock, Flame, Play, Pause, CheckCircle2, ChevronRight, ChevronLeft,
  MessageCircle, User as UserIcon,
} from '../../../core/ui/icons';
import { isRTL, localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useOrderChatInbox } from '../../orders/hooks/useOrderChatInbox';
import { ProfileMenu } from '../../../core/ui/mobile/ProfileMenu';
import Svg, { Circle, Defs, Rect, RadialGradient, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { TechCheckInCTACard } from '../../../core/ui/mobile/TechCheckInCTACard';
import { RecentCompletedList } from '../../orders/components/RecentCompletedList';
import { MyPerformanceCard } from './MyPerformanceCard';
import { ShiftStatusCard, useTodayShift, shiftNotStarted } from './ShiftStatusCard';
import { richOrderFields } from '../../dashboard/components/RecentOrdersMobile';
import { useAuthStore } from '../../../core/store/authStore';
import { useScanStore } from '../../../core/store/scanStore';

import { UnreadMessagesCard } from '../../../core/ui/mobile/UnreadMessagesCard';
import { confirmAsync } from '../../../core/util/confirm';
const TECH = MOBILE_PANEL_THEMES.teknisyen;

export interface TechActiveJob {
  id: string;
  orderNo: string;
  patient: string;
  workType: string;
  stationName: string;
  doctorName?: string | null;
  clinicName?: string | null;
  status: string;          // 'aktif' | 'bekliyor' | 'durakladi' | ...
  startedAt?: string | null;
  isCritical?: boolean;
  isUrgent?: boolean;
  deliveryDate?: string | null;
  clinicLogoUrl?: string | null;
}

export interface TechnicianMobileDashboardProps {
  activeNow?:        number;
  todayCompleted?:   number;
  weekCompleted?:    number;
  totalCompleted?:   number;
  avgDurationHours?: number | null;
  efficiencyPct?:    number;
  weekBars?:         number[];
  weekRange?:        string;
  activeJobs?:       TechActiveJob[];
  /** Sıradaki (henüz başlanmamış / bekleyen) işler */
  queue?:            TechActiveJob[];
  /** İlk veri gelene kadar true — sıfırlar "iş yok" gibi okunmasın */
  loading?:          boolean;
  /** Veri okunamadı — uyarı + tekrar dene */
  loadError?:        boolean;
  onRetry?:          () => void;
  // Actions
  onOpenJob?:       (stageId: string) => void;
  onJobs?:          () => void;
  onHistory?:       () => void;
  onScan?:          () => void;
  onMessages?:      () => void;
  onNotifications?: () => void;
  // Refresh
  refreshing?:      boolean;
  onRefresh?:       () => void;
}

export function TechnicianMobileDashboard(props: TechnicianMobileDashboardProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Mavi accent koyu kartta sönük kalıyor → metin/ikonda açık ton
  const accentInk = isDark ? '#93C5FD' : TECH.primary;
  const insets = useSafeAreaInsets();
  const setScanOpen = useScanStore(s => s.setOpen);
  const { totalUnread } = useOrderChatInbox();
  const signOut = useAuthStore(s => s.signOut);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = () => {
    setProfileMenuOpen(false);
    // Web/PWA'da Alert.alert butonları çalışmıyor → confirmAsync
    confirmAsync(t('common.signOut'), t('profile.signOutConfirm'), {
      confirmText: t('common.signOut'), cancelText: t('common.cancel'), destructive: true,
    }).then(ok => { if (ok) signOut?.(); });
  };
  const handleProfile = () => {
    setProfileMenuOpen(false);
    router.push('/(station)/profile' as any);
  };
  const handleAccessCode = () => {
    setProfileMenuOpen(false);
    router.push('/(station)/settings?tab=mycode' as any);
  };

  // Strip "Dr." prefix if present (technician panel doesn't use Dr.)
  const rawName = (profile?.full_name ?? '').trim();
  const stripDrRe = /^\s*(dr\.?|doktor|prof\.?\s*dr\.?|doç\.?\s*dr\.?)\s*\.?\s*/i;
  let cleanName = rawName;
  while (stripDrRe.test(cleanName)) cleanName = cleanName.replace(stripDrRe, '').trim();
  const firstName = displayFirstName(cleanName, 'Teknisyen');

  const activeNow  = props.activeNow ?? 0;
  const todayCount = props.todayCompleted ?? 0;
  const weekCount  = props.weekCompleted ?? 0;
  const totalCount = props.totalCompleted ?? 0;
  const efficiency = Number.isFinite(props.efficiencyPct as number)
    ? Math.max(0, Math.min(100, props.efficiencyPct as number))
    : 0;
  const week       = props.weekBars ?? [0, 0, 0, 0, 0, 0, 0];
  const shiftRow   = useTodayShift(props.refreshing);
  const shiftFirst = shiftNotStarted(shiftRow);
  const jobs       = props.activeJobs ?? [];
  const queue      = props.queue ?? [];
  const loading    = !!props.loading;
  const urgentCount = [...jobs, ...queue].filter(j => j.isUrgent || j.isCritical || j.status === 'yeniden').length;

  const dateLabel = new Date().toLocaleDateString(localeTag(i18n.language), { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = String(t('dashboard.greetingName', { name: firstName })).replace(/[.!]+$/, '');
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={TECH.primary} />}
    >
      {/* ═══ Başlık — admin Özet ile aynı dil: sayfa adı + tarih · karşılama ═══ */}
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
          {`${dateLabel} · ${greeting}`}
        </Text>
      </View>

      {/* ═══ Bugün şeridi — admin Özet'in büyük sayılarıyla aynı dil ═══ */}
      <View style={{ opacity: loading ? 0.35 : 1 }}>
        <TechStatStrip
          items={[
            { key: 'active', label: t('station.mobile.activeJob'), n: activeNow, tone: 'info',
              onPress: () => router.push('/(station)/jobs' as any) },
            { key: 'queue', label: autoT('Sırada'), n: queue.length,
              onPress: () => router.push('/(station)/jobs' as any) },
            { key: 'urgent', label: autoT('Acil'), n: urgentCount, tone: 'danger',
              onPress: () => router.push('/(station)/jobs' as any) },
            { key: 'today', label: t('station.mobile.completedToday'), n: todayCount,
              onPress: () => router.push('/(station)/history' as any) },
          ]}
        />
      </View>

      {/* Veri okunamadı — sıfırlar gerçek sanılmasın */}
      {props.loadError ? (
        <View style={{
          marginHorizontal: PAGE_PADDING, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 12,
          borderRadius: 28, backgroundColor: U.chipTones.danger.bg,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Veriler yüklenemedi')}</Text>
            <Text style={{ fontSize: 12.5, color: T.ink2, marginTop: 2 }}>{autoT('Bağlantını kontrol edip tekrar dene')}</Text>
          </View>
          <Pressable
            onPress={props.onRetry}
            accessibilityRole="button"
            hitSlop={6}
            style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{autoT('Tekrar dene')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Giriş yapılmadıysa mesai kartı EN ÜSTTE — günün ilk işi */}
      {shiftFirst && shiftRow !== undefined && <ShiftStatusCard accentColor={TECH.primary} row={shiftRow} />}

      {/* ═══ Aktif işlerim ═══ */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2 }}>
          {t('station.mobile.myActiveJobs')}
        </Text>
        <Pressable
          onPress={() => router.push('/(station)/jobs' as any)}
          hitSlop={10}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
        >
          <Text style={{ fontSize: 13, color: accentInk, fontWeight: '600' }}>{t('common.all')}</Text>
          {isRTL()
            ? <ChevronLeft size={14} color={accentInk} strokeWidth={2} />
            : <ChevronRight size={14} color={accentInk} strokeWidth={2} />}
        </Pressable>
      </View>

      {/* Yükleniyor — boş durumla karışmasın diye nötr yer tutucu */}
      {loading && jobs.length === 0 && (
        <View style={{ marginHorizontal: PAGE_PADDING, marginBottom: 16, padding: 16, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, gap: 10 }}>
          <View style={{ width: 96, height: 22, borderRadius: 11, backgroundColor: T.hairline }} />
          <View style={{ width: '62%', height: 18, borderRadius: 6, backgroundColor: T.hairline }} />
          <View style={{ width: '80%', height: 12, borderRadius: 6, backgroundColor: T.hairline }} />
          <View style={{ height: 46, borderRadius: 14, backgroundColor: T.hairline, marginTop: 4 }} />
        </View>
      )}

      {!loading && jobs.length === 0 && (
        <View style={{
          marginHorizontal: PAGE_PADDING, marginBottom: 16,
          padding: 16, borderRadius: 28,
          backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${TECH.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={18} color={accentInk} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              {t('station.mobile.noActiveJobNow')}
            </Text>
            <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
              {queue.length > 0 ? autoT('Sıradaki işlerden birine başlayabilirsin') : t('station.mobile.newJobWillAppear')}
            </Text>
          </View>
        </View>
      )}

      {jobs.length > 0 && (
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 16, gap: 12 }}>
          {jobs.slice(0, 3).map(j => (
            <ActiveJobCard key={j.id} job={j} onOpen={() => props.onOpenJob?.(j.id)} />
          ))}
        </View>
      )}

      {/* ═══ Sıradakiler — başlanmamış / bekleyen işler ═══ */}
      {queue.length > 0 && (
        <QueueCard jobs={queue} onOpen={(id) => props.onOpenJob?.(id)} onAll={() => router.push('/(station)/jobs' as any)} />
      )}

      {/* ═══ QR Check-In — mesai giriş / çıkış ═══ */}
      {/* Giriş yapıldıysa mesai kartı işlerin ALTINDA durur */}
      {!shiftFirst && shiftRow !== undefined && <ShiftStatusCard accentColor={TECH.primary} row={shiftRow} />}

      {/* ═══ Verimlilik + son 7 gün — tek kart ═══ */}
      <EfficiencyWeekCard efficiency={efficiency} week={week} />

      {/* ═══ Mesajlar kartı ═══ */}
      <UnreadMessagesCard
        accent={TECH.primary}
        onOpenOrder={(id) => router.push(`/(station)/order/${id}` as any)}
      />

      {/* ═══ Son Tamamlananlar ═══ */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 16 }}>
        <RecentCompletedList accentColor={TECH.primary} limit={5} surface={T.card} border={T.hairline} />
      </View>

      {/* ═══ Performansım ═══ */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 16 }}>
        <MyPerformanceCard accentColor={TECH.primary} surface={T.card} border={T.hairline} />
      </View>

      <ProfileMenu
        visible={profileMenuOpen}
        anchorTop={120}
        onClose={() => setProfileMenuOpen(false)}
        onProfile={handleProfile}
        onAccessCode={handleAccessCode}
        onLogout={handleLogout}
      />
    </ScrollView>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

// Verimlilik halkası + son 7 gün grafiği — mobil ve masaüstü Özet ortak kullanır.
export function EfficiencyWeekCard({ efficiency, week, flush }: { efficiency: number; week: number[]; flush?: boolean }) {
  const { i18n } = useTranslation();
  const T = useMobileTokens();
  const weekMax = Math.max(1, ...week);
  const weekTotal = week.reduce((a, b) => a + b, 0);
  return (
      <View style={{
        ...(flush ? {} : { marginHorizontal: PAGE_PADDING, marginBottom: 16 }),
        padding: 16, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: T.ink, letterSpacing: -0.2, marginBottom: 14 }}>
          {autoT('Verimlilik ve son 7 gün')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <EfficiencyRing value={efficiency} size={132} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>
              {autoT('Firesiz iş oranı')}
            </Text>
            <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 18 }}>
              {`${autoT('Son 7 gün')} · ${weekTotal} ${autoT('iş')}`}
            </Text>
          </View>
        </View>

        {/* Hafta — ölçek haftanın en yüksek gününe göre; gün adları tarihten gelir */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 132, marginTop: 18 }}>
          {week.map((n, i) => {
            const isToday = i === week.length - 1;
            const d = new Date(); d.setDate(d.getDate() - (week.length - 1 - i));
            const day = d.toLocaleDateString(localeTag(i18n.language), { weekday: 'short' });
            const pct = n > 0 ? Math.min(100, Math.max(16, (n / weekMax) * 100)) : 0;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', gap: 6 }}>
                {/* Çizgili ray + dolu hap — admin haftalık grafiğiyle aynı */}
                <View style={{
                  width: '100%', maxWidth: 40, flex: 1, borderRadius: 999,
                  backgroundColor: `${TECH.primary}0D`,
                  ...(Platform.OS === 'web' ? { backgroundImage: `repeating-linear-gradient(135deg, ${TECH.primary}1F 0 6px, transparent 6px 12px)` } as any : {}),
                  overflow: 'hidden', position: 'relative',
                }}>
                  <HatchFill color={TECH.primary} />
                  {n > 0 ? (
                    <View style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      height: `${pct}%`, minHeight: 30, borderRadius: 999,
                      backgroundColor: isToday ? TECH.primary : `${TECH.primary}66`,
                      alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6,
                      ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                    } as any}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{n}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 11, fontWeight: isToday ? '700' : '500', color: isToday ? T.ink : T.ink3 }} numberOfLines={1}>
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
  );
}

// Bugün şeridi — admin Özet'teki TodayStrip ile aynı dil: kart yok, ince büyük
// rakam, altında küçük büyük-harf etiket, bölmeler arasında saç teli ayraç.
export function TechStatStrip({ items, flush }: {
  flush?: boolean;
  items: { key: string; label: string; n: number; tone?: 'info' | 'danger'; onPress: () => void }[];
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const SIZE = 34;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', ...(flush ? {} : { paddingHorizontal: PAGE_PADDING, marginBottom: 20 }) }}>
      {items.map((it, i) => {
        const on = it.n > 0;
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
                  color: on && it.tone ? U.chipTones[it.tone].fg : T.ink,
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

// Verimlilik halkası — admin Özet'teki PercentRingHero ile aynı dil: geniş soluk
// dış bant, içinde ince iz, gradyan yay, uçta mürekkep topuz + nabız halkası.
// Topuz %100'de de (12 yönünde) görünür.
function EfficiencyRing({ value, size = 132 }: { value: number; size?: number }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const v = Math.max(0, Math.min(100, value));
  const outer = Math.max(8, Math.round(size * 0.12));
  const inner = outer - 6;
  const r = (size - outer - Math.max(3, size * 0.04)) / 2;
  const c = 2 * Math.PI * r;
  const rad = ((v / 100) * 360 - 90) * Math.PI / 180;
  const kx = size / 2 + r * Math.cos(rad);
  const ky = size / 2 + r * Math.sin(rad);
  const kr = inner * 0.85;
  const light = isDark ? '#60A5FA' : TECH.primary;
  const deep  = isDark ? TECH.primary : '#0F2840';

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (v <= 0) return;
    const reduce = Platform.OS === 'web' && typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, v]);
  const haloR = kr * 1.5;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="tech-eff-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={deep} />
            <Stop offset="100%" stopColor={light} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={`${TECH.primary}30`} strokeWidth={outer} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} strokeWidth={inner} fill="none" />
        {v > 0 ? (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke="url(#tech-eff-ring)" strokeWidth={inner} fill="none"
                  strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
        {v > 0 ? <Circle cx={kx} cy={ky} r={kr + Math.max(2, inner * 0.4)} fill={T.ink} fillOpacity={0.22} /> : null}
        {v > 0 ? <Circle cx={kx} cy={ky} r={kr} fill={T.ink} /> : null}
      </Svg>
      {v > 0 ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: kx - haloR, top: ky - haloR,
          width: haloR * 2, height: haloR * 2, borderRadius: haloR, backgroundColor: T.ink,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
        }} />
      ) : null}
      <View style={{ position: 'absolute', flexDirection: 'row', alignItems: 'baseline' }}>
        <AnimatedNumber
          value={v}
          duration={900}
          style={{
            fontSize: size * 0.28, fontWeight: '300', color: T.ink,
            letterSpacing: size * 0.28 * -0.04, lineHeight: size * 0.3,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}
        />
        <Text style={{ fontSize: size * 0.13, color: T.ink3, fontWeight: '400', marginStart: 3 }}>%</Text>
      </View>
    </View>
  );
}

// Teslim notu — "16 Kas · 2 gün kaldı" / "… · 3 gün gecikti". Tarih yoksa boş.
export function dueInfo(deliveryDate?: string | null): { label: string; late: boolean } {
  if (!deliveryDate) return { label: '', late: false };
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const late = deliveryDate < today;
  const f = richOrderFields({ status: 'uretimde', delivery_date: deliveryDate }, today, late);
  const head = `${autoT('Teslim')} ${f.deliveryShort}`;
  return { label: f.deliveryNote ? `${head} · ${f.deliveryNote}` : head, late };
}

// Sıradakiler — tek kartta kompakt satırlar; satıra dokununca iş açılır.
export function QueueCard({ jobs, onOpen, onAll, flush, max = 4, wide }: { jobs: TechActiveJob[]; onOpen: (id: string) => void; onAll: () => void; flush?: boolean; max?: number; wide?: boolean }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const accentInk = isDark ? '#93C5FD' : TECH.primary;
  const shown = jobs.slice(0, max);
  const more = jobs.length - shown.length;
  const chip = (j: TechActiveJob) => {
    if (j.status === 'yeniden') return { label: autoT('Geri döndü'), tone: U.chipTones.warning };
    if (j.isUrgent || j.isCritical) return { label: autoT('Acil'), tone: U.chipTones.danger };
    if (j.status === 'makine_bekliyor') return { label: autoT('Makine bekliyor'), tone: U.chipTones.neutral };
    if (j.status === 'onay_bekliyor') return { label: autoT('Onay bekliyor'), tone: U.chipTones.neutral };
    if (j.status === 'bloklu') return { label: autoT('Bloklu'), tone: U.chipTones.neutral };
    return null;
  };
  return (
    <View style={{ ...(flush ? {} : { marginHorizontal: PAGE_PADDING, marginBottom: 16 }), paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: T.ink, letterSpacing: -0.2 }}>
          {`${autoT('Sıradakiler')} · ${jobs.length}`}
        </Text>
      </View>
      {shown.map((j, i) => {
        const c = chip(j);
        const due = dueInfo(j.deliveryDate);
        return (
          <Pressable
            key={j.id}
            onPress={() => onOpen(j.id)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: T.hairline,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            {/* Klinik logosu (yuvarlak); yoksa klinik / hasta baş harfleri */}
            <View style={{
              width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
              backgroundColor: j.clinicLogoUrl ? '#FFFFFF' : `${TECH.primary}1F`,
              ...(j.clinicLogoUrl ? { borderWidth: 1, borderColor: T.hairline } : {}),
              alignItems: 'center', justifyContent: 'center',
            }}>
              {j.clinicLogoUrl
                ? <Image source={{ uri: j.clinicLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="cover" accessibilityLabel={j.clinicName ?? undefined} />
                : <Text style={{ fontSize: 12, fontWeight: '600', color: accentInk }}>{initialsOf(j.clinicName || j.patient)}</Text>}
            </View>
            {wide ? (
              /* Masaüstü: hasta + iş (iki satır) · rozet · teslim sağda */
              <>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1 }} numberOfLines={1}>{j.patient}</Text>
                    <Text style={{ fontSize: 11.5, fontFamily: T.mono, color: T.ink3, flexShrink: 0 }}>#{j.orderNo}</Text>
                  </View>
                  <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                    {[j.doctorName, `${j.workType} · ${j.stationName}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ minWidth: 60, alignItems: 'flex-start' }}>
                  {c ? (
                    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: c.tone.bg }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tone.fg }}>{c.label}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ width: 170, textAlign: 'right', fontSize: 12.5, color: due.late ? U.chipTones.danger.fg : T.ink3, fontWeight: due.late ? '600' : '400' }} numberOfLines={1}>
                  {due.label}
                </Text>
              </>
            ) : (
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink, flexShrink: 1 }} numberOfLines={1}>{j.patient}</Text>
                {c ? (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.tone.bg, flexShrink: 0 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tone.fg }}>{c.label}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                {j.workType} · {j.stationName}
              </Text>
              <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
                {[j.doctorName, `#${j.orderNo}`].filter(Boolean).join(' · ')}
              </Text>
              {due.label ? (
                <Text style={{ fontSize: 12, marginTop: 1, color: due.late ? U.chipTones.danger.fg : T.ink3, fontWeight: due.late ? '600' : '400' }} numberOfLines={1}>
                  {due.label}
                </Text>
              ) : null}
            </View>
            )}
            {isRTL()
              ? <ChevronLeft size={15} color={T.ink3} strokeWidth={2} />
              : <ChevronRight size={15} color={T.ink3} strokeWidth={2} />}
          </Pressable>
        );
      })}
      {more > 0 ? (
        <Pressable
          onPress={onAll}
          accessibilityRole="button"
          style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.hairline, alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: accentInk }}>{`${autoT('Daha fazla')} (${more})`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function initialsOf(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toLocaleUpperCase() ?? '').join('') || '—';
}

function elapsedLabel(startedAt?: string | null): string | null {
  if (!startedAt) return null;
  const min = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (!Number.isFinite(min) || min < 1) return null;
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} ${autoT('sa')} ${m} ${autoT('dk')}`;
  if (h) return `${h} ${autoT('sa')}`;
  return `${m} ${autoT('dk')}`;
}

// Aktif iş kartı — nötr kart yüzeyi (her iki temada), durum çipi, tek düğme.
// Kartın tamamı düğme DEĞİL: eskiden kart da içindeki düğme de aynı yere
// gidiyordu ve düğme "Tamamla" yazıp işi tamamlamıyordu.
export function ActiveJobCard({ job: j, onOpen }: { job: TechActiveJob; onOpen: () => void }) {
  const { t } = useTranslation();
  const T = useMobileTokens();
  const U = useInkUI();
  const isActive   = j.status === 'aktif';
  const isPaused   = j.status === 'durakladi';
  const isCritical = !!j.isCritical;
  const tone = isCritical ? U.chipTones.danger : isPaused ? U.chipTones.neutral : U.chipTones.info;
  const Icon = isCritical ? Flame : isPaused ? Pause : isActive ? Play : Clock;
  const statusLabel = isCritical ? t('station.mobile.urgent') : isActive ? autoT('Çalışıyor') : isPaused ? t('station.mobile.paused') : t('station.mobile.inQueue');
  const elapsed = isActive ? elapsedLabel(j.startedAt) : null;
  const due = dueInfo(j.deliveryDate);

  return (
    <View style={{
      padding: 16, borderRadius: 28, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 14px rgba(15,40,64,0.08)' } as any : {}),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tone.bg,
        }}>
          <Icon size={12} color={tone.fg} strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: tone.fg }}>
            {elapsed ? `${statusLabel} · ${elapsed}` : statusLabel}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, fontFamily: T.mono, color: T.ink3 }}>#{j.orderNo}</Text>
      </View>

      <Text style={{ fontSize: 18, fontWeight: '600', color: T.ink, letterSpacing: -0.3, marginTop: 12 }} numberOfLines={1}>
        {j.patient}
      </Text>
      <Text style={{ fontSize: 13, color: T.ink2, marginTop: 3 }} numberOfLines={1}>
        {j.workType} · {j.stationName}
      </Text>
      {(j.doctorName || j.clinicName) ? (
        <Text style={{ fontSize: 13, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
          {[j.doctorName, j.clinicName].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      {due.label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Clock size={13} color={due.late ? U.chipTones.danger.fg : T.ink3} strokeWidth={1.9} />
          <Text style={{ fontSize: 13, fontWeight: due.late ? '600' : '400', color: due.late ? U.chipTones.danger.fg : T.ink2 }} numberOfLines={1}>
            {due.label}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={{
          marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          minHeight: 46, borderRadius: 14, backgroundColor: TECH.primary,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>{autoT('İşi aç')}</Text>
        {isRTL()
          ? <ChevronLeft size={16} color="#FFFFFF" strokeWidth={2} />
          : <ChevronRight size={16} color="#FFFFFF" strokeWidth={2} />}
      </Pressable>
    </View>
  );
}
