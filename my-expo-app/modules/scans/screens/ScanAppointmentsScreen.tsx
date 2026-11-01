/**
 * Tarama Randevuları — klinikte ağız içi tarama / fotogrametri ziyaretleri (spec 2026-10-28).
 * Modül: 'scan_appointments' (lab bazında). Erişim: admin + lab yöneticisi + view_scan_appointments.
 * Düzen (onaylı prototip): beyaz hero (bugünün sayısı + sıradaki) → sekmeler (Program | Karar bekleyen)
 * → program kartı (gün: teknisyen şeritleri / hafta) ya da karar bekleyenler listesi.
 * Derin link: ?id=<randevu> → detay açılır (bildirimler buraya gelir).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { useAuthStore } from '../../../core/store/authStore';
import { useFeatureFlagsStore } from '../../../core/store/featureFlagsStore';
import { useFeaturePerms } from '../../../core/store/permissionStore';
import { useRealtimeRefresh } from '../../../core/hooks/useRealtimeRefresh';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { AccessDenied } from '../../../core/ui/AccessDenied';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { useIsDesktop } from '../../../core/layout/PatternsShell';
import { Plus, ChevronLeft, ChevronRight } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { addDays, addMonths, weekDates, monthGrid, labLocalParts, labLocalToIso, hhmm } from '../scanModel';
import { fetchScanDay, fetchPendingDecisions } from '../api';
import { useScanCatalog } from '../hooks/useScanCatalog';
import type { ScanAppointmentRow } from '../types';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { ScanScheduleView } from '../components/ScanScheduleView';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import { AppointmentDetailModal } from '../components/AppointmentDetailModal';
import { DecisionDialog } from '../components/DecisionDialog';
import { PendingDecisionsList } from '../components/PendingDecisionsList';
import { IconBtn, Toggle } from '../components/ui';

type Tab = 'program' | 'pending';

export function ScanAppointmentsScreen() {
  const U = useInkUI();
  const panel = usePanelTheme();
  const heroInk = useWhiteHeroInk(panel.primary);
  const isDesktop = useIsDesktop();
  const MT = useMobileTokens();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const profile = useAuthStore((s) => s.profile);
  const flagsLoaded = useFeatureFlagsStore((s) => s.loaded);
  const flagOn = useFeatureFlagsStore((s) => s.flags.scan_appointments === true);
  const loadFlags = useFeatureFlagsStore((s) => s.load);
  useEffect(() => { void loadFlags(profile?.lab_id ?? null); }, [profile?.lab_id, loadFlags]);
  const perms = useFeaturePerms('scan_appointments');
  const isManager = profile?.user_type === 'admin' || (profile?.user_type === 'lab' && (profile as any)?.role === 'manager');
  const canManage = isManager || perms.canManage;
  const allowed = flagOn && (canManage || perms.canView);

  const cat = useScanCatalog();
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => { setTitle('Tarama Randevuları', ''); return () => clear(); }, [setTitle, clear]);

  const today = labLocalParts(new Date().toISOString(), cat.tz).date;
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => { if (cat.ready && !date) setDate(today); }, [cat.ready, today, date]);
  const [range, setRange] = useState<'month' | 'week' | 'day'>('month');
  const [tab, setTab] = useState<Tab>(params.tab === 'pending' ? 'pending' : 'program');
  const [rows, setRows] = useState<ScanAppointmentRow[]>([]);
  const [todayRows, setTodayRows] = useState<ScanAppointmentRow[]>([]);
  const [pending, setPending] = useState<ScanAppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<ScanAppointmentRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [decideId, setDecideId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const addRef = useRef<any>(null);

  const load = useCallback(async () => {
    if (!cat.ready || !cat.labId || !date) return;
    const from = range === 'day' ? date : range === 'week' ? weekDates(date)[0] : monthGrid(date)[0].date;
    const to = addDays(from, range === 'day' ? 1 : range === 'week' ? 7 : 42);
    const [r, t, p] = await Promise.all([
      fetchScanDay(cat.labId, labLocalToIso(from, 0, cat.tz), labLocalToIso(to, 0, cat.tz)),
      fetchScanDay(cat.labId, labLocalToIso(today, 0, cat.tz), labLocalToIso(addDays(today, 1), 0, cat.tz)),
      fetchPendingDecisions(cat.labId),
    ]);
    setRows(r); setTodayRows(t); setPending(p); setLoading(false);
  }, [cat.ready, cat.labId, cat.tz, date, range, today]);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  useRealtimeRefresh('scan-appointments', ['scan_appointments', 'scan_patients'], () => { void load(); }, { enabled: allowed });

  useEffect(() => {
    const id = typeof params.id === 'string' ? params.id : null;
    if (id) { setOrigin(null); setDetailId(id); }
  }, [params.id]);

  const pendingCount = useMemo(() => pending.reduce((n, a) => n + (a.status === 'planlandi'
    ? 1 : a.patients.filter((p) => p.status === 'karar_bekliyor').length), 0), [pending]);
  const next = useMemo(() => {
    const now = labLocalParts(new Date().toISOString(), cat.tz).minutes;
    return todayRows.filter((r) => r.status === 'planlandi')
      .map((r) => ({ r, m: labLocalParts(r.starts_at, cat.tz).minutes }))
      .filter((x) => x.m + x.r.duration_min >= now).sort((a, b) => a.m - b.m)[0] ?? null;
  }, [todayRows, cat.tz]);

  if (!flagsLoaded || !profile) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }
  if (!allowed) return <AccessDenied />;

  const todayCount = todayRows.filter((r) => r.status !== 'iptal').length;
  const dayTitle = date
    ? new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
    : '';
  const step = (n: number) => date && setDate(range === 'month' ? addMonths(date, n) : addDays(date, range === 'day' ? n : n * 7));
  const monthName = date ? new Intl.DateTimeFormat(localeTag(), { month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : '';
  const openNew = () => measureOrigin(addRef.current, (o) => { setOrigin(o); setEditRow(null); setFormOpen(true); });

  return (
    <View style={{ flex: 1, backgroundColor: isDesktop ? undefined : MT.bg }}>
      <ScrollView contentContainerStyle={{
        paddingHorizontal: PAGE_PADDING,
        paddingTop: isDesktop ? 8 : Math.max(insets.top, 8) + 72,
        paddingBottom: isDesktop ? 120 : navBarMetrics(insets.bottom).clearance + 16,
        gap: CARD_GAP,
      }}>
        <WhiteHero
          compact
          accent={panel.primary}
          kicker={autoT('Tarama Randevuları')}
          title={todayCount > 0
            ? <>{autoT('Bugün')} <Text style={{ color: heroInk.accentInk }}>{todayCount}</Text> {autoT('tarama')}</>
            : autoT('Bugün tarama yok')}
          description={next ? `${autoT('Sıradaki')} ${hhmm(labLocalParts(next.r.starts_at, cat.tz).minutes)} · ${next.r.clinic?.name ?? ''}` : undefined}
          stats={[
            { value: String(todayCount), label: autoT('Bugün') },
            { value: String(pendingCount), label: autoT('Karar bekleyen') },
          ]}
        >
          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SlideTabBar<Tab>
              items={[
                { key: 'program', label: autoT('Program') },
                { key: 'pending', label: autoT('Karar bekleyen'), count: pendingCount },
              ] as any}
              activeKey={tab}
              onChange={setTab}
              accentColor={panel.accent}
              size="sm"
            />
            <View style={{ flex: 1 }} />
            {canManage ? (
              <IconBtn navy innerRef={addRef} label={autoT('Yeni tarama randevusu')} tip={autoT('Telefonla gelen randevuyu kaydedin; uygun saati sistem önerir')} onPress={openNew}>
                {(c) => <Plus size={18} color={c} strokeWidth={2.2} />}
              </IconBtn>
            ) : null}
          </View>
        </WhiteHero>

        {tab === 'program' ? (
          <View style={U.cardSolid}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {range === 'month' ? (
                <Text style={{ fontSize: 26, letterSpacing: -0.65, color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>
                  <Text style={{ fontWeight: '700' }}>{monthName}</Text>
                  <Text style={{ fontWeight: '300' }}> {date?.slice(0, 4)}</Text>
                </Text>
              ) : (
                <Text style={{ fontSize: 22, fontWeight: '300', letterSpacing: -0.55, color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>
                  {range === 'day' ? dayTitle : autoT('Bu hafta')}
                </Text>
              )}
              <View style={{ flex: 1 }} />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Toggle label={autoT('Ay')} on={range === 'month'} onPress={() => setRange('month')} />
                <Toggle label={autoT('Hafta')} on={range === 'week'} onPress={() => setRange('week')} />
                <Toggle label={autoT('Gün')} on={range === 'day'} onPress={() => setRange('day')} />
              </View>
              <IconBtn label={autoT('Önceki')} tip={range === 'day' ? autoT('Önceki gün') : range === 'week' ? autoT('Önceki hafta') : autoT('Önceki ay')} onPress={() => step(-1)}>
                {(c) => (isRTL() ? <ChevronRight size={17} color={c} /> : <ChevronLeft size={17} color={c} />)}
              </IconBtn>
              {date !== today ? (
                <Pressable onPress={() => setDate(today)} accessibilityRole="button" accessibilityLabel={autoT('Bugün')}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[500] }}>{autoT('Bugün')}</Text>
                </Pressable>
              ) : null}
              <IconBtn label={autoT('Sonraki')} tip={range === 'day' ? autoT('Sonraki gün') : range === 'week' ? autoT('Sonraki hafta') : autoT('Sonraki ay')} onPress={() => step(1)}>
                {(c) => (isRTL() ? <ChevronLeft size={17} color={c} /> : <ChevronRight size={17} color={c} />)}
              </IconBtn>
            </View>
            {loading || !date ? <ActivityIndicator style={{ marginVertical: 30 }} /> : (
              <ScanScheduleView
                date={date} range={range} rows={rows} catalog={cat}
                onOpen={(r, o) => { setOrigin(o); setDetailId(r.id); }}
                onPickDay={(d) => { setDate(d); setRange('day'); }}
              />
            )}
          </View>
        ) : (
          <PendingDecisionsList
            rows={pending} catalog={cat} canManage={canManage}
            onOpen={(r, o) => { setOrigin(o); setDetailId(r.id); }}
            onDecide={(r, o) => { setOrigin(o); setDecideId(r.id); }}
            onChanged={load}
          />
        )}
      </ScrollView>

      <AppointmentFormModal
        visible={formOpen} origin={origin} onClose={() => setFormOpen(false)} onSaved={() => { void load(); }}
        catalog={cat} initial={editRow} defaultDate={date ?? today}
      />
      <AppointmentDetailModal
        visible={!!detailId} origin={origin} onClose={() => setDetailId(null)} rowId={detailId} catalog={cat}
        canManage={canManage} onChanged={load}
        onEdit={(r) => { setDetailId(null); setEditRow(r); setFormOpen(true); }}
        onDecide={(r) => { setDetailId(null); setDecideId(r.id); }}
      />
      <DecisionDialog
        visible={!!decideId} origin={origin} onClose={() => setDecideId(null)} appointmentId={decideId}
        catalog={cat} onChanged={load}
      />
    </View>
  );
}
