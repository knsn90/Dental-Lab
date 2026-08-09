import { localeTag } from '../../../core/i18n';
import { safeBack } from '../../../core/util/safeBack';
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
  Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import {
  ArrowLeft, Printer, Download, FileSpreadsheet,
  Calendar, Search, X, Filter, ArrowUpRight, ArrowDownLeft,
  Minus, Banknote, CreditCard, Landmark, FileText,
  Inbox, Building2, ChevronDown, FileClock, ChevronRight,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { DS } from '../../../core/theme/dsTokens';
import { fetchInvoicesForClinic, fetchClinicBalance, fetchUnbilledWorkOrders, createInvoiceFromOrder, fetchClinicPriceCurrency } from '../api';
import { buildStatementLines, buildStatementHtml } from '../buildStatementHtml';
import type { StatementLine } from '../buildStatementHtml';
import type { Invoice, InvoiceStatus, PaymentMethod, ClinicBalance, UnbilledWorkOrder } from '../types';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../types';
import { supabase } from '../../../core/api/supabase';
import type { LabLetterhead } from '../../receipt/buildReceiptHtml';
import { toast } from '../../../core/ui/Toast';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useBaseCurrency } from '../../../core/money/baseCurrency';
import { CURRENCY_META, formatMoney, type Currency } from '../../../core/money/currency';

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
// Katı per-currency: tutar seçili/satırın para biriminde (base'e çevrilmez).
function fmtMoney(n: number | string | null | undefined, currency: string = 'TRY'): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return formatMoney(Number(v) || 0, (currency as Currency), { fractionDigits: 2 });
}
/** Faturanın aslı döviz ise ₺ tutarın yanına küçük "(€35)" karşılığını üretir. */
function origSuffix(cur?: string, amt?: number): string {
  if (!cur || cur === 'TRY' || amt == null || !Number.isFinite(amt)) return '';
  const sym = CURRENCY_META[cur as Currency]?.symbol ?? cur;
  return ` (${sym}${amt.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}
/**
 * Faturalanmamış işin para birimi → tutar haritası.
 * totals_by_currency migration 20260721100000 öncesi kayıtlarda yok →
 * ham estimated_total'ı ₺ kabul ederek geriye dönük uyum sağlar.
 */
/** Cari hesaba henüz girmemiş kalem: ya faturasız iş ya da taslak fatura. */
type PendingRow = {
  key: string;
  kind: 'order' | 'draft';
  workOrderId?: string;
  invoiceId?: string;
  title: string;
  ref: string;
  subtitle: string;
  date: string | null;
  amount: number;
};

function unbilledTotals(o: UnbilledWorkOrder): Record<string, number> {
  const t = o.totals_by_currency;
  if (t && Object.keys(t).length > 0) return t;
  const raw = Number(o.estimated_total) || 0;
  return raw > 0 ? { TRY: raw } : {};
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
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
// Tedarikçi cari ile aynı T-hesap CSV formatı.
function escapeCsv(v: any): string {
  const s = v == null ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportExcel(clinicName: string, lines: StatementLine[], periodFrom?: string, periodTo?: string, currency: string = 'TRY') {
  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const closing     = totalDebit - totalCredit;
  const ba = (n: number) => n > 0.01 ? 'B' : n < -0.01 ? 'A' : '—';
  const fmtNum = (n: number) => n === 0 ? '' : n.toFixed(2);

  // Header metadata
  const titleRows: string[][] = [
    ['CARİ HESAP EKSTRESİ'],
    [`Sağlık Kurumu: ${clinicName}`],
    [periodFrom && periodTo ? `Dönem: ${new Date(periodFrom).toLocaleDateString(localeTag())} – ${new Date(periodTo).toLocaleDateString(localeTag())}` : 'Dönem: Tüm hareketler'],
    [`Düzenlenme: ${new Date().toLocaleDateString(localeTag())}`],
    [`Para Birimi: ${currency}`],
    [''],
  ];

  const headers = ['Tarih', 'Belge No', 'Açıklama', `Borç (${currency})`, `Alacak (${currency})`, `Bakiye (${currency})`, 'B/A', 'Durum', 'Ödeme Yöntemi'];

  const rows = lines.map(l => {
    const status = l.type === 'invoice' && l.status
      ? (INVOICE_STATUS_LABELS[l.status as InvoiceStatus] ?? l.status) : '';
    const method = l.type === 'payment' && l.method
      ? (PAYMENT_METHOD_LABELS[l.method as PaymentMethod] ?? l.method) : '';
    return [
      new Date(l.date + 'T00:00:00').toLocaleDateString(localeTag()),
      l.invoiceNo ?? '',
      `${l.type === 'invoice' ? 'Fatura' : 'Tahsilat'} — ${l.description}`,
      fmtNum(l.debit),
      fmtNum(l.credit),
      Math.abs(l.balance).toFixed(2),
      ba(l.balance),
      status,
      method,
    ];
  });

  const totalRow = ['', '', 'TOPLAM', totalDebit.toFixed(2), totalCredit.toFixed(2), Math.abs(closing).toFixed(2), ba(closing), '', ''];
  const all = [...titleRows, headers, ...rows, totalRow];
  const csv = all.map(r => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = clinicName.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
  a.download = `cari_ekstre_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ClinicStatementScreen() {
  useBaseCurrency();
  const router = useRouter();
  const { clinicId } = useLocalSearchParams<{ clinicId: string }>();
  // Bu ekran hem /(lab)/statement hem /(admin)/statement altında mount ediliyor.
  // Grup adını sabitlemek kullanıcıyı diğer panele atar → FinanceHubScreen ile
  // aynı desen: aktif grubu segment'ten oku.
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();

  // Page title
  const { setTitle, clear } = usePageTitleStore();

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clinicInfo, setClinicInfo] = useState<ClinicBalance | null>(null);
  const [unbilled, setUnbilled] = useState<UnbilledWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'invoice' | 'payment'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Seçili para birimi — ekstre tek dövizde gösterilir (katı per-currency).
  // Başlangıç değeri geçicidir; aşağıdaki "akıllı varsayılan" efekti veri
  // gelince doğru dövizi seçer. Kullanıcı sekmeye bastıktan sonra bir daha
  // müdahale edilmez (ccyPinned).
  const [selectedCcy, setSelectedCcy] = useState<string>('TRY');
  const [ccyPinned, setCcyPinned] = useState(false);
  /** Kliniğin fiyat listesi para birimi — varsayılan sekmenin ilk tercihi. */
  const [priceCcy, setPriceCcy] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchInvoicesForClinic(clinicId),
      fetchClinicBalance(clinicId),
      // Teslim edilmiş ama faturaya bağlanmamış işler — ekstrede görünmezdi.
      fetchUnbilledWorkOrders(clinicId),
      // Varsayılan sekmenin ilk tercihi; başarısız olursa null döner ve
      // aşağıdaki sıralama bir sonraki ölçüte düşer.
      fetchClinicPriceCurrency(clinicId).catch(() => null),
    ]).then(([invRes, balRes, unbRes, pCcy]) => {
      if (cancelled) return;
      setInvoices((invRes.data ?? []) as Invoice[]);
      setClinicInfo((balRes.data ?? null) as ClinicBalance | null);
      setUnbilled((unbRes.data ?? []) as UnbilledWorkOrder[]);
      setPriceCcy((pCcy as string | null) ?? null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [clinicId]);

  // Klinik değişince seçim yeniden hesaplansın.
  useEffect(() => { setCcyPinned(false); }, [clinicId]);

  useEffect(() => {
    const name = clinicInfo?.clinic_name ?? 'Hesap Ekstresi';
    setTitle(name, 'Hesap Ekstresi');
    return clear;
  }, [clinicInfo?.clinic_name]);

  // Faturalardaki para birimleri (katı per-currency — ekstre tek dövizde)
  // + faturalanmamış işlerin para birimleri: aksi halde yalnız EUR işi olan
  //   ama hiç EUR faturası olmayan klinikte o iş hiçbir sekmede görünmezdi.
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) if (i.status !== 'iptal') set.add(i.currency || 'TRY');
    for (const o of unbilled) for (const c of Object.keys(unbilledTotals(o))) set.add(c);
    const order = ['TRY', 'EUR', 'USD', 'GBP'];
    const arr = Array.from(set).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return arr.length ? arr : ['TRY'];
  }, [invoices, unbilled]);

  /** Para birimi başına kesilmiş (taslak/iptal olmayan) fatura sayısı. */
  const postedCountByCcy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invoices) {
      if (i.status === 'iptal' || i.status === 'taslak') continue;
      const c = i.currency || 'TRY';
      m[c] = (m[c] ?? 0) + 1;
    }
    return m;
  }, [invoices]);

  // ── Akıllı varsayılan sekme ────────────────────────────────────────────────
  //
  // Eskiden körlemesine `currencies[0]` (TRY→EUR→USD sırasının ilki) seçiliyordu.
  // Fiyatları USD olan bir klinikte ekran EUR'da açılıp "0 hareket" gösteriyordu;
  // kullanıcı hesabın boş olduğunu sanıyordu. Sıralama:
  //   1. Kliniğin fiyat listesi para birimi — hangi dövizle çalışıldığının en
  //      doğrudan kanıtı, hiç fatura kesilmemişken bile bilinir.
  //   2. Hareketi (kesilmiş faturası) olan ilk döviz — boş sekmeye düşme.
  //   3. Mevcut sabit sıra — hepsi boşsa.
  // Kullanıcı bir sekmeye bastıysa (ccyPinned) bir daha karışılmaz.
  useEffect(() => {
    if (ccyPinned) {
      // Seçili döviz listeden düştüyse (veri değişti) yine de geçerli bir şeye çek.
      if (!currencies.includes(selectedCcy)) setSelectedCcy(currencies[0]);
      return;
    }
    const preferred =
      (priceCcy && currencies.includes(priceCcy) ? priceCcy : null)
      ?? currencies.find(c => (postedCountByCcy[c] ?? 0) > 0)
      ?? currencies[0];
    if (preferred && preferred !== selectedCcy) setSelectedCcy(preferred);
  }, [currencies, priceCcy, postedCountByCcy, ccyPinned]); // eslint-disable-line react-hooks/exhaustive-deps

  const ccyInvoices = useMemo(
    () => invoices.filter(i => (i.currency || 'TRY') === selectedCcy),
    [invoices, selectedCcy],
  );

  // Taslak fatura henüz alacak DEĞİL — v_clinic_balance da taslağı hariç tutuyor.
  // Ekstre satırları ve KPI'lar yalnız kesilmiş faturalardan hesaplanır; taslaklar
  // aşağıdaki "Faturalanmamış İşler" bölümünde bekler.
  const postedInvoices = useMemo(
    () => ccyInvoices.filter(i => i.status !== 'taslak'),
    [ccyInvoices],
  );
  const draftInvoices = useMemo(
    () => ccyInvoices.filter(i => i.status === 'taslak'),
    [ccyInvoices],
  );

  // Seçili dövizde tutarı olan faturalanmamış işler + toplamları.
  // DİKKAT: bu tutar BAKİYE'ye eklenmez — bakiye yalnız kesilmiş faturaları
  // ifade eder; potansiyel geliri oraya karıştırmak muhasebeyi bozar.
  const pendingRows = useMemo<PendingRow[]>(() => {
    // (a) Hiç faturası olmayan teslim edilmiş işler
    const fromOrders: PendingRow[] = unbilled
      .map(o => ({
        key: `wo:${o.work_order_id}`,
        kind: 'order' as const,
        workOrderId: o.work_order_id,
        title: o.patient_name || 'İsimsiz hasta',
        ref: o.order_number,
        subtitle: [o.work_type, o.doctor_name].filter(Boolean).join(' · '),
        date: (o.delivered_at ?? o.delivery_date)?.slice(0, 10) ?? null,
        amount: Number(unbilledTotals(o)[selectedCcy]) || 0,
      }))
      .filter(r => r.amount > 0);

    // (b) Oluşturulmuş ama henüz kesilmemiş taslak faturalar
    const fromDrafts: PendingRow[] = draftInvoices.map(inv => ({
      key: `inv:${inv.id}`,
      kind: 'draft' as const,
      invoiceId: inv.id,
      title: inv.work_order?.patient_name || inv.doctor?.full_name || 'Taslak fatura',
      ref: inv.invoice_number || 'Taslak',
      subtitle: [inv.work_order?.order_number, inv.doctor?.full_name].filter(Boolean).join(' · '),
      date: inv.issue_date ?? null,
      amount: Number(inv.total) || 0,
    }));

    return [...fromDrafts, ...fromOrders]
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  }, [unbilled, draftInvoices, selectedCcy]);

  const pendingTotal = useMemo(
    () => pendingRows.reduce((s, r) => s + r.amount, 0),
    [pendingRows],
  );

  // Satıra basınca: taslak varsa aç, yoksa taslağı üret ve aç.
  // create_invoice_from_order idempotent — açık fatura varsa onu döner.
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const openPendingRow = useCallback(async (row: PendingRow) => {
    if (openingKey) return;
    if (row.kind === 'draft') {
      router.push(`/${panelBase}/invoice/${row.invoiceId}` as any);
      return;
    }
    setOpeningKey(row.key);
    try {
      const { data, error } = await createInvoiceFromOrder(row.workOrderId!);
      if (error || !data) {
        toast.error((error as any)?.message ?? 'Fatura taslağı oluşturulamadı');
        return;
      }
      router.push(`/${panelBase}/invoice/${(data as Invoice).id}` as any);
    } catch (e: any) {
      toast.error(e?.message ?? 'Fatura taslağı oluşturulamadı');
    } finally {
      setOpeningKey(null);
    }
  }, [openingKey, panelBase, router]);

  // Ekstre defter satırından fatura detayına git (fatura & tahsilat satırı ilgili faturaya)
  const openLine = useCallback((line: StatementLine) => {
    if (line.id) router.push(`/${panelBase}/invoice/${line.id}` as any);
  }, [panelBase, router]);

  // Build statement (orijinal tutarda) — yalnız seçili dövizin faturaları
  const allLines = useMemo(() => buildStatementLines(postedInvoices, { original: true }), [postedInvoices]);

  // KPI'lar seçili dövizde, kesilmiş faturalardan hesaplanır (clinicInfo base'di → kullanılmaz)
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let billed = 0, paid = 0, overdue = 0;
    for (const i of postedInvoices) {
      if (i.status === 'iptal') continue;
      const t = Number(i.total || 0), pd = Number(i.paid_amount || 0);
      billed += t; paid += pd;
      if (i.due_date && i.due_date < today && pd < t) overdue += t - pd;
    }
    return { billed, paid, balance: billed - paid, overdue };
  }, [postedInvoices]);

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
        selectedCcy,
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
  }, [clinicInfo, filtered, dateFrom, dateTo, selectedCcy]);

  // ── Excel ──────────────────────────────────────────────
  const handleExcel = useCallback(() => {
    if (Platform.OS !== 'web') {
      toast.info('Excel dışa aktarma web üzerinde desteklenir');
      return;
    }
    exportExcel(clinicInfo?.clinic_name ?? 'Sağlık Kurumu', filtered, dateFrom || undefined, dateTo || undefined, selectedCcy);
    toast.success('Excel indirildi');
  }, [clinicInfo, filtered, dateFrom, dateTo, selectedCcy]);

  const clinicName = clinicInfo?.clinic_name ?? '';
  const totalBilled = kpis.billed;
  const totalPaid = kpis.paid;
  const balance = kpis.balance;
  const overdue = kpis.overdue;
  const pct = totalBilled > 0 ? Math.min(100, (totalPaid / totalBilled) * 100) : 0;

  if (loading) {
    return <CenteredLoader color={DS.ink[400]} label="Ekstre yükleniyor..." />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header ────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingTop: 16 + (isDesktop ? 0 : insets.top), paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
      }}>
        <Pressable
          onPress={() => safeBack('/')}
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
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Para birimi seçici (çok dövizli klinikte) ──────── */}
        {currencies.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {currencies.map(cur => {
              const active = selectedCcy === cur;
              const sym = CURRENCY_META[(cur as Currency)]?.symbol ?? cur;
              // Hareket sayısı rozette: boş sekmenin boş olduğu tıklamadan
              // anlaşılsın. Kullanıcı "hesap görünmüyor" derken aslında yanlış
              // sekmedeydi ve bunu ekranda gösteren hiçbir işaret yoktu.
              const n = postedCountByCcy[cur] ?? 0;
              return (
                <Pressable
                  key={cur}
                  onPress={() => { setCcyPinned(true); setSelectedCcy(cur); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                    borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                    backgroundColor: active ? DS.ink[900] : '#FFF',
                    opacity: !active && n === 0 ? 0.55 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#FFF' : DS.ink[500] }}>{sym}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFF' : DS.ink[700] }}>{cur}</Text>
                  <View style={{
                    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999,
                    backgroundColor: active ? 'rgba(255,255,255,0.22)' : DS.ink[100],
                  }}>
                    <Text style={{
                      fontSize: 10, fontWeight: '700', textAlign: 'center',
                      color: active ? '#FFF' : (n === 0 ? DS.ink[400] : DS.ink[700]),
                    }}>{n}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Summary KPIs ─────────────────────────────────── */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <MiniKPI label="Kesilen" value={fmtMoney(totalBilled, selectedCcy)} color={DS.ink[900]} />
          <MiniKPI label="Tahsil Edilen" value={fmtMoney(totalPaid, selectedCcy)} color={CHIP_TONES.success.fg} />
          <MiniKPI label="Bakiye" value={fmtMoney(balance, selectedCcy)} color={overdue > 0 ? CHIP_TONES.danger.fg : DS.ink[900]} />
          {overdue > 0 && <MiniKPI label="Gecikmiş" value={fmtMoney(overdue, selectedCcy)} color={CHIP_TONES.danger.fg} />}
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

        {/* ── Faturalanmamış işler ─────────────────────────────
            Teslim edilmiş ama faturaya bağlanmamış siparişler.
            Bakiyeye DAHİL DEĞİL — ayrı, açıkça etiketli bölüm. */}
        {pendingRows.length > 0 && (
          <View style={{ ...tableCard, borderColor: 'rgba(232,155,42,0.35)' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 20, paddingVertical: 14,
              backgroundColor: CHIP_TONES.warning.bg,
              borderBottomWidth: 1, borderBottomColor: 'rgba(232,155,42,0.25)',
            }}>
              <FileClock size={17} color={CHIP_TONES.warning.fg} strokeWidth={1.8} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: CHIP_TONES.warning.fg }}>
                  Faturalanmamış İşler
                </Text>
                <Text style={{ fontSize: 11, color: CHIP_TONES.warning.fg, opacity: 0.85, marginTop: 1 }}>
                  Faturasını görmek ve kesmek için satıra dokun · bakiyeye dahil değil
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: CHIP_TONES.warning.fg }}>
                  {fmtMoney(pendingTotal, selectedCcy)}
                </Text>
                <Text style={{ fontSize: 10, color: CHIP_TONES.warning.fg, opacity: 0.85 }}>
                  {pendingRows.length} iş
                </Text>
              </View>
            </View>

            {pendingRows.map((row, i) => {
              const busy = openingKey === row.key;
              return (
                <Pressable
                  key={row.key}
                  onPress={() => openPendingRow(row)}
                  disabled={busy}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 20, paddingVertical: 13,
                    borderBottomWidth: i === pendingRows.length - 1 ? 0 : 1,
                    borderBottomColor: 'rgba(0,0,0,0.05)',
                    opacity: busy ? 0.55 : 1,
                    ...(Platform.OS === 'web' ? { cursor: busy ? 'default' : 'pointer' } as any : {}),
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {row.title}
                      <Text style={{ fontWeight: '500', color: DS.ink[400] }}>{`  ·  ${row.ref}`}</Text>
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                      {row.subtitle || '—'}
                    </Text>
                  </View>

                  {row.kind === 'draft' && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: STATUS_CHIP.taslak.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: STATUS_CHIP.taslak.fg }}>Taslak</Text>
                    </View>
                  )}

                  {isDesktop && (
                    <Text style={{ fontSize: 11, color: DS.ink[400], width: 110, textAlign: 'right' }}>
                      {fmtDateShort(row.date)}
                    </Text>
                  )}

                  <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], textAlign: 'right', minWidth: 78 }}>
                    {fmtMoney(row.amount, selectedCcy)}
                  </Text>
                  {busy
                    ? <ActivityIndicator size="small" color={DS.ink[400]} />
                    : <ChevronRight size={15} color={DS.ink[300]} strokeWidth={1.8} />}
                </Pressable>
              );
            })}
          </View>
        )}

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
              <StatementRow key={line.id ?? i} line={line} last={i === filtered.length - 1} currency={selectedCcy}
                onOpen={line.id ? () => openLine(line) : undefined} />
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
                {fmtMoney(totals.debit, selectedCcy)}
              </Text>
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: CHIP_TONES.success.fg, textAlign: 'right' }}>
                {fmtMoney(totals.credit, selectedCcy)}
              </Text>
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: totals.balance > 0 ? DS.ink[900] : CHIP_TONES.success.fg, textAlign: 'right' }}>
                {fmtMoney(totals.balance, selectedCcy)}
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
              const mTitle = [line.orderNo, line.patientName].filter(Boolean).join(' · ') || line.description;
              const mSub = [line.clinicName, line.doctorName].filter(Boolean).join(' · ');

              return (
                <Pressable key={line.id ?? i}
                  onPress={line.id ? () => openLine(line) : undefined}
                  disabled={!line.id}
                  style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: pressed && line.id ? '#FAFAFA' : 'transparent',
                  ...(line.id && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: isInvoice ? CHIP_TONES.info.bg : CHIP_TONES.success.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={isInvoice ? CHIP_TONES.info.fg : CHIP_TONES.success.fg} strokeWidth={2} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                      {mTitle}
                    </Text>
                    {mSub ? (
                      <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>{mSub}</Text>
                    ) : null}
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
                      {isInvoice ? fmtMoney(line.debit, selectedCcy) : `-${fmtMoney(line.credit, selectedCcy)}`}
                    </Text>
                    <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 1 }}>
                      {fmtMoney(line.balance, selectedCcy)}
                    </Text>
                  </View>
                </Pressable>
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
                Bakiye: {fmtMoney(totals.balance, selectedCcy)}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Desktop statement row ───────────────────────────────────────────
