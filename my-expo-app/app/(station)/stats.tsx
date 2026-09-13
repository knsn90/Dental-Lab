// app/(station)/stats.tsx
// Teknisyen Dashboard — Lab paneli kart tarzı (Patterns), tech-blue tema.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { firstName as displayFirstName } from '../../core/util/personName';
import { View, Text, ScrollView, Pressable, Platform, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Check, Clock, Flame, TrendingUp, Calendar, ArrowUpRight, ArrowUpLeft, ListTodo,
  Wrench, Zap, AlertTriangle, ArrowRight, ArrowLeft, Play, CheckCircle2,
} from '../../core/ui/icons';
import { autoT } from '../../core/i18n/autoTranslate';
import { resolveDoctorClinicNames } from '../../modules/orders/api';
import { useAuthStore } from '../../core/store/authStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { supabase } from '../../core/api/supabase';
import { LinearProgressX, PercentRingX } from '../../core/ui/ProgressX';
import { DS } from '../../core/theme/dsTokens';
import { useStationTheme, hexA } from '../../core/theme/stationPalette';
import { localeTag, isRTL, fmtDayMonthShort, fmtDayMonthYear } from '../../core/i18n';
import { mobileTopPad } from '../../core/ui/pageMetrics';

const SERIF = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const STATION_ACCENT = '#3B82F6';
const STATION_DEEP   = '#1E5FBF';

// ── Card wrapper (Lab dashboard tarzı) ─────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const P = useStationTheme();
  return (
    <View
      className="overflow-hidden"
      style={[{ backgroundColor: P.surface, borderRadius: 24, borderWidth: 1, borderColor: P.ink100 }, style]}
    >
      {children}
    </View>
  );
}

