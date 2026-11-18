import { localeTag, isRTL } from '../../../core/i18n';
/**
 * ClinicStatementScreen — Klinik Hesap Ekstresi (Patterns Design Language)
 *
 * Ayrı sayfa: filtreleme (tarih aralığı, durum), tablo görünümü,
 * PDF yazdırma ve Excel dışa aktarma.
 *
 * §09 tableCard, §05 cardSolid, §05.5 form, §03 pill buttons,
 * §04 CHIP_TONES, DISPLAY font, Lucide icons.
 */
import React, { useEffect, useMemo, useState, useCallback, useContext, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Platform, useWindowDimensions, Modal, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useSegments, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, ArrowRight, Printer, Download, FileSpreadsheet, Wallet,
  Calendar, Search, X, Filter, SlidersHorizontal, ArrowUpRight, ArrowDownLeft,
  Minus, Banknote, CreditCard, Landmark, FileText,
  Inbox, Building2, ChevronDown, FileClock, ChevronRight, ChevronLeft, LayoutList, Percent, FileEdit, MoreHorizontal,
} from '../../../core/ui/icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { withEffectiveDiscounts } from '../lib/correctionDoc';
import { fetchInvoicesForClinic, fetchClinicBalance, fetchUnbilledWorkOrders, createInvoiceFromOrder, fetchClinicPriceCurrency, fetchClinicReceipts, fetchStatementDiscounts, deleteStatementDiscount, fetchInvoiceItemDetails } from '../api';
import { buildStatementLines, buildStatementHtml } from '../buildStatementHtml';
import { statementVatSummary } from '../lib/statementVat';
import { StatementVatSummary } from '../components/StatementVatSummary';
import { StatementPrefsModal } from '../components/StatementPrefsModal';
import { buildPendingAppendixHtml, appendBeforeBody, type PendingAppendixRow } from '../lib/pendingAppendixHtml';
import { buildPreStatementSummaryHtml, buildPreStatementDetailHtml } from '../buildPreStatementHtml';
import { scopeToDoctor } from '../lib/preStatementPdf';
import { patientLabel } from '../lib/preStatement';
import { doctorNamesOf } from '../components/PreStatementPdfButton';
import { StatementScopeMenu, type StatementScope } from '../components/StatementScopeMenu';
import { downloadHtmlPdf, printHtmlDirect } from '../../../core/print/exportHtmlPdf';
import { readPrintPref, writePrintPref } from '../../../core/print/printPrefs';
import { usePreStatementPdfFormat } from '../../../core/store/labSettingsStore';
import { useStatementPrefs } from '../hooks/useStatementPrefs';
import { applyStatementPrefs } from '../lib/statementPrefs';
import { statementPeriodTotals, lineDelta } from '../lib/statementTotals';
import { receiptCreditForCurrency, receiptCoverage, formatReceiptCoverage, receiptVoucherNo, receiptDepositLabel } from '../lib/receiptStatement';
import { revisionDetail } from '../lib/statementRevision';
import { buildReceiptVoucherHtml } from '../buildReceiptVoucherHtml';
import { ClinicReceiptModal } from '../components/ClinicReceiptModal';
import { StatementDiscountModal } from '../components/StatementDiscountModal';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import {
  discountStatementLines, discountCellValue, hasAnyDiscount, discountTotal,
  type DiscountMode,
} from '../lib/statementDiscount';
import { WhiteHero, useWhiteHeroInk, WHITE_HERO_DISPLAY } from '../../../core/ui/WhiteHero';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { StatementLine } from '../buildStatementHtml';
import type { Invoice, InvoiceStatus, PaymentMethod, ClinicBalance, UnbilledWorkOrder, ClinicReceipt, StatementDiscount } from '../types';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../types';
import { supabase } from '../../../core/api/supabase';
import { fetchLabLetterhead, fetchSelfViewLetterhead } from '../labLetterheadApi';
import { toast } from '../../../core/ui/Toast';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useBaseCurrency } from '../../../core/money/baseCurrency';
import { CURRENCY_META, formatMoney, type Currency } from '../../../core/money/currency';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import { HubContext } from '../../../core/ui/HubContext';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isPostedInvoice, isInvoiceOverdue } from '../../../core/metrics/invoiceDefs';
import { NavyBackButtonX } from '../../../core/ui/NavyBackButtonX';
import { useLabPreStatement, LabPreStatementTop, LabPreStatementSection } from '../components/LabPreStatementSection';
import { useInvoiceApprovalEnabled } from '../../../core/store/labSettingsStore';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// cardSolid / tableCard / CHIP_TONES artık `useInkUI()`ten gelir — modül seviyesi
// sabit hook çağıramadığı için koyu temada kart beyaz kalıyordu.
function statusChip(U: InkUI): Record<InvoiceStatus, { bg: string; fg: string }> {
  return {
    taslak:       { bg: U.chipNeutral, fg: U.ink[500] },
    kesildi:      U.chipTones.info,
    kismi_odendi: U.chipTones.warning,
    odendi:       U.chipTones.success,
    iptal:        U.chipTones.danger,
  };
}

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<any>> = {
  nakit:  Banknote,
  kart:   CreditCard,
  havale: Landmark,
  cek:    FileText,
  diger:  Minus,
  indirim: Minus,
};

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

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
/** Düzeltme belgesi (DZ) satırının Alacak sütunundaki tutarı (spec P10: indirim sütununa girmez,
 *  alacakta kendi satırıyla görünür). DZ dışındaki satırlarda 0. */
function dzCredit(l: { type?: string; docKind?: 'IND' | 'DZ'; discount?: number }): number {
  return l.type === 'discount' && l.docKind === 'DZ' ? (Number(l.discount) || 0) : 0;
}

/** İndirim sütunu hücresi: tutar eksi işaretli para, yüzde "%x,x"; indirim yoksa null. */
function discountText(line: StatementLine, mode: DiscountMode, currency: string): string | null {
  const v = discountCellValue(line, mode);
  if (!v) return null;
  if (v.kind === 'percent') {
    return '%' + v.value.toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return `-${fmtMoney(Math.abs(v.value), currency)}`;
}
const pad2 = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM ayının son günü (YYYY-MM-DD). */
function monthEndOf(ymd: string): string {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7));
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
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

