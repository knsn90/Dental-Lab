// modules/station/components/TechnicianMobileDashboard.tsx
// Aydın Lab Mobile handoff — teknisyen dashboard.
// Same design pattern as DoctorMobileDashboard:
//   • Greeting + top 3 action icons (QR · İşlerim · Bell)
//   • Aktif üretim (dark hero) with animated Ring + counters
//   • KPI 2-grid (dynamic dark/soft based on activity)
//   • Week strip
//   • Aktif işlerim list (or positive empty state)

import React, { useEffect, useRef, useState } from 'react';
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
import { isRTL } from '../../../core/i18n';
import { useOrderChatInbox } from '../../orders/hooks/useOrderChatInbox';
import { ProfileMenu } from '../../../core/ui/mobile/ProfileMenu';
import Svg, { Defs, Rect, RadialGradient, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { Ring } from '../../../core/ui/mobile/Ring';
import { AnimatedNumber } from '../../../core/ui/mobile/AnimatedNumber';
import { TechCheckInCTACard } from '../../../core/ui/mobile/TechCheckInCTACard';
import { RecentCompletedList } from '../../orders/components/RecentCompletedList';
import { MyPerformanceCard } from './MyPerformanceCard';
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
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const T = useMobileTokens();
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
  const jobs       = props.activeJobs ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={TECH.primary} />}
    >
      {/* ═══ Greeting + top icons ═══ */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        // Lab logosu (PanelTopHeader: insets.top+7, 38 yüksek) ile selamlama arasında
        // nefes — diğer panellerin mobil özetleriyle aynı ofset.
        paddingTop: Math.max(insets.top, 8) + 72,
        paddingBottom: 18,
        gap: 12,
      }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 28, fontWeight: '300', color: T.ink, letterSpacing: -0.5, lineHeight: 32,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            {t('dashboard.greetingName', { name: firstName })}
          </Text>
          <Text style={{ fontSize: 13.5, color: T.ink3, marginTop: 8, lineHeight: 19 }}>
            {activeNow === 0
              ? t('station.mobile.noActiveJobWaiting')
              : t('station.mobile.activeJobsWaiting', { activeNow, todayCount })}
          </Text>
        </View>

        {/* Üst aksiyon butonları artık layout seviyesindeki TopActionBar'da
           (QR · Mesaj · Bildirim · Profil) — tüm station sayfalarında sabit. */}
      </View>

      {/* ═══ Aktif işlerim — EN ÜSTTE (yoğun teknisyen ilk bakışta "ne yapmalıyım"ı görsün) ═══ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: TECH.primary, letterSpacing: 1.4, textTransform: 'uppercase' }}>
            {t('station.mobile.yourQueue')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{
              fontSize: 20, fontWeight: '600', color: T.ink, letterSpacing: -0.3,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }}>
              {t('station.mobile.myActiveJobs')}
            </Text>
            {jobs.length > 0 && (
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                backgroundColor: TECH.primary,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 }}>{jobs.length}</Text>
              </View>
            )}
          </View>
        </View>
        {jobs.length > 0 && (
          <Pressable
            onPress={() => router.push('/(station)/jobs' as any)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: `${TECH.primary}14`,
            }}
          >
            <Text style={{ fontSize: 12, color: TECH.primary, fontWeight: '700' }}>{t('common.all')}</Text>
            {isRTL()
              ? <ChevronLeft size={13} color={TECH.primary} strokeWidth={2.2} />
              : <ChevronRight size={13} color={TECH.primary} strokeWidth={2.2} />}
          </Pressable>
        )}
      </View>

      {/* Empty state */}
      {jobs.length === 0 && (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
          padding: 16, borderRadius: 18,
          backgroundColor: `${TECH.primary}14`,
          borderWidth: 1, borderColor: `${TECH.primary}28`,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 12,
            backgroundColor: `${TECH.primary}22`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircle2 size={18} color={TECH.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink, letterSpacing: -0.1 }}>
              {t('station.mobile.noActiveJobNow')}
            </Text>
            <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              {t('station.mobile.newJobWillAppear')}
            </Text>
          </View>
        </View>
      )}

      {/* List — aktif kart canlı, bekleyenler soft accent */}
      {jobs.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          {jobs.slice(0, 3).map(j => (
            <ActiveJobCard
              key={j.id}
              job={j}
              T={T}
              onOpen={() => props.onOpenJob?.(j.id)}
            />
          ))}
        </View>
      )}

      {/* ═══ QR Check-In CTA — mesai giriş / çıkış (aktif işlerin ALTINDA) ═══ */}
      <TechCheckInCTACard
        accentColor={TECH.primary}
        onPress={() => setScanOpen(true)}
        kicker={t('station.mobile.checkIn')}
        title={t('station.mobile.checkInWithQr')}
        subtitle={t('station.mobile.scanQrInstructions')}
      />

      {/* ═══ Verimliliğin (gradient hero) ═══
          Diagonal linear (#0A1B3D→#163D8F→#2E6DFF) + sağ üst radial glow (#6BCBFF). */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 24, padding: 18,
        backgroundColor: '#0A1B3D', overflow: 'hidden',
        ...(Platform.OS === 'web'
          ? {
              // @ts-ignore — radial (üstte) + linear (altta) tek backgroundImage'da
              backgroundImage:
                'radial-gradient(circle at top right, rgba(107,203,255,0.8) 8%, rgba(107,203,255,0) 60%), ' +
                'linear-gradient(135deg, #0A1B3D 0%, #163D8F 50%, #2E6DFF 100%)',
            } as any
          : {}),
      }}>
        {/* Native — SVG linear + radial overlay */}
        {Platform.OS !== 'web' && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Svg width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                {/* Diagonal base — topLeading → bottomTrailing */}
                <SvgLinearGradient id="eff-base" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%"   stopColor="#0A1B3D" />
                  <Stop offset="50%"  stopColor="#163D8F" />
                  <Stop offset="100%" stopColor="#2E6DFF" />
                </SvgLinearGradient>
                {/* Sağ üst parlak glow — #6BCBFF@0.8 → clear */}
                <RadialGradient id="eff-glow" cx="100%" cy="0%" rx="95%" ry="95%" fx="100%" fy="0%">
                  <Stop offset="0%"   stopColor="#6BCBFF" stopOpacity="0.8" />
                  <Stop offset="8%"   stopColor="#6BCBFF" stopOpacity="0.8" />
                  <Stop offset="100%" stopColor="#6BCBFF" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#eff-base)" />
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#eff-glow)" />
            </Svg>
          </View>
        )}

        {/* Doku katmanı — görsel yarı saydam (%50): altındaki diagonal gradient
           görünür kalsın, görselin grain/doku hissi üste binsin.
           NOT: width/height vermiyoruz; inset:0 ile tüm border box'ı kaplasın. */}
        <Image
          source={require('../../../assets/images/efficiency-bg.png')}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5, ...({ pointerEvents: 'none' } as any) }}
        />

        {/* Beyaz dikey sheen — rgba(255,255,255,.08) → 0 */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id="eff-sheen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#eff-sheen)" />
          </Svg>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4,
              backgroundColor: TECH.primary,
              ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${TECH.primary}30` } as any : {}),
            }} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: T.onDark2, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {t('station.mobile.yourEfficiency')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: T.onDark3, fontFamily: T.mono }}>
            {activeNow} {t('station.mobile.activeCount')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
          <Ring value={efficiency} size={130} stroke={11} color={TECH.primary} track="rgba(255,255,255,0.10)" animatedEndDot>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <AnimatedNumber
                value={efficiency}
                duration={900}
                style={{
                  fontSize: 40, fontWeight: '400', color: T.onDark, letterSpacing: -1.0, lineHeight: 42,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}
              />
              <Text style={{
                fontSize: 16, color: TECH.primary, fontWeight: '400',
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }}>%</Text>
            </View>
          </Ring>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              {[
                { l: t('common.today'),  n: todayCount, animated: true },
                { l: t('common.week'),  n: weekCount, animated: true },
                { l: t('common.total'), n: totalCount, animated: true },
                {
                  l: t('station.mobile.avgHours'),
                  n: props.avgDurationHours != null ? props.avgDurationHours.toFixed(1) : '—',
                  animated: false,
                },
              ].map((s, i) => (
                <View key={i} style={{ alignItems: 'flex-start' }}>
                  {s.animated ? (
                    <AnimatedNumber
                      value={typeof s.n === 'number' ? s.n : 0}
                      duration={700}
                      delay={i * 80}
                      style={{
                        fontSize: 16, fontWeight: '500', color: T.onDark,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }}
                    />
                  ) : (
                    <Text style={{
                      fontSize: 16, fontWeight: '500', color: T.onDark,
                      ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                    }}>
                      {s.n}
                    </Text>
                  )}
                  <Text style={{ fontSize: 9, color: T.onDark3, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {s.l}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)' }}>
              <View style={{ width: `${Math.min(100, efficiency)}%`, height: 4, borderRadius: 2, backgroundColor: TECH.primary }} />
            </View>
          </View>
        </View>
      </View>

      {/* ═══ KPI 2-grid ═══ */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Kpi
          label={t('station.mobile.activeJob')}
          numericValue={activeNow}
          delta={activeNow > 0 ? t('station.mobile.inProgress') : t('station.mobile.empty')}
          deltaColor={activeNow > 0 ? TECH.primary : T.ink3}
          sub={`${jobs.filter(j => j.isCritical).length} ${t('station.mobile.critical')}`}
          // Active jobs varsa highlight et
          dark={activeNow > 0}
          accent={TECH.primary}
          icon={ListChecks}
        />
        <Kpi
          label={t('station.mobile.completedToday')}
          numericValue={todayCount}
          delta={`${weekCount} ${t('station.mobile.thisWeek')}`}
          sub={props.avgDurationHours != null ? `${props.avgDurationHours.toFixed(1)} ${t('station.mobile.avgHours')}` : '—'}
          icon={CheckCircle2}
        />
      </View>

      {/* ═══ Mesajlar kartı — okunmamışı öne çıkarır (panel accent) ═══ */}
      <UnreadMessagesCard
        accent={TECH.primary}
        onOpenOrder={(id) => router.push(`/(station)/order/${id}` as any)}
      />

      {/* ═══ Week strip ═══ */}
      <View style={{
        marginHorizontal: 16, marginBottom: 16,
        padding: 14, borderRadius: 20,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8 }}>
          <Text
            style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 }}
            numberOfLines={1}
          >
            {t('common.thisWeek')} · {props.weekRange ?? ''}
          </Text>
          <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>
            Toplam <Text style={{ color: T.ink, fontWeight: '600' }}>{week.reduce((a, b) => a + b, 0)}</Text>
          </Text>
        </View>
        {/* Teknisyen: hatched-rail pill kolonları — blue accent */}
        {(() => {
          const SCALE_MAX = 20;
          const FILL_LIGHT = `${TECH.primary}55`;
          const FILL_DARK  = TECH.primary;
          const RAIL_BG    = `${TECH.primary}08`;
          const STRIPE_BG  = `repeating-linear-gradient(135deg, ${TECH.primary}14 0 6px, transparent 6px 12px)`;

          return (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 110, paddingHorizontal: 2 }}>
              {['Pa', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d, i) => {
                const n = week[i] ?? 0;
                const isToday = i === 6;
                const pct = n > 0 ? Math.min(Math.max((n / SCALE_MAX) * 100, 8), 100) : 0;
                const empty = n === 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
                    <View style={{ width: '100%', maxWidth: 36, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {isToday && n > 0 && (
                        <View style={{ marginBottom: 3, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: FILL_DARK }}>{n}</Text>
                        </View>
                      )}
                      <View style={{
                        width: '100%', height: '100%', borderRadius: 999,
                        backgroundColor: RAIL_BG,
                        ...(Platform.OS === 'web' ? { backgroundImage: STRIPE_BG } as any : {}),
                        overflow: 'hidden', position: 'relative' as any,
                      }}>
                        {!empty && (
                          <View style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${pct}%`, borderRadius: 999,
                            backgroundColor: isToday ? FILL_DARK : FILL_LIGHT,
                            ...(Platform.OS === 'web' ? { transition: 'height 800ms cubic-bezier(0.22, 1, 0.36, 1)' } as any : {}),
                          } as any} />
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: isToday ? '700' : '500', color: isToday ? T.ink : T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {d[0]}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      {/* ═══ Son Tamamlananlar (son 5 iş) — Bu hafta kartının altında ═══ */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <RecentCompletedList accentColor={TECH.primary} limit={5} />
      </View>

      {/* ═══ Performansım — en sonda, kendi performans özeti ═══ */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <MyPerformanceCard accentColor={TECH.primary} />
      </View>

      {/* Quick actions removed — QR & İşlerim are now top icons */}

      {/* Profile menu — tema modu seçici · Profil · Çıkış Yap */}
      <ProfileMenu
        visible={profileMenuOpen}
        anchorTop={120}
        onClose={() => setProfileMenuOpen(false)}
        onProfile={handleProfile}
        onAccessCode={handleAccessCode}
        onLogout={handleLogout}
      />

      {/* Mesajlar artık layout'taki TopActionBar'dan açılıyor (buradaki kopya
          hiç açılmıyordu ve ScrollView içinde olduğu için sayfayla kayardı). */}
    </ScrollView>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

// ── Aktif iş kartı — Aktif: dolu accent + nabız; Bekleyen: soft accent border ──
function ActiveJobCard({ job: j, T, onOpen }: { job: TechActiveJob; T: any; onOpen: () => void }) {
  const { t } = useTranslation();
  const statusKind: 'aktif' | 'bekliyor' | 'durakladi' = (j.status as any) ?? 'bekliyor';
  const isActive   = statusKind === 'aktif';
  const isPaused   = statusKind === 'durakladi';
  const isCritical = !!j.isCritical;
  const Icon = isCritical ? Flame : isPaused ? Pause : isActive ? Play : Clock;

  // Nabız animasyonu — aktif veya kritik kart için
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isActive && !isCritical) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, isCritical, pulse]);
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const dotScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });

  // Renkler
  const accent = isCritical ? T.ruby : TECH.primary;
  const cardBg = isActive
    ? accent
    : isCritical
      ? `${T.ruby}1A`
      : isPaused
        ? `${TECH.accentDark}10`
        : '#FFFFFF';
  const cardBorder = isActive
    ? 'transparent'
    : isCritical
      ? `${T.ruby}55`
      : `${TECH.primary}28`;
  const titleColor    = isActive ? '#FFFFFF' : T.ink;
  const subColor      = isActive ? 'rgba(255,255,255,0.78)' : T.ink3;
  const orderNoColor  = isActive ? 'rgba(255,255,255,0.85)' : T.ink2;
  const iconBg        = isActive
    ? 'rgba(255,255,255,0.22)'
    : isCritical
      ? `${T.ruby}1F`
      : isPaused
        ? `${TECH.accentDark}1A`
        : `${TECH.primary}1F`;
  const iconColor     = isActive ? '#FFFFFF' : isCritical ? T.ruby : isPaused ? TECH.accentDark : TECH.primary;
  const badgeBg       = isActive ? 'rgba(255,255,255,0.20)' : isCritical ? T.ruby : isPaused ? T.cardSoft : `${TECH.primary}1A`;
  const badgeFg       = isActive ? '#FFFFFF' : isCritical ? '#FFFFFF' : isPaused ? T.ink2 : TECH.primary;
  const statusLabel   = isActive ? t('station.mobile.working') : isPaused ? t('station.mobile.paused') : isCritical ? t('station.mobile.urgent') : t('station.mobile.inQueue');
  const showPulse     = isActive || isCritical;

  return (
    <Pressable onPress={onOpen}>
      {({ pressed }: any) => (
        <View
          style={{
            padding: 14, borderRadius: 18,
            backgroundColor: cardBg,
            borderWidth: 1, borderColor: cardBorder,
            opacity: pressed ? 0.94 : 1,
            transform: [{ scale: pressed ? 0.995 : 1 }],
            ...(Platform.OS === 'web' ? {
              boxShadow: isActive
                ? `0 8px 20px ${accent}55`
                : isCritical
                  ? `0 4px 14px ${T.ruby}33`
                  : `0 1px 4px rgba(0,0,0,0.04)`,
              cursor: 'pointer',
              transition: 'transform 0.12s, opacity 0.12s',
            } as any : {}),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Sol icon — nabız halo'lu (aktif/kritik için) */}
          <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {showPulse && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute', width: 44, height: 44, borderRadius: 14,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.35)' : `${T.ruby}33`,
                  opacity: dotOpacity, transform: [{ scale: dotScale }],
                }}
              />
            )}
            <View style={{
              width: 44, height: 44, borderRadius: 14,
              backgroundColor: iconBg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} color={iconColor} strokeWidth={1.9} />
            </View>
          </View>

          {/* Orta — hasta + sipariş + iş bilgisi */}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Text
                style={{ fontSize: 15, fontWeight: '700', color: titleColor, flexShrink: 1, letterSpacing: -0.2 }}
                numberOfLines={1}
              >
                {j.patient}
              </Text>
              <Text style={{
                fontSize: 10.5, fontFamily: T.mono, fontWeight: '600',
                color: orderNoColor, flexShrink: 0,
                paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                backgroundColor: isActive ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)',
              }}>
                #{j.orderNo}
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: subColor, fontWeight: '500' }} numberOfLines={1}>
              {j.workType} · {j.stationName}
            </Text>
            {(j.doctorName || j.clinicName) && (
              <Text
                style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.72)' : T.ink3, fontWeight: '500' }}
                numberOfLines={1}
              >
                {[j.doctorName, j.clinicName].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>

          {/* Sağ — durum + chevron */}
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 10, paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: badgeBg,
            }}>
              {showPulse && (
                <Animated.View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: badgeFg,
                  opacity: dotOpacity,
                }} />
              )}
              <Text style={{
                fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4,
                color: badgeFg, textTransform: 'uppercase',
              }}>
                {statusLabel}
              </Text>
            </View>
            {isRTL()
              ? <ChevronLeft size={15} color={isActive ? 'rgba(255,255,255,0.78)' : T.ink3} strokeWidth={2.2} />
              : <ChevronRight size={15} color={isActive ? 'rgba(255,255,255,0.78)' : T.ink3} strokeWidth={2.2} />}
          </View>
          </View>

          {/* Durum-farkında CTA — tek dokunuşla eyleme: başlamamışsa "İşe Başla",
              başlamışsa "Tamamla". Gerçek akış (malzeme onayı + aktif-limit) OperatorScreen'de. */}
          <Pressable
            onPress={onOpen}
            style={{
              marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 11, borderRadius: 13,
              backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : TECH.primary,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            {isPaused
              ? <Play size={16} color="#FFFFFF" strokeWidth={2} />
              : j.startedAt
                ? <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2} />
                : <Play size={16} color="#FFFFFF" strokeWidth={2} />}
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>
              {isPaused ? autoT('Devam et') : j.startedAt ? autoT('Tamamla') : autoT('İşe Başla')}
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
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

function onAccentInk(accent: string): string {
  const h = (accent || '#000000').replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0A0A0A' : '#FFFFFF';
}

function Kpi({ label, numericValue, delta, deltaColor, sub, dark, accent, icon: Icon }:
  { label: string; numericValue: number; delta?: string; deltaColor?: string; sub?: string; dark?: boolean; accent?: string; icon?: any }) {
  const T = useMobileTokens();
  const acc = accent ?? '#F5C24B';
  const fill = !!dark;
  const onAcc = onAccentInk(acc);
  const valueColor = fill ? onAcc : T.ink;
  const labelColor = fill ? `${onAcc}AA` : T.ink3;
  const subColor = fill ? `${onAcc}AA` : T.ink3;
  const deltaColorFinal = fill ? `${onAcc}DD` : (deltaColor ?? T.ink2);
  const iconBg = fill ? `${onAcc}26` : `${acc}1A`;
  const iconColor = fill ? onAcc : acc;
  return (
    <View style={{
      flex: 1, borderRadius: 24, padding: 16,
      backgroundColor: fill ? acc : T.card,
      borderWidth: fill ? 0 : 1, borderColor: T.hairline,
    }}>
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: labelColor, letterSpacing: 1, textTransform: 'uppercase' }} numberOfLines={1}>
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
