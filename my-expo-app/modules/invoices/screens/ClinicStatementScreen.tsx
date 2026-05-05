/**
 * ClinicStatementScreen — Klinik Hesap Ekstresi (Patterns Design Language)
 *
 * Ayrı sayfa: filtreleme (tarih aralığı, durum), tablo görünümü,
 * PDF yazdırma ve Excel dışa aktarma.
 *
 * §09 tableCard, §05 cardSolid, §05.5 form, §03 pill buttons,
 * §04 CHIP_TONES, DISPLAY font, Lucide icons.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, Printer, Download, FileSpreadsheet,
  Calendar, Search, X, Filter, ArrowUpRight, ArrowDownLeft,
  Minus, Banknote, CreditCard, Landmark, FileText,
  Inbox, Building2, ChevronDown,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { DS } from '../../../core/theme/dsTokens';
import { fetchInvoicesForClinic, fetchClinicBalance } from '../api';
import { buildStatementLines, buildStatementHtml } from '../buildStatementHtml';
import type { StatementLine } from '../buildStatementHtml';
import type { Invoice, InvoiceStatus, PaymentMethod, ClinicBalance } from '../types';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../types';
import { supabase } from '../../../core/api/supabase';
import type { LabLetterhead } from '../../receipt/buildReceiptHtml';
import { toast } from '../../../core/ui/Toast';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

const STATUS_CHIP: Record<InvoiceStatus, { bg: string; fg: string }> = {
  taslak:       { bg: 'rgba(0,0,0,0.05)', fg: DS.ink[500] },
  kesildi:      CHIP_TONES.info,
  kismi_odendi: CHIP_TONES.warning,
  odendi:       CHIP_TONES.success,
  iptal:        CHIP_TONES.danger,
};

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<any>> = {
  nakit:  Banknote,
  kart:   CreditCard,
  havale: Landmark,
  cek:    FileText,
  diger:  Minus,
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Lab fetch (cached) ───────────────────────────────────────────────
let _cachedLab: LabLetterhead | null = null;
async function fetchLab(): Promise<LabLetterhead> {
  if (_cachedLab) return _cachedLab;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: '', name: 'Lab' };
  const { data: profile } = await supabase.from('profiles').select('lab_id').eq('id', user.id).single();
  if (!profile?.lab_id) return { id: '', name: 'Lab' };
  const { data } = await supabase
    .from('labs')
    .select('id, name, address, phone, email, website, tax_number, logo_url')
    .eq('id', profile.lab_id)
    .single();
  _cachedLab = (data ?? { id: profile.lab_id, name: 'Lab' }) as LabLetterhead;
  return _cachedLab;
}

// ── Excel export ─────────────────────────────────────────────────────
function exportExcel(clinicName: string, lines: StatementLine[]) {
  // TSV → download as .xls (Excel opens TSV with .xls extension)
  const header = ['Tarih', 'Tip', 'Açıklama', 'Durum', 'Ödeme Yöntemi', 'Borç', 'Alacak', 'Bakiye'].join('\t');
  const rows = lines.map(l => [
    l.date,
    l.type === 'invoice' ? 'Fatura' : 'Tahsilat',
    l.description,
    l.type === 'invoice' && l.status ? (INVOICE_STATUS_LABELS[l.status as InvoiceStatus] ?? l.status) : '',
    l.type === 'payment' && l.method ? (PAYMENT_METHOD_LABELS[l.method as PaymentMethod] ?? l.method) : '',
    l.debit > 0 ? l.debit.toFixed(2) : '',
    l.credit > 0 ? l.credit.toFixed(2) : '',
    l.balance.toFixed(2),
  ].join('\t'));
  const tsv = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + tsv], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Hesap-Ekstresi-${clinicName.replace(/\s+/g, '-')}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ClinicStatementScreen() {
  const router = useRouter();
  const { clinicId } = useLocalSearchParams<{ clinicId: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Page title
  const { setTitle, clear } = usePageTitleStore();

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clinicInfo, setClinicInfo] = useState<ClinicBalance | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'invoice' | 'payment'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchInvoicesForClinic(clinicId),
      fetchClinicBalance(clinicId),
    ]).then(([invRes, balRes]) => {
      if (cancelled) return;
      setInvoices((invRes.data ?? []) as Invoice[]);
      setClinicInfo((balRes.data ?? null) as ClinicBalance | null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [clinicId]);

  useEffect(() => {
    const name = clinicInfo?.clinic_name ?? 'Hesap Ekstresi';
    setTitle(name, 'Hesap Ekstresi');
    return clear;
  }, [clinicInfo?.clinic_name]);

  // Build statement + filter
  const allLines = useMemo(() => buildStatementLines(invoices), [invoices]);

  const filtered = useMemo(() => {
    return allLines.filter(l => {
      if (dateFrom && l.date < dateFrom) return false;
      if (dateTo && l.date > dateTo) return false;
      if (typeFilter !== 'all' && l.type !== typeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return l.description.toLowerCase().includes(q)
          || (l.invoiceNo?.toLowerCase().includes(q) ?? false);
      }
      return true;
    });
  }, [allLines, dateFrom, dateTo, typeFilter, searchTerm]);

  // Totals for filtered
  const totals = useMemo(() => {
    const debit = filtered.reduce((s, l) => s + l.debit, 0);
    const credit = filtered.reduce((s, l) => s + l.credit, 0);
    return { debit, credit, balance: debit - credit };
  }, [filtered]);

  // ── Print / PDF ────────────────────────────────────────
  const handlePrint = useCallback(async () => {
    setExporting(true);
    try {
      const lab = await fetchLab();
      const html = buildStatementHtml(
        clinicInfo?.clinic_name ?? 'Klinik',
        filtered,
        lab,
        { from: dateFrom || undefined, to: dateTo || undefined },
      );

      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (!w) { toast.error('Pop-up engellendi'); return; }
        w.document.write(html);
        w.document.close();
        try { w.focus(); } catch {}
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Hesap-Ekstresi-${clinicInfo?.clinic_name ?? 'Klinik'}.pdf`,
            UTI: 'com.adobe.pdf',
          });
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Dışa aktarma hatası');
    } finally {
      setExporting(false);
    }
  }, [clinicInfo, filtered, dateFrom, dateTo]);

  // ── Excel ──────────────────────────────────────────────
  const handleExcel = useCallback(() => {
    if (Platform.OS !== 'web') {
      toast.info('Excel dışa aktarma web üzerinde desteklenir');
      return;
    }
    exportExcel(clinicInfo?.clinic_name ?? 'Klinik', filtered);
    toast.success('Excel indirildi');
  }, [clinicInfo, filtered]);

  const clinicName = clinicInfo?.clinic_name ?? '';
  const totalBilled = Number(clinicInfo?.total_billed ?? 0);
  const totalPaid = Number(clinicInfo?.total_paid ?? 0);
  const balance = Number(clinicInfo?.balance ?? 0);
  const overdue = Number(clinicInfo?.overdue_amount ?? 0);
  const pct = totalBilled > 0 ? Math.min(100, (totalPaid / totalBilled) * 100) : 0;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={DS.ink[400]} />
        <Text style={{ fontSize: 13, color: DS.ink[400] }}>Ekstre yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header ────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: isDesktop ? 24 : 16, paddingTop: 14, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
      }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
        >
          <ArrowLeft size={18} color={DS.ink[900]} strokeWidth={1.8} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} color={DS.ink[400]} strokeWidth={1.6} />
            <Text style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: -0.4, color: DS.ink[900] }}>
              {clinicName}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2, marginLeft: 24 }}>
            Hesap Ekstresi · {allLines.length} hareket
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <PillBtn icon={Printer} label={isDesktop ? 'Yazdır / PDF' : ''} onPress={handlePrint} busy={exporting} />
          {Platform.OS === 'web' && (
            <PillBtn icon={FileSpreadsheet} label={isDesktop ? 'Excel' : ''} onPress={handleExcel} variant="ghost" />
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 24 : 16, paddingBottom: 48, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Summary KPIs ─────────────────────────────────── */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <MiniKPI label="Kesilen" value={fmtMoney(totalBilled)} color={DS.ink[900]} />
          <MiniKPI label="Tahsil Edilen" value={fmtMoney(totalPaid)} color={CHIP_TONES.success.fg} />
          <MiniKPI label="Bakiye" value={fmtMoney(balance)} color={overdue > 0 ? CHIP_TONES.danger.fg : DS.ink[900]} />
          {overdue > 0 && <MiniKPI label="Gecikmiş" value={fmtMoney(overdue)} color={CHIP_TONES.danger.fg} />}
          <View style={{ flex: 1, minWidth: 120, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 6 }}>
              Tahsilat
            </Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: DS.ink[200], overflow: 'hidden' }}>
              <View style={{ width: `${pct}%` as any, height: '100%', borderRadius: 3, backgroundColor: '#2D9A6B' }} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginTop: 4 }}>{pct.toFixed(0)}%</Text>
          </View>
        </View>

        {/* ── Filters ──────────────────────────────────────── */}
        <View style={{ gap: 10 }}>
          {/* Search + toggle */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
              height: 44, paddingHorizontal: 14, borderRadius: 14,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
            }}>
              <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
                placeholder="Fatura no veya açıklama ara..."
                placeholderTextColor={DS.ink[400]}
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
              {searchTerm.length > 0 && (
                <Pressable onPress={() => setSearchTerm('')} style={{ cursor: 'pointer' as any }}>
                  <X size={14} color={DS.ink[400]} strokeWidth={2} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setShowFilters(v => !v)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 44, paddingHorizontal: 14, borderRadius: 14,
                borderWidth: 1,
                borderColor: showFilters ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                backgroundColor: showFilters ? DS.ink[50] : '#FFF',
                cursor: 'pointer' as any,
              }}
            >
              <Filter size={14} color={showFilters ? DS.ink[900] : DS.ink[400]} strokeWidth={1.8} />
              {isDesktop && (
                <Text style={{ fontSize: 13, fontWeight: showFilters ? '600' : '500', color: showFilters ? DS.ink[900] : DS.ink[500] }}>
                  Filtre
                </Text>
              )}
            </Pressable>
          </View>

          {/* Extended filters */}
          {showFilters && (
            <View style={{
              ...cardSolid, padding: 16, gap: 12,
              flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'flex-end' : 'stretch',
            }}>
              {/* Date from */}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Başlangıç
                </Text>
                <TextInput
                  style={{
                    height: 44, paddingHorizontal: 14, borderRadius: 14,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
                    fontSize: 14, color: DS.ink[900], outline: 'none' as any,
                  }}
                  placeholder="YYYY-AA-GG"
                  placeholderTextColor={DS.ink[300]}
                  value={dateFrom}
                  onChangeText={setDateFrom}
                />
              </View>

              {/* Date to */}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Bitiş
                </Text>
                <TextInput
                  style={{
                    height: 44, paddingHorizontal: 14, borderRadius: 14,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
                    fontSize: 14, color: DS.ink[900], outline: 'none' as any,
                  }}
                  placeholder="YYYY-AA-GG"
                  placeholderTextColor={DS.ink[300]}
                  value={dateTo}
                  onChangeText={setDateTo}
                />
              </View>

              {/* Type filter */}
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Tip
                </Text>
                <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: DS.ink[100], borderRadius: 14 }}>
                  {([
                    { key: 'all', label: 'Tümü' },
                    { key: 'invoice', label: 'Fatura' },
                    { key: 'payment', label: 'Tahsilat' },
                  ] as const).map(opt => {
                    const active = typeFilter === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setTypeFilter(opt.key)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11,
                          backgroundColor: active ? '#FFF' : 'transparent',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Clear */}
              {(dateFrom || dateTo || typeFilter !== 'all') && (
                <Pressable
                  onPress={() => { setDateFrom(''); setDateTo(''); setTypeFilter('all'); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                    backgroundColor: DS.ink[100], cursor: 'pointer' as any,
                    alignSelf: 'flex-end',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>Temizle</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* ── Statement table ──────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              {searchTerm || dateFrom || dateTo || typeFilter !== 'all'
                ? 'Filtreye uygun hareket bulunamadı'
                : 'Henüz hareket yok'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop table ─────────────────────────────────── */
          <View style={tableCard}>
            {/* Toolbar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Ekstre
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {filtered.length} hareket
                {(dateFrom || dateTo) ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
              </Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {[
                { label: 'TARİH',     flex: 1.2 },
                { label: 'TİP',       flex: 0.6 },
                { label: 'AÇIKLAMA',  flex: 3 },
                { label: 'DURUM',     flex: 1 },
                { label: 'BORÇ',      flex: 1.2, align: 'right' as const },
                { label: 'ALACAK',    flex: 1.2, align: 'right' as const },
                { label: 'BAKİYE',    flex: 1.2, align: 'right' as const },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {filtered.map((line, i) => (
              <StatementRow key={line.id ?? i} line={line} last={i === filtered.length - 1} />
            ))}

            {/* Footer */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
              backgroundColor: '#FAFAFA',
            }}>
              <Text style={{ flex: 1.2, fontSize: 11, color: DS.ink[500] }}>{filtered.length} hareket</Text>
              <View style={{ flex: 0.6 }} />
              <View style={{ flex: 3 }} />
              <View style={{ flex: 1 }} />
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: DS.ink[900], textAlign: 'right' }}>
                {fmtMoney(totals.debit)}
              </Text>
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: CHIP_TONES.success.fg, textAlign: 'right' }}>
                {fmtMoney(totals.credit)}
              </Text>
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: totals.balance > 0 ? DS.ink[900] : CHIP_TONES.success.fg, textAlign: 'right' }}>
                {fmtMoney(totals.balance)}
              </Text>
            </View>
          </View>
        ) : (
          /* ���─ Mobile list ────────────────────────────────────── */
          <View style={tableCard}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[900] }}>Ekstre</Text>
            </View>

            {filtered.map((line, i) => {
              const isInvoice = line.type === 'invoice';
              const Icon = isInvoice ? ArrowUpRight : ArrowDownLeft;
              const chip = isInvoice && line.status ? STATUS_CHIP[line.status as InvoiceStatus] : null;

              return (
                <View key={line.id ?? i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.04)',
                }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: isInvoice ? CHIP_TONES.info.bg : CHIP_TONES.success.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={isInvoice ? CHIP_TONES.info.fg : CHIP_TONES.success.fg} strokeWidth={2} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>
                      {line.description}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: DS.ink[400] }}>{fmtDateShort(line.date)}</Text>
                      {isInvoice && chip && line.status && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: chip.bg }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: chip.fg }}>
                            {INVOICE_STATUS_LABELS[line.status as InvoiceStatus]}
                          </Text>
                        </View>
                      )}
                      {!isInvoice && line.method && (
                        <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                          {PAYMENT_METHOD_LABELS[line.method as PaymentMethod]}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: isInvoice ? DS.ink[900] : CHIP_TONES.success.fg,
                    }}>
                      {isInvoice ? fmtMoney(line.debit) : `-${fmtMoney(line.credit)}`}
                    </Text>
                    <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 1 }}>
                      {fmtMoney(line.balance)}
                    </Text>
                  </View>
                </View>
              );
            })}

            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 12,
              borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
              backgroundColor: '#FAFAFA',
            }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{filtered.length} hareket</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: totals.balance > 0 ? DS.ink[900] : CHIP_TONES.success.fg }}>
                Bakiye: {fmtMoney(totals.balance)}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Desktop statement row ───────────────────────────────────────────