function exportExcel(
  clinicName: string, lines: StatementLine[], periodFrom?: string, periodTo?: string, currency: string = 'TRY',
  totals?: { opening: number; closing: number },
  /** Liste ayarı: KDV/durum sütunu; tahsilat gizliyse toplamlar ve KDV dökümü tüm hareketten */
  opts: { vat?: boolean; status?: boolean; sums?: { debit: number; credit: number }; vatSource?: StatementLine[];
          /** Verilirse İndirim sütunu (tutar/yüzde) ve toplam satırında indirim toplamı */
          discount?: DiscountMode } = {},
) {
  const showVat = opts.vat !== false;
  const showStatus = opts.status !== false;
  const discMode = opts.discount;
  const showDisc = !!discMode;
  const discCell = (l: StatementLine): string => {
    const v = discMode ? discountCellValue(l, discMode) : null;
    if (!v) return '';
    return v.kind === 'percent' ? `%${v.value.toFixed(1)}` : (-Math.abs(v.value)).toFixed(2);
  };
  const totalDebit  = opts.sums?.debit  ?? lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = opts.sums?.credit ?? lines.reduce((s, l) => s + l.credit + dzCredit(l), 0);
  // Dönem filtreliyse önceki aylardan devreden borç açılışta görünür, kapanış ona eklenir.
  const opening     = totals?.opening ?? 0;
  const closing     = totals?.closing ?? totalDebit - totalCredit;
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

  // KDV ayrı sütunda + en altta döküm (kullanıcı: KDV'nin fiyatın içinde olduğu anlaşılmıyordu)
  const vat = statementVatSummary(opts.vatSource ?? lines);
  // Önce borç (KDV ayrıysa KDV HARİÇ), sonra KDV — kullanıcı: "önce fiyat, sonraki sütunda KDV"
  const headers = ['Tarih', 'Belge No', 'Açıklama', showVat ? `Borç KDV hariç (${currency})` : `Borç (${currency})`, ...(showVat ? [`KDV (${currency})`] : []), ...(showDisc ? [`${autoT('İndirim')} (${discMode === 'percent' ? '%' : currency})`] : []), `Alacak (${currency})`, `Bakiye (${currency})`, 'B/A', ...(showStatus ? ['Durum'] : []), 'Ödeme Yöntemi'];

  const rows = lines.map(l => {
    const status = l.type === 'invoice' && l.status
      ? (INVOICE_STATUS_LABELS[l.status as InvoiceStatus] ?? l.status) : '';
    const method = l.type === 'payment' && l.method
      ? (PAYMENT_METHOD_LABELS[l.method as PaymentMethod] ?? l.method) : '';
    return [
      new Date(l.date + 'T00:00:00').toLocaleDateString(localeTag()),
      l.invoiceNo ?? '',
      `${l.type === 'invoice' ? 'Fatura' : l.type === 'discount' ? (l.docKind === 'DZ' ? autoT('Düzeltme') : autoT('İndirim')) : 'Tahsilat'} — ${l.description}${l.coverage ? ` · ${l.coverage}` : ''}`,
      fmtNum(showVat ? l.debit - (l.tax ?? 0) : l.debit),
      ...(showVat ? [l.type === 'invoice' ? fmtNum(l.tax ?? 0) : ''] : []),
      ...(showDisc ? [discCell(l)] : []),
      fmtNum(l.credit + dzCredit(l)),
      Math.abs(l.balance).toFixed(2),
      ba(l.balance),
      ...(showStatus ? [status] : []),
      method,
    ];
  });

  const vatCell = showVat ? [vat.tax.toFixed(2)] : [];
  const blankVat = showVat ? [''] : [];
  // İndirim sütunu toplamı: yalnız ekstre indirimleri (bakiyeyi düşürenler)
  const discSum = discountTotal(lines);
  const discTotalCell = showDisc ? [discSum > 0 ? (-discSum).toFixed(2) : ''] : [];
  const blankDisc = showDisc ? [''] : [];
  const tail = showStatus ? ['', ''] : [''];
  const totalRow = ['', '', 'TOPLAM', (showVat ? totalDebit - vat.tax : totalDebit).toFixed(2), ...vatCell, ...discTotalCell, totalCredit.toFixed(2), Math.abs(closing).toFixed(2), ba(closing), ...tail];
  const openingRow = ['', '', 'Devreden bakiye', '', ...blankVat, ...blankDisc, '', Math.abs(opening).toFixed(2), ba(opening), ...tail];
  const vatRows = showVat && vat.total > 0 ? [
    [''],
    ['', '', 'Hizmet bedellerinin KDV dökümü'],
    ['', '', 'Ara Toplam (KDV hariç)', vat.net.toFixed(2)],
    ['', '', 'KDV Toplamı', vat.tax.toFixed(2)],
    ['', '', 'Genel Toplam (KDV dahil)', vat.total.toFixed(2)],
  ] : [];
  const all = [...titleRows, headers, ...(Math.abs(opening) > 0.004 ? [openingRow] : []), ...rows, totalRow, ...vatRows];
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
export function ClinicStatementScreen({ clinicId: clinicIdProp, selfView = false, openPdf = null, onOpenPdfHandled }: {
  /** Hub içine gömülünce (klinik/hekim kendi ekstresi) prop'la gelir; yoksa route param. */
  clinicId?: string;
  /** Klinik/hekim kendi ekstresini görüyor: lab'a özel bölümler (faturalanmamış işler,
      geri butonu) gizlenir; veri çekimi RLS'e takılmayacak şekilde kısılır. */
  selfView?: boolean;
  /** Dışarıdan PDF penceresini bu kapsamla aç (ön ekstre sayfasından yönlendirme). */
  openPdf?: PdfMode | null;
  onOpenPdfHandled?: () => void;
} = {}) {
  const U = useInkUI();
  const STATUS_CHIP = statusChip(U);
  useBaseCurrency();
  const router = useRouter();
  const params = useLocalSearchParams<{ clinicId: string }>();
  const clinicId = clinicIdProp ?? params.clinicId;
  // Bu ekran hem /(lab)/statement hem /(admin)/statement altında mount ediliyor.
  // Grup adını sabitlemek kullanıcıyı diğer panele atar → FinanceHubScreen ile
  // aynı desen: aktif grubu segment'ten oku.
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  // Hub içinde (Finans → Sağlık Kurumları → Ekstre) üst güvenli alanı ve sayfa
  // başlığını KAP veriyor; burada bir daha `insets.top` eklemek başlıkla içerik
  // arasında ~75px boş şerit bırakıyordu (kullanıcı cihazda gördü).
  const isEmbedded = useContext(HubContext);
  // Mobilde alt sınır yüzen navbar'ın GERÇEK geometrisinden gelir — 48px sabit
  // dolgu son hareketleri barın altında bırakıyordu.
  const scrollPadBottom = isDesktop ? 48 : navBarMetrics(insets.bottom).clearance + 16;

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
  /** Genel ekstre PDF seçenek penceresi (ön ekstre PDF'iyle aynı tarz). */
  const [pdfOpen, setPdfOpen] = useState(false);
  /** 'statement' yalnız ekstre · 'with' ekstre + onay bekleyenler · 'pending' yalnız onay bekleyenler (ön ekstre PDF'i). */
  // Son seçilen kapsam cihazda hatırlanır ("PDF"/"Yazdır" doğrudan çalışır, pencere açmaz).
  const [pdfMode, setPdfModeRaw] = useState<PdfMode>(() => readPrintPref<PdfMode>('statementMode', ['statement', 'with', 'pending']) ?? 'with');
  const setPdfMode = useCallback((m: PdfMode) => { setPdfModeRaw(m); writePrintPref('statementMode', m); }, []);
  useEffect(() => {
    if (!openPdf) return;
    setPdfMode(openPdf); setPdfOpen(true); onOpenPdfHandled?.();
  }, [openPdf, setPdfMode, onOpenPdfHandled]);
  const preFmtSetting = usePreStatementPdfFormat();
  const [preFmt, setPreFmtRaw] = useState<'ozet' | 'ayrintili' | null>(() => readPrintPref<'ozet' | 'ayrintili'>('preStatementFormat', ['ozet', 'ayrintili']));
  const setPreFmt = useCallback((f: 'ozet' | 'ayrintili') => { setPreFmtRaw(f); writePrintPref('preStatementFormat', f); }, []);
  const [preDoctor, setPreDoctor] = useState<string | null>(null);
  // Liste ayarı — kullanıcıya özel, cihazda (ekran + PDF + Excel)
  const [prefsOpen, setPrefsOpen] = useState(false);
  const { prefs, setPref, reset: resetPrefs } = useStatementPrefs();

  // Seçili para birimi — ekstre tek dövizde gösterilir (katı per-currency).
  // Başlangıç değeri geçicidir; aşağıdaki "akıllı varsayılan" efekti veri
  // gelince doğru dövizi seçer. Kullanıcı sekmeye bastıktan sonra bir daha
  // müdahale edilmez (ccyPinned).
  const [selectedCcy, setSelectedCcy] = useState<string>('TRY');
  // Kliniğin görünen bakiyesi (tek tanım: kesilmiş fatura − avans, vadesi geçmiş avans düşülmüş),
  // döviz başına — KPI'lar bu satırdan; liste/defter kapanışıyla aynı kaynak (20261026100000).
  const [ccyBalance, setCcyBalance] = useState<{ currency: string; balance: number; overdue_net: number }[]>([]);
  const labToday = useLabToday();
  const [ccyPinned, setCcyPinned] = useState(false);
  /** Kliniğin fiyat listesi para birimi — varsayılan sekmenin ilk tercihi. */
  const [priceCcy, setPriceCcy] = useState<string | null>(null);
  /** Fatura-bağımsız toplu tahsilat penceresi. */
  const [receiptOpen, setReceiptOpen] = useState(false);
  /** Faturaya bağlanmamış tahsilat fişleri — ekstrede kendi satırları olur. */
  const [receipts, setReceipts] = useState<ClinicReceipt[]>([]);
  /** Düzenlenen fiş — null ise pencere "yeni tahsilat" modunda açılır. */
  const [editingReceipt, setEditingReceipt] = useState<ClinicReceipt | null>(null);
  /** Ekstre indirimleri (clinic_statement_discounts) — kendi satırları olur, bakiyeyi düşürür. */
  const [discounts, setDiscounts] = useState<StatementDiscount[]>([]);
  /** "İndirim ekle" penceresi (yalnız lab). */
  const [discountOpen, setDiscountOpen] = useState(false);
  /** İndirim silme onayı — hata pencerede satır içi. */
  const [discConfirm, setDiscConfirm] = useState<ConfirmState | null>(null);
  const deletingRef = useRef(false);
  /** Tahsilat sonrası ekstreyi yeniden çekmek için sayaç. */
  const [reloadTick, setReloadTick] = useState(0);
  // Hangi klinik için veri yüklendi — aynı kliniğin TAZELEMESİ sessiz olsun (bkz. aşağı).
  const loadedFor = useRef<string | null>(null);
  // Ön ekstre (lab tarafı) — ayar kapalıyken hiçbir şey çizmez; klinik kendi ekranını kullanır.
  // Klinik/hekim kendi ekstresinde de çekilir: PDF'teki "Onay bekleyenler" / "Tamamı" kapsamı için (bölüm çizilmez).
  const preSt = useLabPreStatement(clinicId, reloadTick, true);
  // Ayar açıkken taslaklar YALNIZ ön ekstre bölümünde görünür ("Faturalanmamış İşler"de değil).
  // RPC sonucu esas; gelmeden önce lab ayarı (store) ipucu. Kapalıyken bugünkü davranış.
  const approvalHint = useInvoiceApprovalEnabled();
  const draftsInPreStatement = !selfView && (preSt.data ? preSt.data.enabled === true : approvalHint);

  // Faturaya gidip (router.push → kardeş sekme) "Kesildi" yapıp geri dönünce bu ekran
  // hiç kapanmamış oluyor — mobil <Tabs> pasif ekranı mount tutar. Odaklanmada
  // tazelenmezse kesilmiş fatura "Faturalanmamış İşler"de "Taslak" olarak kalıyordu.
  // İlk odak = ilk mount; o yüklemeyi aşağıdaki effect zaten yapıyor → atla.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    setReloadTick(t => t + 1);
  }, []));
  const heroInk = useWhiteHeroInk();

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    // İlk yükleme / klinik değişimi → tam ekran yükleyici. Aynı kliniğin tazelemesi
    // (odaklanma, işlem sonrası) SESSİZ: `loading` ekranı yükleyiciyle değiştirdiği
    // için her geri dönüşte sayfa kararıp kaydırma başa atıyordu.
    if (loadedFor.current !== clinicId) setLoading(true);

    Promise.all([
      fetchInvoicesForClinic(clinicId),
      fetchClinicBalance(clinicId),
      // Teslim edilmiş ama faturaya bağlanmamış işler — lab tarafı (faturalama).
      // Klinik/hekim kendi ekstresinde bu bölüm gizli → RLS'e takılmamak için hiç çekme.
      selfView ? Promise.resolve({ data: [] as UnbilledWorkOrder[] }) : fetchUnbilledWorkOrders(clinicId),
      // Varsayılan sekmenin ilk tercihi; başarısız olursa null döner ve
      // aşağıdaki sıralama bir sonraki ölçüte düşer.
      fetchClinicPriceCurrency(clinicId).catch(() => null),
      fetchClinicReceipts(clinicId).catch(() => [] as ClinicReceipt[]),
      supabase.from('v_clinic_balance_ccy').select('currency, balance, overdue_net').eq('clinic_id', clinicId),
      fetchStatementDiscounts(clinicId).catch(() => ({ data: [] as StatementDiscount[], error: null })),
    ]).then(([invRes, balRes, unbRes, pCcy, rcpts, ccyRes, discRes]) => {
      if (cancelled) return;
      setInvoices((invRes.data ?? []) as Invoice[]);
      setClinicInfo((balRes.data ?? null) as ClinicBalance | null);
      setUnbilled((unbRes.data ?? []) as UnbilledWorkOrder[]);
      setPriceCcy((pCcy as string | null) ?? null);
      setReceipts((rcpts as ClinicReceipt[]) ?? []);
      setDiscounts(discRes?.data ?? []);
      setCcyBalance((((ccyRes as any)?.data ?? []) as any[]).map(r => ({ currency: String(r.currency ?? 'TRY'), balance: Number(r.balance) || 0, overdue_net: Number(r.overdue_net) || 0 })));
      setLoading(false);
      loadedFor.current = clinicId;
    });

    return () => { cancelled = true; };
  }, [clinicId, reloadTick]);

  // Klinik değişince seçim yeniden hesaplansın.
  useEffect(() => { setCcyPinned(false); }, [clinicId]);

  // Sayfa basligi BOLUM adidir, kayit adi degil: klinik adi hem en ustte hem
  // satir basliginda hem hero'da ucurdu. Kimlik hero'da, konum en ustte.
  useEffect(() => {
    setTitle('Finans', 'Hesap Ekstresi');
    return clear;
  }, []);

  // Faturalardaki para birimleri (katı per-currency — ekstre tek dövizde)
  // + faturalanmamış işlerin para birimleri: aksi halde yalnız EUR işi olan
  //   ama hiç EUR faturası olmayan klinikte o iş hiçbir sekmede görünmezdi.
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) if (i.status !== 'iptal') set.add(i.currency || 'TRY');
    for (const o of unbilled) for (const c of Object.keys(unbilledTotals(o))) set.add(c);
    const order = ['TRY', 'EUR', 'USD', 'GBP', 'IRT'];
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

  /** Para birimi başına taslak (henüz kesilmemiş / onay bekleyen) fatura sayısı —
   *  rozet yalnız kesilmişi sayınca taslağı olan döviz "0" görünüp atlanıyordu. */
  const draftCountByCcy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invoices) {
      if (i.status !== 'taslak') continue;
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
    () => (draftsInPreStatement ? [] : ccyInvoices.filter(i => i.status === 'taslak')),
    [ccyInvoices, draftsInPreStatement],
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
      title: inv.work_order?.patient_name || inv.doctor?.full_name || 'Taslak hizmet bedeli',
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
  const [pendTab, setPendTab] = useState<'onay' | 'faturasiz' | null>(null);
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
        toast.error((error as any)?.message ?? 'Hizmet bedeli taslağı oluşturulamadı');
        return;
      }
      router.push(`/${panelBase}/invoice/${(data as Invoice).id}` as any);
    } catch (e: any) {
      toast.error(e?.message ?? 'Hizmet bedeli taslağı oluşturulamadı');
    } finally {
      setOpeningKey(null);
    }
  }, [openingKey, panelBase, router]);

  // Ekstre defter satırından fatura detayına git (fatura & tahsilat satırı ilgili faturaya)
  const openLine = useCallback((line: StatementLine) => {
    // Ekstre indirimi satırı: lab'da silme onayı; klinik/hekim kendi ekstresinde etkisiz.
    if (line.id?.startsWith('disc-')) {
      if (selfView) return;
      const id = line.id.slice('disc-'.length);
      // Düzeltme belgesi silinemez (DZ_DELETE_LOCKED): satır bağlı faturayı açar.
      if (line.docKind === 'DZ') {
        const invId = discounts.find(d => d.id === id)?.invoice_id;
        if (invId) router.push(`/${panelBase}/invoice/${invId}` as any);
        return;
      }
      const ask = (error: string | null): ConfirmState => ({
        title: autoT('İndirimi sil'),
        highlight: line.invoiceNo,
        message: autoT('Bu indirim silinsin mi? Kliniğin bakiyesi indirim kadar artar ve hizmet bedellerindeki indirim payları geri alınır.'),
        label: autoT('Evet, sil'),
        cancelLabel: autoT('Vazgeç'),
        variant: 'danger',
        error,
        onConfirm: async () => {
          if (deletingRef.current) return;
          deletingRef.current = true;
          const res = await deleteStatementDiscount(id);
          deletingRef.current = false;
          if (res.error) { setDiscConfirm(ask(autoT('İndirim silinemedi.'))); return; }
          setDiscConfirm(null);
          toast.success(autoT('İndirim silindi'));
          setReloadTick(t => t + 1);
        },
      });
      setDiscConfirm(ask(null));
      return;
    }
    // Fiş satırının faturası yok → tıklayınca kendi düzenleme penceresi açılır.
    if (line.id?.startsWith('rcpt-')) {
      const r = receipts.find(x => `rcpt-${x.id}` === line.id);
      if (r) { setEditingReceipt(r); setReceiptOpen(true); }
      return;
    }
    if (line.id) router.push(`/${panelBase}/invoice/${line.id}` as any);
  }, [panelBase, router, receipts, selfView, discounts]);

  // Build statement (orijinal tutarda) — yalnız seçili dövizin faturaları.
  //
  // Cari hesap mantığı (kullanıcı): faturalar borç, tahsilat fişi TEK alacak
  // satırı olarak toplam borçtan düşer; faturalara dağıtım arka planda kalır.
  // Fişin bu dövizdeki alacağı = bu dövizdeki faturalara dağıtılan tutar
  // (faturanın kendi parasıyla) + baz döviz sekmesinde dağıtılmamış alacak
  // (lib/receiptStatement). Eskiden fiş yalnız baz sekmesinde toplam bazıyla
  // listeleniyordu → TL faturaları kapatan TL ödeme TL ekstresinde hiç görünmüyordu.
  const allLines = useMemo(() => {
    const invLines = buildStatementLines(postedInvoices, { original: true });
    const rcptLines: StatementLine[] = receipts
      // Fiş tek satır: dağıtılan kısmın fatura-başı ödeme satırları
      // buildStatementLines'ta gizleniyor, o yüzden çifte sayım yok.
      .map(r => ({ ...r, credit_base: receiptCreditForCurrency(r, postedInvoices, selectedCcy) }))
      .filter(r => r.credit_base > 0.004)
      .map(r => ({
        id: `rcpt-${r.id}`,
        date: r.receipt_date,
        type: 'payment' as const,
        description: autoT('Tahsilat'),
        method: r.payment_method,
        debit: 0,
        credit: r.credit_base,
        balance: 0,
        // Fişin hangi paralardan oluştuğu alt satırda görünsün.
        receiptNo: receiptVoucherNo(r.id),
        // Kullanıcı: tahsilat açıklamasında yalnız tür + nereye yatırıldığı (tür satırda ayrıca yazıyor)
        detail: receiptDepositLabel(r, autoT),
        coverage: formatReceiptCoverage(receiptCoverage(r, postedInvoices, selectedCcy), {
          tr: autoT,
          money: (n) => fmtMoney(n, selectedCcy),
          month: (d) => { const m = Number(d.slice(5, 7)); return m >= 1 && m <= 12 ? autoT(TR_MONTHS[m - 1]) : ''; },
        }),
      }));
    // Ekstre indirimleri (yalnız seçili döviz) — yürüyen bakiyeden ÖNCE birleşir.
    // DZ satırı: "Düzeltme belgesi · <fatura no> · <gerekçe>" (fatura bulunamazsa no atlanır).
    const invNoById = new Map(invoices.map(i => [i.id, i.invoice_number] as const));
    const dzInvById = new Map(discounts.map(d => [d.id, d.invoice_id] as const));
    // Faturası iptal DZ "boş": yalnız başka faturalara uygulanmış payı kadar sayılır, yoksa satır yok
    // (SQL v_statement_discount_effective ile aynı kural → ekran, PDF, Excel ve bakiye aynı).
    const discLines = discountStatementLines(withEffectiveDiscounts(discounts, invoices), selectedCcy).map(l => {
      if (l.docKind !== 'DZ') return l;
      const invId = dzInvById.get((l.id ?? '').slice('disc-'.length));
      const invNo = invId ? invNoById.get(invId) : undefined;
      return { ...l, description: [autoT('Düzeltme belgesi'), invNo, l.description].filter(Boolean).join(' · ') };
    });
    if (rcptLines.length === 0 && discLines.length === 0) return invLines;
    // Tarihe göre birleştir ve yürüyen bakiyeyi yeniden hesapla. Sıralama kararlı:
    // aynı gün içinde fatura/tahsilat sırası olduğu gibi kalır, indirim o günün sonuna düşer
    // (dönemin son gününe tarihli indirim o günün faturalarından sonra görünür).
    const rank = (l: StatementLine) => (l.type === 'discount' ? 1 : 0);
    const merged = [...invLines, ...rcptLines, ...discLines]
      .sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b));
    let run = 0;
    return merged.map(l => { run += lineDelta(l); return { ...l, balance: run }; });
  }, [postedInvoices, invoices, receipts, discounts, selectedCcy]);

  // KPI'lar seçili dövizde. Kesilen/tahsil edilen kesilmiş faturalardan; BAKİYE ve VADESİ GEÇMİŞ
  // kliniğin görünen bakiyesinden (avans düşülmüş — klinik ekranı, Cari listesi ve hatırlatmayla aynı).
  const kpis = useMemo(() => {
    // paid_amount ekstre indirimi paylarını da içerir (borcu kapatır). "Tahsil edilen"
    // gerçek tahsilattır: indirim payları (statement_discount_id dolu ödemeler) düşülür.
    let billed = 0, paid = 0, overdue = 0, discPaid = 0;
    for (const i of postedInvoices) {
      if (!isPostedInvoice(i)) continue;
      const t = Number(i.total || 0), pd = Number(i.paid_amount || 0);
      billed += t; paid += pd;
      for (const p of i.payments ?? []) if (p.statement_discount_id) discPaid += Number(p.amount) || 0;
      if (isInvoiceOverdue(i, labToday)) overdue += t - pd;
    }
    const collected = paid - discPaid;
    const row = ccyBalance.find(r => r.currency === selectedCcy);
    return row
      ? { billed, paid: collected, balance: row.balance, overdue: row.overdue_net }
      : { billed, paid: collected, balance: billed - paid, overdue };
  }, [postedInvoices, ccyBalance, selectedCcy, labToday]);

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

  /** Filtre düğmesindeki sayaç — kaç ölçüt etkin. */
  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

  // Ekstre (PDF/Excel) dönem açılış/kapanışı — tür/arama filtresinden BAĞIMSIZ.
  const periodTotals = useMemo(
    () => statementPeriodTotals(allLines, dateFrom || undefined, dateTo || undefined),
    [allLines, dateFrom, dateTo],
  );

  // Totals for filtered
  const totals = useMemo(() => {
    const debit = filtered.reduce((s, l) => s + l.debit, 0);
    // DZ tutarı Alacak sütununda görünür → alacak toplamına girer (borç − alacak − indirimler = bakiye)
    const credit = filtered.reduce((s, l) => s + l.credit + dzCredit(l), 0);
    return { debit, credit, balance: filtered.reduce((s, l) => s + lineDelta(l), 0) };
  }, [filtered]);
  // Faturaların KDV dökümü — KDV hariç + KDV = genel toplam (lib/statementVat)
  const vatSummary = useMemo(() => statementVatSummary(filtered), [filtered]);
  // Liste ayarı (kullanıcıya özel): görünür satırlar — tutar/bakiye `filtered`'dan,
  // kapalı alanlar boşaltılır, tahsilat kapalıysa satırları çıkar (lib/statementPrefs)
  const shown = useMemo(() => applyStatementPrefs(filtered, prefs), [filtered, prefs]);
  const showVat = prefs.vat && vatSummary.total > 0;
  // İndirim sütunu: görüntülenen dönemde en az bir indirim varsa. Klinik/hekim kendi
  // ekstresinde liste ayarı yok → hep tutar (spec §8).
  const showDiscount = hasAnyDiscount(filtered);
  const discMode: DiscountMode = selfView ? 'amount' : prefs.discountMode;
  const discTotal = useMemo(() => discountTotal(filtered), [filtered]);
  // "İndirim ekle" penceresinin önerilen dönemi: ekranda seçili tarih aralığı; yoksa lab gününün ayı.
  const discDefault = useMemo(() => {
    const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const f = ok(dateFrom) ? dateFrom : '';
    const t = ok(dateTo) ? dateTo : '';
    if (f && t) return { from: f, to: t };
    if (f) return { from: f, to: monthEndOf(f) };
    if (t) return { from: t.slice(0, 8) + '01', to: t };
    return { from: labToday.slice(0, 8) + '01', to: monthEndOf(labToday) };
  }, [dateFrom, dateTo, labToday]);

  // ── Print / PDF ────────────────────────────────────────
  /** PDF'in sonuna eklenecek kesinleşmemiş kalemler (seçili dövizde): ön ekstre + taslak/faturasız işler. */
  const pdfPendingRows = useMemo<PendingAppendixRow[]>(() => {
    const out: PendingAppendixRow[] = [];
    if (preSt.data?.enabled) {
      for (const inv of preSt.data.invoices ?? []) {
        if ((inv.currency || 'TRY') !== selectedCcy) continue;
        const items = inv.items ?? [];
        const first = items[0];
        const desc = [first?.description, first ? patientLabel(first) : null, first?.order_no].filter(Boolean).join(' · ');
        out.push({
          ref: inv.invoice_number ?? '',
          date: inv.issue_date ?? inv.created_at,
          description: items.length > 1 ? `${desc} (+${items.length - 1} ${autoT('kalem')})` : desc,
          // Ayrıntılı PDF'te kalem kalem (özet PDF'te dışa aktarımda atılır)
          items: items.map(it => ({
            text: it.description || autoT('Kalem'),
            sub: [`${Number(it.quantity) || 0} × ${fmtMoney(Number(it.unit_price) || 0, selectedCcy)}`, patientLabel(it), it.order_no, it.doctor_name].filter(Boolean).join(' · '),
          })),
          status: 'awaiting',
          amount: Number(inv.total) || 0,
        });
      }
    }
    // Faturasız işler yalnız lab'da (klinik kendi ekstresinde görmez)
    if (!selfView) for (const r of pendingRows) {
      out.push({ ref: r.ref, date: r.date, description: [r.title, r.subtitle].filter(Boolean).join(' · '), status: 'draft', amount: r.amount });
    }
    return out;
  }, [selfView, preSt.data, selectedCcy, pendingRows]);

  const handlePrint = useCallback(async (withPending: boolean = false, action: 'pdf' | 'print' = 'print', detail: boolean = false) => {
    setExporting(true);
    try {
      const lab = selfView ? await fetchSelfViewLetterhead() : await fetchLabLetterhead();
      // Ayrıntılı: her faturanın altına iş kalemleri (tutar/bakiye fatura satırında kalır)
      let lines = shown;
      if (detail) {
        const ids = shown.filter(l => l.type === 'invoice' && l.id).map(l => l.id as string);
        const det = ids.length ? await fetchInvoiceItemDetails(ids) : [];
        const byInv = new Map<string, { text: string; sub?: string | null }[]>();
        for (const it of det) {
          const wo = it.order_item?.work_order;
          const arr = byInv.get(it.invoice_id) ?? [];
          arr.push({
            text: it.description || autoT('Kalem'),
            sub: [`${Number(it.quantity) || 0} × ${fmtMoney(Number(it.unit_price) || 0, selectedCcy)}`, wo?.patient_name, wo?.order_number].filter(Boolean).join(' · '),
          });
          byInv.set(it.invoice_id, arr);
        }
        lines = shown.map(l => (l.type === 'invoice' && l.id && byInv.has(l.id) ? { ...l, items: byInv.get(l.id) } : l));
      }
      const appendixRows = detail ? pdfPendingRows : pdfPendingRows.map(({ items: _i, ...rest }) => rest);
      const baseHtml = buildStatementHtml(
        clinicInfo?.clinic_name ?? 'Klinik',
        lines,
        lab,
        { from: dateFrom || undefined, to: dateTo || undefined },
        selectedCcy,
        periodTotals,
        // Liste ayarı: KDV kapalıysa sütun/döküm yok; tahsilat gizliyse de toplamlar tüm hareketten
        // paper: sekme/araç çubuğu yok — doğrudan dosya ya da doğrudan yazdırma
        { vat: prefs.vat, sums: { debit: totals.debit, credit: totals.credit }, discountMode: discMode, paper: true },
      );
      // Onay bekleyenler: kesinleşmiş ekstrenin ALTINA ayrı, "bakiyeye dahil değil" etiketli bölüm.
      const html = withPending
        ? appendBeforeBody(baseHtml, buildPendingAppendixHtml(appendixRows, selectedCcy, kpis.balance))
        : baseHtml;

      const safeName = (clinicInfo?.clinic_name ?? 'Klinik').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Klinik';
      const docName = `Hesap-Ekstresi${detail ? '-Ayrintili' : ''}-${safeName}-${selectedCcy}`;
      // Tek adım: PDF → dosya iner; Yazdır → yalnız sistem yazdırma penceresi.
      if (action === 'pdf') await downloadHtmlPdf(html, `${docName}.pdf`);
      else await printHtmlDirect(html, docName);
    } catch (e: any) {
      toast.error(e?.message ?? 'Dışa aktarma hatası');
    } finally {
      setExporting(false);
    }
  }, [clinicInfo, shown, dateFrom, dateTo, selectedCcy, selfView, periodTotals, prefs.vat, totals, discMode, pdfPendingRows, kpis.balance]);

  /** Yalnız onay bekleyenler: ön ekstre PDF'i (özet/ayrıntılı, hekim süzgeci), genel ekstreyle aynı açılış. */
  const preStatementCount = preSt.data?.enabled
    ? (preSt.data.invoices ?? []).filter(i => (i.currency || 'TRY') === selectedCcy).length : 0;
  const preDoctors = useMemo(() => doctorNamesOf(preSt.data), [preSt.data]);
  const handlePendingPdf = useCallback((action: 'pdf' | 'print' = 'pdf') => {
    const data = preSt.data;
    if (!data) return;
    const fmt = preFmt ?? preFmtSetting;
    const scoped = preDoctor ? scopeToDoctor(data, preDoctor) : data;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const safe = (x: string) => x.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Klinik';
    const name = clinicInfo?.clinic_name ?? 'Klinik';
    const fileName = `${fmt === 'ayrintili' ? 'On-Ekstre-Ayrintili' : 'On-Ekstre'}-${safe(name)}${preDoctor ? `-${safe(preDoctor)}` : ''}-${selectedCcy}-${ym}.pdf`;
    // await YOK: masaüstünde sekme tıklama jesti içinde açılmalı.
    const html = (async () => {
      const lab = await fetchLabLetterhead();
      // Sekme yok (doğrudan dosya/yazdırma) → kâğıt görünümü.
      const paper = true;
      const input = { clinicName: name, lab, data: scoped, currency: selectedCcy, paper };
      return fmt === 'ayrintili' ? buildPreStatementDetailHtml(input) : buildPreStatementSummaryHtml(input);
    })();
    setExporting(true);
    (action === 'pdf' ? downloadHtmlPdf(html, fileName) : printHtmlDirect(html, fileName.replace(/\.pdf$/i, '')))
      .catch((e: any) => {
        const m = String(e?.message ?? e);
        toast.error(m === 'POPUP_BLOCKED' ? autoT('Açılır pencere engellendi — bu siteye izin verip tekrar deneyin.') : `${action === 'pdf' ? autoT('PDF oluşturulamadı') : autoT('Yazdırılamadı')}: ${m}`);
      })
      .finally(() => setExporting(false));
  }, [preSt.data, preFmt, preFmtSetting, preDoctor, clinicInfo, selectedCcy]);

  /** PDF / Yazdır: kapsam menüden (Ön / Onaylanmış / Tam ekstre) ya da seçenek penceresinden gelir. */
  const runStatementOutput = (action: 'pdf' | 'print', mode: PdfMode = pdfMode) => {
    if (mode === 'pending' && preStatementCount > 0) { handlePendingPdf(action); return; }
    const detail = (preFmt ?? preFmtSetting) === 'ayrintili';
    void handlePrint(mode !== 'statement' && pdfPendingRows.length > 0, action, detail);
  };
  const pickScope = (action: 'pdf' | 'print') => (s: StatementScope) => {
    const m = scopeToMode(s);
    setPdfMode(m);
    runStatementOutput(action, m);
  };

  // ── Excel ──────────────────────────────────────────────
  /** Tahsilat makbuzu (PDF) — ekstre yazdırmayla aynı yol. */
  const printVoucher = useCallback(async (r: ClinicReceipt) => {
    try {
      const lab = selfView ? await fetchSelfViewLetterhead() : await fetchLabLetterhead();
      const html = buildReceiptVoucherHtml(clinicInfo?.clinic_name ?? 'Klinik', {
        id: r.id, receipt_date: r.receipt_date, payment_method: r.payment_method,
        reference_no: r.reference_no, notes: r.notes,
        base_currency: r.base_currency, total_base: Number(r.total_base) || 0,
        lines: (r.lines ?? []).map(l => ({
          currency: l.currency, amount: Number(l.amount) || 0,
          rate: Number(l.rate) || 0, amount_base: Number(l.amount_base) || 0,
        })),
      }, lab);
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (!w) { toast.error(autoT('Pop-up engellendi')); return; }
        w.document.write(html); w.document.close();
        try { w.focus(); } catch {}
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Tahsilat-Makbuzu-${r.id.split('-')[0]}.pdf`,
            UTI: 'com.adobe.pdf',
          });
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? autoT('Makbuz oluşturulamadı'));
    }
  }, [clinicInfo?.clinic_name, selfView]);

  const handleExcel = useCallback(() => {
    if (Platform.OS !== 'web') {
      toast.info('Excel dışa aktarma web üzerinde desteklenir');
      return;
    }
    exportExcel(clinicInfo?.clinic_name ?? 'Sağlık Kurumu', shown, dateFrom || undefined, dateTo || undefined, selectedCcy, periodTotals,
      { vat: prefs.vat, status: prefs.status, sums: { debit: totals.debit, credit: totals.credit }, vatSource: filtered,
        ...(hasAnyDiscount(shown) ? { discount: discMode } : {}) });
    toast.success('Excel indirildi');
  }, [clinicInfo, shown, filtered, dateFrom, dateTo, selectedCcy, periodTotals, prefs.vat, prefs.status, totals, discMode]);

  const clinicName = clinicInfo?.clinic_name ?? '';
  const totalBilled = kpis.billed;
  const totalPaid = kpis.paid;
  const balance = kpis.balance;
  const overdue = kpis.overdue;
  const pct = totalBilled > 0 ? Math.min(100, (totalPaid / totalBilled) * 100) : 0;

  // Hero dökümü (lab tarafı): kesinleşmiş bakiye + klinik onayı bekleyen ön ekstre +
  // taslak/faturasız işler. Yalnız EKRAN özeti — ekstre tablosu, PDF ve Excel yine
  // yalnız kesinleşmiş tutarla yürür.
  const psRow = !selfView && preSt.data?.enabled
    ? (preSt.data.summary ?? []).find(r => r.currency === selectedCcy)
    : undefined;
  const awaitingTotal = Number(psRow?.pending) || 0;
  const awaitingCount = !selfView && preSt.data?.enabled
    ? (preSt.data.invoices ?? []).filter(i => (i.currency || 'TRY') === selectedCcy).length
    : 0;
  const draftTotal = selfView ? 0 : pendingTotal;
  const draftCount = selfView ? 0 : pendingRows.length;
  // Kesinleşmemiş kalemler kartı: sekme seçilmediyse dolu olan sekme açılır.
  const preOn = preSt.data?.enabled === true;
  const pendTabEff: 'onay' | 'faturasiz' = !preOn ? 'faturasiz'
    : (pendTab ?? (awaitingCount > 0 || pendingRows.length === 0 ? 'onay' : 'faturasiz'));
  const openFinal = Math.max(0, balance);
  const grandTotal = balance + awaitingTotal + draftTotal;
  const barTotal = Math.max(0, totalPaid) + openFinal + awaitingTotal + draftTotal;
  const barPct = (n: number) => (barTotal > 0 ? (Math.max(0, n) / barTotal) * 100 : 0);
  const collectPct = barTotal > 0 ? (Math.max(0, totalPaid) / barTotal) * 100 : 0;

  if (loading) {
    return <CenteredLoader color={U.ink[400]} label="Ekstre yükleniyor..." />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Ayrı başlık şeridi YOK: içinde yalnız geri düğmesi kalınca boş bir
          bant + çizgi olarak duruyordu. Geri düğmesi hero'nun içinde. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16, paddingBottom: scrollPadBottom, gap: 16,
          // Baslik seridi kaldirildi; ust centik payi artik burada.
          paddingTop: (isDesktop || isEmbedded) ? 16 : 16 + insets.top,
        }}
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
              const nDraft = selfView ? 0 : (draftCountByCcy[cur] ?? 0);
              return (
                <Pressable
                  key={cur}
                  onPress={() => { setCcyPinned(true); setSelectedCcy(cur); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                    borderColor: active ? U.ink[900] : U.plainBtn.border,
                    backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
                    opacity: !active && n === 0 && nDraft === 0 ? 0.55 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? U.onDarkPill : U.ink[500] }}>{sym}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? U.onDarkPill : U.ink[700] }}>{cur}</Text>
                  <View style={{
                    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999,
                    backgroundColor: active ? (U.isDark ? 'rgba(20,19,18,0.22)' : 'rgba(255,255,255,0.22)') : U.ink[100],
                  }}>
                    <Text style={{
                      fontSize: 10, fontWeight: '700', textAlign: 'center',
                      color: active ? U.onDarkPill : (n === 0 ? U.ink[400] : U.ink[700]),
                    }}>{n}</Text>
                  </View>
                  {nDraft > 0 ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipTones.warning.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.warning.fg }}>
                        {`${nDraft} ${autoT('taslak')}`}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Ön ekstre: açık itiraz şeridi + üç rakam (yalnız ayar açıkken) ── */}
        {!selfView ? <LabPreStatementTop st={preSt} currency={selectedCcy} /> : null}

        {/* ── Beyaz hero — ozet kartlari icine alindi ──────────
            Ayri duran bes kutu, baslikla ekstre tablosu arasinda kopuk bir
            serit birakiyordu; hero ikisini tek blokta topluyor. */}
        <WhiteHero
          kicker={autoT('Hesap Ekstresi')}
          /* Geri, kicker'in solunda: ayri bir satirda dururken hero'dan kopuk
             bir kutu gibi duruyordu. */
          leading={!selfView ? (
            /* Ekstre, Finans hub'ının "Sağlık Kurumları" sekmesinin alt sayfası.
               safeBack mobilde Özet'e düşüyordu; hiyerarşik "yukarı" sabit. */
            <NavyBackButtonX
              onPress={() => router.replace(`/${panelBase}/finance?tab=clinic_balance` as any)}
              tooltip="Sağlık kurumu listesine dön"
            />
          ) : null}
          title={clinicName || autoT('Sağlık Kurumu')}
          description={selfView
            ? `${allLines.length} ${autoT('hareket')}${overdue > 0 ? ` · ${fmtMoney(overdue, selectedCcy)} ${autoT('gecikmiş')}` : ''}`
            : `${allLines.length} ${autoT('hareket')}${awaitingCount > 0 ? ` · ${awaitingCount} ${autoT('hizmet bedeli onay bekliyor')}` : ''}`}
          stats={selfView ? [
            { value: fmtMoney(balance, selectedCcy),     label: autoT('Bakiye') },
            { value: fmtMoney(totalBilled, selectedCcy), label: autoT('Kesinleşen') },
            { value: fmtMoney(totalPaid, selectedCcy),   label: autoT('Tahsil edilen') },
          ] : [
            { value: fmtMoney(grandTotal, selectedCcy), label: autoT('Toplam bakiye') },
          ]}
          actionsAlign="end"
          actions={<>
            {/* Fatura secmeden, cok dovizli toplu tahsilat. Klinik portalinda
                (selfView) gosterilmez: tahsilati lab girer. */}
            {!selfView && (
              <GlassTooltip title={autoT('Tahsilat ekle')}
                            text={autoT('Hizmet bedeli seçmeden, birden çok para biriminde tahsilat gir')}>
                <PillBtn icon={Wallet} label={isDesktop ? "Tahsilat ekle" : ""} onPress={() => { setEditingReceipt(null); setReceiptOpen(true); }} />
              </GlassTooltip>
            )}
            <StatementScopeMenu
              icon={Download} label={isDesktop ? 'PDF' : ''}
              tooltipTitle={autoT('PDF indir')} tooltipText={autoT('Ön ekstre, onaylanmış ekstre ya da tam ekstre')}
              busy={exporting} current={modeToScope(pdfMode)} preDisabled={preStatementCount === 0}
              onPick={pickScope('pdf')}
            />
            <StatementScopeMenu
              icon={Printer} label={isDesktop ? autoT('Yazdır') : ''}
              tooltipTitle={autoT('Yazdır')} tooltipText={autoT('Ön ekstre, onaylanmış ekstre ya da tam ekstre')}
              busy={exporting} current={modeToScope(pdfMode)} preDisabled={preStatementCount === 0}
              onPick={pickScope('print')}
            />
            <GlassTooltip title={autoT('PDF seçenekleri')} text={autoT('Ön ekstre / onaylanmış ekstre / tam ekstre; özet ya da ayrıntılı')}>
              <PillBtn icon={SlidersHorizontal} onPress={() => setPdfOpen(true)} busy={exporting} variant="ghost" />
            </GlassTooltip>
            {/* İkincil eylemler tek menüde: İndirim (lab), Liste ayarı, Excel (web) */}
            <HeroMoreMenu items={[
              ...(!selfView ? [{ key: 'disc', icon: Percent, label: autoT('İndirim ekle'), hint: autoT('Seçili dönemin hizmet bedellerine yüzde ya da tutar indirim uygula'), onPress: () => setDiscountOpen(true) }] : []),
              { key: 'prefs', icon: LayoutList, label: autoT('Liste ayarı'), hint: autoT('Ekstrede görünecek alanları seç; PDF ve Excel de buna göre çıkar'), onPress: () => setPrefsOpen(true) },
              ...(Platform.OS === 'web' ? [{ key: 'xls', icon: FileSpreadsheet, label: autoT('Excel'), hint: autoT('Ekstreyi Excel dosyası olarak indir'), onPress: handleExcel }] : []),
            ]} />
          </>}
        >
          {selfView ? (
            /* Tahsilat orani — hero icinde tam genislikte ray (klinik portalı: değişmedi) */
            <View style={{ marginTop: 16, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7,
                               textTransform: 'uppercase', color: heroInk.inkSoft }}>
                  Tahsilat oranı
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: heroInk.ink }}>{pct.toFixed(0)}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: heroInk.tileBg, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%` as any, height: '100%', borderRadius: 3, backgroundColor: '#2D9A6B' }} />
              </View>
            </View>
          ) : (
            <StatementHeroBreakdown
              currency={selectedCcy}
              billed={totalBilled}
              paid={totalPaid}
              openFinal={balance}
              awaiting={awaitingTotal}
              awaitingCount={awaitingCount}
              draft={draftTotal}
              draftCount={draftCount}
              barTotal={barTotal}
              segs={{ paid: barPct(totalPaid), open: barPct(openFinal), awaiting: barPct(awaitingTotal), draft: barPct(draftTotal) }}
              collectPct={collectPct}
              overdue={overdue}
            />
          )}
        </WhiteHero>

        {/* ── Kesinleşmemiş kalemler: onay bekleyen ön ekstre + faturalanmamış işler tek kartta.
            İkisi de bakiyeye henüz dahil değil. Ön ekstre ayarı kapalıysa yalnız faturasız işler. ── */}
        {!selfView && clinicId && (preOn || pendingRows.length > 0) ? (
          <View style={U.tableCard}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: U.hairline,
            }}>
              <FileClock size={17} color={U.chipTones.warning.fg} strokeWidth={1.8} />
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: U.ink[900] }}>{autoT('Kesinleşmemiş kalemler')}</Text>
                <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 1 }}>{autoT('Bakiyeye henüz dahil değil')}</Text>
              </View>
              {preOn ? (
                <View style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
                  {([
                    { key: 'onay' as const, label: `${autoT('Onayda')} · ${awaitingCount}` },
                    { key: 'faturasiz' as const, label: `${autoT('Hizmet bedeli bekleyen')} · ${pendingRows.length}` },
                  ]).map(opt => {
                    const active = pendTabEff === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setPendTab(opt.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={{
                          paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: active ? U.segActive : 'transparent',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* Onayda: ön ekstre bölümü (menü, bağlantı, onay modalleri) gömülü — DOM'da kalır */}
            <View style={pendTabEff === 'onay' ? undefined : { display: 'none' }}>
              <LabPreStatementSection
                embedded
                st={preSt}
                clinicId={clinicId}
                clinicName={clinicName}
                currency={selectedCcy}
                onApproved={() => setReloadTick(t => t + 1)}
              />
            </View>

            {/* Faturasız: teslim edilmiş, faturaya bağlanmamış siparişler (ayar kapalıyken taslaklar da) */}
            {pendTabEff === 'faturasiz' ? (
              pendingRows.length === 0 ? (
                <Text style={{ paddingHorizontal: 18, paddingVertical: 16, fontSize: 12.5, color: U.ink[400] }}>
                  {autoT('Hizmet bedeli bekleyen iş yok')}
                </Text>
              ) : (
                <>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: U.hairline,
                  }}>
                    <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.ink[500] }}>
                      {autoT('Hizmet bedelini görmek ve kesinleştirmek için satıra dokun')}
                    </Text>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>
                      <Text style={{ fontWeight: '700', color: U.chipTones.warning.fg }}>{fmtMoney(pendingTotal, selectedCcy)}</Text>
                      {` · ${pendingRows.length} ${autoT('iş')}`}
                    </Text>
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
                    borderBottomColor: U.hairline,
                    opacity: busy ? 0.55 : 1,
                    ...(Platform.OS === 'web' ? { cursor: busy ? 'default' : 'pointer' } as any : {}),
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>
                      {row.title}
                      <Text style={{ fontWeight: '500', color: U.ink[400] }}>{`  ·  ${row.ref}`}</Text>
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                      {row.subtitle || '—'}
                    </Text>
                  </View>

                  {row.kind === 'draft' && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: STATUS_CHIP.taslak.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: STATUS_CHIP.taslak.fg }}>Taslak</Text>
                    </View>
                  )}

                  {isDesktop && (
                    <Text style={{ fontSize: 11, color: U.ink[400], width: 110, textAlign: 'end' as any }}>
                      {fmtDateShort(row.date)}
                    </Text>
                  )}

                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900], textAlign: 'end' as any, minWidth: 78 }}>
                    {fmtMoney(row.amount, selectedCcy)}
                  </Text>
                  {busy
                    ? <ActivityIndicator size="small" color={U.ink[400]} />
                    : isRTL() ? <ChevronLeft size={15} color={U.ink[300]} strokeWidth={1.8} /> : <ChevronRight size={15} color={U.ink[300]} strokeWidth={1.8} />}
                </Pressable>
              );
            })}
                </>
              )
            ) : null}
          </View>
        ) : null}

        {/* ── Ekstre: sade başlık (arama + filtre kartın içinde) ── */}
        <View style={U.tableCard}>
          <View style={{
            paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: isDesktop ? -0.4 : -0.3, color: U.ink[900] }}>
                Ekstre
              </Text>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {shown.length} hareket
                {(dateFrom || dateTo) ? ` · ${dateFrom || '...'} → ${dateTo || '...'}` : ''}
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              {/* Search + toggle */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
                  height: 44, paddingHorizontal: 14, borderRadius: 9999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }}>
                  <Search size={15} color={U.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: U.ink[900], outline: 'none' as any }}
                    placeholder="Belge no veya açıklama ara..."
                    placeholderTextColor={U.ink[400]}
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                  />
                  {searchTerm.length > 0 && (
                    <Pressable onPress={() => setSearchTerm('')} style={{ cursor: 'pointer' as any }}>
                      <X size={14} color={U.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
                {/* Site geneli filtre dugmesi: SlidersHorizontal + "Filtrele" +
                    aktif filtre sayaci (Klinikler/Stok ile ayni kalip). */}
                <GlassTooltip title={autoT('Filtrele')} text={autoT('Hareketleri tarihe ve türe göre süz')}>
                  <Pressable
                    onPress={() => setShowFilters(v => !v)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 44, paddingHorizontal: 14, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: activeFilterCount > 0 ? U.ink[900] : U.plainBtn.border,
                      backgroundColor: activeFilterCount > 0 ? U.ink[50] : U.plainBtn.bg,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <SlidersHorizontal size={14} color={activeFilterCount > 0 ? U.ink[900] : U.ink[400]} strokeWidth={1.8} />
                    {isDesktop && (
                      <Text style={{ fontSize: 13, fontWeight: activeFilterCount > 0 ? '600' : '500',
                                     color: activeFilterCount > 0 ? U.ink[900] : U.ink[500] }}>
                        Filtrele{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                      </Text>
                    )}
                    {!isDesktop && activeFilterCount > 0 && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[900] }}>{activeFilterCount}</Text>
                    )}
                  </Pressable>
                </GlassTooltip>
              </View>

              {/* Extended filters */}
              {showFilters && (
                <View style={{
                  backgroundColor: U.surfaceSoft, borderRadius: 16, padding: 14, gap: 12,
                  flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'flex-end' : 'stretch',
                }}>
                  {/* Date from */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: U.ink[400] }}>
                      Başlangıç
                    </Text>
                    <TextInput
                      style={{
                        height: 44, paddingHorizontal: 14, borderRadius: 14,
                        borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                        fontSize: 14, color: U.ink[900], outline: 'none' as any,
                      }}
                      placeholder="YYYY-AA-GG"
                      placeholderTextColor={U.ink[300]}
                      value={dateFrom}
                      onChangeText={setDateFrom}
                    />
                  </View>

                  {/* Date to */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: U.ink[400] }}>
                      Bitiş
                    </Text>
                    <TextInput
                      style={{
                        height: 44, paddingHorizontal: 14, borderRadius: 14,
                        borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                        fontSize: 14, color: U.ink[900], outline: 'none' as any,
                      }}
                      placeholder="YYYY-AA-GG"
                      placeholderTextColor={U.ink[300]}
                      value={dateTo}
                      onChangeText={setDateTo}
                    />
                  </View>

                  {/* Type filter */}
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: U.ink[400] }}>
                      Tip
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: U.ink[100], borderRadius: 14 }}>
                      {([
                        { key: 'all', label: 'Tümü' },
                        { key: 'invoice', label: 'Hizmet bedeli' },
                        { key: 'payment', label: 'Tahsilat' },
                      ] as const).map(opt => {
                        const active = typeFilter === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => setTypeFilter(opt.key)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11,
                              backgroundColor: active ? U.segActive : 'transparent',
                              cursor: 'pointer' as any,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? U.ink[900] : U.ink[500] }}>
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
                        backgroundColor: U.ink[100], cursor: 'pointer' as any,
                        alignSelf: 'flex-end',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>Temizle</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={U.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: U.ink[400] }}>
              {searchTerm || dateFrom || dateTo || typeFilter !== 'all'
                ? 'Filtreye uygun hareket bulunamadı'
                : 'Henüz hareket yok'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop table ─────────────────────────────────── */
          <>
            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: U.surfaceSoft, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
              {[
                { label: 'TARİH',     flex: 1.2 },
                { label: 'TİP',       flex: 0.6 },
                { label: 'AÇIKLAMA',  flex: 3 },
                { label: 'DURUM',     flex: 1 },
                // Kullanıcı: "önce fiyat, sonraki sütunda KDV" — borç KDV hariç, KDV yanında
                { label: showVat ? 'BORÇ (KDV HARİÇ)' : 'BORÇ', flex: 1.2, align: 'end' as const },
                ...(showVat ? [{ label: 'KDV', flex: 1, align: 'end' as const }] : []),
                // Yalnız indirim varken; ipucu: faturadaki indirim tutara yansımış, ekstre indirimi kendi satırında
                ...(showDiscount ? [{ label: 'İNDİRİM', flex: 1, align: 'end' as const, tip: true }] : []),
                { label: 'ALACAK',    flex: 1.2, align: 'end' as const },
                { label: selfView ? 'BAKİYE' : 'KESİNLEŞMİŞ BAKİYE', flex: 1.2, align: 'end' as const },
              ].map((h: { label: string; flex: number; align?: 'end'; tip?: boolean }, i) => h.tip ? (
                <View key={i} style={{ flex: h.flex, alignItems: 'flex-end' }}>
                  <GlassTooltip title={autoT('İndirim')}
                    text={autoT('Hizmet bedelindeki indirim tutara zaten yansımıştır; bakiyeden ayrıca düşülmez. Ekstre indirimleri kendi satırında bakiyeyi düşürür.')}>
                    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: U.ink[500], textAlign: 'end' as any }}>
                      {h.label}
                    </Text>
                  </GlassTooltip>
                </View>
              ) : (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: U.ink[500], textAlign: h.align as any }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {shown.map((line, i) => (
              <StatementRow key={line.id ?? i} line={line} last={i === shown.length - 1} currency={selectedCcy} showVat={showVat}
                discountMode={showDiscount ? discMode : undefined}
                onOpen={line.id && !(selfView && line.type === 'discount') ? () => openLine(line) : undefined} />
            ))}

            {/* Footer */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: U.hairline,
              backgroundColor: U.surfaceSoft,
            }}>
              <Text style={{ flex: 1.2, fontSize: 11, color: U.ink[500] }}>{shown.length} hareket</Text>
              <View style={{ flex: 0.6 }} />
              <View style={{ flex: 3 }} />
              <View style={{ flex: 1 }} />
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: U.ink[900], textAlign: 'end' as any }}>
                {fmtMoney(showVat ? totals.debit - vatSummary.tax : totals.debit, selectedCcy)}
              </Text>
              {showVat && (
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: U.ink[700], textAlign: 'end' as any }}>
                  {fmtMoney(vatSummary.tax, selectedCcy)}
                </Text>
              )}
              {/* İndirimler: fatura toplamı ile bakiye arasında — borç − alacak − indirimler = bakiye */}
              {showDiscount && (
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {discTotal > 0 ? (
                    <>
                      <Text style={{ fontSize: 9.5, fontWeight: '600', letterSpacing: 0.5, color: U.ink[400], textTransform: 'uppercase' }}>
                        {autoT('İndirimler')}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.info.fg, textAlign: 'end' as any }}>
                        {`-${fmtMoney(discTotal, selectedCcy)}`}
                      </Text>
                    </>
                  ) : null}
                </View>
              )}
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: U.chipTones.success.fg, textAlign: 'end' as any }}>
                {fmtMoney(totals.credit, selectedCcy)}
              </Text>
              <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '700', color: totals.balance > 0 ? U.ink[900] : U.chipTones.success.fg, textAlign: 'end' as any }}>
                {fmtMoney(totals.balance, selectedCcy)}
              </Text>
            </View>
            {!selfView ? <PendingReconcileRow finalBalance={totals.balance} pending={awaitingTotal + draftTotal} currency={selectedCcy} padH={20} /> : null}
            {showVat && (
              <StatementVatSummary summary={vatSummary} fmt={(n) => fmtMoney(n, selectedCcy)} padH={20} />
            )}
          </>
        ) : (
          /* ���─ Mobile list ────────────────────────────────────── */
          <>
            {shown.map((line, i) => {
              const isInvoice = line.type === 'invoice';
              const isDisc = line.type === 'discount';
              const isDz = isDisc && line.docKind === 'DZ';
              const Icon = isInvoice ? ArrowUpRight : isDz ? FileEdit : isDisc ? Percent : ArrowDownLeft;
              const tone = isInvoice || isDisc ? U.chipTones.info : U.chipTones.success;
              const chip = isInvoice && line.status ? STATUS_CHIP[line.status as InvoiceStatus] : null;
              const mIsInvoice = line.type === 'invoice';
              // Faturadaki bilgi indirimi (liste ayarına göre tutar/yüzde)
              const invDisc = isInvoice && showDiscount ? discountText(line, discMode, selectedCcy) : null;
              const tapOff = !line.id || (selfView && isDisc);
              const mTitle = mIsInvoice
                ? ([line.invoiceNo, line.patientName].filter(Boolean).join(' · ') || line.description)
                : isDz ? line.description : isDisc ? autoT('Dönem indirimi') : autoT('Tahsilat');
              const mSub = mIsInvoice
                ? [line.orderNo, revisionDetail(line, line.debit, autoT), line.doctorName].filter(Boolean).join(' · ')
                : isDz ? (line.invoiceNo ?? '')
                : isDisc ? [line.invoiceNo, line.description].filter(Boolean).join(' · ')
                : [line.invoiceNo, line.receiptNo ? `${autoT('Makbuz')} #${line.receiptNo}` : null, line.patientName, line.detail].filter(Boolean).join(' · ');

              return (
                <Pressable key={line.id ?? i}
                  onPress={!tapOff ? () => openLine(line) : undefined}
                  disabled={tapOff}
                  style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: i < shown.length - 1 ? 1 : 0,
                  borderBottomColor: U.hairlineSoft,
                  backgroundColor: pressed && !tapOff ? U.rowHover : 'transparent',
                  ...(!tapOff && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: tone.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={tone.fg} strokeWidth={2} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                        {mTitle}
                      </Text>
                      {mIsInvoice && line.revisionOf ? <RevisionChip /> : null}
                    </View>
                    {mSub ? (
                      <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>{mSub}</Text>
                    ) : null}
                    {line.coverage ? (
                      <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 1 }} numberOfLines={2}>{line.coverage}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: U.ink[400] }}>{fmtDateShort(line.date)}</Text>
                      {isInvoice && chip && line.status && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: chip.bg }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: chip.fg }}>
                            {INVOICE_STATUS_LABELS[line.status as InvoiceStatus]}
                          </Text>
                        </View>
                      )}
                      {!isInvoice && line.method && (
                        <Text style={{ fontSize: 10, color: U.ink[400] }}>
                          {PAYMENT_METHOD_LABELS[line.method as PaymentMethod]}
                        </Text>
                      )}
                      {isDisc && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipTones.info.bg }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: U.chipTones.info.fg }}>{isDz ? autoT('Düzeltme') : autoT('İndirim')}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: isInvoice ? U.ink[900] : isDisc ? U.chipTones.info.fg : U.chipTones.success.fg,
                    }}>
                      {isInvoice ? fmtMoney(showVat ? line.debit - (line.tax ?? 0) : line.debit, selectedCcy)
                        : `-${fmtMoney(isDisc ? (line.discount ?? 0) : line.credit, selectedCcy)}`}
                    </Text>
                    {invDisc ? (
                      <Text style={{ fontSize: 10, color: U.ink[500], marginTop: 1 }}>
                        {autoT('İndirim')} {invDisc}
                      </Text>
                    ) : null}
                    {/* Kullanıcı: KDV fiyatın içinde görünmüyordu → ayrı yazılır */}
                    {isInvoice && (line.tax ?? 0) > 0 ? (
                      <Text style={{ fontSize: 10, color: U.ink[500], marginTop: 1 }}>
                        {autoT('KDV')} {fmtMoney(line.tax ?? 0, selectedCcy)}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 1 }}>
                      {fmtMoney(line.balance, selectedCcy)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {showVat && (
              <StatementVatSummary summary={vatSummary} fmt={(n) => fmtMoney(n, selectedCcy)} />
            )}
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 12,
              borderTopWidth: 1, borderTopColor: U.hairline,
              backgroundColor: U.surfaceSoft,
            }}>
              <Text style={{ fontSize: 11, color: U.ink[500] }}>{shown.length} hareket</Text>
              <View style={{ alignItems: 'flex-end' }}>
                {/* İndirimler: fatura toplamı ile bakiye arasında — bakiyenin neden düştüğü görünsün */}
                {discTotal > 0 ? (
                  <Text style={{ fontSize: 11, fontWeight: '600', color: U.chipTones.info.fg, marginBottom: 2 }}>
                    {autoT('İndirimler')}: {`-${fmtMoney(discTotal, selectedCcy)}`}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: totals.balance > 0 ? U.ink[900] : U.chipTones.success.fg }}>
                  {selfView ? autoT('Bakiye') : autoT('Kesinleşmiş bakiye')}: {fmtMoney(totals.balance, selectedCcy)}
                </Text>
              </View>
            </View>
            {!selfView ? <PendingReconcileRow finalBalance={totals.balance} pending={awaitingTotal + draftTotal} currency={selectedCcy} padH={16} /> : null}
          </>
        )}
        </View>

      </ScrollView>

      <StatementPdfModal
        open={pdfOpen}
        pendingCount={pdfPendingRows.length}
        pendingTotal={pdfPendingRows.reduce((t, r) => t + r.amount, 0)}
        currency={selectedCcy}
        mode={pdfMode}
        onMode={setPdfMode}
        preCount={preStatementCount}
        preFormat={preFmt ?? preFmtSetting}
        onPreFormat={setPreFmt}
        doctors={preDoctors}
        doctor={preDoctor}
        onDoctor={setPreDoctor}
        onClose={() => setPdfOpen(false)}
        onRun={(action) => {
          setPdfOpen(false);
          runStatementOutput(action);
        }}
      />

      <StatementPrefsModal
        visible={prefsOpen}
        prefs={prefs}
        onChange={setPref}
        onDiscountMode={selfView ? undefined : (m) => setPref('discountMode', m)}
        onReset={resetPrefs}
        onClose={() => setPrefsOpen(false)}
      />

      {!selfView && clinicId ? (
        <StatementDiscountModal
          visible={discountOpen}
          clinicId={clinicId}
          currency={selectedCcy}
          defaultFrom={discDefault.from}
          defaultTo={discDefault.to}
          onClose={() => setDiscountOpen(false)}
          onSaved={() => { setDiscountOpen(false); setReloadTick(t => t + 1); }}
        />
      ) : null}

      <ConfirmDialog state={discConfirm} onClose={() => setDiscConfirm(null)} />

      <ClinicReceiptModal
        visible={receiptOpen}
        clinicId={clinicId ?? null}
        clinicName={clinicName}
        editing={editingReceipt}
        onPrintVoucher={printVoucher}
        onClose={() => { setReceiptOpen(false); setEditingReceipt(null); }}
        onSaved={() => setReloadTick(t => t + 1)}
      />
    </View>
  );
}

