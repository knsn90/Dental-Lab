/**
 * Hesap Ekstresi PDF HTML builder
 * A4 yazdırma için optimize. buildInvoiceHtml ile aynı pattern.
 */

import type { Invoice } from './types';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { buildCariStatementHtml, type CariLine } from '../../core/util/buildCariStatementHtml';
import { baseSymbol } from '../../core/money/baseCurrency';

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
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function fmtMoney(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  return baseSymbol() + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Statement line builder ───────────────────────────────────────────
export interface StatementLine {
  /** Stabil React key için opsiyonel id (örn. fatura/ödeme uuid'si) */
  id?: string;
  date: string;
  type: 'invoice' | 'payment';
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
      status: inv.status,
      debit: debitVal,
      credit: 0,
      ...(foreign && !original ? { origCurrency: inv.currency, origAmount: inv.total } : {}),
    });
    if (inv.payments) {
      for (const p of inv.payments) {
        // Alacak: original ise ödemenin kendi tutarı; değilse faturanın kuruyla baz'a çevrilir.
        const creditVal = original ? p.amount : p.amount * rate;
        lines.push({
          id: inv.id,
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
    running += l.debit - l.credit;
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
): string {
  const cariLines: CariLine[] = lines.map(l => ({
    refNo: l.invoiceNo ?? null,
    reference: l.type === 'invoice'
      ? (l.status ? (INVOICE_STATUS_LABELS[l.status as keyof typeof INVOICE_STATUS_LABELS] ?? l.status) : 'Fatura')
      : (l.method ? `Tahsilat (${PAYMENT_METHOD_LABELS[l.method as keyof typeof PAYMENT_METHOD_LABELS] ?? l.method})` : 'Tahsilat'),
    date: l.date,
    counterparty: l.description,
    counterpartySub: l.invoiceNo ?? null,
    amount: l.debit > 0 ? l.debit : l.credit,
    currency,
    type: l.debit > 0 ? 'debit' : 'credit',
    balance: l.balance,
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
    openingBalance: 0,
    closingBalance: lines.reduce((s, l) => s + l.debit - l.credit, 0),
    currency,
    lines: cariLines,
  });
}
