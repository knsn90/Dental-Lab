// app/(station)/stats.tsx
// Teknisyen Dashboard — Lab paneli kart tarzı (Patterns), tech-blue tema.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HatchFill } from '../../core/ui/HatchFill';
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
import { TechnicianDesktopDashboard } from '../../modules/station/components/TechnicianDesktopDashboard';
import { useAuthStore } from '../../core/store/authStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { supabase } from '../../core/api/supabase';
import { LinearProgressX, PercentRingX } from '../../core/ui/ProgressX';
import { DS } from '../../core/theme/dsTokens';
import { useStationTheme, hexA } from '../../core/theme/stationPalette';
import { useNeonNavy, NeonPulse } from '../../core/ui/HeroGlow';
import { localeTag, isRTL, fmtDayMonthShort, fmtDayMonthYear, fmtWeekdayDayMonth } from '../../core/i18n';
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
  delivery_date?: string | null;
  is_urgent?: boolean;
}
// Yerel takvim günü (YYYY-MM-DD) — toISOString UTC'ye çevirdiği için gece
// yarısına yakın biten işler yanlış güne düşüyordu.
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
interface DayBar {
  date: string;
  label: string;
  count: number;
}

/**
 * Yeni Sipariş CTA — zemin TEK kaynaktan: `useNeonNavy` ("neon navy").
 *
 * Eskiden mavi→lacivert gradyan + yüzen beyaz daire + nabız atan beyaz ışıma
 * vardı; açık temada kart alacalı görünüyordu. Kullanıcı kararı: açık temada
 * DÜZ panel rengi, koyu temada neon yüzey + nabız — yönetim, lab, klinik ve
 * hekim panellerindeki CTA kartlarıyla aynı dil.
 */