// ─── Desktop statement row ───────────────────────────────────────────
/** Ekstrede revizyon faturası etiketi (asıl sipariş + sorumlu alt satırda) */
function RevisionChip() {
  const U = useInkUI();
  const t = U.chipTones.warning;
  return (
    <GlassTooltip title={autoT('Revizyon')} text={autoT('Bu hizmet bedeli bir revizyon siparişine ait')}>
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: t.bg }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.fg }}>{autoT('Revizyon')}</Text>
      </View>
    </GlassTooltip>
  );
}

function StatementRow({ line, last, currency, onOpen, showVat = true, discountMode }: {
  line: StatementLine; last: boolean; currency: string; onOpen?: () => void; showVat?: boolean;
  /** Verilirse İndirim sütunu çizilir (tutar/yüzde) */
  discountMode?: DiscountMode;
}) {
  const U = useInkUI();
  const STATUS_CHIP = statusChip(U);
  const isInvoice = line.type === 'invoice';
  const isDiscount = line.type === 'discount';
  const isDz = isDiscount && line.docKind === 'DZ';
  const Icon = isInvoice ? ArrowUpRight : isDz ? FileEdit : isDiscount ? Percent : ArrowDownLeft;
  const typeTone = isInvoice || isDiscount ? U.chipTones.info : U.chipTones.success;
  const discCell = discountMode ? discountText(line, discountMode, currency) : null;
  const chip = isInvoice && line.status ? STATUS_CHIP[line.status as InvoiceStatus] : null;
  const MIcon = !isInvoice && line.method ? METHOD_ICON[line.method as PaymentMethod] : null;
  const clickable = !!onOpen;
  // Fatura satiri: fatura no + hasta birincil, siparis no + hekim alt satirda.
  // Odeme satiri KENDI kimligiyle yazilir ("Tahsilat"); hangi faturayi
  // kapattigi alt satira duser. Onceden odeme, faturanin metnini birebir
  // tekrarladigi icin ayni fatura listede iki kez gorunuyordu.
  const rowTitle = isInvoice
    ? ([line.invoiceNo, line.patientName].filter(Boolean).join(' · ') || line.description)
    : isDz ? line.description : isDiscount ? autoT('Dönem indirimi') : autoT('Tahsilat');
  // Revizyon faturası: "Asıl sipariş … · Lab kaynaklı, ücretsiz" sipariş no'nun yanında
  const rowSub = isInvoice
    ? [line.orderNo, revisionDetail(line, line.debit, autoT), line.doctorName].filter(Boolean).join(' · ')
    : isDz ? (line.invoiceNo ?? '')
    : isDiscount ? [line.invoiceNo, line.description].filter(Boolean).join(' · ')
    : [line.invoiceNo, line.receiptNo ? `${autoT('Makbuz')} #${line.receiptNo}` : null, line.patientName, line.detail].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      disabled={!clickable}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: U.hairlineSoft,
        backgroundColor: hovered && clickable ? U.rowHover : 'transparent',
        ...(clickable && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}>
      <Text style={{ flex: 1.2, fontSize: 12, color: U.ink[500], fontFamily: 'monospace' }}>
        {fmtDateShort(line.date)}
      </Text>

      <View style={{ flex: 0.6 }}>
        <View style={{
          width: 22, height: 22, borderRadius: 6,
          backgroundColor: typeTone.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={11} color={typeTone.fg} strokeWidth={2} />
        </View>
      </View>

      <View style={{ flex: 3, gap: 2, paddingEnd: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
            {rowTitle}
          </Text>
          {isInvoice && line.revisionOf ? <RevisionChip /> : null}
          {!isInvoice && MIcon && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MIcon size={10} color={U.ink[400]} strokeWidth={1.6} />
              <Text style={{ fontSize: 10, color: U.ink[400] }}>
                {line.method ? PAYMENT_METHOD_LABELS[line.method as PaymentMethod] : ''}
              </Text>
            </View>
          )}
        </View>
        {rowSub ? (
          <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{rowSub}</Text>
        ) : null}
        {line.coverage ? (
          <Text style={{ fontSize: 11, color: U.ink[500] }} numberOfLines={2}>{line.coverage}</Text>
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
        {isDiscount && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: U.chipTones.info.bg }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: U.chipTones.info.fg }}>{isDz ? autoT('Düzeltme') : autoT('İndirim')}</Text>
          </View>
        )}
      </View>

      {/* Borç — KDV ayrı gösteriliyorsa KDV HARİÇ tutar (kullanıcı: "fiyat KDV dahil yazıyor,
          ayrı ayrı yazmalı; önce fiyat sonra KDV"). Bakiye yine KDV dahil yürür. */}
      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: line.debit > 0 ? '600' : '400',
        color: line.debit > 0 ? U.ink[900] : U.ink[300], textAlign: 'end' as any,
      }}>
        {isDiscount ? '' : line.debit > 0 ? fmtMoney(showVat ? line.debit - (line.tax ?? 0) : line.debit, currency) : '—'}
      </Text>

      {/* KDV — borcun içindeki pay, fiyatın hemen sağında */}
      {showVat && <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 12, color: (line.tax ?? 0) > 0 ? U.ink[700] : U.ink[300] }}>
          {isDiscount ? '' : (line.tax ?? 0) > 0 ? fmtMoney(line.tax ?? 0, currency) : '—'}
        </Text>
        {(line.tax ?? 0) > 0 && (line.taxRate ?? 0) > 0 ? (
          <Text style={{ fontSize: 10, color: U.ink[400], marginTop: 1 }}>%{line.taxRate}</Text>
        ) : null}
      </View>}

      {/* İndirim — ekstre indiriminde bakiyeyi düşüren tutar; faturada yalnız bilgi */}
      {discountMode && (
        <Text style={{
          flex: 1, fontSize: 12.5, fontWeight: isDiscount ? '600' : '400', textAlign: 'end' as any,
          color: discCell ? (isDiscount ? U.chipTones.info.fg : U.ink[700]) : U.ink[300],
        }}>
          {discCell ?? '—'}
        </Text>
      )}

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: line.credit > 0 || isDz ? '600' : '400',
        color: line.credit > 0 || isDz ? U.chipTones.success.fg : U.ink[300], textAlign: 'end' as any,
      }}>
        {isDz ? fmtMoney(dzCredit(line), currency) : isDiscount ? '' : line.credit > 0 ? fmtMoney(line.credit, currency) : '—'}
      </Text>

      <Text style={{
        flex: 1.2, fontSize: 13, fontWeight: '600',
        color: line.balance > 0 ? U.ink[900] : U.chipTones.success.fg, textAlign: 'end' as any,
      }}>
        {fmtMoney(line.balance, currency)}
      </Text>
    </Pressable>
  );
}

