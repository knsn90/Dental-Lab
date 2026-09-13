/**
 * Kurye Performansı — responsive (mobile + desktop), DESIGN_LANGUAGE birebir.
 *
 * Mobile:
 *  - Top action bar (avatar+ad+saat | Bell)
 *  - F1 Glassmorphism Hero (krem zemin + iç beyaz cam panel + 2 BigStat)
 *  - Range pill bar (Hafta / Ay / Tüm Zaman)
 *  - 2x2 KPI grid (compact tiles)
 *  - Mini bar chart (son 7 gün teslimat)
 *  - Son Teslimatlar liste
 *
 * Desktop:
 *  - PageTitle + range pill
 *  - F2 Full-bleed Gradient hero (huge 56px display + dark CTA içeride)
 *  - 4-col KPI shelf
 *  - 2 chart card (Bar + Line trend)
 *  - Full-width tablo (geçmiş teslimatlar)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, ScrollView, Pressable, useWindowDimensions, RefreshControl, Platform, Alert, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Truck, Timer, Navigation, Check, Star, BarChart3, TrendingUp,
  Calendar, Award, Activity, Bell, Globe, LogOut, AlertTriangle,
} from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useHeroSurface } from '../../../core/ui/HeroGlow';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchMyDeliveries, type CourierDelivery } from '../api';
import { PremiumKPI } from '../components/PremiumKPI';
import { localeTag, setLanguage } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { formatAddress } from '../../../core/util/formatAddress';
import { deleteMyAccount } from '../../../lib/auth';
import { toast } from '../../../core/ui/Toast';

const TH = DS.tech;
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const SUCCESS = '#2D9A6B';
const WARNING = '#E89B2A';
const DANGER  = '#D94B4B';

type Range = 'week' | 'month' | 'all';

const initials = (s?: string | null) => {
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

/* ════════════════════════════════════════════════════════════════ */

export function CourierStatsScreen() {
  const { i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { profile } = useAuthStore();

  const [items, setItems]     = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState<Range>('week');

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try { setItems(await fetchMyDeliveries(profile.id)); }
    finally { setLoading(false); }
  }, [profile?.id]);
  useEffect(() => { load(); }, [load]);

  // Range filter — delivered_at içinde tarih kontrol
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = range === 'week'  ? now - 7  * 86400000
                 : range === 'month' ? now - 30 * 86400000
                 : 0;
    return items.filter(d => d.delivered_at && new Date(d.delivered_at).getTime() >= cutoff);
  }, [items, range]);

  // KPI hesaplamaları
  const stats = useMemo(() => {
    const delivered = filtered.filter(d => d.status === 'teslim_edildi');
    const totalCount = delivered.length;
    const totalAttempt = filtered.length;
    const successPct = totalAttempt > 0 ? Math.round((totalCount / totalAttempt) * 100) : 0;
    const durations = delivered
      .filter(d => d.picked_up_at && d.delivered_at)
      .map(d => (new Date(d.delivered_at!).getTime() - new Date(d.picked_up_at!).getTime()) / 60000);
    const avgMin = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;
    const fastest = durations.length ? Math.round(Math.min(...durations)) : 0;
    return { totalCount, totalAttempt, successPct, avgMin, fastest };
  }, [filtered]);

  // Son 7 gün bar verisi
  const last7Days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(today.getTime() - (6 - i) * 86400000);
      const dayLabel = day.toLocaleDateString(localeTag(i18n.language), { weekday: 'short' }).slice(0, 2);
      const count = items.filter(d => {
        if (!d.delivered_at) return false;
        const dd = new Date(d.delivered_at);
        dd.setHours(0, 0, 0, 0);
        return dd.getTime() === day.getTime();
      }).length;
      return { day: dayLabel, count };
    });
  }, [items]);

  const maxDayCount = Math.max(...last7Days.map(d => d.count), 1);

  return isDesktop
    ? <DesktopView {...{ profile, filtered, stats, loading, range, setRange, onRefresh: load, last7Days, maxDayCount }} />
    : <MobileView  {...{ profile, filtered, stats, loading, range, setRange, onRefresh: load, last7Days, maxDayCount }} />;
}

