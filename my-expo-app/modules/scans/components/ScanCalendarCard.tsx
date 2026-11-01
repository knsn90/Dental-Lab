// Özet sayfası — Tarama programı widget'ı (kullanıcı: "bu tarz [Fantastical] daha modern ve minimal küçük widget").
// Sol: seçili günün büyük tarihi; sağ: küçük ay takvimi (randevulu günler yoğunluğa göre tonlanır, bugün dolu
// kare); alt: seçili günün randevuları. Kart yarım sütun kadar genişse (Admin Özet) liste takvimin sağına geçer.
// Hafta/gün görünümleri Tarama Randevuları sayfasındadır.
// Ana pakette (Özet panoları) kullanılır: ekran modüllerini İÇE AKTARMAZ; detay/form pencereleri React.lazy ile
// ayrı parçadan gelir. Modül kapalıysa ya da yetki yoksa hiç çizilmez ve sorgu da yapmaz (iç bileşen yalnız
// görünürken bağlanır). Yerleşim kartın KENDİ genişliğine göre seçilir (ızgarada çeyrek ya da yarım olabilir).
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { useAccentTones } from '../../../core/ui/HeroGlow';
import { hexA } from '../../../core/theme/stationPalette';
import { DS } from '../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useAuthStore } from '../../../core/store/authStore';
import { useFeatureFlagsStore } from '../../../core/store/featureFlagsStore';
import { useFeaturePerms } from '../../../core/store/permissionStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag, isRTL } from '../../../core/i18n';
import { Plus, ChevronLeft, ChevronRight } from '../../../core/ui/icons';
import { addDays, addMonths, monthGrid, weekDates, labLocalParts, labLocalToIso, hhmm } from '../scanModel';
import type { ScanKind } from '../scanModel';
import { fetchScanDay, fetchPendingDecisions } from '../api';
import { useScanCatalog } from '../hooks/useScanCatalog';
import type { ScanAppointmentRow } from '../types';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { IconBtn, useKindTones, WEB_PTR, pressScale, DISPLAY_FONT } from './ui';

const DetailLazy = React.lazy(() => import('./AppointmentDetailModal').then((m) => ({ default: m.AppointmentDetailModal })));
const FormLazy = React.lazy(() => import('./AppointmentFormModal').then((m) => ({ default: m.AppointmentFormModal })));

const AGENDA_MAX = 3;        // widget'ta gösterilen randevu (fazlası "+N daha")
const WIDE_MIN = 330;        // bu genişliğin altında tarih bloğu takvimin üstüne geçer
const XWIDE_MIN = 520;       // bu genişlikten itibaren liste takvimin SAĞINA geçer (yarım sütun — kısa ve yatay)
const XWIDE_MONTH_W = 236;   // yatay yerleşimde küçük ayın sabit genişliği

/** Kart görünür mü (modül açık + yönetici ya da görme yetkisi) — panolar ızgarayı buna göre kurar */
export function useScanCardVisible(): { visible: boolean; canManage: boolean } {
  const profile = useAuthStore((s) => s.profile);
  const on = useFeatureFlagsStore((s) => s.flags.scan_appointments === true);
  const perms = useFeaturePerms('scan_appointments');
  const isManager = profile?.user_type === 'admin' || (profile?.user_type === 'lab' && (profile as any)?.role === 'manager');
  return { visible: on && (isManager || perms.canView), canManage: isManager || perms.canManage };
}

export function ScanCalendarCard({ style }: { style?: any }) {
  const { visible, canManage } = useScanCardVisible();
  if (!visible) return null;
  return <Inner style={style} canManage={canManage} />;
}

function kindsOf(r: ScanAppointmentRow): ScanKind[] {
  const ks = Array.from(new Set(r.services.map((s) => s.scan_kind).filter(Boolean))) as ScanKind[];
  return ks.length ? ks : ['intraoral'];
}