function StatementRow({ line, last, currency, onOpen }: { line: StatementLine; last: boolean; currency: string; onOpen?: () => void }) {
  const isInvoice = line.type === 'invoice';
  const Icon = isInvoice ? ArrowUpRight : ArrowDownLeft;
  const chip = isInvoice && line.status ? STATUS_CHIP[line.status as InvoiceStatus] : null;
  const MIcon = !isInvoice && line.method ? METHOD_ICON[line.method as PaymentMethod] : null;
  const clickable = !!onOpen;
  // Başlık: sipariş no + hasta · Alt satır: klinik + hekim (yoksa description'a düş)
  const rowTitle = [line.orderNo, line.patientName].filter(Boolean).join(' · ') || line.description;
  const rowSub = [line.clinicName, line.doctorName].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      disabled={!clickable}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: 'rgba(0,0,0,0.04)',
        backgroundColor: hovered && clickable ? '#FAFAFA' : 'transparent',
        ...(clickable && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}>
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

      <View style={{ flex: 3, gap: 2, paddingRight: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {rowTitle}
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
        {rowSub ? (
          <Text style={{ fontSize: 11, color: DS.ink[400] }} numberOfLines={1}>{rowSub}</Text>
        ) : null}
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
        {line.debit > 0 ? fmtMoney(line.debit, currency) : '—'}
      </Text>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: line.credit > 0 ? '600' : '400',
        color: line.credit > 0 ? CHIP_TONES.success.fg : DS.ink[300], textAlign: 'right',
      }}>
        {line.credit > 0 ? fmtMoney(line.credit, currency) : '—'}
      </Text>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: '600',
        color: line.balance > 0 ? DS.ink[900] : CHIP_TONES.success.fg, textAlign: 'right',
      }}>
        {fmtMoney(line.balance, currency)}
      </Text>
    </Pressable>
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
      <Icon size={14} color={dark ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
      {!!label && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? '#FFF' : DS.ink[700] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export default ClinicStatementScreen;
