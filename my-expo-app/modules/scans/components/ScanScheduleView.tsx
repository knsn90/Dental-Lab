// Tarama programı görünümü (prototip: Özet kartı). Gün: geniş ekranda teknisyen şeritleri + saat ızgarası,
// randevular arası kesikli yol çizgisi, sıkışık geçişte sarı rozet; dar ekranda ajanda listesi.
// Hafta: 7 sütun (dar ekranda gün gün liste). Ana pakette de kullanılır (Özet kartı) → yalnız scans
// modülünün saf/hafif dosyalarını içe aktarır, ekran modüllerini değil.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import {
  labLocalParts, hhmm, weekDates, monthGrid, apptWarnings, makeTravelFn, type ScanSettings, type ScanKind, type ApptBlock,
} from '../scanModel';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import type { ScanAppointmentRow } from '../types';
import type { ScanCatalog } from '../hooks/useScanCatalog';
import { useKindTones, WEB_PTR, pressScale, DISPLAY_FONT } from './ui';

const PX = 52;          // saat başına yükseklik
const HEAD = 34;        // şerit başlığı

function kindOf(r: ScanAppointmentRow): ScanKind | 'both' {
  const ks = new Set(r.services.map((s) => s.scan_kind).filter(Boolean));
  return ks.size > 1 ? 'both' : ((ks.values().next().value as ScanKind) ?? 'intraoral');
}
function kindText(k: ScanKind | 'both'): string {
  return k === 'both' ? `${autoT('Ağız içi')} + ${autoT('Fotogrametri')}` : k === 'photogrammetry' ? autoT('Fotogrametri') : autoT('Ağız içi');
}

interface Props {
  date: string;
  range: 'month' | 'week' | 'day';
  rows: ScanAppointmentRow[];
  catalog: ScanCatalog;
  onOpen: (row: ScanAppointmentRow, origin: OriginRect | null) => void;
  onPickDay?: (date: string) => void;
  /** Özet kartında: daha kısa saat aralığı yok, yalnız dar kenar boşlukları */
  compact?: boolean;
  /** Özet kartı (kullanıcı: "çok büyük"): küçük ay takvimi (noktalar) + seçili günün listesi; hafta/gün liste */
  mini?: boolean;
}

export function ScanScheduleView(p: Props) {
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  if (p.range === 'month') return <MonthGrid {...p} narrow={narrow} />;
  if (p.range === 'week') return <WeekGrid {...p} narrow={narrow || !!p.mini} />;
  return narrow || p.mini ? <DayAgenda {...p} /> : <DayLanes {...p} />;
}

/** Bir randevunun lab-yerel blok bilgisi + uyarı hesabı için ortak hazırlık */
function useDay(p: Props) {
  return useMemo(() => {
    const rows = p.rows
      .filter((r) => r.status !== 'iptal')
      .map((r) => ({ r, lp: labLocalParts(r.starts_at, p.catalog.tz) }))
      .filter((x) => x.lp.date === p.date)
      .sort((a, b) => a.lp.minutes - b.lp.minutes);
    const blocks: ApptBlock[] = rows.map(({ r, lp }) => ({
      id: r.id, clinicId: r.clinic_id, technicianId: r.technician_id,
      equipmentIds: r.services.map((s) => s.equipment_id).filter((e): e is string => !!e),
      startMin: lp.minutes, minutes: r.duration_min, status: r.status,
    }));
    const points: Record<string, { lat: number; lng: number } | null> = {};
    for (const c of p.catalog.clinics) points[c.id] = c.geo ? { lat: c.geo.lat, lng: c.geo.lng } : null;
    const travel = makeTravelFn(points, {});
    const weekday = labLocalParts(`${p.date}T12:00:00Z`, p.catalog.tz).weekday;
    const tight: Record<string, { need: number; have: number }> = {};
    for (const b of blocks) {
      if (b.status !== 'planlandi') continue;
      const w = apptWarnings(b, blocks, travel, p.catalog.settings, weekday).find((x) => x.kind === 'late_from_prev');
      if (w && 'needMin' in w) tight[b.id] = { need: w.needMin, have: w.haveMin };
    }
    const today = labLocalParts(new Date().toISOString(), p.catalog.tz);
    return { rows, blocks, travel, tight, nowMin: today.date === p.date ? today.minutes : null };
  }, [p.rows, p.date, p.catalog]);
}