const fmtDay = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(localeTag(), { ...o, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

function Inner({ style, canManage }: { style?: any; canManage: boolean }) {
  const seg = String((useSegments() as string[])?.[0] ?? '(lab)');
  const cat = useScanCatalog();
  const today = labLocalParts(new Date().toISOString(), cat.tz).date;
  const [sel, setSel] = useState<string | null>(null);       // seçili gün: sol tarih + alttaki liste
  const [month, setMonth] = useState<string | null>(null);   // görüntülenen ay (içinden herhangi bir gün)
  useEffect(() => { if (cat.ready && !sel) { setSel(today); setMonth(today); } }, [cat.ready, today, sel]);
  const [rows, setRows] = useState<ScanAppointmentRow[]>([]);
  const [pending, setPending] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lastDetail, setLastDetail] = useState<string | null>(null);   // kapanış hareketi için bağlı kalır
  const [formOpen, setFormOpen] = useState(false);
  const [formEver, setFormEver] = useState(false);
  const [editRow, setEditRow] = useState<ScanAppointmentRow | null>(null);
  const [origin, setOrigin] = useState<OriginRect | null>(null);

  const load = useCallback(async () => {
    if (!cat.ready || !cat.labId || !month || !sel) return;
    const from = monthGrid(month)[0].date;
    const to = addDays(from, 42);
    const span = (a: string, b: string) => fetchScanDay(cat.labId!, labLocalToIso(a, 0, cat.tz), labLocalToIso(b, 0, cat.tz));
    // seçili gün görünen ayın dışında kaldıysa (ay okları) onun listesi de gelsin
    const outside = sel < from || sel >= to;
    const [r, extra, p] = await Promise.all([span(from, to), outside ? span(sel, addDays(sel, 1)) : Promise.resolve([]), fetchPendingDecisions(cat.labId)]);
    const seen = new Set(r.map((x) => x.id));
    setRows([...r, ...extra.filter((x) => !seen.has(x.id))]);
    setPending(p.reduce((n, a) => n + (a.status === 'planlandi' ? 1 : a.patients.filter((x) => x.status === 'karar_bekliyor').length), 0));
  }, [cat.ready, cat.labId, cat.tz, month, sel]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (detailId) setLastDetail(detailId); }, [detailId]);
  useEffect(() => { if (formOpen) setFormEver(true); }, [formOpen]);

  if (!cat.ready || !sel || !month) return <ScanWidgetLoading style={style} />;
  return (
    <ScanWidgetView
      style={style} today={today} sel={sel} month={month} rows={rows} tz={cat.tz} workdays={cat.settings.workdays}
      pending={pending} canManage={canManage}
      onPick={(d, inMonth) => { setSel(d); if (!inMonth) setMonth(d); }}
      onStep={(n) => setMonth(addMonths(month, n))}
      onToday={() => { setSel(today); setMonth(today); }}
      onNav={(to) => router.push((to === 'pending' ? `/${seg}/scans?tab=pending` : `/${seg}/scans`) as any)}
      onNew={(o) => { setOrigin(o); setEditRow(null); setFormOpen(true); }}
      onOpenRow={(id, o) => { setOrigin(o); setDetailId(id); }}
    >
      <Suspense fallback={null}>
        {lastDetail ? (
          <DetailLazy
            visible={!!detailId} origin={origin} onClose={() => setDetailId(null)} rowId={detailId ?? lastDetail} catalog={cat}
            canManage={canManage} onChanged={load}
            onEdit={(r) => { setDetailId(null); setEditRow(r); setFormOpen(true); }}
            onDecide={(r) => { setDetailId(null); router.push(`/${seg}/scans?tab=pending&id=${r.id}` as any); }}
          />
        ) : null}
        {formOpen || formEver ? (
          <FormLazy
            visible={formOpen} origin={origin} onClose={() => setFormOpen(false)} onSaved={() => { void load(); }}
            catalog={cat} initial={editRow} defaultDate={sel >= today ? sel : today}
          />
        ) : null}
      </Suspense>
    </ScanWidgetView>
  );
}

/** Genişlik: web'de bağlanırken eşzamanlı ölçülür (ilk karede dar→geniş zıplaması olmasın), sonra onLayout izler */
function useWidth(): [React.MutableRefObject<any>, number, (e: any) => void] {
  const ref = useRef<any>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect?.();
    if (r?.width) setW(Math.round(r.width));
  }, []);
  return [ref, w, (e: any) => setW(Math.round(e.nativeEvent.layout.width))];
}

function useShell() {
  const U = useInkUI();
  return { backgroundColor: U.surface, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: U.hairline, padding: 16 };
}

function ScanWidgetLoading({ style }: { style?: any }) {
  const shell = useShell();
  return <View style={[shell, { alignItems: 'center', justifyContent: 'center', minHeight: 220 }, style]}><ActivityIndicator /></View>;
}