// ── AnimatedActiveJobCard — pulsing dot + ambient glow + breathing ─────
function AnimatedActiveJobCard({
  activeJob, activeNow, router,
}: {
  activeJob: ActiveJob | null;
  activeNow: number;
  router: any;
}) {
  const { t } = useTranslation();
  const P = useStationTheme();
  const dotAnim     = useRef(new Animated.Value(0)).current;
  const glowAnim    = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [dotAnim, glowAnim, breatheAnim]);

  const dotOpacity   = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const glowOpacity  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] });
  const glowScale    = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View
      className="overflow-hidden"
      style={{
        flex: 1, minWidth: 320,
        backgroundColor: P.surface,
        borderRadius: 24,
        borderWidth: 1, borderColor: P.ink100,
      }}
    >
      {/* Üst: Koyu denim gradient — animated content */}
      <View style={{
        // @ts-ignore — web gradient
        backgroundImage: `linear-gradient(180deg, ${STATION_DEEP} 0%, #0F2840 100%)`,
        backgroundColor: '#0F2840',
        minHeight: 140,
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
        {/* Ambient glow */}
        <Animated.View
          style={{
            position: 'absolute', width: 220, height: 220, borderRadius: 110,
            backgroundColor: STATION_ACCENT,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }}
          pointerEvents="none"
        />

        {/* AKTİF badge */}
        <View className="absolute rounded-full" style={{
          top: 14, start: 14,
          paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: hexA(STATION_ACCENT, 0.95),
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Animated.View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: '#FFFFFF',
            opacity: dotOpacity,
          }} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#FFFFFF', letterSpacing: 0.6 }}>
            {t('station.badges.active')}
          </Text>
        </View>

        {/* Sağ üst: critical badge */}
        {activeJob?.is_critical && (
          <View className="absolute rounded-full" style={{
            top: 14, end: 14,
            paddingHorizontal: 8, paddingVertical: 4,
            backgroundColor: 'rgba(217,119,6,0.95)',
            flexDirection: 'row', alignItems: 'center', gap: 4,
          }}>
            <AlertTriangle size={9} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
              {t('station.badges.critical')}
            </Text>
          </View>
        )}

        {/* Center content */}
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: activeJob ? breatheScale : 1 }] }}>
          <View style={{
            width: 44, height: 44, borderRadius: 14,
            backgroundColor: hexA(STATION_ACCENT, 0.18),
            borderWidth: 1.5, borderColor: hexA(STATION_ACCENT, 0.40),
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 8,
          }}>
            <Wrench size={20} color="#FFFFFF" strokeWidth={1.7} />
          </View>
          {activeJob ? (
            <>
              <Text style={{ ...SERIF, fontSize: 19, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 22, textAlign: 'center' }}>
                {activeJob.station_name ?? '—'}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2, letterSpacing: 0.3 }}>
                {t('station.dashboard.workingOn')}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ ...SERIF, fontSize: 19, color: 'rgba(255,255,255,0.85)', letterSpacing: -0.4, textAlign: 'center' }}>
                {t('station.dashboard.noActiveJob')}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {t('station.dashboard.waitingForAssignment')}
              </Text>
            </>
          )}
        </Animated.View>

        {/* Sağ alt: count chip */}
        <View className="absolute" style={{ bottom: 14, end: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Zap size={11} color={STATION_ACCENT} strokeWidth={2.2} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 }}>
            {activeNow}
          </Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{t('station.dashboard.activeCount')}</Text>
        </View>
      </View>

      {/* Alt: White section — order info */}
      <Pressable
        onPress={() => router.push('/(station)/jobs' as any)}
        style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          {activeJob ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900 }} numberOfLines={1}>
                {activeJob.patient_name ?? 'Hasta —'}
              </Text>
              <Text style={{ fontSize: 11, color: P.ink500 }} numberOfLines={1}>
                #{activeJob.order_number ?? '—'} · {activeJob.work_type ?? ''}
              </Text>
              {(activeJob.doctor_name || activeJob.clinic_name) && (
                <Text style={{ fontSize: 11, color: P.ink400 }} numberOfLines={1}>
                  {[activeJob.doctor_name, activeJob.clinic_name].filter(Boolean).join(' · ')}
                </Text>
              )}
            </>
          ) : (
            <Text style={{ fontSize: 13, color: P.ink400 }}>{t('station.dashboard.jobsAppearWhenAssigned')}</Text>
          )}
        </View>
        {activeJob ? (
          /* Durum-farkında CTA (mobil ile aynı): başlamamışsa İşe Başla, başlamışsa Tamamla.
             Gerçek akış (malzeme/aktif-limit) İşler ekranında. */
          <View className="flex-row items-center rounded-full" style={{ gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: STATION_ACCENT }}>
            {activeJob.status === 'durakladi'
              ? <Play size={15} color="#FFFFFF" strokeWidth={2} />
              : activeJob.started_at
                ? <CheckCircle2 size={15} color="#FFFFFF" strokeWidth={2} />
                : <Play size={15} color="#FFFFFF" strokeWidth={2} />}
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
              {activeJob.status === 'durakladi' ? autoT('Devam et') : activeJob.started_at ? autoT('Tamamla') : autoT('İşe Başla')}
            </Text>
          </View>
        ) : (
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 32, height: 32, backgroundColor: hexA(STATION_ACCENT, 0.10) }}
          >
            {isRTL() ? <ArrowUpLeft size={14} color={STATION_ACCENT} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={STATION_ACCENT} strokeWidth={1.8} />}
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ── Recent activity types ──────────────────────────────────────────────
interface RecentItem {
  id: string;
  station_name: string | null;
  patient_name: string | null;
  order_number: string | null;
  completed_at: string | null;
}

interface ActiveJob {
  stage_id: string;
  station_name: string | null;
  station_color: string | null;
  is_critical: boolean;
  patient_name: string | null;
  order_number: string | null;
  work_type: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  started_at: string | null;
  status: string | null;
}
interface DayBar {
  date: string;
  label: string;
  count: number;
}

