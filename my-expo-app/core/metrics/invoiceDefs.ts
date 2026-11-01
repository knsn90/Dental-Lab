/**
 * Fatura tanımlarının istemci aynası (tek tanım, 2026-10-26).
 *
 * SQL karşılığı: v_clinic_balance(_ccy), finance_period_metrics, lab_receivables_summary
 * (20261026100000). Toplamlar sunucudan gelir (`useFinanceMetrics`); bu dosya yalnız
 * ekranın elindeki fatura satırlarını aynı kuralla işaretlemek/süzmek içindir.
 * Bilerek import YOK: node testleri uzantısız göreli importu çözemiyor.
 */

/** Kesilmiş fatura: ciro ve alacağa girer. Taslak ve iptal girmez. */
export const POSTED_INVOICE_STATUSES = ['kesildi', 'kismi_odendi', 'odendi'] as const;

type InvoiceLike = { status: string; due_date?: string | null; total?: number | string | null; paid_amount?: number | string | null };

export function isPostedInvoice(inv: { status: string }): boolean {
  return (POSTED_INVOICE_STATUSES as readonly string[]).includes(inv.status);
}

/** Vadesi geçmiş fatura: kesilmiş, kalanı var, vade lab gününden önce. */
export function isInvoiceOverdue(inv: InvoiceLike, today: string): boolean {
  if (!isPostedInvoice(inv)) return false;
  const due = (inv.due_date ?? '').slice(0, 10);
  if (!due || due >= today) return false;
  return (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0) > 0;
}
