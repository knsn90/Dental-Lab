// Ön ekstre PDF'leri için saf gruplama ve toplam hesapları (node --test ile çalışır).
// Yerel içe aktarma yalnız `import type`.
import type { PreStatement, PreStatementInvoice, PreStatementItem } from '../types';

export const NO_DOCTOR = '—';

export type PdfItem = PreStatementItem & { invoice_id: string; invoice_date: string | null; currency: string };
export interface DoctorGroup { doctor: string; items: PdfItem[]; subtotal: Record<string, number> }

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: unknown): number => Number(n) || 0;

/** Kuruş yuvarlaması toplam sonunda: ara toplamlar 2 ondalıkta döner. */
function addTo(rec: Record<string, number>, ccy: string, v: number): void {
  rec[ccy] = (rec[ccy] ?? 0) + v;
}
function roundRec(rec: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(rec)) o[k] = r2(rec[k]);
  return o;
}

export function groupByDoctor(inv: PreStatementInvoice[]): DoctorGroup[] {
  const map = new Map<string, { items: PdfItem[]; sub: Record<string, number> }>();
  for (const i of inv) {
    const ccy = i.currency || 'TRY';
    for (const it of i.items ?? []) {
      const name = (it.doctor_name ?? '').trim() || NO_DOCTOR;
      let g = map.get(name);
      if (!g) { g = { items: [], sub: {} }; map.set(name, g); }
      g.items.push({ ...it, invoice_id: i.id, invoice_date: i.issue_date ?? null, currency: ccy });
      addTo(g.sub, ccy, num(it.total));
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([doctor, g]) => ({ doctor, items: g.items, subtotal: roundRec(g.sub) }));
}

export function workTypeTotals(inv: PreStatementInvoice[]): { work: string; currency: string; quantity: number; total: number }[] {
  const map = new Map<string, { work: string; currency: string; quantity: number; total: number }>();
  for (const i of inv) {
    const ccy = i.currency || 'TRY';
    for (const it of i.items ?? []) {
      const work = (it.description ?? '').trim() || NO_DOCTOR;
      const key = `${ccy}\u0000${work}`;
      const e = map.get(key) ?? { work, currency: ccy, quantity: 0, total: 0 };
      e.quantity += num(it.quantity);
      e.total += num(it.total);
      map.set(key, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, total: r2(e.total) }))
    .sort((a, b) => b.total - a.total);
}

/** get_pre_statement.summary.pending ile aynı: fatura total'larının para birimi başına toplamı. */
export function pendingTotal(inv: PreStatementInvoice[]): Record<string, number> {
  const rec: Record<string, number> = {};
  for (const i of inv) addTo(rec, i.currency || 'TRY', num(i.total));
  return roundRec(rec);
}

/** R7: yalnız o hekimin kalemleri; klinik geneli rakamlar (bakiye, vadesi geçen) yok. */
export function scopeToDoctor(data: PreStatement, doctor: string): PreStatement {
  const invoices: PreStatementInvoice[] = [];
  const pending: Record<string, number> = {};
  for (const i of data.invoices) {
    const items = (i.items ?? []).filter((it) => ((it.doctor_name ?? '').trim() || NO_DOCTOR) === doctor);
    if (items.length === 0) continue;
    const net = items.reduce((s, it) => s + num(it.total), 0);
    const gross = items.reduce((s, it) => s + num(it.gross_total), 0);
    invoices.push({ ...i, items, subtotal: r2(net), tax: r2(gross - net), total: r2(gross) });
    addTo(pending, i.currency || 'TRY', gross);
  }
  const pend = roundRec(pending);
  const ccys = new Set<string>([...Object.keys(pend), ...data.summary.map((s) => s.currency)]);
  const summary = [...ccys].sort().filter((c) => c in pend).map((currency) => ({
    currency, finalized_balance: null, overdue: null, pending: pend[currency],
  }));
  return { ...data, scope: 'own', summary, invoices };
}
