// Teknisyen "Randevularım" (plan Task 14, prototip "Teknisyen mobil"): bugün ve yaklaşan 14 günün KENDİ
// tarama randevuları. Her kartta kliniğin adresi + Google Maps yol tarifi; "Taramayı bitir" detay penceresini
// açar (hasta ekleme, dosya yükleme, "Tarama yapıldı" orada — AppointmentDetailModal teknisyeni tanır).
// Karar eylemi bu ekranda YOK (karar admin/yöneticinin). Rota lazyRoute: app/(station)/scans.tsx.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { useAuthStore } from '../../../core/store/authStore';
import { useFeatureFlagsStore } from '../../../core/store/featureFlagsStore';
import { useRealtimeRefresh } from '../../../core/hooks/useRealtimeRefresh';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { AccessDenied } from '../../../core/ui/AccessDenied';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { useIsDesktop } from '../../../core/layout/PatternsShell';
import { addDays, labLocalParts, labLocalToIso, hhmm } from '../scanModel';
import { fetchScanDay } from '../api';
import { useScanCatalog } from '../hooks/useScanCatalog';
import type { ScanAppointmentRow } from '../types';
import type { OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { AppointmentDetailModal } from '../components/AppointmentDetailModal';
import { Eyebrow } from '../components/ui';
import { ApptCard } from '../components/ScanApptCard';

const DAYS_AHEAD = 14;
const DAYS_BACK = 3;   // işaretlenmemiş geçmiş randevular (akşam taraması, ertesi sabah dosya/işaret)

export function MyScanAppointmentsScreen() {
  const U = useInkUI();
  const MT = useMobileTokens();
  const panel = usePanelTheme();
  const heroInk = useWhiteHeroInk(panel.primary);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const profile = useAuthStore((s) => s.profile);
  const flagsLoaded = useFeatureFlagsStore((s) => s.loaded);
  const on = useFeatureFlagsStore((s) => s.flags.scan_appointments === true);
  const cat = useScanCatalog();
  const me = profile?.id ?? null;
  const [rows, setRows] = useState<ScanAppointmentRow[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lastDetail, setLastDetail] = useState<string | null>(null);
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => { setTitle('Randevularım', ''); return () => clear(); }, [setTitle, clear]);
  useEffect(() => { if (detailId) setLastDetail(detailId); }, [detailId]);

  const today = labLocalParts(new Date().toISOString(), cat.tz).date;
  const load = useCallback(async () => {
    if (!cat.ready || !cat.labId || !me) return;
    const r = await fetchScanDay(cat.labId, labLocalToIso(addDays(today, -DAYS_BACK), 0, cat.tz), labLocalToIso(addDays(today, DAYS_AHEAD), 0, cat.tz));
    // geçmiş günlerden yalnız hâlâ "planlandı" olanlar (yapıldı denmemiş) — teknisyen ertesi gün bitirebilsin
    setRows(r.filter((x) => x.technician_id === me && x.status !== 'iptal'
      && (labLocalParts(x.starts_at, cat.tz).date >= today || x.status === 'planlandi')));
  }, [cat.ready, cat.labId, cat.tz, me, today]);
  useEffect(() => { void load(); }, [load]);
  useRealtimeRefresh('my-scan-appointments', ['scan_appointments', 'scan_patients'], () => { void load(); }, { enabled: on && !!me });

  const groups = useMemo(() => {
    const m = new Map<string, { r: ScanAppointmentRow; min: number }[]>();
    for (const r of rows ?? []) {
      const lp = labLocalParts(r.starts_at, cat.tz);
      (m.get(lp.date) ?? m.set(lp.date, []).get(lp.date)!).push({ r, min: lp.minutes });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({ date, list: list.sort((a, b) => a.min - b.min) }));
  }, [rows, cat.tz]);

  if (!flagsLoaded || !profile) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!on) return <AccessDenied />;

  const todayList = groups.find((g) => g.date === today)?.list ?? [];
  const nowMin = labLocalParts(new Date().toISOString(), cat.tz).minutes;
  const next = todayList.find((x) => x.r.status === 'planlandi' && x.min + x.r.duration_min >= nowMin) ?? null;
  const dayLabel = (d: string) => d === today ? autoT('Bugün') : d === addDays(today, 1) ? autoT('Yarın') : d === addDays(today, -1) ? autoT('Dün')
    : new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

  return (
    <View style={{ flex: 1, backgroundColor: isDesktop ? undefined : MT.bg }}>
      <ScrollView contentContainerStyle={{
        paddingHorizontal: PAGE_PADDING,
        paddingTop: isDesktop ? 8 : Math.max(insets.top, 8) + 72,
        paddingBottom: isDesktop ? 120 : navBarMetrics(insets.bottom).clearance + 16,
        gap: CARD_GAP, maxWidth: 760, width: '100%', alignSelf: 'center',
      }}>
        <WhiteHero
          compact
          accent={panel.primary}
          kicker={autoT('Randevularım')}
          title={todayList.length > 0
            ? <>{autoT('Bugün')} <Text style={{ color: heroInk.accentInk }}>{todayList.length}</Text> {autoT('tarama')}</>
            : autoT('Bugün tarama yok')}
          description={next ? `${autoT('Sıradaki')} ${hhmm(next.min)} · ${next.r.clinic?.name ?? ''}` : undefined}
        />

        {rows === null ? <ActivityIndicator style={{ marginTop: 24 }} /> : groups.length === 0 ? (
          <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>{autoT('Yaklaşan tarama yok')}</Text>
            <Text style={{ fontSize: 12.5, color: U.ink[500], marginTop: 4, textAlign: 'center' }}>{autoT('Size atanan randevular burada görünür.')}</Text>
          </View>
        ) : groups.map((g) => (
          <View key={g.date} style={{ gap: CARD_GAP }}>
            <Eyebrow>{dayLabel(g.date)}</Eyebrow>
            {g.list.map(({ r, min }) => (
              <ApptCard key={r.id} row={r} startMin={min} devices={cat.devices}
                onOpen={(o) => { setOrigin(o); setDetailId(r.id); }} />
            ))}
          </View>
        ))}
      </ScrollView>

      {lastDetail && cat.ready ? (
        <AppointmentDetailModal
          visible={!!detailId} origin={origin} onClose={() => setDetailId(null)} rowId={detailId ?? lastDetail} catalog={cat}
          canManage={false} onChanged={load} onEdit={() => {}} onDecide={() => {}}
        />
      ) : null}
    </View>
  );
}

export default MyScanAppointmentsScreen;
