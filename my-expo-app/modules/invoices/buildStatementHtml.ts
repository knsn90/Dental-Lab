/**
 * Hesap Ekstresi PDF HTML builder
 * A4 yazdırma için optimize. buildInvoiceHtml ile aynı pattern.
 */

import type { Invoice } from './types';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { buildCariStatementHtml, type CariLine } from '../../core/util/buildCariStatementHtml';
import { baseSymbol } from '../../core/money/baseCurrency';

import { autoT } from '../../core/i18n/autoTranslate';
import { revisionDetail } from './lib/statementRevision';
import { htmlAttrs, printLocale } from '../../core/i18n/printLocale';
import { lineDelta } from './lib/statementTotals';
import { invoiceDiscountOf, discountCellValue, hasAnyDiscount, discountTotal, type DiscountMode } from './lib/statementDiscount';
import { vatPortion, statementVatSummary } from './lib/statementVat';
// ── Yardımcılar ──────────────────────────────────────────────────────
function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(printLocale(), { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(printLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function fmtMoney(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  return baseSymbol() + n.toLocaleString(printLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Statement line builder ───────────────────────────────────────────
export interface StatementLine {
  /** Stabil React key için opsiyonel id (örn. fatura/ödeme uuid'si) */
  id?: string;
  date: string;
  type: 'invoice' | 'payment' | 'discount';
  description: string;
  invoiceNo?: string;
  /** Ekstre satırı başlığı/alt-satırı için (ekran) — sipariş no, hasta, klinik, hekim */
  orderNo?: string | null;
  patientName?: string | null;
  clinicName?: string | null;
  doctorName?: string | null;
  status?: string;
  method?: string;
  /** Baz para (₺) cinsinden — KPI'lar ve bakiye ile tutarlı */
  debit: number;
  credit: number;
  balance: number;
  /** Faturanın/ödemenin kendi para birimi (TRY değilse gösterilir) */
  origCurrency?: string;
  /** Orijinal döviz tutarı (borç ya da alacak — pozitif) */
  origAmount?: number;
  /** Tahsilat fişi ayrıntısı: dekont no · kapattığı faturalar · not */
  detail?: string | null;
  /** Tahsilat fişinin makbuz numarası (lib/receiptStatement.receiptVoucherNo) */
  receiptNo?: string | null;
  /** Revizyon faturası: asıl sipariş no + sorumlu (lib/statementRevision) */
  revisionOf?: string | null;
  revisionResponsible?: string | null;
  /** Fatura satırı: borcun içindeki KDV payı (borçla aynı birimde) — lib/statementVat */
  tax?: number;
  /** Faturanın KDV oranı (%) */
  taxRate?: number;
  /** İndirim satırında bakiyeyi düşüren tutar; fatura satırında yalnız bilgi */
  discount?: number;
  /** İndirim yüzdesi için dayanak (fatura brüt / dönem fatura toplamı) */
  discountBase?: number;
  /** İndirim satırının türü: İND (ekstre indirimi) ya da DZ (düzeltme belgesi) */
  docKind?: 'IND' | 'DZ';
}

/**
 * @param opts.original  KATI per-currency: true ise borç/alacak ORİJİNAL tutarda
 *   (base'e çevrilmez). Tek bir para birimine ait fatura alt-kümesiyle çağrılmalı
 *   → running bakiye o para biriminde anlamlı olur. (false = eski base davranışı.)
 */
export function buildStatementLines(
  invoices: Invoice[],
  opts: { original?: boolean } = {},
): StatementLine[] {
  const original = !!opts.original;
  const lines: Omit<StatementLine, 'balance'>[] = [];

  for (const inv of invoices) {
    if (inv.status === 'iptal') continue;
    // İşlem anı kuru: 1 birim currency = rate baz para. TRY ise 1.
    const rate = inv.rate_at_time && inv.rate_at_time > 0 ? inv.rate_at_time : 1;
    const foreign = !!inv.currency && inv.currency !== 'TRY';
    // Borç: original ise faturanın kendi tutarı; değilse baz ₺ (amount_base ya da total×kur).
    const debitVal = original ? inv.total : (inv.amount_base != null ? inv.amount_base : inv.total * rate);
    const invDisc = invoiceDiscountOf(inv);
    lines.push({
      id: inv.id,
      date: inv.issue_date,
      type: 'invoice',
      description: inv.work_order?.patient_name
        ? `${inv.work_order.patient_name} — ${inv.invoice_number}`
        : inv.invoice_number,
      invoiceNo: inv.invoice_number,
      orderNo: inv.work_order?.order_number ?? null,
      patientName: inv.work_order?.patient_name ?? null,
      clinicName: inv.clinic?.name ?? null,
      doctorName: inv.doctor?.full_name ?? null,
      revisionOf: inv.work_order?.revision_of?.order_number ?? null,
      revisionResponsible: inv.work_order?.revision_responsible ?? null,
      status: inv.status,
      debit: debitVal,
      credit: 0,
      discount: invDisc.amount,
      discountBase: invDisc.gross,
      // Kullanıcı: KDV fiyatın içinde görünmüyordu → satırda ayrı, sonda toplam
      tax: vatPortion(inv, debitVal),
      taxRate: Number(inv.tax_rate) || 0,
      ...(foreign && !original ? { origCurrency: inv.currency, origAmount: inv.total } : {}),
    });
    if (inv.payments) {
      for (const p of inv.payments) {
        // Toplu tahsilattan gelen ödemeler defterde TEK bir fiş satırı olarak
        // görünür (ekran fişi ayrıca ekler). Burada da yazsaydık aynı para
        // hem fiş hem fatura-başı ödeme olarak iki kez sayılırdı.
        if ((p as any).receipt_id) continue;
        // Ekstre indirimi payı: indirim ayrı 'discount' satırı olarak görünür; burada
        // yazılsa iki kez sayılırdı.
        if ((p as any).statement_discount_id) continue;
        // Alacak: original ise ödemenin kendi tutarı; değilse faturanın kuruyla baz'a çevrilir.
        const creditVal = original ? p.amount : p.amount * rate;
        lines.push({
          // Odemenin KENDI id'si: fatura id'si kullanilinca fatura satiriyla
          // ayni React key olusuyordu.
          id: p.id ?? `${inv.id}-pay-${p.payment_date}-${p.amount}`,
          date: p.payment_date,
          type: 'payment',
          description: `Tahsilat — ${inv.invoice_number}`,
          invoiceNo: inv.invoice_number,
          orderNo: inv.work_order?.order_number ?? null,
          patientName: inv.work_order?.patient_name ?? null,
          clinicName: inv.clinic?.name ?? null,
          doctorName: inv.doctor?.full_name ?? null,
          method: p.payment_method,
          debit: 0,
          credit: creditVal,
          ...(foreign && !original ? { origCurrency: inv.currency, origAmount: p.amount } : {}),
        });
      }
    }
  }

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  return lines.map(l => {
    running += lineDelta(l);
    return { ...l, balance: running };
  });
}

// ── HTML builder ─────────────────────────────────────────────────────
// Yeni: Dribbble-tarzı (bank statement layout) — paylaşılan buildCariStatementHtml kullanır.
export function buildStatementHtml(
  clinicName: string,
  lines: StatementLine[],
  lab: LabLetterhead,
  period?: { from?: string; to?: string },
  /** Ekstrenin para birimi (katı per-currency — satırlar tek dövizde gelir). Default TRY. */
  currency: string = 'TRY',
  /** Dönem açılış/kapanış bakiyesi (lib/statementTotals). Yoksa açılış 0, kapanış satır toplamı. */
  totals?: { opening: number; closing: number },
  /**
   * Liste ayarı (lib/statementPrefs): vat=false → KDV sütunu/dökümü yok.
   * sums: tahsilat satırları gizlendiğinde özet çubuğu yine TÜM hareketin borç/alacağını yazar.
   * discountMode: İndirim sütunu tutar mı yüzde mi (klinik/hekim kendi ekstresinde hep tutar).
   */
  opts: { vat?: boolean; sums?: { debit: number; credit: number }; discountMode?: DiscountMode } = {},
): string {
  const vat = statementVatSummary(lines);
  const showVat = opts.vat !== false && vat.total > 0;
  // İndirim sütunu: dönemde en az bir indirim (ekstre indirimi ya da indirimli fatura) varsa
  const showDiscount = hasAnyDiscount(lines);
  const discMode: DiscountMode = opts.discountMode ?? 'amount';
  const discText = (l: StatementLine): string | undefined => {
    const v = discountCellValue(l, discMode);
    if (!v) return undefined;
    return v.kind === 'percent'
      ? '%' + v.value.toLocaleString(printLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '−' + Math.abs(v.value).toLocaleString(printLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
  };
  const cariLines: CariLine[] = lines.map(l => l.type === 'discount' ? ({
    // Ekstre indirimi: belge sütununda İND-n, tutar yalnız İndirim sütununda; bakiye düşer
    refNo: l.invoiceNo ?? null,
    reference: autoT('Ekstre indirimi'),
    date: l.date,
    counterparty: l.description || autoT('Dönem indirimi'),
    counterpartySub: null,
    amount: Number(l.discount) || 0,
    currency,
    type: 'credit',
    kind: 'discount',
    balance: l.balance,
    tax: null,
    taxRate: null,
    ...(showDiscount ? { discountText: discText(l) } : {}),
  } as CariLine) : ({
    // Fatura satırında fatura no; tahsilat fişinde makbuz no (belge sütununda, referans etiketinin üstünde)
    refNo: l.invoiceNo ?? (l.receiptNo ? `${autoT('Makbuz')} #${l.receiptNo}` : null),
    reference: l.type === 'invoice'
      ? (l.status ? (INVOICE_STATUS_LABELS[l.status as keyof typeof INVOICE_STATUS_LABELS] ?? l.status) : 'Fatura')
      : (l.method ? `Tahsilat (${PAYMENT_METHOD_LABELS[l.method as keyof typeof PAYMENT_METHOD_LABELS] ?? l.method})` : 'Tahsilat'),
    date: l.date,
    // Hekim isteği: ekstrede HASTA adı görünsün. Alt satırda eskiden fatura no
    // vardı — o zaten solda "Belge No" sütununda yazıyor, tekrarıydı. Yerine
    // sipariş no kondu: hasta + sipariş, hekimin işi tanıması için gereken çift.
    // Tahsilat fişi: yalnız tür + yatırıldığı yer ("Havale / EFT · Ziraat Bankası")
    counterparty: l.type === 'payment' && !l.invoiceNo
      ? [l.method ? autoT(PAYMENT_METHOD_LABELS[l.method as keyof typeof PAYMENT_METHOD_LABELS] ?? l.method) : autoT('Tahsilat'), l.detail]
          .filter(Boolean).join(' · ')
      // Liste ayarında hasta bilgisi kapalıysa açıklama fatura no'ya iner — belge sütununda zaten var
      : (l.patientName ?? (l.description !== l.invoiceNo ? l.description : autoT('Fatura'))),
    // Revizyon faturası: sipariş no yanında "Revizyon · Asıl sipariş … · Lab kaynaklı, ücretsiz"
    counterpartySub: (l.type === 'payment'
      ? [l.orderNo]
      : [l.orderNo, l.revisionOf ? `${autoT('Revizyon')} · ${revisionDetail(l, l.debit, autoT)}` : null])
      .filter(Boolean).join(' · ') || null,
    // Fatura her zaman borç satırı: 0 tutarlı (ücretsiz revizyon) fatura eskiden yeşil "alacak" çiziliyordu.
    // KDV ayrı sütundaysa tutar KDV HARİÇ (kullanıcı: "fiyat KDV dahil yazıyor, ayrı ayrı yazmalı")
    amount: l.type === 'invoice' ? (showVat ? l.debit - (l.tax ?? 0) : l.debit) : l.credit,
    currency,
    type: l.type === 'invoice' ? 'debit' : 'credit',
    balance: l.balance,
    // KDV ayrı sütunda (kullanıcı: KDV'nin fiyatın içinde olduğu anlaşılmıyordu)
    tax: l.type === 'invoice' ? (l.tax ?? 0) : null,
    taxRate: l.type === 'invoice' ? (l.taxRate ?? null) : null,
    ...(showDiscount ? { discountText: discText(l) } : {}),
  }));

  return buildCariStatementHtml({
    documentTitle: 'Cari Hesap Ekstresi',
    periodFrom: period?.from ?? null,
    periodTo: period?.to ?? null,
    lab: {
      name: lab.name,
      logoUrl: lab.logo_url ?? null,
      address: lab.address ?? null,
      phone: lab.phone ?? null,
      email: lab.email ?? null,
      taxNo: lab.tax_number ?? null,
    },
    holder: {
      name: clinicName,
      addressLines: [],
    },
    openingBalance: totals?.opening ?? 0,
    closingBalance: totals?.closing ?? lines.reduce((s, l) => s + lineDelta(l), 0),
    currency,
    lines: cariLines,
    // Dönemde fatura varsa KDV dökümü (KDV hariç + KDV = genel toplam); liste ayarıyla kapatılabilir
    vatSummary: showVat ? vat : null,
    summaryTotals: opts.sums ?? null,
    // İndirim sütunu yalnız indirim varken; yoksa alanlar hiç verilmez → belge değişmez
    ...(showDiscount ? { showDiscount: true, discountTotal: discountTotal(lines) } : {}),
    // Bu sütunda hasta + sipariş no ya da tahsilat yöntemi yazar; karşı taraf zaten klinik.
    labels: { party: autoT('Açıklama') },
  });
}