/* ══════════════════════════ MOBILE ══════════════════════════ */

function MobileView({ profile, filtered, stats, loading, range, setRange, onRefresh, last7Days, maxDayCount }: any) {
  const U = useInkUI();
  const heroSurface = useHeroSurface(TH.primary);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  // Hesap silme (App Store 5.1.1(v)) — yaz-onayla
  const [delOpen, setDelOpen]   = useState(false);
  const [delText, setDelText]   = useState('');
  const [delBusy, setDelBusy]   = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const delConfirmed = delText.trim().toLocaleUpperCase('tr') === 'SİL' || delText.trim().toLocaleUpperCase('tr') === 'SIL';
  const runDeleteAccount = async () => {
    if (delBusy || !delConfirmed) return;
    setDelBusy(true); setDelError(null);
    const res = await deleteMyAccount();
    setDelBusy(false);
    if (!res.ok) { setDelError(res.error ?? autoT('İşlem başarısız')); return; }
    setDelOpen(false);
    toast.success(autoT('Hesabınız silindi.'));
    useAuthStore.getState().signOut();
  };
  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: U.isDark ? U.pageBg : TH.bg }}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={TH.primary} />}
    >
      {/* Top action bar */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: TH.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{initials(profile?.full_name)}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
              {profile?.full_name?.split(' ').slice(0, 2).join(' ') ?? 'Kurye'}
            </Text>
            <Text style={{ fontSize: 10, color: U.ink[500] }}>Performansım</Text>
          </View>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: U.plainBtn.bg, borderWidth: U.isDark ? 1 : 0, borderColor: U.plainBtn.border, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={15} color={U.ink[800]} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {/* ── F1 Glassmorphism Hero (krem zemin + iç beyaz cam) ── */}
        <View style={{ borderRadius: 28, ...(U.isDark ? heroSurface : { backgroundColor: TH.bg }), padding: 14, borderWidth: 1, borderColor: U.isDark ? 'rgba(255,255,255,0.10)' : TH.bgDeep }}>
          <View style={{
            backgroundColor: U.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.62)',
            borderRadius: 22, padding: 22,
            borderWidth: 1, borderColor: U.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)',
            gap: 12,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: U.ink[500] }}>
              {t('courier.stats.courierPerformance')}
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 36, color: U.ink[900], letterSpacing: -1, lineHeight: 40, marginTop: 2 }}>
              {range === 'week' ? t('courier.stats.rangeWeek') : range === 'month' ? t('courier.stats.rangeMonth') : t('courier.stats.rangeAllTime')}
            </Text>
            <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19 }}>
              {stats.totalCount > 0
                ? t('courier.stats.successSummary', { count: stats.totalCount, avgMin: stats.avgMin })
                : t('courier.stats.noPeriodDeliveries')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 6 }}>
              <BigStat value={String(stats.totalCount)} label={t('courier.stats.total')} />
              <BigStat value={`%${stats.successPct}`}   label={t('courier.stats.success')} tone="success" />
            </View>
          </View>
        </View>

        {/* Range pill bar */}
        <RangePillBar value={range} onChange={setRange} />

        {/* 2×2 KPI grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <PremiumKPI size="sm" icon={Truck}    label={t('courier.kpi.totalDeliveries')} value={stats.totalCount}  sub={t('courier.stats.tasksCount', { count: stats.totalAttempt })}                                  accent={TH.primary} />
          <PremiumKPI size="sm" icon={Timer}    label={t('courier.kpi.avgTime')}      value={`${stats.avgMin}${autoT('dk')}`} sub={stats.fastest > 0 ? t('courier.stats.fastest', { count: stats.fastest }) : '—'}    accent={SUCCESS} />
          <PremiumKPI size="sm" icon={Award}    label={t('courier.kpi.successRate')}   value={`%${stats.successPct}`} sub={t('courier.stats.thisPeriod')}                                                  accent={WARNING} trend={{ value: stats.successPct >= 90 ? t('courier.trend.good') : stats.successPct >= 70 ? t('courier.trend.average') : t('courier.trend.low'), tone: stats.successPct >= 90 ? 'up' : stats.successPct >= 70 ? 'neutral' : 'down' }} />
          <PremiumKPI size="sm" icon={Activity} label={t('courier.kpi.waiting')}       value={Math.max(0, stats.totalAttempt - stats.totalCount)} sub={t('courier.stats.activeTask')}                  accent="#7C3AED" />
        </View>

        {/* Mini bar chart — son 7 gün */}
        <View style={{ borderRadius: 18, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[200], padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500] }}>{t('courier.stats.last7Days')}</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.5, marginTop: 2 }}>{t('courier.stats.dailyTrend')}</Text>
            </View>
            <Text style={{ fontSize: 11, color: U.ink[500] }}>{last7Days.reduce((s: number, d: any) => s + d.count, 0)} {t('courier.stats.totalMetric')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100, marginTop: 4 }}>
            {last7Days.map((d: any, i: number) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                <View style={{
                  width: '100%',
                  height: Math.max(4, (d.count / maxDayCount) * 80),
                  backgroundColor: d.count > 0 ? TH.primary : U.ink[100],
                  borderRadius: 4,
                }} />
                <Text style={{ fontSize: 9, color: U.ink[500], fontWeight: '600' }}>{d.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Son Teslimatlar */}
        <View>
          <Text style={{ ...DISPLAY, fontSize: 18, color: U.ink[900], letterSpacing: -0.3, marginBottom: 12 }}>{t('courier.stats.recentDeliveries')}</Text>
          {filtered.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: U.ink[200], backgroundColor: U.surface }}>
              <Calendar size={20} color={U.ink[400]} />
              <Text style={{ fontSize: 13, color: U.ink[500] }}>{t('courier.stats.noPeriodDeliveries2')}</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.slice(0, 10).map((d: CourierDelivery) => {
                const dur = d.picked_up_at && d.delivered_at
                  ? Math.round((new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000)
                  : null;
                return (
                  <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[100] }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(45,154,107,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={16} color={SUCCESS} strokeWidth={2.4} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                        {d.destination_name ?? '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                        {d.delivered_at ? new Date(d.delivered_at).toLocaleString(localeTag(i18n.language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        {dur && ` · ${dur}${autoT('dk')}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── AYARLAR — Dil + Çıkış (kurye profil/ayar ekranı) ── */}
        <View style={{ gap: 12, marginTop: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[500] }}>{autoT('AYARLAR')}</Text>

          {/* Dil seçimi */}
          <View style={{ backgroundColor: U.surface, borderRadius: 18, borderWidth: 1, borderColor: U.ink[200], padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Globe size={16} color={U.ink[700]} strokeWidth={1.8} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>{autoT('Dil')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['tr', 'en', 'de', 'fa'] as const).map(l => {
                const active = i18n.language === l;
                const label = ({ tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی' } as const)[l];
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLanguage(l)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? TH.primary : U.plainBtn.bg, borderWidth: 1, borderColor: active ? TH.primary : U.plainBtn.border }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? '#FFF' : U.ink[700] }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Çıkış Yap */}
          <Pressable
            onPress={() => {
              const doOut = () => { useAuthStore.getState().signOut(); };
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined' && window.confirm(autoT('Çıkış yapmak istediğinize emin misiniz?'))) doOut();
              } else {
                Alert.alert(autoT('Çıkış Yap'), autoT('Çıkış yapmak istediğinize emin misiniz?'), [
                  { text: autoT('Vazgeç'), style: 'cancel' },
                  { text: autoT('Çıkış Yap'), style: 'destructive', onPress: doOut },
                ]);
              }
            }}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 14, borderRadius: 18, backgroundColor: U.plainBtn.bg,
              borderWidth: 1, borderColor: 'rgba(217,75,75,0.30)',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <LogOut size={16} color="#D94B4B" strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#D94B4B' }}>{autoT('Çıkış Yap')}</Text>
          </Pressable>

          {/* Hesabımı Sil — App Store 5.1.1(v) uygulama-içi hesap silme */}
          <Pressable
            onPress={() => { setDelText(''); setDelError(null); setDelOpen(true); }}
            style={({ pressed }: any) => ({ alignSelf: 'center', paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontSize: 12.5, color: U.ink[400], textDecorationLine: 'underline' }}>{autoT('Hesabımı Sil')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>

    {/* Hesabımı Sil — onay modalı (yaz-onayla) */}
    <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => !delBusy && setDelOpen(false)}>
      <View style={{ flex: 1, backgroundColor: U.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: U.surface, borderRadius: 24, padding: 24, gap: 16, ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(217,75,75,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} color={DANGER} strokeWidth={2.2} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.5, flex: 1 }}>{autoT('Hesabımı Sil')}</Text>
          </View>

          <Text style={{ fontSize: 13, color: U.ink[700], lineHeight: 20 }}>
            {autoT('Bu işlem geri alınamaz. Hesabınız kalıcı olarak kapatılır ve giriş yapamazsınız. Yasal yükümlülükler gereği bazı teslimat/iş kayıtları anonimleştirilmiş biçimde saklanabilir.')}
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>
              {autoT('Onaylamak için SİL yazın')}
            </Text>
            <TextInput
              value={delText}
              onChangeText={setDelText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="SİL"
              placeholderTextColor={U.ink[300]}
              editable={!delBusy}
              style={{
                borderWidth: 1, borderColor: delConfirmed ? DANGER : U.ink[200],
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                fontSize: 15, color: U.ink[900], backgroundColor: U.plainBtn.bg,
              }}
            />
            {delError ? <Text style={{ fontSize: 12, color: DANGER }}>{delError}</Text> : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Pressable
              onPress={() => !delBusy && setDelOpen(false)}
              style={({ pressed }: any) => ({
                flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center',
                backgroundColor: U.isDark ? U.chipNeutral : '#F1F5F9', opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>{autoT('Vazgeç')}</Text>
            </Pressable>
            <Pressable
              disabled={!delConfirmed || delBusy}
              onPress={runDeleteAccount}
              style={({ pressed }: any) => ({
                flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center',
                backgroundColor: (!delConfirmed || delBusy) ? 'rgba(217,75,75,0.35)' : DANGER,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                {delBusy ? autoT('Siliniyor…') : autoT('Hesabımı Sil')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

/* ══════════════════════════ DESKTOP ══════════════════════════ */

function DesktopView({ profile, filtered, stats, loading, range, setRange, onRefresh, last7Days, maxDayCount }: any) {
  const U = useInkUI();
  const heroSurface = useHeroSurface(TH.primary);
  const { t, i18n } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
    >
      {/* Page title */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[500] }}>{greeting(t)}, {profile?.full_name?.split(' ')[0] ?? 'Kurye'}</Text>
          <Text style={{ ...DISPLAY, fontSize: 30, color: U.ink[900], letterSpacing: -0.9, lineHeight: 34, marginTop: 2 }}>{t('courier.stats.myPerformance')}</Text>
          <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 4 }}>{t('courier.stats.description')}</Text>
        </View>
        <RangePillBar value={range} onChange={setRange} />
      </View>

      {/* ── F2 Full-bleed Gradient Hero ── */}
      <View style={{
        borderRadius: 28, padding: 48, ...heroSurface,
        position: 'relative', overflow: 'hidden',
      }}>
        <View style={{ position: 'absolute', top: -40, end: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} pointerEvents="none" />
        <View style={{ position: 'absolute', bottom: -60, start: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} pointerEvents="none" />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 280 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
              {range === 'week' ? t('courier.stats.summaryWeek') : range === 'month' ? t('courier.stats.summaryMonth') : t('courier.stats.summaryAllTime')}
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 72, color: '#FFF', letterSpacing: -2.6, lineHeight: 76, marginTop: 14 }}>
              {t('courier.stats.deliveriesCount', { count: stats.totalCount })}
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 14, maxWidth: 520, lineHeight: 20 }}>
              {t('courier.stats.heroDescription', { pct: stats.successPct, avgMin: stats.avgMin })}
              {stats.fastest > 0 && ` · ${t('courier.stats.heroFastest', { count: stats.fastest })}`}.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: U.ink[900], marginTop: 24, alignSelf: 'flex-start' }}>
              <BarChart3 size={14} color={U.onDarkPill} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>{t('courier.stats.detailedReport')}</Text>
            </View>
          </View>
          <View style={{
            width: 140, height: 140, borderRadius: 28,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Award size={64} color="#FFF" strokeWidth={1.4} />
          </View>
        </View>
      </View>

      {/* KPI shelf 4-col */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <PremiumKPI size="lg" icon={Truck}    label={t('courier.stats.kpiTotalDeliveries')} value={stats.totalCount}                              sub={t('courier.stats.tasksCount', { count: stats.totalAttempt })}                              accent={TH.primary} />
        <PremiumKPI size="lg" icon={Timer}    label={t('courier.stats.kpiAvgTime')}     value={`${stats.avgMin}${autoT('dk')}`}                          sub={stats.fastest > 0 ? t('courier.stats.fastest', { count: stats.fastest }) : '—'}   accent={SUCCESS}
          trend={stats.fastest > 0 && stats.avgMin < 20 ? { value: autoT('Hızlı'), tone: 'up' } : undefined} />
        <PremiumKPI size="lg" icon={Award}    label={t('courier.stats.kpiSuccess')}        value={`%${stats.successPct}`}                        sub={t('courier.stats.thisPeriod')}                                                    accent={WARNING}
          trend={{ value: stats.successPct >= 90 ? t('courier.stats.trendExcellent') : stats.successPct >= 70 ? t('courier.stats.trendMiddle') : t('courier.stats.trendLow'), tone: stats.successPct >= 90 ? 'up' : stats.successPct >= 70 ? 'neutral' : 'down' }} />
        <PremiumKPI size="lg" icon={Activity} label={t('courier.kpi.waiting')}      value={Math.max(0, stats.totalAttempt - stats.totalCount)} sub={t('courier.stats.activeTask')}                                              accent="#7C3AED" />
      </View>

      {/* 2 chart card */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Card padding={20} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500] }}>{t('courier.stats.chart1Last7Days')}</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.5, marginTop: 2 }}>{t('courier.stats.dailyDeliveries')}</Text>
            </View>
            <Text style={{ fontSize: 11, color: U.ink[500] }}>{last7Days.reduce((s: number, d: any) => s + d.count, 0)} {t('courier.stats.totalMetric')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140, marginTop: 20 }}>
            {last7Days.map((d: any, i: number) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: '100%',
                  height: Math.max(4, (d.count / maxDayCount) * 110),
                  backgroundColor: d.count > 0 ? TH.primary : U.ink[100],
                  borderRadius: 4,
                }} />
                <Text style={{ fontSize: 10, color: U.ink[500], fontWeight: '600' }}>{d.day}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card padding={20} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500] }}>{t('courier.stats.efficiency')}</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.5, marginTop: 2 }}>{t('courier.stats.timeDistribution')}</Text>
            </View>
            <TrendingUp size={16} color={SUCCESS} />
          </View>
          <View style={{ marginTop: 20, gap: 12 }}>
            {[
              { label: t('courier.stats.duration15'), value: filtered.filter((d: CourierDelivery) => d.picked_up_at && d.delivered_at && (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000 < 15).length, color: SUCCESS },
              { label: t('courier.stats.duration30'), value: filtered.filter((d: CourierDelivery) => {
                if (!d.picked_up_at || !d.delivered_at) return false;
                const m = (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
                return m >= 15 && m < 30;
              }).length, color: TH.primary },
              { label: t('courier.stats.duration60'), value: filtered.filter((d: CourierDelivery) => {
                if (!d.picked_up_at || !d.delivered_at) return false;
                const m = (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
                return m >= 30 && m < 60;
              }).length, color: WARNING },
              { label: t('courier.stats.durationOver60'), value: filtered.filter((d: CourierDelivery) => d.picked_up_at && d.delivered_at && (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000 >= 60).length, color: DANGER },
            ].map((row, i) => {
              const total = stats.totalCount || 1;
              const pct = (row.value / total) * 100;
              return (
                <View key={i} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{row.label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[900] }}>{row.value}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 999, backgroundColor: U.ink[100], overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: row.color, borderRadius: 999 }} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      {/* Tablo */}
      <View>
        <SecHeader eyebrow={t('courier.section.history')} title={`${t('courier.stats.allDeliveries')} (${filtered.length})`} />
        <Card padding={0}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: U.ink[50], borderBottomWidth: 1, borderBottomColor: U.ink[100] }}>
            {[t('courier.table.date'), t('courier.table.customer'), t('courier.table.address'), t('courier.table.duration'), t('courier.table.status')].map((h, i) => (
              <Text key={h} style={{ flex: i === 2 ? 2 : 1, fontSize: 10, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</Text>
            ))}
          </View>
          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
              <Calendar size={24} color={U.ink[300]} />
              <Text style={{ fontSize: 13, color: U.ink[500] }}>{t('courier.stats.emptyPeriod')}</Text>
            </View>
          ) : filtered.map((d: CourierDelivery, i: number, arr: CourierDelivery[]) => {
            const dur = d.picked_up_at && d.delivered_at
              ? Math.round((new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000)
              : null;
            return (
              <View key={d.id} style={{
                flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: U.ink[100],
              }}>
                <Text style={{ flex: 1, fontSize: 11, color: U.ink[500] }}>
                  {d.delivered_at ? new Date(d.delivered_at).toLocaleDateString(localeTag(i18n.language), { day: '2-digit', month: 'short' }) : '—'}
                </Text>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{d.destination_name ?? '—'}</Text>
                <Text style={{ flex: 2, fontSize: 12, color: U.ink[500] }} numberOfLines={1}>{formatAddress(d.destination_address) || '—'}</Text>
                <Text style={{ flex: 1, fontSize: 12, color: U.ink[700] }}>{dur ? `${dur}${autoT('dk')}` : '—'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(45,154,107,0.14)', alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: SUCCESS }}>TAMAM</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </View>
    </ScrollView>
  );
}

/* ════════════════════════ Atoms ════════════════════════ */

function RangePillBar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const U = useInkUI();
  const { t } = useTranslation();
  const opts: { key: Range; label: string }[] = [
    { key: 'week',  label: t('courier.range.week') },
    { key: 'month', label: t('courier.range.month') },
    { key: 'all',   label: t('courier.range.all') },
  ];
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 999, backgroundColor: U.chipNeutral }}>
      {opts.map(o => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
              backgroundColor: active ? U.segActive : 'transparent',
              ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null),
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BigStat({ value, label, tone }: { value: string; label: string; tone?: 'success' }) {
  const U = useInkUI();
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 42, color: tone === 'success' ? SUCCESS : U.ink[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function KPIMini({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent: string }) {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, minWidth: '46%', backgroundColor: U.surface, borderRadius: 16, borderWidth: 1, borderColor: U.ink[200], padding: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: accent + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={accent} strokeWidth={2.2} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500], flex: 1 }}>{label}</Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.7, lineHeight: 26, color: U.ink[900] }}>{value}</Text>
      {sub && <Text style={{ fontSize: 10, color: U.ink[500] }} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function KPIDesktop({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent: string }) {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, backgroundColor: U.surface, borderRadius: 16, borderWidth: 1, borderColor: U.ink[200], padding: 18, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: accent + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={accent} strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500], flex: 1 }}>{label}</Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.7, lineHeight: 30, color: U.ink[900] }}>{value}</Text>
      {sub && <Text style={{ fontSize: 11, color: U.ink[500] }} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function Card({ children, padding = 16, style }: any) {
  const U = useInkUI();
  return <View style={[{ backgroundColor: U.surface, borderRadius: 18, borderWidth: 1, borderColor: U.ink[200], padding }, style]}>{children}</View>;
}

function SecHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const U = useInkUI();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: U.ink[500] }}>{eyebrow}</Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.5, marginTop: 4 }}>{title}</Text>
    </View>
  );
}
