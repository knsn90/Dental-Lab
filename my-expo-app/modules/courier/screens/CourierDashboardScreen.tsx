/**
 * Kurye Dashboard — "Bugün" sayfası, responsive.
 *
 * Dashboard akışı:
 *   1. Greeting + günlük durum bar
 *   2. Bugün Özet (4 KPI tile — Aktif, Tamamlanan, Bekleyen, Süre)
 *   3. Progress ring + Aktif görev hero
 *   4. Quick Actions (Tara, Ara, Foto, Mesaj)
 *   5. Sıradaki teslimatlar
 *   6. Bugün tamamlananlar (compact)
 *   7. Bu hafta mini sparkline
 *
 * Veri: fetchMyDeliveries → bugüne filtre + status grupları
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { firstName as displayFirstName } from '../../../core/util/personName';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../../core/i18n';
import {
  View, Text, ScrollView, Pressable, Platform, useWindowDimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Truck, Navigation, Check, Timer, MapPin, Bell, QrCode,
  ChevronRight, ChevronLeft, Map as MapIcon, TrendingUp, Phone, Camera, MessageCircle,
  Clock, CheckCircle2, AlertCircle, Calendar, Target, Activity,
} from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { useScanStore } from '../../../core/store/scanStore';
import { fetchMyDeliveries, type CourierDelivery } from '../api';
import { PremiumKPI } from '../components/PremiumKPI';
import { CourierLiveMap } from '../CourierLiveMap';
import { formatAddress } from '../../../core/util/formatAddress';
import { isRTL } from '../../../core/i18n';

const TH = DS.tech;
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const SUCCESS = '#2D9A6B';
const WARNING = '#E89B2A';
const DANGER  = '#D94B4B';

/* ─── helpers ─── */

const STATUS_LABEL: Record<string, string> = {
  beklemede: 'BEKLİYOR', atandi: 'ATANDI',
  teslim_alindi: 'ALINDI', yolda: 'YOLDA',
  teslim_edildi: 'TESLİM', iptal: 'İPTAL',
};
const STATUS_COLOR: Record<string, string> = {
  beklemede: DS.ink[500], atandi: TH.primary,
  teslim_alindi: TH.primary, yolda: WARNING,
  teslim_edildi: SUCCESS, iptal: DANGER,
};