function legText(travel: ReturnType<typeof makeTravelFn>, a: string, b: string, at: number): string | null {
  if (a === b) return autoT('aynı klinik');
  const t = travel(a, b, at);
  return t ? `~${t.minutes} ${autoT('dk yol')}` : null;
}

/** Ölçülen düğme: pencere buradan büyür */
function OpenPress({ onOpen, style, children, label }: { onOpen: (o: OriginRect | null) => void; style: (pressed: boolean) => any; children: React.ReactNode; label: string }) {
  const ref = useRef<any>(null);
  return (
    <Pressable
      ref={ref}
      onPress={() => measureOrigin(ref.current, onOpen)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }: any) => ({ ...style(pressed), ...WEB_PTR })}
    >
      {children}
    </Pressable>
  );
}

function DayLanes(p: Props) {
  const U = useInkUI();
  const K = useKindTones();
  const panel = usePanelTheme();
  const d = useDay(p);
  const s: ScanSettings = p.catalog.settings;
  const startH = Math.floor(Math.min(s.hoursStart, ...d.blocks.map((b) => b.startMin)) / 60);
  const endH = Math.ceil(Math.max(s.hoursEnd, ...d.blocks.map((b) => b.startMin + b.minutes)) / 60);
  const laneIds = useMemo(() => {
    const ids: string[] = [];
    for (const t of p.catalog.techs) ids.push(t.id);
    for (const b of d.blocks) if (!ids.includes(b.technicianId)) ids.push(b.technicianId);
    return ids;
  }, [p.catalog.techs, d.blocks]);
  const nameOf = (id: string) => p.catalog.techs.find((t) => t.id === id)?.name
    ?? d.rows.find((x) => x.r.technician_id === id)?.r.technician?.full_name ?? '—';
  const devOf = (id: string) => {
    const used = new Set(d.rows.filter((x) => x.r.technician_id === id).flatMap((x) => x.r.services.map((sv) => sv.equipment_id)).filter(Boolean));
    return p.catalog.devices.filter((dv) => used.has(dv.id)).map((dv) => dv.name).join(', ');
  };
  const y = (min: number) => HEAD + ((min - startH * 60) / 60) * PX;
  const H = HEAD + (endH - startH) * PX;

  if (!laneIds.length) return <EmptyDay />;
  return (
    <View style={{ flexDirection: 'row', marginTop: 12 }}>
      <View style={{ width: 50, height: H }}>
        {Array.from({ length: endH - startH + 1 }, (_, i) => (
          <Text key={i} style={{ position: 'absolute', top: HEAD + i * PX - 7, fontSize: 11, color: U.ink[400], fontVariant: ['tabular-nums'] }}>
            {hhmm((startH + i) * 60)}
          </Text>
        ))}
      </View>
      {laneIds.map((tid) => {
        const mine = d.blocks.filter((b) => b.technicianId === tid);
        return (
          <View key={tid} style={{ flex: 1, height: H, borderLeftWidth: 1, borderLeftColor: U.hairline, position: 'relative' }}>
            {Array.from({ length: endH - startH + 1 }, (_, i) => (
              <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: HEAD + i * PX, height: 1, backgroundColor: U.hairlineSoft }} />
            ))}
            <View style={{ height: HEAD, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 8, backgroundColor: U.isDark ? 'rgba(255,255,255,0.10)' : `${panel.primary}33`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[900] }}>{(nameOf(tid)[0] ?? '?').toLocaleUpperCase('tr')}</Text>
              </View>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700], flexShrink: 1 }} numberOfLines={1}>{nameOf(tid)}</Text>
              <Text style={{ marginLeft: 'auto', fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{devOf(tid)}</Text>
            </View>
            {mine.map((b, i) => {
              const row = d.rows.find((x) => x.r.id === b.id)!.r;
              const k = kindOf(row);
              const tone = k === 'both' ? K.intraoral : K[k];
              const compact = b.minutes <= 60;
              const tight = d.tight[b.id];
              const next = mine[i + 1];
              const gapTop = y(b.startMin + b.minutes);
              const gapH = next ? y(next.startMin) - gapTop : 0;
              const leg = next && gapH >= 22 && !d.tight[next.id] ? legText(d.travel, b.clinicId, next.clinicId, b.startMin + b.minutes) : null;
              const done = row.status === 'yapildi' || row.status === 'kapandi';
              return (
                <React.Fragment key={b.id}>
                  <OpenPress
                    label={`${hhmm(b.startMin)} ${row.clinic?.name ?? ''}`}
                    onOpen={(o) => p.onOpen(row, o)}
                    style={(pressed) => ({
                      position: 'absolute', left: 6, right: 6, top: y(b.startMin) + 1, height: Math.max(26, (b.minutes / 60) * PX - 4),
                      borderRadius: 14, paddingVertical: compact ? 0 : 8, paddingHorizontal: 10, overflow: 'hidden',
                      backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline, opacity: done ? 0.62 : 1,
                      flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'stretch', gap: compact ? 8 : 3,
                      ...pressScale(pressed),
                    })}
                  >
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: tone.bg }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {done ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#2D9A6B' }} /> : null}
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: U.ink[700], fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                        {hhmm(b.startMin)} – {hhmm(b.startMin + b.minutes)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={compact ? 1 : 2}>{row.clinic?.name ?? '—'}</Text>
                    {!compact && !tight ? (
                      <Text style={{ fontSize: 11, color: U.ink[500] }} numberOfLines={1}>
                        {kindText(k)}{row.patients.length ? ` · ${row.patients.length} ${autoT('hasta')}` : ''}
                      </Text>
                    ) : null}
                    {tight ? (
                      <View style={{ alignSelf: compact ? 'center' : 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: U.chipTones.warning.bg }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.chipTones.warning.fg }} numberOfLines={1}>
                          {tight.need} {autoT('dk yol')} · {tight.have} {autoT('dk açık')}
                        </Text>
                      </View>
                    ) : null}
                  </OpenPress>
                  {leg ? (
                    <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, top: gapTop + gapH / 2 - 7, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: U.fieldBorder }} />
                      <Text style={{ fontSize: 10.5, fontWeight: '600', color: U.ink[400] }}>{leg}</Text>
                      <View style={{ flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: U.fieldBorder }} />
                    </View>
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>
        );
      })}
      {d.nowMin != null && d.nowMin >= startH * 60 && d.nowMin <= endH * 60 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 50, right: 0, top: y(d.nowMin), height: 2, backgroundColor: '#D94B4B' }}>
          <View style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#D94B4B' }} />
        </View>
      ) : null}
    </View>
  );
}