function StatementRow({ line, last }: { line: StatementLine; last: boolean }) {
  const isInvoice = line.type === 'invoice';
  const Icon = isInvoice ? ArrowUpRight : ArrowDownLeft;
  const chip = isInvoice && line.status ? STATUS_CHIP[line.status as InvoiceStatus] : null;
  const MIcon = !isInvoice && line.method ? METHOD_ICON[line.method as PaymentMethod] : null;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 12,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: 'rgba(0,0,0,0.04)',
    }}>
      <Text style={{ flex: 1.2, fontSize: 12, color: DS.ink[500], fontFamily: 'monospace' }}>
        {fmtDateShort(line.date)}
      </Text>

      <View style={{ flex: 0.6 }}>
        <View style={{
          width: 22, height: 22, borderRadius: 6,
          backgroundColor: isInvoice ? CHIP_TONES.info.bg : CHIP_TONES.success.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={11} color={isInvoice ? CHIP_TONES.info.fg : CHIP_TONES.success.fg} strokeWidth={2} />
        </View>
      </View>

      <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 13, color: DS.ink[800] }} numberOfLines={1}>
          {line.description}
        </Text>
        {!isInvoice && MIcon && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <MIcon size={10} color={DS.ink[400]} strokeWidth={1.6} />
            <Text style={{ fontSize: 10, color: DS.ink[400] }}>
              {line.method ? PAYMENT_METHOD_LABELS[line.method as PaymentMethod] : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        {isInvoice && chip && line.status && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: chip.bg }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: chip.fg }}>
              {INVOICE_STATUS_LABELS[line.status as InvoiceStatus]}
            </Text>
          </View>
        )}
      </View>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: line.debit > 0 ? '600' : '400',
        color: line.debit > 0 ? DS.ink[900] : DS.ink[300], textAlign: 'right',
      }}>
        {line.debit > 0 ? fmtMoney(line.debit) : '—'}
      </Text>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: line.credit > 0 ? '600' : '400',
        color: line.credit > 0 ? CHIP_TONES.success.fg : DS.ink[300], textAlign: 'right',
      }}>
        {line.credit > 0 ? fmtMoney(line.credit) : '—'}
      </Text>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: '600',
        color: line.balance > 0 ? DS.ink[900] : CHIP_TONES.success.fg, textAlign: 'right',
      }}>
        {fmtMoney(line.balance)}
      </Text>
    </View>
  );
}

// ─── Mini KPI ────────────────────────────────────────────────────────
function MiniKPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 120, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color }}>{value}</Text>
    </View>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', busy }: {
  icon: React.ComponentType<any>; label?: string; onPress: () => void;
  variant?: 'dark' | 'ghost'; busy?: boolean;
}) {
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: label ? 16 : 12, paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: dark ? DS.ink[900] : 'transparent',
        borderWidth: dark ? 0 : 1,
        borderColor: DS.ink[200],
        opacity: busy ? 0.5 : 1,
        cursor: 'pointer' as any,
      }}
    >
      {busy
        ? <ActivityIndicator size={14} color={dark ? '#FFF' : DS.ink[700]} />
        : <Icon size={14} color={dark ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
      }
      {!!label && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? '#FFF' : DS.ink[700] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export default ClinicStatementScreen;
