/**
 * BulkEFaturaList — Faturalar › "Toplu e-Fatura" sekmesi.
 *
 * Aynı ETTN'yi paylaşan (en az iki) Siman faturası = bir resmi e-fatura: Siman'da
 * birleştirilerek kesilen ya da Luca'da kesilip bağlanan. Kart başına e-fatura no,
 * klinik, fatura sayısı, toplam, durum; açılınca içindeki Siman faturaları (dokununca
 * fatura açılır) ve "Durum sorgula" (sunucu aynı ETTN'li tüm faturaları günceller).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { formatMoney } from '../../../core/money/currency';
import { toast } from '../../../core/ui/Toast';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { AlertCircle, Building2, ChevronDown, ChevronRight, FileText, Layers, RefreshCw } from '../../../core/ui/icons';
import { fetchEInvoicedRows } from '../bulkApi';
import { queryEFaturaStatus, STATUS_LABELS } from '../api';
import { groupBulkEInvoices, filterGroups, type BulkGroup } from '../lib/bulkGroups';
import { openEFaturaPdf } from '../pdf';
import type { EFaturaStatus } from '../types';
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '../../invoices/types';

interface Props {
  search: string;
  /** Artınca yeniden yüklenir (ör. Toplu e-Fatura penceresinden sonra) */
  refreshKey?: number;
  onOpenInvoice: (invoiceNumberOrId: string) => void;
}

const money = (n: number, cur: string) => formatMoney(Number(n) || 0, (cur || 'TRY') as any);
const day = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString(localeTag()) : '—');
const web = (on = true) => (Platform.OS === 'web' && on ? ({ cursor: 'pointer' } as any) : {});

