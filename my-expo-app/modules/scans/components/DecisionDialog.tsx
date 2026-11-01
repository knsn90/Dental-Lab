// Karar penceresi (prototip: "Karar bekleyen taramalar"). Her hasta için: siparişe bağla (hasta adı eşleşen
// siparişler önce), yeni sipariş aç (sihirbaz klinik/hekim/hasta hazır açılır; oluşunca karar kaydedilir)
// ya da yalnız tarama. Ücret önizlemesi resolve_item_price ile (sunucunun kullandığı kural); faturalama
// düzeni kliniğin billing_mode'una göre yazılır. Verilmiş karar geri alınabilir (kesilmiş fatura hariç).
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { Undo2 } from '../../../core/ui/icons';
import {
  fetchScanAppointment, fetchClinicOrders, previewPrice, fetchClinicBillingMode, decide, undoDecision,
  type ClinicOrderOption,
} from '../api';
import type { ScanAppointmentRow, ScanPatientRow } from '../types';
import { INTENT_LABEL } from '../scanModel';
import type { ScanCatalog } from '../hooks/useScanCatalog';
import type { OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { SheetModal, Btn, Chip, Eyebrow, KIND_LABEL, WEB_PTR, pressScale } from './ui';

// Sihirbaz kendi rotasında lazyRoute ile yüklenir → burada da gecikmeli (statik import #130 riski)
const NewOrderLazy = React.lazy(() =>
  import('../../orders/screens/NewOrderScreen').then((m) => ({ default: m.NewOrderScreen })),
);

type Choice = 'link' | 'new' | 'only';
const DECISION_LABEL: Record<string, string> = { siparise_baglandi: 'Siparişe bağlandı', yeni_siparis: 'Yeni sipariş', yalniz_tarama: 'Yalnız tarama' };
const norm = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

export function DecisionDialog({ visible, origin, onClose, appointmentId, catalog, onChanged }: {
  visible: boolean; origin: OriginRect | null; onClose: () => void; appointmentId: string | null;
  catalog: ScanCatalog; onChanged: () => void;
}) {
  const U = useInkUI();
  // panel-agnostik: admin'den açılınca "Siparişi gör" /(admin)/order/... gitsin
  const orderPanel = String((useSegments() as string[])?.[0] ?? '') === '(admin)' ? 'admin' as const : 'lab' as const;
  const [row, setRow] = useState<ScanAppointmentRow | null>(null);
  const [orders, setOrders] = useState<ClinicOrderOption[]>([]);
  const [mode, setMode] = useState<'per_order' | 'monthly_bulk'>('monthly_bulk');
  const [prices, setPrices] = useState<Record<string, { price: number; currency: string } | null>>({});
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [pick, setPick] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [newFor, setNewFor] = useState<ScanPatientRow | null>(null);

  const load = useCallback(async () => {
    if (!appointmentId || !catalog.labId) return;
    const r = await fetchScanAppointment(appointmentId);
    setRow(r);
    if (!r) return;
    const [os, bm] = await Promise.all([fetchClinicOrders(catalog.labId, r.clinic_id), fetchClinicBillingMode(r.clinic_id)]);
    setOrders(os); setMode(bm);
    const svcIds = Array.from(new Set(r.patients.flatMap((p) => p.charges.map((c) => c.service_id))));
    const pr: Record<string, { price: number; currency: string } | null> = {};
    await Promise.all(svcIds.map(async (id) => { pr[id] = await previewPrice(catalog.labId!, id, r.clinic_id); }));
    setPrices(pr);
  }, [appointmentId, catalog.labId]);

  useEffect(() => {
    if (!visible) return;
    setRow(null); setErr(null); setDone(null); setChoice({}); setPick({});
    void load();
  }, [visible, load]);

  // varsayılan seçim: hastanın ön bağlantısı → randevudaki beklenen sonuç → hasta adı eşleşen sipariş
  useEffect(() => {
    if (!row) return;
    const c: Record<string, Choice> = {}; const pk: Record<string, string | null> = {};
    for (const p of row.patients) {
      if (p.decision) continue;
      if (row.intent === 'yalniz_tarama' && !p.work_order_id) { c[p.id] = 'only'; continue; }
      const nameHit = orders.find((o) => norm(o.patient_name) === norm(p.patient_name))?.id ?? null;
      const match = p.work_order_id ?? (row.intent === 'mevcut_siparis' ? (row.intended_order_id ?? nameHit) : nameHit);
      if (match) { c[p.id] = 'link'; pk[p.id] = match; }
      else if (row.intent === 'mevcut_siparis') c[p.id] = 'link';
    }
    setChoice((x) => ({ ...c, ...x })); setPick((x) => ({ ...pk, ...x }));
  }, [row, orders]);

  // "siparişe dönerse ücretsiz" hizmetler (fiyat listesi ayarı; önizleme)
  const freeIds = useMemo(() => new Set(catalog.services.filter((s) => s.scan_free_if_order).map((s) => s.id)), [catalog.services]);
  const pending = row?.patients.filter((p) => !p.decision) ?? [];
  const decided = row?.patients.filter((p) => !!p.decision) ?? [];
  const ready = pending.some((p) => (choice[p.id] === 'link' && !!pick[p.id]) || choice[p.id] === 'only');

  const save = async () => {
    if (!row || busy) return;
    setBusy(true); setErr(null);
    const invoices: string[] = []; let pooled = 0;
    for (const p of pending) {
      if (choice[p.id] === 'link' && pick[p.id]) {
        const r = await decide([p.id], 'siparise_baglandi', pick[p.id]!);
        if (!r.ok) { setBusy(false); setErr(r.error ?? null); await load(); onChanged(); return; }
        invoices.push(...(r.invoices ?? [])); pooled += r.pooled ?? 0;
      }
    }
    const only = pending.filter((p) => choice[p.id] === 'only').map((p) => p.id);
    if (only.length) {
      const r = await decide(only, 'yalniz_tarama', null);
      if (!r.ok) { setBusy(false); setErr(r.error ?? null); await load(); onChanged(); return; }
      invoices.push(...(r.invoices ?? [])); pooled += r.pooled ?? 0;
    }
    setBusy(false);
    const parts = [
      invoices.length ? `${invoices.length} ${autoT('taslak fatura açıldı')}` : null,
      pooled ? `${pooled} ${autoT('kalem aylık faturayı bekliyor')}` : null,
    ].filter(Boolean);
    setDone(parts.length ? parts.join(' · ') : autoT('Kararlar kaydedildi'));
    await load(); onChanged();
  };

  const undo = async (p: ScanPatientRow) => {
    setBusy(true); setErr(null);
    const r = await undoDecision(p.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? null); return; }
    await load(); onChanged();
  };

  return (
    <>
      <SheetModal
        visible={visible && !newFor} origin={origin} onClose={onClose} maxWidth={660}
        title={autoT('Karar bekleyen taramalar')}
        subtitle={autoT('Her hasta için ayrı: siparişe bağla, yeni sipariş aç ya da yalnız tarama.')}
        footer={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 12, color: err ? U.chipTones.danger.fg : done ? U.chipTones.success.fg : U.ink[400] }} accessibilityLiveRegion="polite">
              {err ?? done ?? autoT('Karar sonradan geri alınabilir; kesilmiş faturadaki tarama hariç.')}
            </Text>
            <Btn kind="ghost" label={autoT('Kapat')} onPress={onClose} />
            {pending.length ? (
              <Btn kind="pri" label={autoT('Kararları kaydet')} onPress={save} busy={busy} disabled={!ready}
                tip={autoT('Seçilen kararları kaydeder; ücretli taramalar faturaya yönlendirilir')} />
            ) : null}
          </View>
        )}
      >
        {!row ? <ActivityIndicator style={{ marginVertical: 24 }} /> : (
          <>
            <Eyebrow>{row.clinic?.name ?? ''}</Eyebrow>
            {row.intent !== 'belirsiz' ? (
              <Text style={{ fontSize: 12.5, color: U.ink[500] }}>
                {`${autoT('Randevu verilirken')}: ${autoT(INTENT_LABEL[row.intent])}${row.intended_order?.order_number ? ` · #${row.intended_order.order_number}` : ''}`}
              </Text>
            ) : null}
            {!row.patients.length ? <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Bu randevuda hasta yok')}</Text> : null}
            {pending.map((p) => (
              <PatientDecision
                key={p.id} p={p} row={row} orders={orders} mode={mode} prices={prices} freeIds={freeIds}
                choice={choice[p.id] ?? null} picked={pick[p.id] ?? null}
                onChoice={(c) => { if (c === 'new') { setNewFor(p); return; } setChoice((x) => ({ ...x, [p.id]: c })); }}
                onPick={(id) => setPick((x) => ({ ...x, [p.id]: id }))}
              />
            ))}
            {decided.length ? (
              <View style={{ gap: 8 }}>
                <Eyebrow>{autoT('Karar verilenler')}</Eyebrow>
                {decided.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: U.hairline, padding: 10 }}>
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{p.patient_name ?? '—'}</Text>
                    <Chip tone="success" label={autoT(DECISION_LABEL[p.decision!])} />
                    <Btn kind="sec" label={autoT('Geri al')} onPress={() => undo(p)} busy={busy}
                      icon={(c) => <Undo2 size={14} color={c} />} tip={autoT('Kararı geri alır; taslaktaki fatura satırı silinir')} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </SheetModal>

      {/* Yeni sipariş: sihirbaz klinik, hekim ve hasta hazır; sipariş oluşunca karar kaydedilir */}
      <Modal visible={!!newFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNewFor(null)}>
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: U.pageBg }}>
          {newFor && row ? (
            <Suspense fallback={<ActivityIndicator style={{ marginTop: 40 }} />}>
              <NewOrderLazy
                panel={orderPanel}
                scanPrefill={{ clinic_id: row.clinic_id, doctor_id: row.doctor_id, patient_name: newFor.patient_name ?? '' }}
                onClose={() => setNewFor(null)}
                onCreated={async (orderId: string) => {
                  const r = await decide([newFor.id], 'yeni_siparis', orderId);
                  if (!r.ok) setErr(r.error ?? null);
                  else setDone((r.invoices?.length ? `${r.invoices.length} ${autoT('taslak fatura açıldı')}` : autoT('Kararlar kaydedildi')));
                  await load(); onChanged();
                }}
              />
            </Suspense>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function PatientDecision({ p, row, orders, mode, prices, choice, picked, onChoice, onPick, freeIds }: {
  p: ScanPatientRow; row: ScanAppointmentRow; orders: ClinicOrderOption[]; mode: 'per_order' | 'monthly_bulk'; freeIds: Set<string>;
  prices: Record<string, { price: number; currency: string } | null>; choice: Choice | null; picked: string | null;
  onChoice: (c: Choice) => void; onPick: (id: string) => void;
}) {
  const U = useInkUI();
  const sorted = useMemo(() => {
    const n = norm(p.patient_name);
    return [...orders].sort((a, b) => Number(norm(b.patient_name) === n) - Number(norm(a.patient_name) === n)).slice(0, 8);
  }, [orders, p.patient_name]);
  const opts: { k: Choice; t: string; s: string }[] = [
    { k: 'link', t: autoT('Siparişe bağla'), s: autoT('Kliniğin açık siparişleri') },
    { k: 'new', t: autoT('Yeni sipariş aç'), s: autoT('Klinik ve hasta hazır gelir') },
    { k: 'only', t: autoT('Yalnız tarama'), s: autoT('Ayrı kalem faturalanır') },
  ];
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: U.hairline, padding: 12, gap: 10 }}>
      <View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{p.patient_name || autoT('Adı yazılmadı')}</Text>
        <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={1}>
          {p.charges.map((c) => { const s = row.services.find((x) => x.service_id === c.service_id); return s?.scan_kind ? autoT(KIND_LABEL[s.scan_kind]) : s?.name; }).filter(Boolean).join(', ')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o) => {
          const on = choice === o.k;
          return (
            <Pressable key={o.k} onPress={() => onChoice(o.k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.t}
              style={({ pressed }: any) => ({
                flexGrow: 1, flexBasis: 150, borderRadius: 14, padding: 10, gap: 3,
                backgroundColor: on ? U.ink[900] : U.plainBtn.bg, borderWidth: 1, borderColor: on ? 'transparent' : U.fieldBorder,
                ...pressScale(pressed), ...WEB_PTR,
              })}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? U.onDarkPill : U.ink[900] }}>{o.t}</Text>
              <Text style={{ fontSize: 11.5, color: on ? U.onDarkPillMuted : U.ink[500] }}>{o.s}</Text>
            </Pressable>
          );
        })}
      </View>
      {choice === 'link' ? (
        sorted.length ? (
          <View style={{ gap: 6 }}>
            {sorted.map((o) => {
              const on = picked === o.id;
              const match = norm(o.patient_name) === norm(p.patient_name) && !!norm(p.patient_name);
              return (
                <Pressable key={o.id} onPress={() => onPick(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`#${o.order_number ?? ''} ${o.patient_name ?? ''}`}
                  style={({ pressed }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
                    backgroundColor: on ? U.surface : U.surfaceSoft, borderWidth: 1, borderColor: on ? U.ink[900] : 'transparent',
                    ...pressScale(pressed), ...WEB_PTR,
                  })}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900], fontVariant: ['tabular-nums'] }}>#{o.order_number ?? '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: U.ink[700] }} numberOfLines={1}>{[o.patient_name, o.work_type].filter(Boolean).join(' · ')}</Text>
                  {match ? <Text style={{ fontSize: 11.5, color: U.chipTones.success.fg }}>{autoT('hasta adı eşleşti')}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Bu kliniğin açık siparişi yok')}</Text>
      ) : null}
      {choice ? p.charges.map((c) => {
        const svc = row.services.find((x) => x.service_id === c.service_id);
        const pr = prices[c.service_id];
        const free = choice !== 'only' && freeIds.has(c.service_id);
        const where = choice === 'only'
          ? (mode === 'per_order' ? autoT('kliniğe taslak fatura açılır') : autoT('aylık faturaya eklenir'))
          : autoT('siparişin faturasına eklenir');
        return (
          <View key={c.service_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
            backgroundColor: free ? U.chipTones.success.bg : U.surfaceSoft }}>
            <Text style={{ flex: 1, fontSize: 12.5, color: free ? U.chipTones.success.fg : U.ink[700] }} numberOfLines={2}>
              {svc?.scan_kind ? autoT(KIND_LABEL[svc.scan_kind]) : svc?.name}{' · '}{free ? autoT('siparişe dönerse ücretsiz') : where}
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: free ? U.chipTones.success.fg : U.ink[900], fontVariant: ['tabular-nums'] }}>
              {free ? formatMoney(0, ((pr?.currency ?? 'TRY') as Currency)) : pr ? formatMoney(Number(pr.price) || 0, pr.currency as Currency) : '—'}
            </Text>
          </View>
        );
      }) : null}
    </View>
  );
}