function DayAgenda(p: Props & { limit?: number }) {
  const U = useInkUI();
  const K = useKindTones();
  const d = useDay(p);
  if (!d.rows.length) return <EmptyDay />;
  const shown = p.limit ? d.rows.slice(0, p.limit) : d.rows;
  const rest = d.rows.length - shown.length;
  return (
    <View style={{ marginTop: 12, gap: 6 }}>
      {shown.map(({ r, lp }, i) => {
        const k = kindOf(r);
        const tone = k === 'both' ? K.intraoral : K[k];
        const prev = d.rows[i - 1];
        const leg = prev && prev.r.technician_id === r.technician_id && !d.tight[r.id]
          ? legText(d.travel, prev.r.clinic_id, r.clinic_id, prev.lp.minutes + prev.r.duration_min) : null;
        const tight = d.tight[r.id];
        const done = r.status === 'yapildi' || r.status === 'kapandi';
        return (
          <React.Fragment key={r.id}>
            {leg ? <Text style={{ fontSize: 11, color: U.ink[400], textAlign: 'center' }}>{leg}</Text> : null}
            <OpenPress
              label={`${hhmm(lp.minutes)} ${r.clinic?.name ?? ''}`}
              onOpen={(o) => p.onOpen(r, o)}
              style={(pressed) => ({
                flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: U.hairline,
                backgroundColor: U.surface, opacity: done ? 0.62 : 1, ...pressScale(pressed),
              })}
            >
              <View style={{ width: 54 }}>
                <Text style={{ fontSize: 18, fontWeight: '300', letterSpacing: -0.4, color: U.ink[900], fontFamily: DISPLAY_FONT, fontVariant: ['tabular-nums'] }}>{hhmm(lp.minutes)}</Text>
                <Text style={{ fontSize: 11, color: U.ink[400], fontVariant: ['tabular-nums'] }}>{hhmm(lp.minutes + r.duration_min)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{r.clinic?.name ?? '—'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: tone.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: tone.fg }}>{kindText(k)}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: U.ink[500], alignSelf: 'center' }} numberOfLines={1}>
                    {r.technician?.full_name ?? ''}{r.patients.length ? ` · ${r.patients.length} ${autoT('hasta')}` : ''}
                  </Text>
                </View>
                {tight ? (
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: U.chipTones.warning.fg }}>
                    {tight.need} {autoT('dk yol')} · {tight.have} {autoT('dk açık')}
                  </Text>
                ) : null}
              </View>
            </OpenPress>
          </React.Fragment>
        );
      })}
      {rest > 0 ? <Text style={{ fontSize: 12, color: U.ink[400], textAlign: 'center' }}>+{rest} {autoT('daha')}</Text> : null}
    </View>
  );
}

