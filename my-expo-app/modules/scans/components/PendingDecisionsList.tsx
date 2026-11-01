// Karar bekleyenler (spec 4.2, 4.7, 4.8): önce saati geçmiş ama işaretlenmemiş randevular, sonra "yapıldı"
// denmiş ve hastası karar bekleyenler. Altta aylık faturalanan kliniklerin "yalnız tarama" havuzu.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { labLocalParts, hhmm } from '../scanModel';
import { fetchPoolSummary, createPoolInvoice } from '../api';
import type { ScanAppointmentRow } from '../types';
import type { ScanCatalog } from '../hooks/useScanCatalog';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { Btn, Chip, Eyebrow, WEB_PTR, pressScale } from './ui';

export function PendingDecisionsList({ rows, catalog, canManage, onOpen, onDecide, onChanged }: {
  rows: ScanAppointmentRow[]; catalog: ScanCatalog; canManage: boolean;
  onOpen: (r: ScanAppointmentRow, o: OriginRect | null) => void;
  onDecide: (r: ScanAppointmentRow, o: OriginRect | null) => void;
  onChanged: () => void;
}) {
  const U = useInkUI();
  const [pool, setPool] = useState<Awaited<ReturnType<typeof fetchPoolSummary>>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const loadPool = async () => { if (catalog.labId && canManage) setPool(await fetchPoolSummary(catalog.labId)); };
  useEffect(() => { void loadPool(); }, [catalog.labId, canManage, rows]);

  const unmarked = rows.filter((r) => r.status === 'planlandi');
  const done = rows.filter((r) => r.status === 'yapildi');

  const bill = async (clinicId: string) => {
    setBusy(clinicId); setMsg(null);
    const r = await createPoolInvoice(clinicId);
    setBusy(null);
    setMsg(r.ok ? `${r.invoices?.length ?? 0} ${autoT('taslak fatura açıldı')}` : (r.error ?? null));
    await loadPool(); onChanged();
  };

  if (!unmarked.length && !done.length && !pool.length) {
    return (
      <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 34 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>{autoT('Karar bekleyen tarama yok')}</Text>
        <Text style={{ fontSize: 13, color: U.ink[500], marginTop: 4 }}>{autoT('Yapılan her tarama siparişe bağlandı ya da faturalandı.')}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {unmarked.length ? (
        <View style={{ ...U.cardSolid, gap: 10 }}>
          <Eyebrow>{autoT('İşaretlenmemiş randevular')}</Eyebrow>
          <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Saati geçti ama "Tarama yapıldı" denmedi. Açıp işaretleyin ya da nedeniyle iptal edin.')}</Text>
          {unmarked.map((r) => <Line key={r.id} r={r} catalog={catalog} onOpen={onOpen} />)}
        </View>
      ) : null}
      {done.length ? (
        <View style={{ ...U.cardSolid, gap: 10 }}>
          <Eyebrow>{autoT('Karar bekleyen taramalar')}</Eyebrow>
          {done.map((r) => <Line key={r.id} r={r} catalog={catalog} onOpen={onOpen} onDecide={canManage ? onDecide : undefined} />)}
        </View>
      ) : null}
      {pool.length ? (
        <View style={{ ...U.cardSolid, gap: 10 }}>
          <Eyebrow>{autoT('Aylık faturayı bekleyen taramalar')}</Eyebrow>
          {pool.map((p) => (
            <View key={p.clinicId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{p.clinicName}</Text>
                <Text style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>
                  {p.count} {autoT('kalem')} · {Object.entries(p.totals).map(([c, v]) => formatMoney(Number(v) || 0, c as Currency)).join(' + ')}
                </Text>
              </View>
              <Btn kind="sec" label={autoT('Şimdi faturala')} onPress={() => bill(p.clinicId)} busy={busy === p.clinicId}
                tip={autoT('Bu kliniğin bekleyen tarama kalemleri için taslak fatura açar')} />
            </View>
          ))}
          {msg ? <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{msg}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function Line({ r, catalog, onOpen, onDecide }: {
  r: ScanAppointmentRow; catalog: ScanCatalog;
  onOpen: (r: ScanAppointmentRow, o: OriginRect | null) => void;
  onDecide?: (r: ScanAppointmentRow, o: OriginRect | null) => void;
}) {
  const U = useInkUI();
  const ref = useRef<any>(null);
  const lp = labLocalParts(r.starts_at, catalog.tz);
  const waiting = r.patients.filter((p) => p.status === 'karar_bekliyor').length;
  return (
    <View ref={ref} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable onPress={() => measureOrigin(ref.current, (o) => onOpen(r, o))} accessibilityRole="button" accessibilityLabel={r.clinic?.name ?? ''}
        style={({ pressed, hovered }: any) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 10,
          backgroundColor: hovered ? U.rowHover : U.surfaceSoft, ...pressScale(pressed), ...WEB_PTR })}>
        <View style={{ width: 62 }}>
          <Text style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>{lp.date.split('-').reverse().slice(0, 2).join('.')}</Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{hhmm(lp.minutes)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{r.clinic?.name ?? '—'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip tone="neutral" label={r.technician?.full_name ?? '—'} />
            {r.status === 'yapildi' ? <Chip tone="warning" label={`${waiting} ${autoT('hasta karar bekliyor')}`} /> : <Chip tone="warning" label={autoT('İşaretlenmedi')} />}
          </View>
        </View>
      </Pressable>
      {onDecide && r.status === 'yapildi' ? (
        <Btn kind="pri" label={autoT('Karar ver')} onPress={() => measureOrigin(ref.current, (o) => onDecide(r, o))}
          tip={autoT('Her hasta için: siparişe bağla, yeni sipariş aç ya da yalnız tarama')} />
      ) : null}
    </View>
  );
}