// ─── Mini KPI ────────────────────────────────────────────────────────
/**
 * Hero dökümü (lab ekstresi): Toplam bakiye = onaylanan açık + onay bekleyen + taslak.
 * Parçalı çubuk tahsil edileni, onaylı açığı, onay bekleyeni ve taslağı ayrı gösterir —
 * tek renkli "%100" çubuğu bekleyen tutar varken hesabı kapanmış gibi gösteriyordu.
 */
function StatementHeroBreakdown({ currency, billed, paid, openFinal, awaiting, awaitingCount, draft, draftCount, barTotal, segs, collectPct, overdue = 0 }: {
  /** Vadesi geçen (kesinleşmiş) tutar — Onaylanan kutucuğunun alt satırında kırmızı */
  overdue?: number;
  currency: string; billed: number; paid: number; openFinal: number;
  awaiting: number; awaitingCount: number; draft: number; draftCount: number;
  barTotal: number;
  segs: { paid: number; open: number; awaiting: number; draft: number };
  collectPct: number;
}) {
  const U = useInkUI();
  const heroInk = useWhiteHeroInk();
  const { width } = useWindowDimensions();
  const narrow = width < 640;
  const C = {
    paid: '#2D9A6B',
    open: heroInk.isDark ? '#93C5FD' : '#004B87',
    awaiting: '#E89B2A',
    draft: heroInk.isDark ? 'rgba(255,255,255,0.45)' : (U.ink[300] as string),
  };
  const warnInk = heroInk.isDark ? '#FAC775' : (U.chipTones.warning.fg as string);

  const dangerInk = heroInk.isDark ? '#F09595' : (U.chipTones.danger.fg as string);
  const tile = (opts: { dot: string; label: string; value: string; sub: string; warn?: boolean; danger?: boolean }) => (
    <View key={opts.label} style={{
      flex: 1, minWidth: narrow ? 0 : 170, ...(narrow ? { flexBasis: '100%' as any } : null),
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
      backgroundColor: opts.warn ? (heroInk.isDark ? 'rgba(232,155,42,0.18)' : U.chipTones.warning.bg) : heroInk.tileBg,
      borderColor: opts.warn ? 'rgba(232,155,42,0.45)' : heroInk.tileBorder,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opts.dot }} />
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase',
                       color: opts.warn ? warnInk : heroInk.inkSoft }}>
          {opts.label}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ ...WHITE_HERO_DISPLAY, fontSize: 22, letterSpacing: -0.5, marginTop: 6,
                                       color: opts.warn ? warnInk : heroInk.ink }}>
        {opts.value}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 11, marginTop: 2, color: opts.danger ? dangerInk : opts.warn ? warnInk : heroInk.inkFaint,
                                       fontWeight: opts.danger ? '700' : '400' }}>
        {opts.sub}
      </Text>
    </View>
  );

  const legend = (color: string, label: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: heroInk.inkFaint }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ marginTop: 18, gap: 16 }}>
      {narrow ? (
        /* Dar ekran: üç kutucuk yerine tek kutuda üç satır — hero kısa kalır */
        <View style={{ borderRadius: 14, borderWidth: 1, backgroundColor: heroInk.tileBg, borderColor: heroInk.tileBorder, paddingHorizontal: 14, paddingVertical: 4 }}>
          {[
            { dot: C.open, label: autoT('Onaylanan (açık)'), value: openFinal, sub: overdue > 0 ? `${fmtMoney(overdue, currency)} ${autoT('vadesi geçti')}` : null, danger: overdue > 0, warn: false },
            { dot: C.awaiting, label: autoT('Onay bekleyen'), value: awaiting, sub: awaitingCount > 0 ? `${awaitingCount} ${autoT('hizmet bedeli')}` : null, danger: false, warn: awaiting > 0 },
            { dot: C.draft, label: autoT('Taslak'), value: draft, sub: draftCount > 0 ? `${draftCount} ${autoT('iş')}` : null, danger: false, warn: false },
          ].filter((r, i) => i === 0 || r.value > 0).map((r, i) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9,
                                         borderTopWidth: i === 0 ? 0 : 1, borderTopColor: heroInk.tileBorder }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.dot }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: r.warn ? warnInk : heroInk.ink }}>{r.label}</Text>
                {r.sub ? <Text numberOfLines={1} style={{ fontSize: 11, color: r.danger ? dangerInk : heroInk.inkFaint, fontWeight: r.danger ? '700' : '400' }}>{r.sub}</Text> : null}
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: r.warn ? warnInk : heroInk.ink }}>{fmtMoney(r.value, currency)}</Text>
            </View>
          ))}
        </View>
      ) : (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tile({
          dot: C.open, label: autoT('Onaylanan (açık)'), value: fmtMoney(openFinal, currency),
          sub: overdue > 0
            ? `${fmtMoney(overdue, currency)} ${autoT('vadesi geçti')}`
            : `${autoT('Onaylanan')} ${fmtMoney(billed, currency)} · ${autoT('tahsil')} ${fmtMoney(paid, currency)}`,
          danger: overdue > 0,
        })}
        {tile({
          dot: C.awaiting, label: autoT('Onay bekleyen'), value: fmtMoney(awaiting, currency),
          sub: awaitingCount > 0 ? `${awaitingCount} ${autoT('hizmet bedeli · klinik onayında')}` : autoT('Bekleyen yok'),
          warn: awaiting > 0,
        })}
        {tile({
          dot: C.draft, label: autoT('Taslak'), value: fmtMoney(draft, currency),
          sub: draftCount > 0 ? `${draftCount} ${autoT('iş · henüz kesilmedi')}` : autoT('Taslak yok'),
        })}
      </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: heroInk.inkSoft }}>
            {autoT('Tahsilat durumu')}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: heroInk.ink }}>
            {`${fmtMoney(paid, currency)} / ${fmtMoney(barTotal, currency)} · ${collectPct.toFixed(0)}%`}
          </Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: heroInk.tileBg, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ width: `${segs.paid}%` as any, height: '100%', backgroundColor: C.paid }} />
          <View style={{ width: `${segs.open}%` as any, height: '100%', backgroundColor: C.open }} />
          <View style={{ width: `${segs.awaiting}%` as any, height: '100%', backgroundColor: C.awaiting }} />
          <View style={{ width: `${segs.draft}%` as any, height: '100%', backgroundColor: C.draft }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: narrow ? 10 : 14 }}>
          {legend(C.paid, autoT('Tahsil edildi'))}
          {legend(C.open, autoT('Onaylı açık'))}
          {legend(C.awaiting, autoT('Onay bekliyor'))}
          {legend(C.draft, autoT('Taslak'))}
        </View>
      </View>
    </View>
  );
}