function WeekGrid(p: Props & { narrow: boolean }) {
  const U = useInkUI();
  const K = useKindTones();
  const panel = usePanelTheme();
  const days = weekDates(p.date);
  const today = labLocalParts(new Date().toISOString(), p.catalog.tz).date;
  const byDay = useMemo(() => {
    const m: Record<string, { r: ScanAppointmentRow; min: number }[]> = {};
    for (const r of p.rows) {
      if (r.status === 'iptal') continue;
      const lp = labLocalParts(r.starts_at, p.catalog.tz);
      (m[lp.date] ??= []).push({ r, min: lp.minutes });
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.min - b.min);
    return m;
  }, [p.rows, p.catalog.tz]);
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(localeTag(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <View style={{ marginTop: 12, flexDirection: p.narrow ? 'column' : 'row', gap: 8 }}>
      {days.map((iso, idx) => {
        const list = byDay[iso] ?? [];
        const off = !p.catalog.settings.workdays.includes(idx + 1);
        const isToday = iso === today;
        if (p.narrow && !list.length && !isToday) return null;
        return (
          <Pressable
            key={iso}
            onPress={p.onPickDay ? () => p.onPickDay!(iso) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${fmtDay(iso)} ${Number(iso.slice(8))}`}
            style={({ pressed }: any) => ({
              flex: p.narrow ? undefined : 1, minHeight: p.narrow ? 0 : 150, borderRadius: 16, padding: 10, gap: 6,
              backgroundColor: isToday ? (U.isDark ? 'rgba(255,255,255,0.08)' : `${panel.primary}26`) : U.surfaceSoft,
              borderWidth: 1, borderColor: U.hairline, opacity: off ? 0.5 : 1, ...pressScale(pressed && !!p.onPickDay), ...WEB_PTR,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>{fmtDay(iso)}</Text>
              <Text style={{ fontSize: 18, fontWeight: '400', color: U.ink[900], fontFamily: DISPLAY_FONT, fontVariant: ['tabular-nums'] }}>{Number(iso.slice(8))}</Text>
            </View>
            {list.map(({ r, min }) => {
              const k = kindOf(r);
              return (
                <OpenPress
                  key={r.id}
                  label={`${hhmm(min)} ${r.clinic?.name ?? ''}`}
                  onOpen={(o) => p.onOpen(r, o)}
                  style={(pressed) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8,
                    backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline, ...pressScale(pressed),
                  })}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: (k === 'photogrammetry' ? K.photogrammetry : K.intraoral).fg }} />
                  <Text style={{ fontSize: 11.5, color: U.ink[700], fontVariant: ['tabular-nums'] }}>{hhmm(min)}</Text>
                  <Text style={{ fontSize: 11.5, color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>{r.clinic?.name ?? '—'}</Text>
                </OpenPress>
              );
            })}
            {!list.length ? <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{off ? autoT('Kapalı') : autoT('Boş')}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Ay görünümü (kullanıcı isteği: macOS Takvim düzeni, daha sakin ve minimal). Pazartesiden 6 hafta;
 * ince çizgiler, sağ üstte gün numarası, bugün panel renginde daire. Geniş ekranda gün başına en fazla
 * 2 kapsül (nokta + saat + klinik) ve "+N"; dar ekranda yalnız noktalar, dokunulan günün ajandası altta.
 */
function MonthGrid(p: Props & { narrow: boolean }) {
  const U = useInkUI();
  const K = useKindTones();
  const panel = usePanelTheme();
  const grid = monthGrid(p.date);
  const today = labLocalParts(new Date().toISOString(), p.catalog.tz).date;
  const firstSel = () => (grid.some((g) => g.date === today && g.inMonth) ? today : grid.find((g) => g.inMonth)!.date);
  const [sel, setSel] = useState<string>(firstSel);
  // ay değişince seçili gün yeni aya geçer (eski ayın günü yüklenmemiş aralıkta kalıp boş görünmesin)
  const monthKey = p.date.slice(0, 7);
  useEffect(() => { setSel(firstSel()); }, [monthKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [boxW, setBoxW] = useState(0);   // yan yana yerleşim ekranın değil kartın genişliğine göre
  const byDay = useMemo(() => {
    const m: Record<string, { r: ScanAppointmentRow; min: number }[]> = {};
    for (const r of p.rows) {
      if (r.status === 'iptal') continue;
      const lp = labLocalParts(r.starts_at, p.catalog.tz);
      (m[lp.date] ??= []).push({ r, min: lp.minutes });
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.min - b.min);
    return m;
  }, [p.rows, p.catalog.tz]);
  const wd = weekDates(grid[0].date).map((iso) =>
    new Intl.DateTimeFormat(localeTag(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)));
  const toneOf = (r: ScanAppointmentRow) => { const k = kindOf(r); return k === 'photogrammetry' ? K.photogrammetry : K.intraoral; };
  const dots = p.narrow || !!p.mini;              // küçük takvim: kapsül yok, yalnız noktalar
  const cellH = p.mini ? 40 : p.narrow ? 52 : p.compact ? 86 : 104;
  const side = !!p.mini && boxW >= 640;          // kart genişse seçili günün listesi sağda

  const gridView = (
    <View style={side ? { flex: 1, maxWidth: 400 } : undefined}>
      <View style={{ flexDirection: 'row' }}>
        {wd.map((w, i) => (
          <Text key={i} style={{ flex: 1, textAlign: dots ? 'center' : 'right', paddingRight: dots ? 0 : 8, paddingBottom: 6, fontSize: p.mini ? 11 : 12, color: U.ink[400] }} numberOfLines={1}>{w}</Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: U.hairlineSoft }}>
          {grid.slice(row * 7, row * 7 + 7).map((g, col) => {
            const list = byDay[g.date] ?? [];
            const isToday = g.date === today;
            const off = !p.catalog.settings.workdays.includes(col + 1);
            const selected = dots && sel === g.date;
            return (
              <Pressable
                key={g.date}
                onPress={() => (dots ? setSel(g.date) : p.onPickDay?.(g.date))}
                accessibilityRole="button"
                accessibilityLabel={`${Number(g.date.slice(8))} · ${list.length} ${autoT('randevu')}`}
                style={({ hovered }: any) => ({
                  flex: 1, height: cellH, paddingTop: p.mini ? 3 : 6, paddingHorizontal: dots ? 2 : 6, gap: p.mini ? 2 : 3,
                  borderLeftWidth: col && !p.mini ? 1 : 0, borderLeftColor: U.hairlineSoft, borderRadius: p.mini ? 10 : 0,
                  backgroundColor: selected ? U.rowHover : off ? U.surfaceSoft : hovered ? U.rowHover : 'transparent',
                  ...WEB_PTR,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: dots ? 'center' : 'flex-end' }}>
                  <View style={{ minWidth: p.mini ? 24 : 26, height: p.mini ? 24 : 26, borderRadius: 13, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? panel.primary : 'transparent' }}>
                    <Text style={{ fontSize: p.mini ? 12.5 : 14, fontWeight: isToday ? '700' : '500', fontVariant: ['tabular-nums'],
                      color: isToday ? onAccentInk(panel.primary) : g.inMonth ? U.ink[900] : U.ink[300] }}>
                      {Number(g.date.slice(8))}
                    </Text>
                  </View>
                </View>
                {dots ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
                    {list.slice(0, 3).map(({ r }) => <View key={r.id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: toneOf(r).fg, opacity: r.status === 'planlandi' ? 1 : 0.45 }} />)}
                  </View>
                ) : (
                  <>
                    {list.slice(0, 2).map(({ r, min }) => (
                      <OpenPress
                        key={r.id}
                        label={`${hhmm(min)} ${r.clinic?.name ?? ''}`}
                        onOpen={(o) => p.onOpen(r, o)}
                        style={(pressed) => ({
                          height: 20, borderRadius: 6, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: toneOf(r).bg, opacity: r.status === 'planlandi' ? (g.inMonth ? 1 : 0.6) : 0.5, ...pressScale(pressed),
                        })}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneOf(r).fg }} />
                        <Text style={{ flex: 1, fontSize: 11.5, color: U.ink[800] }} numberOfLines={1}>
                          <Text style={{ fontVariant: ['tabular-nums'], color: U.ink[500] }}>{hhmm(min)} </Text>{r.clinic?.name ?? '—'}
                        </Text>
                      </OpenPress>
                    ))}
                    {list.length > 2 ? <Text style={{ fontSize: 11, color: U.ink[400], paddingLeft: 6 }}>+{list.length - 2} {autoT('daha')}</Text> : null}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
  if (!dots) return <View style={{ marginTop: 12 }}>{gridView}</View>;
  // noktalı takvim: dokunulan günün listesi (kart genişse sağda, değilse altta; Özet'te en fazla 3)
  return (
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={{ marginTop: 12, flexDirection: side ? 'row' : 'column', gap: side ? 20 : 0 }}>
      {gridView}
      <View style={side ? { flex: 1, minWidth: 0, marginTop: -12 } : undefined}>
        <DayAgenda {...p} date={sel} range="day" limit={p.mini ? 3 : undefined} />
      </View>
    </View>
  );
}

function EmptyDay() {
  const U = useInkUI();
  return (
    <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: U.fieldBorder, padding: 16 }}>
      <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Bu gün tarama yok')}</Text>
    </View>
  );
}

export { kindOf, kindText };