export function BulkEFaturaList({ search, refreshKey = 0, onOpenInvoice }: Props) {
  const U = useInkUI();
  const [groups, setGroups] = useState<BulkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [querying, setQuerying] = useState<string | null>(null);
  const [pdfFor, setPdfFor] = useState<string | null>(null);

  /** Resmi e-fatura PDF'i — tarayıcının PDF görüntüleyicisinde önizle / indir / yazdır */
  const pdf = async (g: BulkGroup) => {
    setPdfFor(g.ettn);
    const r = await openEFaturaPdf(g.invoices[0].id);
    setPdfFor(null);
    if (!r.ok) toast.error(autoT(r.error ?? 'PDF açılamadı'));
  };

  const load = async () => {
    setLoading(true); setErr(null);
    const r = await fetchEInvoicedRows();
    setLoading(false);
    if (r.error) { setErr(autoT('Toplu e-faturalar yüklenemedi')); return; }
    setGroups(groupBulkEInvoices(r.data));
  };
  useEffect(() => { load(); }, [refreshKey]);

  const shown = useMemo(() => filterGroups(groups, search), [groups, search]);

  const toggle = (ettn: string) => setOpen((p) => { const n = new Set(p); n.has(ettn) ? n.delete(ettn) : n.add(ettn); return n; });

  const query = async (g: BulkGroup) => {
    setQuerying(g.ettn);
    const r = await queryEFaturaStatus(g.invoices[0].id);
    setQuerying(null);
    if (!r.ok) toast.error(autoT(r.error ?? 'Sorgulama başarısız'));
    else toast.info(`${autoT('Durum')}: ${autoT(STATUS_LABELS[r.status as EFaturaStatus]?.label ?? String(r.status))}`);
    load();
  };

  const toneOf = (s: string | null) =>
    s === 'accepted' ? U.chipTones.success
      : s === 'sent' ? U.chipTones.info
      : s === 'cancelled' ? U.chipTones.neutral
      : s === 'error' || s === 'rejected' ? U.chipTones.danger : U.chipTones.neutral;
  const chip = (text: string, tone: { bg: string; fg: string }) => (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone.fg }}>{text}</Text>
    </View>
  );

  if (loading && !groups.length) {
    return <View style={{ paddingVertical: 64, alignItems: 'center' }}><ActivityIndicator color={U.ink[400]} /></View>;
  }
  if (err) {
    return (
      <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: U.chipTones.danger.bg }}>
        <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.danger.fg} />
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: U.chipTones.danger.fg }}>{err}</Text>
      </View>
    );
  }
  if (!shown.length) {
    return (
      <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 }}>
        <Layers size={26} strokeWidth={1.5} color={U.ink[300]} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>
          {search.trim() ? autoT('Sonuç yok') : autoT('Henüz toplu e-fatura yok')}
        </Text>
        {!search.trim() ? (
          <Text style={{ fontSize: 12.5, color: U.ink[500], textAlign: 'center', lineHeight: 18, maxWidth: 420 }}>
            Toplu e-Fatura ile bir kliniğin faturalarını tek e-faturada birleştirdiğinizde ya da Luca'da kestiğiniz faturayı bağladığınızda burada görünür.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {shown.map((g) => {
        const isOpen = open.has(g.ettn);
        const st = (g.status ?? 'pending') as EFaturaStatus;
        return (
          <View key={g.ettn} style={{ ...U.cardSolid, padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => toggle(g.ettn)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={({ pressed }) => ({ padding: 16, gap: 10, backgroundColor: pressed ? U.rowHover : 'transparent', ...web() })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: g.clinicLogo ? '#FFFFFF' : U.chipNeutral }}>
                  {g.clinicLogo
                    ? <Image source={{ uri: g.clinicLogo }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    : <Building2 size={16} strokeWidth={1.7} color={U.ink[500]} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>{g.clinicName}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: U.ink[500] }}>
                    <Text style={{ fontFamily: 'monospace' as any, color: U.ink[700] }}>{g.number ?? '—'}</Text>
                    {` · ${day(g.sentAt)}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{money(g.total, g.currency)}</Text>
                  <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${g.invoices.length} ${autoT('fatura')}`}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {chip(autoT(STATUS_LABELS[st]?.label ?? String(g.status)), toneOf(g.status))}
                {chip(g.type === 'e_arsiv' ? 'e-Arşiv' : 'e-Fatura', U.chipTones.neutral)}
                <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{`${day(g.firstDate)} – ${day(g.lastDate)}`}</Text>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>
                    {isOpen ? autoT('Faturaları gizle') : autoT('Faturaları göster')}
                  </Text>
                  {isOpen
                    ? <ChevronDown size={14} strokeWidth={2} color={U.ink[400]} />
                    : <ChevronRight size={14} strokeWidth={2} color={U.ink[400]} />}
                </View>
              </View>
            </Pressable>

            {isOpen ? (
              <View style={{ borderTopWidth: 1, borderTopColor: U.hairlineSoft }}>
                {g.invoices.map((inv, i) => (
                  <Pressable
                    key={inv.id}
                    onPress={() => onOpenInvoice(inv.invoice_number ?? inv.id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
                      backgroundColor: pressed ? U.rowHover : 'transparent',
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft, ...web(),
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900], fontFamily: 'monospace' as any }}>{inv.invoice_number}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 11.5, color: U.ink[500] }}>
                        {`${day(inv.issue_date)} · ${autoT(INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status)}`}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900] }}>{money(inv.total, inv.currency)}</Text>
                    <ChevronRight size={13} strokeWidth={1.9} color={U.ink[300]} />
                  </Pressable>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: U.hairlineSoft, backgroundColor: U.surfaceSoft }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: U.ink[400], fontFamily: 'monospace' as any }}>{`ETTN ${g.ettn}`}</Text>
                  {g.status !== 'cancelled' ? (
                    <Pressable
                      onPress={() => pdf(g)}
                      disabled={!!pdfFor}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                        opacity: pdfFor && pdfFor !== g.ettn ? 0.5 : pressed ? 0.85 : 1, ...web(!pdfFor),
                      })}
                    >
                      {pdfFor === g.ettn
                        ? <ActivityIndicator size={14} color={U.plainBtn.fg} />
                        : <FileText size={13} strokeWidth={1.9} color={U.plainBtn.fg} />}
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>e-Fatura PDF</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => query(g)}
                    disabled={!!querying}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                      opacity: querying && querying !== g.ettn ? 0.5 : pressed ? 0.85 : 1, ...web(!querying),
                    })}
                  >
                    {querying === g.ettn
                      ? <ActivityIndicator size={14} color={U.plainBtn.fg} />
                      : <RefreshCw size={13} strokeWidth={1.9} color={U.plainBtn.fg} />}
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>Durum sorgula</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