export interface ScanWidgetViewProps {
  style?: any; today: string; sel: string; month: string; rows: ScanAppointmentRow[]; tz: string; workdays: number[];
  pending: number; canManage: boolean;
  onPick: (d: string, inMonth: boolean) => void; onStep: (n: number) => void; onToday: () => void;
  onNav: (to: 'scans' | 'pending') => void; onNew: (o: OriginRect | null) => void; onOpenRow: (id: string, o: OriginRect | null) => void;
  children?: React.ReactNode;
}

/** Saf görünüm (veri dışarıdan) — /dev/scan-widget demo sayfası da bunu sahte veriyle çizer */
export function ScanWidgetView(p: ScanWidgetViewProps) {
  const U = useInkUI();
  const panel = usePanelTheme();
  const tones = useAccentTones(panel.primary);
  const shell = useShell();
  const [cardRef, cardW, onCardLayout] = useWidth();
  const addRef = useRef<any>(null);
  const { sel, today, pending } = p;

  const byDay = useMemo(() => {
    const m: Record<string, { r: ScanAppointmentRow; min: number }[]> = {};
    for (const r of p.rows) {
      if (r.status === 'iptal') continue;
      const lp = labLocalParts(r.starts_at, p.tz);
      (m[lp.date] ??= []).push({ r, min: lp.minutes });
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.min - b.min);
    return m;
  }, [p.rows, p.tz]);

  const wide = cardW >= WIDE_MIN;
  const xwide = cardW >= XWIDE_MIN;
  const isToday = sel === today;
  // açık accent'ler (safran) beyaz zeminde metin olarak okunmaz → nötr mürekkep
  const accentText = onAccentInk(panel.primary) === '#FFFFFF' ? tones.ink : U.ink[900];
  const dayList = byDay[sel] ?? [];

  const dateBlock = (side: boolean) => (
    <GlassTooltip title={autoT('Tarama Randevuları')} text={autoT('Programın tamamını açar')}>
      <Pressable onPress={() => p.onNav('scans')} accessibilityRole="link"
        accessibilityLabel={`${autoT('Tarama Randevuları')} · ${fmtDay(sel, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        style={({ pressed }: any) => ({
          ...(side ? { width: Math.max(84, Math.min(128, Math.round(cardW * 0.3))) } : { flexDirection: 'row', alignItems: 'center', gap: 12 }),
          ...pressScale(pressed), ...WEB_PTR,
        })}>
        {side ? null : <BigDay day={sel} size={44} />}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: U.ink[400] }} numberOfLines={1}>
            {fmtDay(sel, { month: 'long' }).toLocaleUpperCase(localeTag())}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: isToday ? accentText : U.ink[700], marginTop: 2 }} numberOfLines={1}>
            {fmtDay(sel, { weekday: 'long' })}
          </Text>
        </View>
        {side ? <BigDay day={sel} size={60} /> : null}
      </Pressable>
    </GlassTooltip>
  );

  const pendingChip = (full: boolean) => (pending > 0 ? (
    <GlassTooltip title={`${pending} ${autoT('karar bekliyor')}`} text={autoT('İşaretlenmemiş ya da sonucu girilmemiş taramalar')}>
      <Pressable onPress={() => p.onNav('pending')} accessibilityRole="button"
        accessibilityLabel={`${pending} ${autoT('karar bekliyor')}`}
        style={({ pressed }: any) => ({ height: 26, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: U.chipTones.warning.bg, ...pressScale(pressed), ...WEB_PTR })}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: DS.exec.warning }} />
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: U.chipTones.warning.fg }} numberOfLines={1}>
          {full ? `${pending} ${autoT('karar bekliyor')}` : String(pending)}
        </Text>
      </Pressable>
    </GlassTooltip>
  ) : null);

  const plusBtn = p.canManage ? (
    <IconBtn navy innerRef={addRef} size={28} label={autoT('Yeni tarama randevusu')} tip={autoT('Telefonla gelen randevuyu kaydedin; uygun saati sistem önerir')}
      onPress={() => measureOrigin(addRef.current, p.onNew)}>
      {(c) => <Plus size={15} color={c} strokeWidth={2.2} />}
    </IconBtn>
  ) : null;

  const agendaRows = (
    <View style={{ marginTop: 4 }}>
      {dayList.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: U.ink[400], paddingVertical: 8 }}>{autoT('Randevu yok')}</Text>
      ) : dayList.slice(0, AGENDA_MAX).map(({ r, min }) => (
        <AgendaRow key={r.id} row={r} startMin={min} onOpen={(o) => p.onOpenRow(r.id, o)} />
      ))}
      {dayList.length > AGENDA_MAX ? (
        <Pressable onPress={() => p.onNav('scans')} accessibilityRole="link"
          style={({ pressed }: any) => ({ alignSelf: 'flex-start', paddingVertical: 4, ...pressScale(pressed), ...WEB_PTR })}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>{`+${dayList.length - AGENDA_MAX} ${autoT('daha')}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const month = (key: string, width?: number) => (
    // yerleşim değişince yeniden bağlanır → hücre ölçüsü yeni genişlikten
    <MiniMonth key={key} width={width} month={p.month} sel={sel} today={today} byDay={byDay} workdays={p.workdays} onPick={p.onPick} onStep={p.onStep} onToday={p.onToday} />
  );

  return (
    <View ref={cardRef} style={[shell, p.style]} onLayout={onCardLayout}>
      {xwide ? (
        // Yatay (orta boy widget): solda küçük ay, sağda seçili günün başlığı + listesi
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {month('xwide', XWIDE_MONTH_W)}
          <View style={{ width: 1, backgroundColor: U.hairlineSoft }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View style={{ flex: 1, minWidth: 0 }}>{dateBlock(false)}</View>
              {plusBtn}
            </View>
            {agendaRows}
            {pending > 0 ? <View style={{ flexDirection: 'row', marginTop: 6 }}>{pendingChip(true)}</View> : null}
          </View>
        </View>
      ) : (
        <>
          <View style={wide ? { flexDirection: 'row', gap: 14 } : { gap: 12 }}>
            {dateBlock(wide)}
            {month(wide ? 'wide' : 'narrow')}
          </View>

          <View style={{ height: 1, backgroundColor: U.hairlineSoft, marginTop: 12, marginBottom: 10 }} />

          {/* Seçili günün listesi */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: isToday ? accentText : U.ink[500], flexShrink: 1 }} numberOfLines={1}>
              {isToday ? autoT('Bugün').toLocaleUpperCase(localeTag()) : fmtDay(sel, { weekday: 'short', day: 'numeric', month: 'short' }).toLocaleUpperCase(localeTag())}
              {wide ? <Text style={{ fontWeight: '500', color: U.ink[400] }}>{`  ${fmtDay(sel, { day: '2-digit', month: '2-digit', year: 'numeric' })}`}</Text> : null}
            </Text>
            <View style={{ flex: 1 }} />
            {pendingChip(wide)}
            {plusBtn}
          </View>
          {agendaRows}
        </>
      )}
      {p.children}
    </View>
  );
}

function BigDay({ day, size }: { day: string; size: number }) {
  const U = useInkUI();
  return (
    <Text style={{ fontFamily: DISPLAY_FONT, fontSize: size, fontWeight: '200', letterSpacing: -0.04 * size, lineHeight: size * 1.08,
      color: U.ink[900], fontVariant: ['tabular-nums'], marginTop: size > 50 ? 2 : 0 }}>
      {Number(day.slice(8))}
    </Text>
  );
}

/** Küçük ay takvimi: randevulu günler sayıya göre tonlanır; bugün dolu kare, seçili gün halka */
function MiniMonth({ month, sel, today, byDay, workdays, onPick, onStep, onToday, width }: {
  month: string; sel: string; today: string; byDay: Record<string, unknown[]>; workdays: number[]; width?: number;
  onPick: (d: string, inMonth: boolean) => void; onStep: (n: number) => void; onToday: () => void;
}) {
  const U = useInkUI();
  const panel = usePanelTheme();
  const [boxRef, w, onBoxLayout] = useWidth();
  const grid = monthGrid(month);
  const cell = w ? Math.floor(w / 7) : 30;
  const d = Math.max(20, Math.min(26, cell - 4));
  const rad = Math.round(d * 0.32);
  const off = month.slice(0, 7) !== today.slice(0, 7);
  const wd = weekDates(grid[0].date).map((iso) => fmtDay(iso, { weekday: 'narrow' }));
  const heat = (n: number) => hexA(panel.primary, n >= 3 ? 0.38 : n === 2 ? 0.26 : 0.16);

  return (
    <View ref={boxRef} style={width ? { width } : { flex: 1, minWidth: 0 }} onLayout={onBoxLayout}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <GlassTooltip title={off ? autoT('Bugüne dön') : fmtDay(month, { month: 'long', year: 'numeric' })} text={off ? autoT('Bu aya ve bugüne döner') : autoT('Bu ay')}>
          <Pressable onPress={onToday} accessibilityRole="button" accessibilityLabel={autoT('Bugüne dön')}
            style={({ pressed }: any) => ({ paddingVertical: 2, ...pressScale(pressed), ...WEB_PTR })}>
            <Text style={{ fontSize: 13.5, color: U.ink[900] }} numberOfLines={1}>
              <Text style={{ fontWeight: '700' }}>{fmtDay(month, { month: 'short' })}</Text>
              <Text style={{ fontWeight: '300' }}>{` ${month.slice(0, 4)}`}</Text>
            </Text>
          </Pressable>
        </GlassTooltip>
        <View style={{ flex: 1 }} />
        <Chevron dir={-1} onPress={() => onStep(-1)} />
        <Chevron dir={1} onPress={() => onStep(1)} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {wd.map((t, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: workdays.includes(i + 1) ? U.ink[400] : U.ink[300], paddingBottom: 2 }}>{t}</Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {grid.slice(row * 7, row * 7 + 7).map((g) => {
            const n = g.inMonth ? (byDay[g.date]?.length ?? 0) : 0;
            const isToday = g.date === today;
            const selected = g.date === sel && !isToday;
            return (
              <Pressable key={g.date} onPress={() => onPick(g.date, g.inMonth)} accessibilityRole="button"
                accessibilityLabel={`${fmtDay(g.date, { day: 'numeric', month: 'long' })} · ${n} ${autoT('randevu')}`}
                style={{ flex: 1, height: d + 3, alignItems: 'center', justifyContent: 'center', ...WEB_PTR }}>
                {({ hovered }: any) => (
                  <View style={{
                    width: d, height: d, borderRadius: rad, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isToday ? panel.primary : n ? heat(n) : hovered ? U.rowHover : 'transparent',
                    borderWidth: selected ? 1.5 : 0, borderColor: U.ink[900],
                  }}>
                    <Text style={{ fontSize: 11.5, fontWeight: isToday ? '700' : '500', fontVariant: ['tabular-nums'],
                      color: isToday ? onAccentInk(panel.primary) : g.inMonth ? U.ink[900] : U.ink[300] }}>
                      {Number(g.date.slice(8))}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Chevron({ dir, onPress }: { dir: -1 | 1; onPress: () => void }) {
  const U = useInkUI();
  const left = (dir === -1) !== isRTL();
  const label = dir === -1 ? autoT('Önceki ay') : autoT('Sonraki ay');
  return (
    <GlassTooltip title={label} text={dir === -1 ? autoT('Önceki ayın taramalarını gösterir') : autoT('Sonraki ayın taramalarını gösterir')}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed, hovered }: any) => ({ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
          backgroundColor: hovered ? U.rowHover : 'transparent', ...pressScale(pressed), ...WEB_PTR })}>
        {left ? <ChevronLeft size={15} color={U.ink[500]} /> : <ChevronRight size={15} color={U.ink[500]} />}
      </Pressable>
    </GlassTooltip>
  );
}

function AgendaRow({ row, startMin, onOpen }: { row: ScanAppointmentRow; startMin: number; onOpen: (o: OriginRect | null) => void }) {
  const U = useInkUI();
  const K = useKindTones();
  const ref = useRef<any>(null);
  const ks = kindsOf(row);
  const done = row.status === 'yapildi' || row.status === 'kapandi';
  const time = `${hhmm(startMin)} – ${hhmm(startMin + row.duration_min)}`;
  return (
    <Pressable ref={ref} onPress={() => measureOrigin(ref.current, onOpen)} accessibilityRole="button"
      accessibilityLabel={`${time} ${row.clinic?.name ?? ''}`}
      style={({ pressed, hovered }: any) => ({ flexDirection: 'row', gap: 10, paddingVertical: 6, paddingHorizontal: 6, marginHorizontal: -6,
        borderRadius: 10, backgroundColor: hovered ? U.rowHover : 'transparent', opacity: done ? 0.55 : 1, ...pressScale(pressed), ...WEB_PTR })}>
      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, backgroundColor: K[ks[0]].fg,
        ...(ks.length > 1 ? { borderWidth: 2, borderColor: K[ks[1]].fg } : {}) }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11.5, color: U.ink[500], fontVariant: ['tabular-nums'] }} numberOfLines={1}>{time}</Text>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{row.clinic?.name ?? '—'}</Text>
      </View>
    </Pressable>
  );
}