// ── Yeni Sipariş CTA kartı — station mavi (diğer panellerdeki AnimatedCTACard'ın eşi) ──
function StationCTACard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(floatAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(floatAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(arrowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(arrowAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [floatAnim, glowAnim, arrowAnim]);

  const floatY      = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.28] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const arrowX      = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, isRTL() ? -6 : 6] });

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => Animated.spring(scaleAnim, { toValue: 1.02, friction: 8, tension: 200, useNativeDriver: true }).start()}
      onHoverOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start()}
      style={{ flex: 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
    >
      <Animated.View style={{
        flex: 1,
        borderRadius: 24, padding: 22, overflow: 'hidden', position: 'relative',
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(135deg, ${STATION_ACCENT} 0%, ${STATION_DEEP} 100%)`,
        backgroundColor: STATION_ACCENT, minHeight: 180,
        transform: [{ scale: scaleAnim }],
      }}>
        <Animated.View style={{ position: 'absolute', top: -20, end: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.18)', transform: [{ translateY: floatY }] }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -40, end: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: '#FFFFFF', opacity: glowOpacity, transform: [{ scale: glowScale }] }} />
        <View style={{ position: 'relative' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>{t('station.dashboard.quickAction')}</Text>
          <Text style={{ ...SERIF, fontSize: 32, letterSpacing: -0.6, lineHeight: 35, color: '#FFFFFF', marginBottom: 18 }}>{t('station.dashboard.createNewOrder')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFFFFF', gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: STATION_DEEP }}>{t('station.dashboard.start')}</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              {isRTL() ? <ArrowLeft size={14} color={STATION_DEEP} strokeWidth={2.2} /> : <ArrowRight size={14} color={STATION_DEEP} strokeWidth={2.2} />}
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function StationDashboard() {
  const { t, i18n } = useTranslation();
  const P = useStationTheme();
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  const router = useRouter();
  const canCreateOrder = usePermissionStore(s => s.can('manage_order_create'));
  const insets = useSafeAreaInsets();

  // Selamlama page title'a taşındı — toolbar ile aynı dikey hizada
  // (önceki "Hoş geldin" hero bloğu kaldırıldı)
  // Set işi aşağıdaki effect'te yapılır, çünkü stats verisine bağlı.

  // Bugünün tarihi
  const todayLabel = useMemo(() => {
    const days = t('common.days').split(' ');
    const months = t('common.months').split(' ');
    const d = new Date();
    return {
      day:  days[d.getDay()],
      date: fmtDayMonthYear(d),
    };
  }, []);

  const [stats, setStats] = useState<{
    completed: number;
    todayCount: number;
    activeNow: number;
    waste: number;
    avgDurationHours: number | null;
    efficiency: number;
    weekBars: DayBar[];
    recent: RecentItem[];
    activeJob: ActiveJob | null;
  }>({
    completed: 0, todayCount: 0, activeNow: 0, waste: 0,
    avgDurationHours: null, efficiency: 0,
    weekBars: [], recent: [],
    activeJob: null,
  });
  const [loading, setLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Realtime tick — order_stages değişince effect tetiklenip yeniden yüklesin
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    if (!profile?.id) return;
    const ch = supabase
      .channel(`station-stats-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages', filter: `technician_id=eq.${profile.id}` },
        () => setReloadTick(t => t + 1),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0);

      const [
        { count: completed },
        { count: todayCount },
        { count: activeNow },
        { data: wasteRows },
        { data: durations },
        { data: weekStages },
        { data: recentRows },
        { data: activeRows },
      ] = await Promise.all([
        supabase.from('order_stages').select('id', { count: 'exact', head: true })
          .eq('technician_id', profile.id).in('status', ['tamamlandi','onaylandi']),
        supabase.from('order_stages').select('id', { count: 'exact', head: true })
          .eq('technician_id', profile.id).in('status', ['tamamlandi','onaylandi'])
          .gte('completed_at', todayStart.toISOString()),
        supabase.from('order_stages').select('id', { count: 'exact', head: true })
          .eq('technician_id', profile.id).in('status', ['aktif', 'durakladi']),
        supabase.from('stock_movements').select('quantity').eq('user_id', profile.id).eq('type', 'WASTE').limit(1000),
        supabase.from('order_stages').select('started_at, completed_at')
          .eq('technician_id', profile.id).in('status', ['tamamlandi','onaylandi'])
          .not('started_at', 'is', null).not('completed_at', 'is', null).limit(50),
        supabase.from('order_stages').select('completed_at')
          .eq('technician_id', profile.id).in('status', ['tamamlandi','onaylandi'])
          .gte('completed_at', weekAgo.toISOString()),
        supabase.from('order_stages').select(`
            id, completed_at,
            station:lab_stations(name),
            work_order:work_orders!work_order_id(order_number, patient_name)
          `)
          .eq('technician_id', profile.id).in('status', ['tamamlandi','onaylandi'])
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(5),
        // Aktif iş — animated hero kart için
        supabase.from('order_stages').select(`
            id, started_at, is_critical, status,
            station:lab_stations(name, color, is_critical),
            work_order:work_orders!work_order_id(order_number, patient_name, work_type, doctor_id)
          `)
          .eq('technician_id', profile.id).in('status', ['aktif', 'durakladi'])
          .order('status', { ascending: true })
          .order('started_at', { ascending: false })
          .limit(1),
      ]);

      let avgDurationHours: number | null = null;
      if (durations && durations.length > 0) {
        const total = durations.reduce((sum, d: any) => {
          const start = new Date(d.started_at).getTime();
          const end = new Date(d.completed_at).getTime();
          return sum + (end - start);
        }, 0);
        avgDurationHours = +(total / durations.length / 3_600_000).toFixed(1);
      }

      const days = ['Pzr','Pzt','Sal','Çar','Per','Cum','Cmt'];
      const weekBars: DayBar[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const iso = d.toISOString().slice(0, 10);
        const dayCount = (weekStages ?? []).filter((s: any) => (s.completed_at ?? '').startsWith(iso)).length;
        weekBars.push({ date: iso, label: days[d.getDay()], count: dayCount });
      }

      const wasteCount = (wasteRows ?? []).length;
      const totalCompleted = completed ?? 0;
      const efficiency = totalCompleted + wasteCount > 0
        ? Math.round((totalCompleted / (totalCompleted + wasteCount)) * 100)
        : 0;

      const recent: RecentItem[] = ((recentRows ?? []) as any[]).map(r => ({
        id: r.id,
        station_name: r.station?.name ?? null,
        patient_name: r.work_order?.patient_name ?? null,
        order_number: r.work_order?.order_number ?? null,
        completed_at: r.completed_at ?? null,
      }));

      // Aktif iş (en yeni başlanmış) — animated hero için
      const a = (activeRows ?? [])[0] as any;
      const activeJob: ActiveJob | null = a ? {
        stage_id:      a.id,
        station_name:  a.station?.name ?? null,
        station_color: a.station?.color ?? null,
        is_critical:   !!(a.station?.is_critical || a.is_critical),
        patient_name:  a.work_order?.patient_name ?? null,
        order_number:  a.work_order?.order_number ?? null,
        work_type:     a.work_order?.work_type ?? null,
        doctor_name:   null,
        clinic_name:   null,
        started_at:    a.started_at ?? null,
        status:        a.status ?? null,
      } : null;

      // Hekim + klinik adını çöz (doctor_id polimorfik). Teknisyen is_lab_user()
      // TRUE olduğundan doctors/clinics/profiles okuyabilir.
      const activeDocId = a?.work_order?.doctor_id as string | null | undefined;
      if (activeJob && activeDocId) {
        try {
          const nameMap = await resolveDoctorClinicNames([activeDocId]);
          const info = nameMap.get(activeDocId);
          if (info) { activeJob.doctor_name = info.doctorName; activeJob.clinic_name = info.clinicName; }
        } catch (e) {
          console.warn('[station-stats] doctor/clinic resolve failed:', (e as any)?.message);
        }
      }

      setStats({
        completed: totalCompleted,
        todayCount: todayCount ?? 0,
        activeNow: activeNow ?? 0,
        waste: (wasteRows ?? []).reduce((s, r: any) => s + Number(r.quantity ?? 0), 0),
        avgDurationHours,
        efficiency,
        weekBars,
        recent,
        activeJob,
      });
      setLoading(false);
    })();
  }, [profile?.id, reloadTick]);

  const maxBar = useMemo(
    () => Math.max(1, ...stats.weekBars.map(b => b.count)),
    [stats.weekBars],
  );

  // Page title gizli — dashboard'da kullanmıyoruz, content yukarı gelsin
  useEffect(() => {
    setTitle('', '');
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Aydın Lab handoff (TechnicianMobileDashboard)
  // ══════════════════════════════════════════════════════════════
  const { width: _wMob } = require('react-native').useWindowDimensions();
  if (_wMob < 1024) {
    const { TechnicianMobileDashboard } = require('../../modules/station/components/TechnicianMobileDashboard');
    // Aktif işleri "active jobs" listesine çevirelim. stats.activeJob tek bir kayıt;
    // hero'daki kart için yeterli. Daha geniş liste için ileride ayrı query yapılabilir.
    const activeJobsArr = stats.activeJob ? [{
      id:           stats.activeJob.stage_id,
      orderNo:      stats.activeJob.order_number ?? '—',
      patient:      stats.activeJob.patient_name ?? 'Hasta',
      workType:     stats.activeJob.work_type ?? 'Sipariş',
      stationName:  stats.activeJob.station_name ?? 'İstasyon',
      doctorName:   stats.activeJob.doctor_name,
      clinicName:   stats.activeJob.clinic_name,
      status:       stats.activeJob.status ?? 'aktif',
      startedAt:    stats.activeJob.started_at,
      isCritical:   stats.activeJob.is_critical,
    }] : [];
    const monthsShort = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const wkStart = new Date(); wkStart.setDate(wkStart.getDate() - 6);
    const weekRange = `${fmtDayMonthShort(wkStart)} → ${fmtDayMonthShort(new Date())}`;
    const weekCompleted = stats.weekBars.reduce((s, b) => s + b.count, 0);

    // Notification buckets — teknisyen-specific labels
    const { NotificationsSheet } = require('../../core/ui/mobile/NotificationsSheet');
    const notifActive = activeJobsArr.filter(j => !j.isCritical).map(j => ({
      id: j.orderNo,
      _id: j.id,
      patient: j.patient,
      workType: `${j.workType} · ${j.stationName}`,
    }));
    const notifCritical = activeJobsArr.filter(j => j.isCritical).map(j => ({
      id: j.orderNo,
      _id: j.id,
      patient: j.patient,
      workType: `${j.workType} · ${j.stationName}`,
      daysLate: 0,
    }));

    return (
      <>
        <TechnicianMobileDashboard
          activeNow={stats.activeNow}
          todayCompleted={stats.todayCount}
          weekCompleted={weekCompleted}
          totalCompleted={stats.completed}
          avgDurationHours={stats.avgDurationHours}
          efficiencyPct={stats.efficiency}
          weekBars={stats.weekBars.map(b => b.count)}
          weekRange={weekRange}
          activeJobs={activeJobsArr}
          onOpenJob={(id: string) => router.push(`/(station)/jobs?focus=${id}` as any)}
          onJobs={() => router.push('/(station)/jobs' as any)}
          onHistory={() => router.push('/(station)/history' as any)}
          onNotifications={() => setNotificationsOpen(true)}
          refreshing={loading}
          onRefresh={() => { setLoading(true); }}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onOpenOrder={(dbId: string) => router.push(`/(station)/jobs?focus=${dbId}` as any)}
          panel="teknisyen"
          approvals={notifActive}
          overdue={notifCritical}
          upcoming={[]}
          labels={{
            approvals: 'Aktif işler',
            overdue:   'Kritik / acil',
            upcoming:  'Yaklaşan',
          }}
        />
      </>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: P.pageBg }}
      contentContainerStyle={{ padding: 16, paddingTop: mobileTopPad(insets.top), paddingBottom: 120, gap: 16 }}
    >
      {/* ═══ HERO — Tarih + selamlama ═══ */}
      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: STATION_ACCENT, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          {todayLabel.day} · {todayLabel.date}
        </Text>
        <Text style={{ ...SERIF, fontSize: 42, color: P.ink900, letterSpacing: -1.4, lineHeight: 44, marginTop: 4 }}>
          Hoş geldin, <Text style={{ color: P.ink400 }}>{displayFirstName(profile?.full_name)}</Text>
        </Text>
        <Text style={{ fontSize: 13, color: P.ink500, marginTop: 6 }}>
          {stats.activeNow === 0
            ? 'Şu an aktif iş yok — yeni atama gelince burada görünecek.'
            : `${stats.activeNow} aktif iş seni bekliyor.`}
        </Text>
      </View>

      {/* ═══ TOP ROW — Yeni Sipariş CTA + aktif iş + performans (aynı satır) ═══ */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {/* HERO: Aktif iş animated card */}
        <View style={{ flex: 1.2, minWidth: 240 }}>
          <AnimatedActiveJobCard
            activeJob={stats.activeJob}
            activeNow={stats.activeNow}
            router={router}
          />
        </View>

        {/* Sağ: Tek zengin performans kartı — hero ile aynı yükseklik */}
        <View style={{ flex: 1, minWidth: 230 }}>
          <Card style={{ padding: 22, flex: 1, justifyContent: 'space-between', gap: 18 }}>
            {/* Header */}
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 10,
                backgroundColor: hexA(STATION_DEEP, 0.12),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={16} color={STATION_DEEP} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  {t('station.dashboard.performance')}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900, letterSpacing: -0.1, marginTop: 1 }}>
                  {t('station.dashboard.completedStages')}
                </Text>
              </View>
            </View>

            {/* Büyük öne çıkan metrik — Bugün */}
            <View style={{ gap: 4 }}>
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#1F6B47' }} />
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.ink500, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {t('common.today')}
                </Text>
                <Text style={{ fontSize: 10.5, color: P.ink400, marginStart: 'auto' }}>{todayLabel.day}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ ...SERIF, fontSize: 52, lineHeight: 54, color: P.ink900, letterSpacing: -1.4 }}>
                  {loading ? '…' : stats.todayCount}
                </Text>
                <Text style={{ fontSize: 14, color: P.ink500, fontWeight: '500' }}>{t('station.dashboard.stagesCompleted')}</Text>
              </View>
            </View>

            {/* Alt: 2 ikincil metrik yan yana */}
            <View style={{ flexDirection: 'row', alignItems: 'stretch', paddingTop: 14, borderTopWidth: 1, borderTopColor: P.ink100 }}>
              {/* Toplam */}
              <View style={{ flex: 1, gap: 4, paddingEnd: 12 }}>
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATION_DEEP }} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {t('common.total')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ ...SERIF, fontSize: 26, lineHeight: 28, color: P.ink900, letterSpacing: -0.6 }}>
                    {loading ? '…' : (Number(stats.completed) || 0).toLocaleString(localeTag(i18n.language))}
                  </Text>
                  <Text style={{ fontSize: 11, color: P.ink400 }}>{t('common.stages')}</Text>
                </View>
                <Text style={{ fontSize: 10.5, color: P.ink400 }}>{t('common.allTime')}</Text>
              </View>

              {/* Ayırıcı */}
              <View style={{ width: 1, backgroundColor: P.ink100 }} />

              {/* Ort. süre */}
              <View style={{ flex: 1, gap: 4, paddingStart: 12 }}>
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#9C5E0E' }} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {t('station.dashboard.averageDuration')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ ...SERIF, fontSize: 26, lineHeight: 28, color: P.ink900, letterSpacing: -0.6 }}>
                    {loading || stats.avgDurationHours == null ? '—' : stats.avgDurationHours}
                  </Text>
                  {!loading && stats.avgDurationHours != null && (
                    <Text style={{ fontSize: 11, color: P.ink400 }}>{t('common.hours')}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 10.5, color: P.ink400 }}>{t('station.dashboard.perStage')}</Text>
              </View>
            </View>
          </Card>
        </View>{/* /sağ KPI kolonu */}

        {/* Yeni Sipariş CTA — en sağda (yalnız manage_order_create yetkili teknisyene) */}
        {canCreateOrder && (
          <View style={{ flex: 1, minWidth: 220 }}>
            <StationCTACard onPress={() => router.push('/(station)/new-order' as any)} />
          </View>
        )}
      </View>{/* /TOP ROW */}

      {/* ═══ BOTTOM ROW — Haftalık + Verimlilik ═══ */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {/* Sol: Haftalık — 7 günlük kart row */}
        <Card style={{ flex: 1.4, minWidth: 320, padding: 18 }}>
          {/* Header */}
          <View className="flex-row items-center" style={{ marginBottom: 14, gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink900 }}>{t('common.thisWeek')}</Text>
            <Text style={{ fontSize: 13, color: P.ink400 }}>
              {(() => {
                const monthsShort = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
                const first = stats.weekBars[0]?.date;
                const last  = stats.weekBars[stats.weekBars.length - 1]?.date;
                if (!first || !last) return '';
                const fd = new Date(first);
                const ld = new Date(last);
                return `${fd.getDate()}–${ld.getDate()} ${monthsShort[ld.getMonth()]} ${ld.getFullYear()}`;
              })()}
            </Text>
            <View style={{ flex: 1 }} />
            <View
              className="rounded-full"
              style={{
                paddingHorizontal: 10, paddingVertical: 4,
                backgroundColor: hexA(STATION_ACCENT, 0.12),
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: STATION_DEEP, letterSpacing: 0.3 }}>
                {t('common.total')} {stats.weekBars.reduce((s, b) => s + b.count, 0)}
              </Text>
            </View>
          </View>

          {/* 7 gün — hatched-rail pill kolonlar (admin tarzı) */}
          {(() => {
            const SCALE_MAX = 20;
            const FILL_LIGHT = hexA(STATION_ACCENT, 0.35);
            const FILL_DARK  = STATION_ACCENT;
            const STRIPE_BG  = `repeating-linear-gradient(135deg, ${P.ink100} 0 6px, transparent 6px 12px)`;
            const todayIso = new Date().toISOString().slice(0, 10);
            const maxInWeek = Math.max(...stats.weekBars.map(b => b.count));
            return (
              <View className="flex-row items-end" style={{ gap: 10, minHeight: 160, paddingHorizontal: 2 }}>
                {stats.weekBars.map(bar => {
                  const d = new Date(bar.date);
                  const dayLabels = ['PZ','PA','SA','ÇA','PE','CU','CT'];
                  const isToday = bar.date === todayIso;
                  const isMax   = bar.count > 0 && bar.count === maxInWeek;
                  const pct = bar.count > 0 ? Math.min(Math.max((bar.count / SCALE_MAX) * 100, 8), 100) : 0;
                  const empty = bar.count === 0;
                  const showBubble = (isToday || isMax) && bar.count > 0;
                  return (
                    <View key={bar.date} style={{ flex: 1, alignItems: 'center', height: 160, justifyContent: 'flex-end', gap: 6 }}>
                      <View style={{ width: '100%', maxWidth: 56, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {showBubble && (
                          <View style={{ marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: P.surface, borderWidth: 1, borderColor: P.ink100 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: STATION_DEEP }}>{bar.count}</Text>
                          </View>
                        )}
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 999,
                            backgroundColor: P.surfaceAlt,
                            // @ts-ignore web hatched bg
                            backgroundImage: STRIPE_BG,
                            overflow: 'hidden',
                            position: 'relative' as any,
                          }}
                        >
                          {!empty && (
                            <View
                              style={{
                                position: 'absolute',
                                left: 0, right: 0, bottom: 0,
                                height: `${pct}%`,
                                borderRadius: 999,
                                backgroundColor: isToday || isMax ? FILL_DARK : FILL_LIGHT,
                              }}
                            />
                          )}
                        </View>
                      </View>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: isToday ? '700' : '500',
                        color: isToday ? P.ink900 : P.ink400,
                        textTransform: 'uppercase',
                        letterSpacing: 0.05 * 11,
                      }}>
                        {dayLabels[d.getDay()]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </Card>

        {/* Sağ: Verimlilik ring — koyu denim gradient (hero ile aynı dil) */}
        <View
          className="overflow-hidden"
          style={{
            flex: 1, minWidth: 280,
            borderRadius: 24,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
            // @ts-ignore — web gradient
            backgroundImage: `linear-gradient(180deg, ${STATION_DEEP} 0%, #0F2840 100%)`,
            backgroundColor: '#0F2840',
            padding: 16,
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/* Ambient soft glow merkezde */}
          <View
            style={{
              position: 'absolute',
              top: '38%', left: '50%',
              width: 200, height: 200, borderRadius: 100,
              backgroundColor: STATION_ACCENT,
              opacity: 0.10,
              transform: [{ translateX: -100 }, { translateY: -100 }],
            }}
            pointerEvents="none"
          />

          <View className="w-full flex-row items-center justify-between" style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>{t('station.dashboard.efficiency')}</Text>
            <View
              className="items-center justify-center rounded-full"
              style={{ width: 32, height: 32, backgroundColor: hexA(STATION_ACCENT, 0.20), borderWidth: 1, borderColor: hexA(STATION_ACCENT, 0.40) }}
            >
              <TrendingUp size={14} color="#FFFFFF" strokeWidth={1.8} />
            </View>
          </View>

          <PercentRingX value={stats.efficiency} size={110} theme="tech" />

          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 8 }}>
            {t('station.dashboard.firstTimeSuccess')}
          </Text>

          <View className="flex-row" style={{ gap: 8, marginTop: 8 }}>
            <View
              className="items-center rounded-full"
              style={{ paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', gap: 5, backgroundColor: 'rgba(220,38,38,0.18)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.30)' }}
            >
              <Flame size={10} color="#FCA5A5" strokeWidth={1.8} />
              <Text style={{ fontSize: 10, fontWeight: '500', color: '#FCA5A5' }}>
                {t('station.dashboard.totalWaste')} {stats.waste.toFixed(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ═══ Recent activity ═══ */}
      <Card style={{ padding: 16 }}>
        <View className="flex-row items-start justify-between" style={{ marginBottom: 14 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '500', color: P.ink900 }}>{t('station.dashboard.recentActivity')}</Text>
            <Text style={{ ...SERIF, fontSize: 22, lineHeight: 26, color: P.ink900, letterSpacing: -0.4, marginTop: 4 }}>
              {t('station.dashboard.last5CompletedJobs')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(station)/history' as any)}
            className="items-center justify-center rounded-full"
            style={{ width: 32, height: 32, backgroundColor: hexA(STATION_ACCENT, 0.10) }}
          >
            {isRTL() ? <ArrowUpLeft size={14} color={STATION_ACCENT} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={STATION_ACCENT} strokeWidth={1.8} />}
          </Pressable>
        </View>

        {stats.recent.length === 0 ? (
          <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
            <Calendar size={28} color={P.ink300} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, color: P.ink400 }}>{t('station.dashboard.noCompletedJobsYet')}</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {stats.recent.map(it => (
              <View
                key={it.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 14, paddingVertical: 12,
                  backgroundColor: P.surfaceAlt,
                  borderRadius: 12,
                  borderWidth: 1, borderColor: hexA(STATION_ACCENT, 0.10),
                }}
              >
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: hexA('#1F6B47', 0.12),
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={14} color="#1F6B47" strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink900 }} numberOfLines={1}>
                    {it.station_name ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 11, color: P.ink500, marginTop: 2 }} numberOfLines={1}>
                    #{it.order_number ?? '—'} · {it.patient_name ?? '—'}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: P.ink400 }}>
                  {it.completed_at ? new Date(it.completed_at).toLocaleDateString(localeTag(i18n.language)) : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