/**
 * Genel ekstre PDF penceresi — ön ekstre PDF penceresiyle (PreStatementPdfButton) aynı tarz:
 * başlık · seçenek çipleri · Vazgeç / İndir. Seçenek: onay bekleyenleri sona ekle.
 */
type PdfMode = 'statement' | 'with' | 'pending';
const scopeToMode = (s: StatementScope): PdfMode => (s === 'pre' ? 'pending' : s === 'approved' ? 'statement' : 'with');
const modeToScope = (m: PdfMode): StatementScope => (m === 'pending' ? 'pre' : m === 'statement' ? 'approved' : 'full');

function StatementPdfModal({
  open, pendingCount, pendingTotal, currency, mode, onMode, preCount, preFormat, onPreFormat,
  doctors, doctor, onDoctor, onClose, onRun,
}: {
  open: boolean; pendingCount: number; pendingTotal: number; currency: string;
  mode: PdfMode; onMode: (m: PdfMode) => void;
  /** Ön ekstrede (klinik onayında) bu dövizdeki fatura sayısı — 0 ise "Yalnız onay bekleyenler" çıkmaz. */
  preCount: number;
  preFormat: 'ozet' | 'ayrintili'; onPreFormat: (f: 'ozet' | 'ayrintili') => void;
  doctors: string[]; doctor: string | null; onDoctor: (d: string | null) => void;
  onClose: () => void; onRun: (action: 'pdf' | 'print') => void;
}) {
  const U = useInkUI();
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as any) : {};
  const eff: PdfMode = mode === 'pending' && preCount === 0 ? 'with' : mode;
  const chip = (label: string, active: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      style={{
        paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
        backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
        borderWidth: 1, borderColor: active ? U.ink[900] : U.plainBtn.border, ...web,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? U.onDarkPill : U.plainBtn.fg }}>{label}</Text>
    </Pressable>
  );
  const lbl = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: U.ink[400] };
  const hint = eff === 'pending'
    ? `${preCount} ${autoT('hizmet bedeli klinik onayında')} — ${autoT('kesinleşmiş ekstre olmadan yalnız ön ekstre')}`
    : eff === 'with' && pendingCount > 0
      ? `${pendingCount} ${autoT('kesinleşmemiş kalem')} · ${fmtMoney(pendingTotal, currency)} — ${autoT('ekstrenin altında ayrı bölüm olarak yer alır, bakiyeye eklenmez')}`
      : eff === 'statement' ? autoT('Yalnız kesinleşmiş hareketler') : autoT('Onay bekleyen ya da taslak kalem yok');
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 460 }]}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: U.ink[900] }}>{autoT('Ekstre PDF')}</Text>
            <View style={{ gap: 8 }}>
              <Text style={lbl}>{autoT('İçerik')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {preCount > 0 ? chip(autoT('Ön ekstre'), eff === 'pending', () => onMode('pending'), 'm:p') : null}
                {chip(autoT('Onaylanmış ekstre'), eff === 'statement', () => onMode('statement'), 'm:s')}
                {chip(autoT('Tam ekstre'), eff === 'with', () => onMode('with'), 'm:w')}
              </View>
              <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{hint}</Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={lbl}>{autoT('Biçim')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chip(autoT('Özet'), preFormat === 'ozet', () => onPreFormat('ozet'), 'f:o')}
                {chip(autoT('Ayrıntılı'), preFormat === 'ayrintili', () => onPreFormat('ayrintili'), 'f:a')}
              </View>
              <Text style={{ fontSize: 11.5, color: U.ink[500] }}>
                {preFormat === 'ayrintili' ? autoT('Her hizmet bedelinin altında iş kalemleri: açıklama, adet × fiyat, hasta, sipariş no') : autoT('Hizmet bedeli başına tek satır')}
              </Text>
            </View>
            {eff === 'pending' ? (
              <>
                {doctors.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={lbl}>{autoT('Hekim')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {chip(autoT('Tüm hekimler'), doctor === null, () => onDoctor(null), 'd:__all')}
                      {doctors.map(d => chip(d, doctor === d, () => onDoctor(d), `d:${d}`))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={onClose}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <Pressable
                onPress={() => onRun('print')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web }}
              >
                <Printer size={13} color={U.plainBtn.fg} strokeWidth={2} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Yazdır')}</Text>
              </Pressable>
              <Pressable
                onPress={() => onRun('pdf')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: U.ink[900], ...web }}
              >
                <Download size={13} color={U.onDarkPill} strokeWidth={2} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('PDF indir')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MiniKPI({ label, value, color }: { label: string; value: string; color: string }) {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, minWidth: 120, backgroundColor: U.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: U.hairline }}>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400], marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color }}>{value}</Text>
    </View>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────
