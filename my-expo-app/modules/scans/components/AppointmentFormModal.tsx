// Yeni / düzenle tarama randevusu (prototip: "Yeni tarama randevusu"). Klinik + hizmet + gün + tercih
// seçilince uygun saatler önerilir (scanModel.suggestSlots; yol: travel.ts — Google varsa trafikli, yoksa tahmin).
// Öneriye dokunmak saat/teknisyen/cihazı doldurur; elle saatte uyarılar kaydet düğmesinin yanında, engellemez.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { DatePicker } from '../../../core/ui/DatePicker';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { Search, Plus, Minus } from '../../../core/ui/icons';
import {
  addDays, hhmm, parseHHMM, labLocalParts, labLocalToIso, toBlocks, suggestSlots, apptWarnings, warningText,
  WINDOWS, SOURCES, SOURCE_LABEL, INTENTS, INTENT_LABEL,
  type ScanKind, type ScanSource, type ScanIntent, type Slot, type TravelFn, type ApptBlock,
} from '../scanModel';
import { fetchScanDay, fetchClinicDoctors, fetchClinicOrders, saveAppointment, savePatient, type ClinicOrderOption } from '../api';
import { ensureClinicGeo, ensureLabGeo, buildTravelFn, pairsFor } from '../travel';
import type { ScanAppointmentRow } from '../types';
import type { ScanCatalog } from '../hooks/useScanCatalog';
import type { OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { SheetModal, Btn, Toggle, FieldLabel, WarnLines, useKindTones, KIND_LABEL, WEB_PTR, pressScale, DISPLAY_FONT } from './ui';
import { TimeField } from './WheelTimePicker';

type Win = keyof typeof WINDOWS;

export function AppointmentFormModal({ visible, origin, onClose, onSaved, catalog, initial, defaultDate }: {
  visible: boolean; origin: OriginRect | null; onClose: () => void; onSaved: (id: string) => void;
  catalog: ScanCatalog; initial?: ScanAppointmentRow | null; defaultDate: string;
}) {
  const U = useInkUI();
  const K = useKindTones();
  const panel = usePanelTheme();
  const tz = catalog.tz;
  const today = labLocalParts(new Date().toISOString(), tz).date;

  const [clinicId, setClinicId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [svcIds, setSvcIds] = useState<string[]>([]);
  const [date, setDate] = useState(defaultDate);
  const [win, setWin] = useState<Win | null>(null);
  const [minutes, setMinutes] = useState(catalog.settings.defaultMinutes);
  const [timeText, setTimeText] = useState('');
  const [techId, setTechId] = useState<string | null>(null);
  const [equip, setEquip] = useState<Record<string, string | null>>({});
  const [more, setMore] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [patient, setPatient] = useState('');
  const [source, setSource] = useState<ScanSource>('telefon');
  const [note, setNote] = useState('');
  const [intent, setIntent] = useState<ScanIntent>('belirsiz');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ClinicOrderOption[]>([]);
  const [dayRows, setDayRows] = useState<ScanAppointmentRow[]>([]);
  const [travel, setTravel] = useState<TravelFn | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Randevu kaydedildi ama hasta satırı kaydedilemediyse: yeniden "Kaydet" İKİNCİ randevu açmasın, bunu güncellesin
  const [createdId, setCreatedId] = useState<string | null>(null);

  // açılışta sıfırla / düzenlemede doldur
  useEffect(() => {
    if (!visible) return;
    setErr(null); setBusy(false); setPicked(null); setQ(''); setMore(false); setPatient(''); setWheelOpen(false); setCreatedId(null);
    if (initial) {
      const lp = labLocalParts(initial.starts_at, tz);
      setClinicId(initial.clinic_id); setSvcIds(initial.services.map((s) => s.service_id)); setDate(lp.date);
      setMinutes(initial.duration_min); setTimeText(hhmm(lp.minutes)); setTechId(initial.technician_id);
      setEquip(Object.fromEntries(initial.services.map((s) => [s.service_id, s.equipment_id])));
      setDoctorId(initial.doctor_id); setSource(initial.source); setNote(initial.note ?? ''); setWin(null);
      setIntent(initial.intent ?? 'belirsiz'); setOrderId(initial.intended_order_id ?? null);
    } else {
      setClinicId(null); setSvcIds(catalog.services.length === 1 ? [catalog.services[0].id] : []); setDate(defaultDate);
      setMinutes(catalog.settings.defaultMinutes); setTimeText(''); setTechId(catalog.techs.length === 1 ? catalog.techs[0].id : null);
      setEquip({}); setDoctorId(null); setSource('telefon'); setNote(''); setWin(null);
      setIntent('belirsiz'); setOrderId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const clinic = catalog.clinics.find((c) => c.id === clinicId) ?? null;
  useEffect(() => {
    if (!clinicId) { setDoctors([]); return; }
    let alive = true;
    void fetchClinicDoctors(clinicId).then((d) => { if (alive) setDoctors(d); });
    return () => { alive = false; };
  }, [clinicId]);

  // "Mevcut siparişe bağlanacak": kliniğin siparişleri (hasta adı eşleşen önce)
  useEffect(() => {
    if (!clinicId || intent !== 'mevcut_siparis' || !catalog.labId) { setOrders([]); return; }
    let alive = true;
    void fetchClinicOrders(catalog.labId, clinicId).then((o) => { if (alive) setOrders(o); });
    return () => { alive = false; };
  }, [clinicId, intent, catalog.labId]);
  const orderList = useMemo(() => {
    const n = patient.trim().toLocaleLowerCase('tr');
    const hit = (o: ClinicOrderOption) => !!n && (o.patient_name ?? '').toLocaleLowerCase('tr').includes(n);
    return [...orders].sort((a, b) => Number(hit(b)) - Number(hit(a))).slice(0, 6);
  }, [orders, patient]);

  // seçili günün randevuları
  useEffect(() => {
    if (!visible || !catalog.labId) return;
    let alive = true;
    void fetchScanDay(catalog.labId, labLocalToIso(date, 0, tz), labLocalToIso(addDays(date, 1), 0, tz))
      .then((r) => { if (alive) setDayRows(r); });
    return () => { alive = false; };
  }, [visible, date, catalog.labId, tz]);

  // yol fonksiyonu (Google varsa trafikli, yoksa tahmin)
  useEffect(() => {
    if (!visible || !clinic || !catalog.labId) { setTravel(null); return; }
    let alive = true;
    (async () => {
      const [labPt, cPt] = await Promise.all([ensureLabGeo(catalog.labId!), ensureClinicGeo(clinic)]);
      const points: Record<string, { lat: number; lng: number } | null> = { LAB: labPt, [clinic.id]: cPt };
      for (const r of dayRows) {
        const c = catalog.clinics.find((x) => x.id === r.clinic_id);
        if (c && !(c.id in points)) points[c.id] = c.geo ? { lat: c.geo.lat, lng: c.geo.lng } : null;
      }
      const fn = await buildTravelFn(points, pairsFor(clinic.id, dayRows.map((r) => r.clinic_id)), date, tz);
      if (alive) setTravel(() => fn);
    })();
    return () => { alive = false; };
  }, [visible, clinic, dayRows, date, tz, catalog.labId, catalog.clinics]);

  const kinds = useMemo(() => Array.from(new Set(svcIds
    .map((id) => catalog.services.find((s) => s.id === id)?.scan_kind)
    .filter((k): k is ScanKind => !!k))), [svcIds, catalog.services]);
  const blocks: ApptBlock[] = useMemo(
    () => toBlocks(dayRows.filter((r) => r.id !== initial?.id) as any, date, tz), [dayRows, date, tz, initial?.id]);
  const weekday = labLocalParts(`${date}T12:00:00Z`, tz).weekday;

  const slots: Slot[] = useMemo(() => {
    if (!clinic || !travel || !kinds.length || !catalog.techs.length) return [];
    return suggestSlots({
      clinicId: clinic.id, minutes, weekday, window: win ? [WINDOWS[win][0], WINDOWS[win][1]] : null,
      requiredKinds: kinds, technicians: catalog.techs, devices: catalog.devices, dayAppts: blocks, travel,
      settings: catalog.settings,
    });
  }, [clinic, travel, kinds, minutes, weekday, win, catalog, blocks]);

  const startMin = parseHHMM(timeText);
  const equipmentIds = svcIds.map((id) => equip[id]).filter((e): e is string => !!e);
  const warnings = useMemo(() => {
    if (!clinic || startMin == null || !techId || !travel) return [];
    const c: ApptBlock = { id: initial?.id ?? '__yeni__', clinicId: clinic.id, technicianId: techId, equipmentIds, startMin, minutes, status: 'planlandi' };
    return apptWarnings(c, blocks, travel, catalog.settings, weekday).map((w) => warningText(w, autoT));
  }, [clinic, startMin, techId, travel, equipmentIds.join(','), minutes, blocks, catalog.settings, weekday, initial?.id]);

  const pickSlot = (i: number) => {
    const s = slots[i];
    setPicked(i); setTimeText(hhmm(s.startMin)); setTechId(s.technicianId); setWheelOpen(false);
    const next: Record<string, string | null> = {};
    for (const id of svcIds) {
      const kind = catalog.services.find((x) => x.id === id)?.scan_kind;
      next[id] = s.equipmentIds.find((e) => catalog.devices.find((d) => d.id === e)?.kind === kind) ?? null;
    }
    setEquip(next);
  };

  const toggleSvc = (id: string) => setSvcIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const ready = !!clinic && svcIds.length > 0 && startMin != null && !!techId;
  const hint = !clinic ? autoT('Klinik seçin') : !svcIds.length ? autoT('Tarama hizmeti seçin')
    : startMin == null ? autoT('Saat seçin') : !techId ? autoT('Teknisyen seçin') : null;

  const save = async () => {
    if (!ready || busy) { if (hint) setErr(hint); return; }
    setBusy(true); setErr(null);
    const r = await saveAppointment({
      id: initial?.id ?? createdId ?? null, clinicId: clinic!.id, doctorId, startsAt: labLocalToIso(date, startMin!, tz), minutes,
      technicianId: techId!, source, note: note.trim() || null,
      services: svcIds.map((id) => ({ service_id: id, equipment_id: equip[id] ?? null })),
      intent, orderId: intent === 'mevcut_siparis' ? orderId : null,
    });
    if (!r.ok || !r.id) { setBusy(false); setErr(r.error ?? autoT('İşlem tamamlanamadı')); return; }
    if (!initial) setCreatedId(r.id);
    if (!initial && patient.trim().length >= 2) {
      const pr = await savePatient({ id: null, appointmentId: r.id, patientName: patient.trim(), serviceIds: svcIds, note: null,
        workOrderId: intent === 'mevcut_siparis' ? orderId : null });
      if (!pr.ok) { setBusy(false); setErr(pr.error ?? autoT('İşlem tamamlanamadı')); onSaved(r.id); return; }   // randevu oluştu → liste tazelensin
    }
    setBusy(false);
    onSaved(r.id);
    onClose();
  };

  // Klinik yalnız arama çubuğu: yazmadan liste yok; yazdıkça eşleşenler önerilir
  const matches = q.trim()
    ? catalog.clinics.filter((c) => c.name.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))).slice(0, 6)
    : [];

  return (
    <SheetModal
      visible={visible} origin={origin} onClose={onClose}
      title={initial ? autoT('Randevuyu düzenle') : autoT('Yeni tarama randevusu')}
      subtitle={initial ? undefined : autoT('Telefonla gelen randevuyu kaydedin; uygun saati sistem önerir.')}
      footer={(
        <>
          <WarnLines lines={warnings} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 12, color: err ? U.chipTones.danger.fg : U.ink[400] }} accessibilityLiveRegion="polite">
              {err ?? (warnings.length ? autoT('Uyarı kaydı engellemez.') : '')}
            </Text>
            <Btn kind="ghost" label={autoT('Vazgeç')} onPress={onClose} />
            <Btn kind="pri" label={autoT('Kaydet')} onPress={save} busy={busy} disabled={!ready}
              tip={autoT('Randevuyu kaydeder ve teknisyene bildirir')} />
          </View>
        </>
      )}
    >
      {/* Klinik */}
      <View>
        <FieldLabel>{autoT('Klinik')}</FieldLabel>
        {clinic ? (
          <Pressable onPress={() => setClinicId(null)} accessibilityRole="button" accessibilityLabel={autoT('Kliniği değiştir')}
            style={({ pressed }: any) => ({ ...U.inputStyle, flexDirection: 'row', alignItems: 'center', gap: 10, ...pressScale(pressed), ...WEB_PTR })}>
            <Text style={{ flex: 1, fontSize: 14, color: U.ink[900] }} numberOfLines={1}>{clinic.name}</Text>
            <Text style={{ fontSize: 12, color: U.ink[400] }}>{autoT('Değiştir')}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 6 }}>
            <View style={{ ...U.inputStyle, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
              <Search size={16} color={U.ink[400]} />
              <TextInput value={q} onChangeText={setQ} placeholder={autoT('Klinik ara')} placeholderTextColor={U.ink[400]}
                style={{ flex: 1, fontSize: 16, color: U.ink[900], height: 42, ...({ outlineStyle: 'none' } as any) }} />
            </View>
            {matches.map((c) => (
              <Pressable key={c.id} onPress={() => { setClinicId(c.id); setPicked(null); setDoctorId(null); setOrderId(null); /* hekim ve sipariş kliniğe bağlı */ }} accessibilityRole="button" accessibilityLabel={c.name}
                style={({ pressed, hovered }: any) => ({ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: hovered ? U.rowHover : 'transparent', ...pressScale(pressed), ...WEB_PTR })}>
                <Text style={{ fontSize: 13.5, color: U.ink[800] }} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Hizmet */}
      <View>
        <FieldLabel>{autoT('Tarama')}</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {catalog.services.map((s) => (
            <Toggle key={s.id} label={s.name} on={svcIds.includes(s.id)} onPress={() => { toggleSvc(s.id); setPicked(null); }} dot={K[s.scan_kind].fg} />
          ))}
          {!catalog.services.length ? <Text style={{ fontSize: 12.5, color: U.chipTones.warning.fg }}>{autoT('Fiyat listesinde tarama hizmeti işaretli değil')}</Text> : null}
        </View>
      </View>

      {/* Beklenen sonuç — kesin karar değil; karar penceresinde hazır gelir */}
      <View>
        <FieldLabel>{autoT('Bu tarama sonunda ne olacak?')}</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {INTENTS.map((k) => <Toggle key={k} label={autoT(INTENT_LABEL[k])} on={intent === k} onPress={() => setIntent(k)} />)}
        </View>
        {intent === 'mevcut_siparis' && clinic ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {orderList.length ? orderList.map((o) => {
              const on = orderId === o.id;
              return (
                <Pressable key={o.id} onPress={() => setOrderId(on ? null : o.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`#${o.order_number ?? ''} ${o.patient_name ?? ''}`}
                  style={({ pressed }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
                    backgroundColor: on ? U.surface : U.surfaceSoft, borderWidth: 1, borderColor: on ? U.ink[900] : 'transparent',
                    ...pressScale(pressed), ...WEB_PTR,
                  })}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900], fontVariant: ['tabular-nums'] }}>#{o.order_number ?? '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: U.ink[700] }} numberOfLines={1}>{[o.patient_name, o.work_type].filter(Boolean).join(' · ')}</Text>
                </Pressable>
              );
            }) : <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Bu kliniğin açık siparişi yok')}</Text>}
            <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{autoT('Sipariş seçmek isteğe bağlı; karar verilirken de seçilebilir.')}</Text>
          </View>
        ) : null}
      </View>

      {/* Gün (takvimden) + tercih */}
      <View>
        <FieldLabel>{autoT('Gün')}</FieldLabel>
        <DatePicker
          value={date}
          onChange={(iso) => { setDate(iso); setPicked(null); }}
          accent={panel.primary}
          minDate={initial ? undefined : today}
          placeholder={autoT('Tarih seç')}
        />
      </View>
      <View>
        <FieldLabel>{autoT('Hekim ne zaman istiyor?')}</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['sabah', 'ogle', 'aksam'] as Win[]).map((w) => (
            <Toggle key={w} label={w === 'sabah' ? autoT('Sabah') : w === 'ogle' ? autoT('Öğle') : autoT('Akşam')} on={win === w}
              onPress={() => { setWin(win === w ? null : w); setPicked(null); }} />
          ))}
        </View>
      </View>

      {/* Uygun saatler */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700], flex: 1 }}>{autoT('Uygun saatler')}</Text>
          {clinic && !travel ? <ActivityIndicator size="small" /> : null}
        </View>
        {clinic && travel && kinds.length ? (
          slots.length ? (
            <View style={{ gap: 8 }}>
              {slots.map((s, i) => {
                const tech = catalog.techs.find((t) => t.id === s.technicianId)?.name ?? '';
                const dev = s.equipmentIds.map((e) => catalog.devices.find((d) => d.id === e)?.name).filter(Boolean).join(', ');
                const legA = s.prev ? `${s.prev.estimated ? '~' : ''}${s.prev.minutes} ${autoT('dk yol')}` : '';
                return (
                  <Pressable key={`${s.startMin}-${s.technicianId}`} onPress={() => pickSlot(i)} accessibilityRole="button"
                    accessibilityState={{ selected: picked === i }} accessibilityLabel={`${hhmm(s.startMin)} ${tech}`}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16,
                      borderWidth: picked === i ? 2 : 1, borderColor: picked === i ? U.ink[900] : U.hairline,
                      backgroundColor: hovered ? U.rowHover : U.surface, ...pressScale(pressed), ...WEB_PTR,
                    })}>
                    <Text style={{ width: 64, fontSize: 20, fontWeight: '400', letterSpacing: -0.4, color: U.ink[900], fontFamily: DISPLAY_FONT, fontVariant: ['tabular-nums'] }}>{hhmm(s.startMin)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{tech}</Text>
                        {i === 0 ? (
                          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: U.chipTones.success.bg }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: U.chipTones.success.fg }}>{autoT('EN UYGUN')}</Text>
                          </View>
                        ) : null}
                      </View>
                      {dev ? <Text style={{ fontSize: 11.5, color: U.ink[500] }} numberOfLines={1}>{dev}</Text> : null}
                    </View>
                    <Text style={{ fontSize: 11.5, color: U.ink[500], textAlign: 'right' }}>{legA}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Bu gün için uygun saat bulunamadı')}</Text>
        ) : (
          <Text style={{ fontSize: 12.5, color: U.ink[400] }}>{autoT('Klinik ve tarama seçince öneriler gelir')}</Text>
        )}
      </View>

      {/* Saat + süre */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 200 }}>
          {/* Saat yazılmaz, tekerlekten seçilir (kullanıcı isteği) */}
          <TimeField
            label={autoT('Saat (öneri dışında seçebilirsiniz)')}
            value={startMin}
            onChange={(v) => { setTimeText(hhmm(v)); setPicked(null); }}
            fallback={slots[0]?.startMin ?? catalog.settings.hoursStart}
            open={wheelOpen}
            onToggle={() => setWheelOpen((o) => !o)}
          />
        </View>
        <View>
          <FieldLabel>{autoT('Süre')}</FieldLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder, backgroundColor: U.surfaceSoft }}>
            <Pressable onPress={() => setMinutes((m) => Math.max(15, m - 15))} accessibilityLabel={autoT('Kısalt')} style={({ pressed }: any) => ({ width: 40, height: 42, alignItems: 'center', justifyContent: 'center', ...pressScale(pressed), ...WEB_PTR })}>
              <Minus size={16} color={U.ink[700]} />
            </Pressable>
            <Text style={{ minWidth: 64, textAlign: 'center', fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{minutes} {autoT('dk')}</Text>
            <Pressable onPress={() => setMinutes((m) => Math.min(600, m + 15))} accessibilityLabel={autoT('Uzat')} style={({ pressed }: any) => ({ width: 40, height: 42, alignItems: 'center', justifyContent: 'center', ...pressScale(pressed), ...WEB_PTR })}>
              <Plus size={16} color={U.ink[700]} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Teknisyen + cihaz */}
      <View>
        <FieldLabel>{autoT('Teknisyen')}</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {catalog.techs.map((t) => <Toggle key={t.id} label={t.name} on={techId === t.id} onPress={() => setTechId(t.id)} />)}
        </View>
      </View>
      {svcIds.map((id) => {
        const svc = catalog.services.find((s) => s.id === id);
        const devs = catalog.devices.filter((d) => d.kind === svc?.scan_kind);
        if (!svc || !devs.length) return null;
        return (
          <View key={id}>
            <FieldLabel>{`${autoT('Cihaz')} · ${autoT(KIND_LABEL[svc.scan_kind])}`}</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {devs.map((d) => <Toggle key={d.id} label={d.name} on={equip[id] === d.id} onPress={() => setEquip((e) => ({ ...e, [id]: e[id] === d.id ? null : d.id }))} />)}
            </View>
          </View>
        );
      })}

      {/* Ayrıntı */}
      {more ? (
        <View style={{ gap: 14 }}>
          {doctors.length ? (
            <View>
              <FieldLabel>{autoT('Hekim (isteğe bağlı)')}</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {doctors.map((d) => <Toggle key={d.id} label={d.name} on={doctorId === d.id} onPress={() => setDoctorId(doctorId === d.id ? null : d.id)} />)}
              </View>
            </View>
          ) : null}
          {!initial ? (
            <View>
              <FieldLabel>{autoT('Hasta (biliniyorsa)')}</FieldLabel>
              <TextInput value={patient} onChangeText={setPatient} placeholder={autoT('Ad soyad')} placeholderTextColor={U.ink[400]} style={{ ...U.inputStyle, fontSize: 16 }} />
            </View>
          ) : null}
          <View>
            <FieldLabel>{autoT('Randevu nereden geldi?')}</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SOURCES.map((s) => <Toggle key={s} label={autoT(SOURCE_LABEL[s])} on={source === s} onPress={() => setSource(s)} />)}
            </View>
          </View>
          <View>
            <FieldLabel>{autoT('Not')}</FieldLabel>
            <TextInput value={note} onChangeText={setNote} multiline placeholder={autoT('Örn. hekim akşam saatlerini istedi')} placeholderTextColor={U.ink[400]}
              style={{ ...U.inputStyle, minHeight: 72, height: undefined, paddingTop: 10, fontSize: 16, textAlignVertical: 'top' }} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel={autoT('Hekim, hasta ve not ekle')}
          style={({ pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', ...pressScale(pressed), ...WEB_PTR })}>
          <Plus size={14} color={U.ink[500]} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[500] }}>{autoT('Hekim, hasta ve not ekle')}</Text>
        </Pressable>
      )}
    </SheetModal>
  );
}