const fmtElapsedFrom = (iso?: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)}sa ${min % 60}dk`;
};

const initials = (s?: string | null): string => {
  if (!s) return '?';
  return s.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
};

const greeting = (t: (k: string) => string): string => {
  const h = new Date().getHours();
  if (h < 6)  return t('courier.greeting.night');
  if (h < 12) return t('courier.greeting.morning');
  if (h < 18) return t('courier.greeting.day');
  return t('courier.greeting.evening');
};

const sameDay = (iso?: string | null): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
};

const fmtTodayDate = (lng?: string): string =>
  new Date().toLocaleDateString(localeTag(lng), { day: '2-digit', month: 'long', weekday: 'long' });

/* ════════════════════════════════════════════════════════════════ */

export function CourierDashboardScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { profile } = useAuthStore();
  const setScanOpen = useScanStore(s => s.setOpen);

  const [items, setItems]     = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try { setItems(await fetchMyDeliveries(profile.id)); }
    finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Bugün özeti hesabı ── */
  const dash = useMemo(() => {
    const todayAssigned   = items.filter(d => sameDay(d.assigned_at));
    const todayDelivered  = items.filter(d => sameDay(d.delivered_at));
    const todayInProgress = items.filter(d => d.status === 'yolda' || d.status === 'teslim_alindi');
    const pending         = items.filter(d => d.status === 'beklemede' || d.status === 'atandi');

    // Ortalama süre (bugün tamamlananlar arası)
    const durations = todayDelivered
      .filter(d => d.picked_up_at && d.delivered_at)
      .map(d => (new Date(d.delivered_at!).getTime() - new Date(d.picked_up_at!).getTime()) / 60000);
    const avgMin = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;

    // İlerleme yüzdesi
    const totalToday = todayAssigned.length || todayDelivered.length + todayInProgress.length + pending.length;
    const progress = totalToday > 0 ? Math.round((todayDelivered.length / totalToday) * 100) : 0;

    // Aktif iş (en başta gösterilecek)
    const active = todayInProgress[0] ?? null;

    // İlk başlangıç (vardiyaya kaç saat var)
    const firstPickedAt = todayDelivered.concat(todayInProgress)
      .map(d => d.picked_up_at).filter(Boolean).sort()[0];
    const hoursWorked = firstPickedAt
      ? ((Date.now() - new Date(firstPickedAt).getTime()) / 3600000)
      : 0;

    // ── Haftalık stats (son 7 gün) ──
    const weekCutoff = Date.now() - 7 * 86400000;
    const weekDelivered = items.filter(d => d.delivered_at && new Date(d.delivered_at).getTime() >= weekCutoff && d.status === 'teslim_edildi');
    const weekDurations = weekDelivered
      .filter(d => d.picked_up_at && d.delivered_at)
      .map(d => (new Date(d.delivered_at!).getTime() - new Date(d.picked_up_at!).getTime()) / 60000);
    const weekAvg = weekDurations.length ? Math.round(weekDurations.reduce((s, v) => s + v, 0) / weekDurations.length) : 0;
    const weekFastest = weekDurations.length ? Math.round(Math.min(...weekDurations)) : 0;

    // ── 7 gün bar chart verisi ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(today.getTime() - (6 - i) * 86400000);
      const label = day.toLocaleDateString(localeTag(i18n.language), { weekday: 'short' }).slice(0, 2);
      const count = items.filter(d => {
        if (!d.delivered_at) return false;
        const dd = new Date(d.delivered_at); dd.setHours(0, 0, 0, 0);
        return dd.getTime() === day.getTime();
      }).length;
      return { label, count };
    });
    const max7 = Math.max(...last7Days.map(d => d.count), 1);

    return {
      todayAssigned, todayDelivered, todayInProgress, pending,
      avgMin, progress, active, totalToday, hoursWorked,
      weekDelivered, weekAvg, weekFastest, last7Days, max7,
    };
  }, [items, i18n.language]);

  const onScan = () => setScanOpen(true);
  const onActive = () => dash.active && router.push(`/(courier)/delivery/${dash.active.id}` as any);

  return isDesktop
    ? <DesktopView {...{ profile, items, dash, loading, router, onRefresh: load, onScan, onActive }} />
    : <MobileView  {...{ profile, items, dash, loading, router, onRefresh: load, onScan, onActive }} />;
}

/* ══════════════════════════ MOBILE ══════════════════════════ */
/**
 * /dev/courier-design preview pattern:
 *  - Top action bar (avatar+ad+saat | QR | Bell)
 *  - F1c Compact Hero (accent dolu) — aktif görev + 3 mini-stat (GİDEN/GELEN/BUGÜN)
 *  - Dark CTA "Yola Çık → Navigasyon"
 *  - Eyebrow BUGÜN · {tarih}
 *  - Section "Sıradaki Teslimatlar" + Tümü →
 *  - 4 delivery card (number badge + name + address + status chip + time chip)
 *  - "Bugün Tamamlanan" 18px gray section + check rows
 */

function MobileView({ profile, items, dash, loading, router, onRefresh, onScan, onActive }: any) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const todayLabel = new Date().toLocaleDateString(localeTag(i18n.language), { day: '2-digit', month: 'long' }).toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: TH.bg }}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={TH.primary} />}
    >
      {/* ── Top Action Bar (compact: avatar + bell + QR) ── */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: TH.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{initials(profile?.full_name)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <Bell size={15} color={DS.ink[800]} />
          {dash.pending.length > 0 && (
            <View style={{ position: 'absolute', top: -2, end: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>{dash.pending.length}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={onScan} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}>
          <QrCode size={15} color={DS.ink[800]} />
        </Pressable>
      </View>

      {/* ── Page Title — desktop ile aynı greeting + name + tarih ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>
          {greeting(t).toLocaleUpperCase(localeTag(i18n.language))} 👋
        </Text>
        <Text
          style={{ ...DISPLAY, fontSize: 30, color: DS.ink[900], letterSpacing: -0.9, lineHeight: 34, marginTop: 4 }}
          numberOfLines={1}
        >
          Merhaba, <Text style={{ color: TH.primary }}>{displayFirstName(profile?.full_name, 'Kurye')}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4, textTransform: 'capitalize' }}>
          {new Date().toLocaleDateString(localeTag(i18n.language), { weekday: 'long', day: '2-digit', month: 'long' })}
          {dash.hoursWorked > 0 && ` · ${dash.hoursWorked.toFixed(1)} sa vardiyadasın`}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {/* ── F2 Hero — Full-bleed Gradient (büyük statement + dark CTA içeride) ── */}
        <View style={{
          borderRadius: 28, padding: 28, backgroundColor: TH.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Dekoratif daireler — gradient hissi için blur uygulanmış (mobile F2) */}
          <BlurOrb
            position="top-right"
            size={260}
            color="rgba(255,255,255,0.30)"
            offset={{ top: -80, right: -60 }}
          />
          <BlurOrb
            position="bottom-left"
            size={220}
            color="rgba(15,40,64,0.20)"
            offset={{ bottom: -80, left: -40 }}
          />
          <BlurOrb
            position="center-right"
            size={140}
            color="rgba(255,255,255,0.18)"
            offset={{ top: 40, right: 30 }}
          />

          {/* Eyebrow */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' }} />
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
              {dash.active ? `AKTİF · ${STATUS_LABEL[dash.active.status] ?? dash.active.status}` : 'BUGÜN ÖZET'}
            </Text>
          </View>

          {/* Huge Display Title */}
          <Text style={{ ...DISPLAY, fontSize: 44, color: '#FFF', letterSpacing: -1.8, lineHeight: 48, marginTop: 10 }} numberOfLines={2}>
            {dash.active
              ? (dash.active.destination_name ?? dash.active.order_number ?? '—')
              : (dash.pending.length > 0 ? t('courier.pending', { count: dash.pending.length }) : t('courier.ready'))}
          </Text>

          {/* Body description */}
          {dash.active ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <MapPin size={12} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1, lineHeight: 18 }} numberOfLines={2}>
                {formatAddress(dash.active.destination_address) || '—'}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 10, lineHeight: 18 }}>
              {t('courier.dashboard.completedCount', { count: dash.todayDelivered.length })}
              {dash.pending.length > 0 && ` ${t('courier.dashboard.pickTaskStart')}`}
            </Text>
          )}

          {/* 3 mini-stat (translucent, F2 içinde) */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
            {[
              { label: t('courier.dashboard.active'),  value: String(dash.todayInProgress.length) },
              { label: t('courier.dashboard.pending'), value: String(dash.pending.length) },
              { label: t('courier.dashboard.today'),  value: String(dash.todayDelivered.length) },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{s.label}</Text>
                <Text style={{ ...DISPLAY, fontSize: 18, color: '#FFF', letterSpacing: -0.4, lineHeight: 22 }}>{s.value}</Text>
              </View>
            ))}
          </View>

          {/* Dark CTA pill (F2 standardı — hero içinde) */}
          {dash.active && (
            <Pressable
              onPress={onActive}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 14, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: DS.ink[900], marginTop: 20,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Navigation size={15} color="#FFF" strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF' }}>{t('courier.dashboard.startNavigation')}</Text>
            </Pressable>
          )}
        </View>

        {/* ── Eyebrow BUGÜN · 18 MART ── */}
        <View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>
            {t('courier.dashboard.todayDate', { date: todayLabel })}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>{t('courier.dashboard.nextDeliveries')}</Text>
            {dash.pending.length > 0 && (
              <Pressable onPress={() => router.push('/(courier)/deliveries' as any)}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>{t('courier.dashboard.viewAll')}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Delivery cards (max 4) ── */}
        {dash.pending.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200], backgroundColor: '#FFF' }}>
            <CheckCircle2 size={24} color={SUCCESS} strokeWidth={1.6} />
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>{t('courier.dashboard.noPendingDeliveries')}</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {dash.pending.slice(0, 4).map((d: CourierDelivery, i: number) => (
              <PreviewDeliveryCard
                key={d.id}
                index={i + 1}
                delivery={d}
                onPress={() => router.push(`/(courier)/delivery/${d.id}` as any)}
              />
            ))}
          </View>
        )}

        {/* ── Bugün Tamamlanan ── */}
        {dash.todayDelivered.length > 0 && (
          <>
            <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[700], letterSpacing: -0.3, marginTop: 4 }}>{t('courier.dashboard.completedToday')}</Text>
            <View style={{ gap: 8 }}>
              {dash.todayDelivered.slice(0, 4).map((d: CourierDelivery) => (
                <View key={d.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: 14,
                  borderWidth: 1, borderColor: DS.ink[100], backgroundColor: '#FFF',
                }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(45,154,107,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={14} color={SUCCESS} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[800] }} numberOfLines={1}>
                      {d.destination_name ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 10, color: DS.ink[500] }}>
                      {d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString(localeTag(i18n.language), { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {d.picked_up_at && d.delivered_at && ` · ${Math.round((new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000)} dk`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── İstatistik · Bu Hafta ── */}
        {dash.weekDelivered.length > 0 && (
          <>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>
                {t('courier.dashboard.statisticsThisWeek')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>{t('courier.dashboard.myPerformance')}</Text>
                <Pressable onPress={() => router.push('/(courier)/stats' as any)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>{t('courier.dashboard.details')}</Text>
                </Pressable>
              </View>
            </View>

            {/* 2×2 PremiumKPI grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <PremiumKPI size="sm" icon={CheckCircle2} label={t('courier.kpi.delivered')}      value={dash.weekDelivered.length}  accent={SUCCESS}   sub={`${dash.todayDelivered.length} bugün`} />
              <PremiumKPI size="sm" icon={Timer}        label={t('courier.kpi.averageTime')}   value={`${dash.weekAvg} dk`}        accent={TH.primary} sub={dash.weekFastest > 0 ? `En hızlı ${dash.weekFastest} dk` : '—'} />
              <PremiumKPI size="sm" icon={Activity}     label={t('courier.kpi.active')}       value={dash.todayInProgress.length} accent={WARNING}    sub={t('courier.dashboard.onTheWayNow')} />
              <PremiumKPI size="sm" icon={AlertCircle}  label={t('courier.kpi.waiting')}    value={dash.pending.length}         accent="#7C3AED"    sub="Sıradaki görev" />
            </View>

            {/* 7-gün mini bar chart */}
            <View style={{ borderRadius: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>{t('courier.dashboard.last7Days')}</Text>
                  <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.4, marginTop: 2 }}>{t('courier.dashboard.dailyTrend')}</Text>
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '600' }}>
                  {dash.last7Days.reduce((s: number, d: any) => s + d.count, 0)} {t('courier.dashboard.deliveredMetric')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 6 }}>
                {dash.last7Days.map((d: any, i: number) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: '100%',
                      height: Math.max(3, (d.count / dash.max7) * 64),
                      backgroundColor: d.count > 0 ? TH.primary : DS.ink[100],
                      borderRadius: 3,
                    }} />
                    <Text style={{ fontSize: 9, color: DS.ink[500], fontWeight: '600' }}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Empty state ── */}
        {!loading && items.length === 0 && (
          <View style={{ padding: 40, alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 22, borderWidth: 1, borderColor: DS.ink[200] }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={26} color={TH.primary} strokeWidth={1.6} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>{t('courier.dashboard.noTasksYet')}</Text>
            <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center', maxWidth: 280 }}>
              {t('courier.dashboard.notifyOnNewDelivery')}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* PreviewDeliveryCard — courier-design preview kart anatomisi (number badge + chip + adres + time) */
function PreviewDeliveryCard({ index, delivery, onPress }: { index: number; delivery: CourierDelivery; onPress: () => void }) {
  const tagLabel = STATUS_LABEL[delivery.status] ?? delivery.status;
  const tagColor = STATUS_COLOR[delivery.status] ?? DS.ink[500];
  const timeLabel = fmtElapsedFrom(delivery.assigned_at);
  const timeTone = delivery.status === 'yolda' ? WARNING : DS.ink[500];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: any) => ({
        padding: 14, borderRadius: 18,
        backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Sol: 44×44 numara badge */}
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary, letterSpacing: -0.3 }}>{index}</Text>
        </View>

        {/* Orta: chip + ad + adres */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
            <Chip label={tagLabel} color={tagColor} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {delivery.destination_name ?? delivery.order_number ?? '—'}
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }} numberOfLines={1}>
            {formatAddress(delivery.destination_address) || '—'}
          </Text>
        </View>

        {/* Sağ: time chip + chevron */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: timeTone + '14' }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: timeTone }}>{timeLabel.toUpperCase()}</Text>
          </View>
          {isRTL() ? <ChevronLeft size={14} color={DS.ink[400]} /> : <ChevronRight size={14} color={DS.ink[400]} />}
        </View>
      </View>
    </Pressable>
  );
}

/* ══════════════════════════ DESKTOP ══════════════════════════ */

function DesktopView({ profile, items, dash, loading, router, onRefresh, onScan, onActive }: any) {
  const { t, i18n } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
    >
      {/* Page title — greeting + courier ismi */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>
            {greeting(t).toLocaleUpperCase(localeTag(i18n.language))} 👋
          </Text>
          <Text
            style={{ ...DISPLAY, fontSize: 36, color: DS.ink[900], letterSpacing: -1, lineHeight: 40, marginTop: 6 }}
            numberOfLines={1}
          >
            Merhaba, <Text style={{ color: TH.primary }}>{displayFirstName(profile?.full_name, 'Kurye')}</Text>
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6, textTransform: 'capitalize' }}>{fmtTodayDate(i18n.language)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={onScan} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200] }}>
            <QrCode size={14} color={DS.ink[800]} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800] }}>QR Tara</Text>
          </Pressable>
        </View>
      </View>

      {/* Bugün özet kart — progress ring + KPI shelf birleşik */}
      <View style={{ borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], padding: 20, flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        <ProgressRing value={dash.progress} size={88} />
        <View style={{ flex: 0.4, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{t('courier.dashboard.todayProgress')}</Text>
          <Text style={{ ...DISPLAY, fontSize: 28, color: DS.ink[900], letterSpacing: -0.8, marginTop: 2 }}>
            {dash.todayDelivered.length}/{dash.totalToday}
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
            {dash.hoursWorked > 0 ? t('courier.hoursWorked', { h: dash.hoursWorked.toFixed(1) }) : t('courier.shiftNotStarted')}
          </Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
          <PremiumKPI size="lg" icon={Activity}     label={t('courier.kpi.active')}     value={dash.todayInProgress.length} accent={TH.primary} sub={t('courier.dashboard.onTheWayNow')} />
          <PremiumKPI size="lg" icon={CheckCircle2} label={t('courier.dashboard.completedToday')} value={dash.todayDelivered.length} accent={SUCCESS}    sub={t('courier.dashboard.deliveredToday')} />
          <PremiumKPI size="lg" icon={AlertCircle}  label={t('courier.kpi.waiting')}   value={dash.pending.length}        accent={WARNING}    sub={t('courier.dashboard.upcomingTasks')} />
          <PremiumKPI size="lg" icon={Timer}        label={t('courier.kpi.averageTime')}  value={`${dash.avgMin} dk`}        accent="#7C3AED"    sub={t('courier.dashboard.deliveryAverage')} />
        </View>
      </View>

      {/* ── F2 Hero — Full-bleed Gradient (desktop, DESIGN_LANGUAGE § 4.2) ── */}
      {dash.active && (
        <Pressable
          onPress={onActive}
          style={({ pressed }: any) => ({
            borderRadius: 28, padding: 48, backgroundColor: TH.primary,
            position: 'relative', overflow: 'hidden',
            opacity: pressed ? 0.96 : 1,
          })}
        >
          {/* Dekoratif daireler — F2 spec (220 + 180) */}
          <View style={{ position: 'absolute', top: -40, end: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} pointerEvents="none" />
          <View style={{ position: 'absolute', bottom: -60, start: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} pointerEvents="none" />

          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 32, flexWrap: 'wrap' }}>
            {/* Sol: Eyebrow + Huge Display + Body + CTA */}
            <View style={{ flex: 1, minWidth: 320, justifyContent: 'space-between' }}>
              <View>
                {/* Eyebrow with live dot */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                    AKTİF GÖREV · {STATUS_LABEL[dash.active.status] ?? dash.active.status}
                  </Text>
                </View>

                {/* Huge Display */}
                <Text style={{ ...DISPLAY, fontSize: 56, color: '#FFF', letterSpacing: -2, lineHeight: 60, marginTop: 16 }} numberOfLines={2}>
                  {dash.active.destination_name ?? dash.active.order_number ?? '—'}
                </Text>

                {/* Body with MapPin */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <MapPin size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', flex: 1, lineHeight: 19 }} numberOfLines={2}>
                    {formatAddress(dash.active.destination_address) || '—'}
                  </Text>
                </View>
              </View>

              {/* Dark CTA pill + elapsed sub */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: DS.ink[900] }}>
                  <Navigation size={13} color="#FFF" strokeWidth={2.2} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{t('courier.dashboard.startDetails')}</Text>
                </View>
                {dash.active.picked_up_at && (
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                    ⏱ {fmtElapsedFrom(dash.active.picked_up_at)} önce
                  </Text>
                )}
              </View>
            </View>

            {/* Sağ: Canlı harita — minimal, tıklayınca detay */}
            <Pressable
              onPress={onActive}
              style={{
                width: 360, height: 240, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.10)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer' as any,
              }}
            >
              <CourierLiveMap
                deliveryId={dash.active.id}
                height={240}
                accent={TH.primary}
                compact
              />
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* F2 — Aktif yoksa varyant (Bugün özet) */}
      {!dash.active && (
        <View style={{
          borderRadius: 28, padding: 48, backgroundColor: TH.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          <View style={{ position: 'absolute', top: -40, end: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} pointerEvents="none" />
          <View style={{ position: 'absolute', bottom: -60, start: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} pointerEvents="none" />

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 280 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                {t('courier.dashboard.todaySummary')}
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 56, color: '#FFF', letterSpacing: -2, lineHeight: 60, marginTop: 16 }}>
                {dash.pending.length > 0 ? t('courier.pending', { count: dash.pending.length }) : t('courier.ready')}
              </Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 14, maxWidth: 480, lineHeight: 19 }}>
                Bugün {dash.todayDelivered.length} teslimat tamamladın.
                {dash.pending.length > 0 && ' Bir görev seçip başlayabilirsin.'}
              </Text>
              {dash.pending.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: DS.ink[900], marginTop: 24, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Listeyi Aç →</Text>
                </View>
              )}
            </View>
            <View style={{
              width: 120, height: 120, borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Truck size={52} color="#FFF" strokeWidth={1.4} />
            </View>
          </View>
        </View>
      )}

      {/* 2-col body: liste + harita */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 6 }}>
          <SecHeader eyebrow={t('courier.section.list')} title={t('courier.dashboard.nextDeliveries')} />
          {dash.pending.length === 0 ? (
            <Card padding={32}>
              <Text style={{ fontSize: 13, color: DS.ink[500], textAlign: 'center' }}>{t('courier.delivery.noPending')}</Text>
            </Card>
          ) : (
            <Card padding={0}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100], gap: 12 }}>
                {[t('courier.table.customer'), t('courier.table.address'), t('courier.table.phone'), t('courier.table.assigned'), t('courier.table.status'), ''].map((h, i) => (
                  <Text key={h} style={{ flex: i === 1 ? 2 : 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</Text>
                ))}
              </View>
              {dash.pending.map((d: CourierDelivery, i: number, arr: CourierDelivery[]) => (
                <Pressable
                  key={d.id}
                  onPress={() => router.push(`/(courier)/delivery/${d.id}` as any)}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 12, alignItems: 'center',
                    borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: DS.ink[100],
                    backgroundColor: hovered ? DS.ink[50] : '#FFF',
                  })}
                >
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                    {d.destination_name ?? d.order_number ?? '—'}
                  </Text>
                  <Text style={{ flex: 2, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>{formatAddress(d.destination_address) || '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }} numberOfLines={1}>{d.destination_phone ?? '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500] }}>{fmtElapsedFrom(d.assigned_at)} önce</Text>
                  <View style={{ flex: 1 }}><Chip label={STATUS_LABEL[d.status] ?? d.status} color={STATUS_COLOR[d.status] ?? DS.ink[500]} /></View>
                  {isRTL() ? <ChevronLeft size={14} color={DS.ink[300]} /> : <ChevronRight size={14} color={DS.ink[300]} />}
                </Pressable>
              ))}
            </Card>
          )}
        </View>

        <View style={{ flex: 4 }}>
          <SecHeader eyebrow={t('courier.section.location')} title={t('courier.map.liveMap')} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>{t('courier.map.liveLocationActive')}</Text>
            </View>
            <View style={{ height: 360, backgroundColor: TH.bgSoft, position: 'relative', overflow: 'hidden' }}>
              {dash.active ? (
                <CourierLiveMap deliveryId={dash.active.id} height={360} accent={TH.primary} compact />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MapIcon size={28} color={DS.ink[300]} strokeWidth={1.4} />
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>{t('courier.map.noActiveTask')}</Text>
                </View>
              )}
            </View>
            <View style={{ padding: 12 }}>
              <Pressable onPress={() => router.push('/(courier)/map' as any)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900] }}>
                <MapIcon size={13} color="#FFF" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>{t('courier.map.fullScreen')}</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </View>

      {/* Bugün Tamamlanan */}
      {dash.todayDelivered.length > 0 && (
        <View>
          <SecHeader eyebrow="Geçmiş" title={`${t('courier.dashboard.completedTodayTitle')} (${dash.todayDelivered.length})`} />
          <Card padding={0}>
            {dash.todayDelivered.slice(0, 8).map((d: CourierDelivery, i: number, arr: CourierDelivery[]) => (
              <View key={d.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: DS.ink[100],
              }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(45,154,107,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={14} color={SUCCESS} strokeWidth={2.4} />
                </View>
                <Text style={{ flex: 2, fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{d.destination_name ?? '—'}</Text>
                <Text style={{ flex: 2, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>{formatAddress(d.destination_address) || '—'}</Text>
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }}>
                  {d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString(localeTag(i18n.language), { hour: '2-digit', minute: '2-digit' }) : '—'}
                </Text>
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[500] }}>
                  {d.picked_up_at && d.delivered_at
                    ? `${Math.round((new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000)} dk`
                    : '—'}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

/* ════════════════════════ ATOMS ════════════════════════ */

function ProgressRing({ value, size = 68 }: { value: number; size?: number }) {
  // Saf View ile percentage ring (gerçek SVG yerine donut)
  const radius = size / 2;
  const stroke = size * 0.10;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring track */}
      <View style={{
        width: size, height: size, borderRadius: radius,
        borderWidth: stroke, borderColor: TH.bgDeep,
        position: 'absolute',
      }} />
      {/* Progress dial — conic-gradient (web) or arc rotation */}
      <View style={{
        width: size, height: size, borderRadius: radius,
        borderWidth: stroke, borderColor: 'transparent',
        borderTopColor: TH.primary,
        borderEndColor: value > 25 ? TH.primary : 'transparent',
        borderBottomColor: value > 50 ? TH.primary : 'transparent',
        borderStartColor: value > 75 ? TH.primary : 'transparent',
        position: 'absolute',
        transform: [{ rotate: `${(value / 100) * 360 - 90}deg` }],
      }} />
      {/* Center text */}
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ ...DISPLAY, fontSize: size * 0.32, color: DS.ink[900], letterSpacing: -0.6, lineHeight: size * 0.36 }}>
          {value}
        </Text>
        <Text style={{ fontSize: size * 0.13, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.4 }}>%</Text>
      </View>
    </View>
  );
}

function MiniKpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: accent + '08', borderWidth: 1, borderColor: accent + '14' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Icon size={11} color={accent} strokeWidth={2.2} />
        <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: accent }}>{label}</Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.5, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon: Icon, label, color, onPress }: { icon: any; label: string; color: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200] }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={color} strokeWidth={2.2} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[700], textAlign: 'center' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function DeliveryRow({ index, delivery, onPress }: { index: number; delivery: CourierDelivery; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: any) => ({
        padding: 14, borderRadius: 16,
        backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...DISPLAY, fontSize: 17, color: TH.primary, letterSpacing: -0.3 }}>{index}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {delivery.destination_name ?? delivery.order_number ?? '—'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MapPin size={10} color={DS.ink[400]} />
            <Text style={{ fontSize: 11, color: DS.ink[500], flex: 1 }} numberOfLines={1}>{formatAddress(delivery.destination_address) || '—'}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Chip label={STATUS_LABEL[delivery.status] ?? delivery.status} color={STATUS_COLOR[delivery.status] ?? DS.ink[500]} />
          {isRTL() ? <ChevronLeft size={13} color={DS.ink[400]} /> : <ChevronRight size={13} color={DS.ink[400]} />}
        </View>
      </View>
    </Pressable>
  );
}

function Card({ children, padding = 16, style }: any) {
  return <View style={[{ backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200], padding }, style]}>{children}</View>;
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color + '14', alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color }}>{label}</Text>
    </View>
  );
}

function KPIDesktop({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: accent + '08', borderWidth: 1, borderColor: accent + '14' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={accent} strokeWidth={2.2} />
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: accent }}>{label}</Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.6, lineHeight: 26, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function SecHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{eyebrow}</Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>{title}</Text>
    </View>
  );
}

function MapGrid() {
  return (
    <View style={{ position: 'absolute', inset: 0 as any, opacity: 0.4 }} pointerEvents="none">
      {Array.from({ length: 16 }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * 32, height: 1, backgroundColor: TH.primary + '15' }} />
      ))}
      {Array.from({ length: 16 }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: i * 32, width: 1, backgroundColor: TH.primary + '15' }} />
      ))}
    </View>
  );
}

/**
 * BlurOrb — F2 hero dekoratif daire (yumuşatılmış, gradient hissi).
 *
 * Web: CSS `filter: blur()` (GPU-accelerated, performant).
 * Native (iOS/Android): expo-blur BlurView (UIVisualEffectView / RenderScript).
 *
 * Eski Android (<API 31) için BlurView graceful fallback yapar — biraz daha az
 * yumuşak ama yine de kabul edilebilir görünüm.
 */
function BlurOrb({
  size, color, offset, position,
}: {
  size: number;
  color: string;
  offset: { top?: number; right?: number; bottom?: number; left?: number };
  position?: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View
        // @ts-ignore — RN-Web filter prop
        style={{
          position: 'absolute',
          ...offset,
          width: size, height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          filter: `blur(${Math.round(size * 0.18)}px)`,
        }}
        pointerEvents="none"
      />
    );
  }
  // Native — bg color'lı View'i hafif daha geniş + opacity ile yumuşat
  return (
    <View
      style={{
        position: 'absolute',
        ...offset,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.85,
      }}
      pointerEvents="none"
    />
  );
}