/** Tablo altı: kesinleşmiş bakiye + bekleyenler = hero'daki toplam (iki rakam neden farklı görünsün). */
function PendingReconcileRow({ finalBalance, pending, currency, padH }: { finalBalance: number; pending: number; currency: string; padH: number }) {
  const U = useInkUI();
  if (!(pending > 0)) return null;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end',
      paddingHorizontal: padH, paddingVertical: 10, borderTopWidth: 1, borderTopColor: U.hairline,
    }}>
      <Text style={{ fontSize: 12, color: U.ink[500] }}>
        {`${autoT('Kesinleşmiş bakiye')} ${fmtMoney(finalBalance, currency)}`}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>
        {`+ ${autoT('onay bekleyen ve taslak')} ${fmtMoney(pending, currency)}`}
      </Text>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.ink[900] }}>
        {`= ${autoT('Toplam bakiye')} ${fmtMoney(finalBalance + pending, currency)}`}
      </Text>
    </View>
  );
}

/** Hero "⋯" menüsü — tetikleyiciye yaslı açılır (ikincil eylemler). */
function HeroMoreMenu({ items }: { items: { key: string; icon: React.ComponentType<any>; label: string; hint?: string; onPress: () => void }[] }) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const MENU_W = 300;
  const openMenu = () => {
    const node = ref.current;
    if (node?.measureInWindow) node.measureInWindow((x: number, y: number, w: number, h: number) => { setAnchor({ x, y, w, h }); setOpen(true); });
    else { setAnchor(null); setOpen(true); }
  };
  const win = Dimensions.get('window');
  const estH = items.length * 60 + 12;
  const right = anchor ? Math.max(8, win.width - (anchor.x + anchor.w)) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const top = anchor && below + estH > win.height - 12 ? Math.max(12, anchor.y - estH - 6) : below;
  return (
    <>
      <GlassTooltip title={autoT('Diğer')} text={autoT('İndirim, liste ayarı ve Excel')}>
        <Pressable
          ref={ref}
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel={autoT('Diğer')}
          style={({ pressed }: any) => ({
            paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999,
            borderWidth: 1, borderColor: U.ink[200], opacity: pressed ? 0.7 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <MoreHorizontal size={14} color={U.ink[700]} strokeWidth={1.8} />
        </Pressable>
      </GlassTooltip>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, right, width: MENU_W, padding: 6, borderRadius: 14,
              backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
              shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
            }}
          >
            {items.map(it => {
              const Icon = it.icon;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => { setOpen(false); it.onPress(); }}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10,
                    borderRadius: 10, backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Icon size={15} color={U.ink[700]} strokeWidth={1.9} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{it.label}</Text>
                    {it.hint ? <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 1 }}>{it.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PillBtn({ icon: Icon, label, onPress, variant = 'dark', busy }: {
  icon: React.ComponentType<any>; label?: string; onPress: () => void;
  variant?: 'dark' | 'ghost'; busy?: boolean;
}) {
  const U = useInkUI();
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: label ? 16 : 12, paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: dark ? U.ink[900] : 'transparent',
        borderWidth: dark ? 0 : 1,
        borderColor: U.ink[200],
        opacity: busy ? 0.5 : 1,
        cursor: 'pointer' as any,
      }}
    >
      <Icon size={14} color={dark ? U.onDarkPill : U.ink[700]} strokeWidth={1.8} />
      {!!label && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? U.onDarkPill : U.ink[700] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export default ClinicStatementScreen;