function StationCTACard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const nn = useNeonNavy(STATION_ACCENT);
  // Tek kalan hareket: eylem okunun nazik dürtüsü.
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(arrowAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(arrowAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [arrowAnim]);

  const arrowX = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, isRTL() ? -6 : 6] });

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
        minHeight: 180,
        ...nn.surface,
        transform: [{ scale: scaleAnim }],
      }}>
        {!nn.flat && <NeonPulse radius={24} color={nn.glow} />}
        <View style={{ position: 'relative' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: nn.inkSoft, marginBottom: 14 }}>{t('station.dashboard.quickAction')}</Text>
          <Text style={{ ...SERIF, fontSize: 32, letterSpacing: -0.6, lineHeight: 35, color: nn.ink, marginBottom: 18 }}>{t('station.dashboard.createNewOrder')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: nn.pillBg, gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: nn.pillInk }}>{t('station.dashboard.start')}</Text>
            <Animated.View style={{ transform: [{ translateX: arrowX }] }}>
              {isRTL() ? <ArrowLeft size={14} color={nn.pillInk} strokeWidth={2.2} /> : <ArrowRight size={14} color={nn.pillInk} strokeWidth={2.2} />}
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
  // Sorgu başarısız olursa sayfa sessizce sıfır göstermesin
  const [loadError, setLoadError] = useState(false);
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
     try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0);

      const [
        { count: completed, error: errCompleted },
        { count: todayCount },
        { count: activeNow },
        { data: wasteRows },
        { data: durations },
        { data: weekStages },
        { data: recentRows },
        { data: activeRows, error: errActive },
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
            work_order:work_orders!work_order_id(order_number, patient_name, work_type, doctor_id, delivery_date, is_urgent)
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
        const iso = localDayKey(d);
        const dayCount = (weekStages ?? []).filter((s: any) => s.completed_at && localDayKey(new Date(s.completed_at)) === iso).length;
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
        delivery_date: a.work_order?.delivery_date ?? null,
        is_urgent:     !!a.work_order?.is_urgent,
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
      setLoadError(!!(errCompleted || errActive));
      setLoading(false);
     } catch (e) {
      console.warn('[station-stats] load failed:', (e as any)?.message);
      setLoadError(true);
      setLoading(false);
     }
    })();
  }, [profile?.id, reloadTick]);

  // Sıradaki işler — mobil Özet'teki "Sıradakiler" listesi (İşlerim ile aynı durumlar,
  // elde olan aktif/duraklamış işler hariç).
  const [queueRows, setQueueRows] = useState<any[]>([]);
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('order_stages').select(`
          id, status, sequence_order, is_critical, started_at,
          station:lab_stations(name, is_critical),
          work_order:work_orders!work_order_id(order_number, patient_name, work_type, delivery_date, is_urgent, doctor_id)
        `)
        .eq('technician_id', profile.id)
        .in('status', ['aktif', 'durakladi', 'bekliyor', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden'])
        .order('sequence_order', { ascending: true })
        .limit(40);
      if (error) console.warn('[station-stats] queue load failed:', error.message);
      const rows = (data ?? []) as any[];
      // Hekim/klinik adı — elde olan kartlar ve Sıradakiler satırları buradan beslenir
      const docIds = Array.from(new Set(rows.map(r => r.work_order?.doctor_id).filter(Boolean))) as string[];
      if (docIds.length) {
        try {
          const nameMap = await resolveDoctorClinicNames(docIds);
          for (const r of rows) {
            const info = nameMap.get(r.work_order?.doctor_id);
            if (info) { r._doctorName = info.doctorName; r._clinicName = info.clinicName; }
          }
        } catch (e) {
          console.warn('[station-stats] queue doctor resolve failed:', (e as any)?.message);
        }
        // Klinik logosu — sıra satırındaki yuvarlak görsel (bulunamazsa baş harfler)
        const { data: logoRows } = await supabase.from('doctors').select('id, clinic:clinics(logo_url)').in('id', docIds);
        const logos = new Map<string, string | null>();
        for (const d of (logoRows ?? []) as any[]) logos.set(d.id, d.clinic?.logo_url ?? null);
        // Hekim bir uygulama kullanıcısıysa (profiles) logo kliniğinden gelir
        const profIds = docIds.filter(id => !logos.has(id));
        if (profIds.length) {
          const { data: profs } = await supabase.from('profiles').select('id, clinic_id').in('id', profIds);
          const clinicIds = Array.from(new Set(((profs ?? []) as any[]).map(p => p.clinic_id).filter(Boolean)));
          if (clinicIds.length) {
            const { data: cls } = await supabase.from('clinics').select('id, logo_url').in('id', clinicIds);
            const byClinic = new Map<string, string | null>();
            for (const c of (cls ?? []) as any[]) byClinic.set(c.id, c.logo_url ?? null);
            for (const p of (profs ?? []) as any[]) logos.set(p.id, p.clinic_id ? (byClinic.get(p.clinic_id) ?? null) : null);
          }
        }
        for (const r of rows) r._clinicLogo = logos.get(r.work_order?.doctor_id) ?? null;
      }
      if (alive) setQueueRows(rows);
    })();
    return () => { alive = false; };
  }, [profile?.id, reloadTick]);

  const maxBar = useMemo(
    () => Math.max(1, ...stats.weekBars.map(b => b.count)),
    [stats.weekBars],
  );

  // Page title gizli — dashboard'da kullanmıyoruz, content yukarı gelsin
  // Masaüstünde kabuk başlığı = bugünün tarihi (admin Özet ile aynı, kenar menüyle
  // aynı hizadan başlar). Mobilde başlık gizli kalır; sayfa kendi başlığını çizer.
  const _isDeskTitle = require('react-native').useWindowDimensions().width >= 1024;
  useEffect(() => {
    setTitle(_isDeskTitle ? fmtWeekdayDayMonth(new Date()) : '', '');
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_isDeskTitle, i18n.language]);

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Aydın Lab handoff (TechnicianMobileDashboard)
  // ══════════════════════════════════════════════════════════════
  // İş listeleri — mobil ve masaüstü Özet aynı eşlemeyi kullanır
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
    deliveryDate: stats.activeJob.delivery_date ?? null,
    isUrgent:     !!stats.activeJob.is_urgent,
  }] : [];
  // Sıra: geri dönen → acil/kritik → teslim tarihi yakın olan
  const toJob = (r: any) => ({
    id:           r.id,
    orderNo:      r.work_order?.order_number ?? '—',
    patient:      r.work_order?.patient_name ?? 'Hasta',
    workType:     r.work_order?.work_type ?? 'Sipariş',
    stationName:  r.station?.name ?? 'İstasyon',
    status:       r.status ?? 'bekliyor',
    isCritical:   !!(r.is_critical || r.station?.is_critical),
    isUrgent:     !!r.work_order?.is_urgent,
    deliveryDate: r.work_order?.delivery_date ?? null,
    startedAt:    r.started_at ?? null,
    doctorName:   r._doctorName ?? null,
    clinicName:   r._clinicName ?? null,
    clinicLogoUrl: r._clinicLogo ?? null,
  });
  const inHand = (r: any) => r.status === 'aktif' || r.status === 'durakladi';
  // Elde birden fazla iş varsa hepsi görünsün (şeritteki "Aktif iş" sayısıyla tutarlı):
  // ilk kart hekim/klinik adı çözülmüş olan, diğerleri bu sorgudan.
  for (const r of queueRows) {
    if (inHand(r) && r.id !== stats.activeJob?.stage_id) activeJobsArr.push(toJob(r) as any);
  }
  const queueArr = queueRows.filter((r: any) => !inHand(r)).map(toJob).sort((a: any, b: any) => {
    const rank = (j: any) => (j.status === 'yeniden' ? 0 : (j.isUrgent || j.isCritical) ? 1 : 2);
    return rank(a) - rank(b) || String(a.deliveryDate ?? '9999').localeCompare(String(b.deliveryDate ?? '9999'));
  });
  const deskJobs = { active: activeJobsArr, queue: queueArr };

  const { width: _wMob } = require('react-native').useWindowDimensions();
  if (_wMob < 1024) {
    const { TechnicianMobileDashboard } = require('../../modules/station/components/TechnicianMobileDashboard');
    // Aktif işleri "active jobs" listesine çevirelim. stats.activeJob tek bir kayıt;
    // hero'daki kart için yeterli. Daha geniş liste için ileride ayrı query yapılabilir.
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
          queue={queueArr}
          loading={loading}
          loadError={loadError}
          onRetry={() => { setLoadError(false); setLoading(true); setReloadTick(t => t + 1); }}
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
      contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 120, gap: 16 }}   // masaüstü: admin Özet ile aynı üst boşluk
    >
      <TechnicianDesktopDashboard
        activeNow={stats.activeNow}
        avgDurationHours={stats.avgDurationHours}
        todayCompleted={stats.todayCount}
        efficiencyPct={stats.efficiency}
        weekBars={stats.weekBars.map(b => b.count)}
        activeJobs={deskJobs.active}
        queue={deskJobs.queue}
        loading={loading}
        loadError={loadError}
        onRetry={() => { setLoadError(false); setLoading(true); setReloadTick(t => t + 1); }}
        onOpenJob={(id: string) => router.push(`/(station)/jobs?focus=${id}` as any)}
        onNewOrder={canCreateOrder ? () => router.push('/(station)/new-order' as any) : undefined}
      />
    </ScrollView>
  );
}
