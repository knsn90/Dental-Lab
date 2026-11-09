// Ön ekstre PDF'leri için saf gruplama ve toplam hesapları (node --test ile çalışır).
// Yerel içe aktarma yalnız `import type`.
import type { PreStatement, PreStatementInvoice, PreStatementItem } from '../types';

export const NO_DOCTOR = '—';

export type PdfItem = PreStatementItem & { invoice_id: string; invoice_date: string | null; currency: string; share: number };
/** subtotal = KDV ve fatura indirimi payı dahil (Σ share); net = Σ kalem net tutarı */
export interface DoctorGroup { doctor: string; items: PdfItem[]; subtotal: Record<string, number>; net: Record<string, number> }

// Değiştirirsen ikisini birden değiştir; parity testi korur (buildPreStatementHtml.ts içindeki kopya).
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: unknown): number => Number(n) || 0;

/**
 * Fatura toplamını (KDV dahil, fatura indirimi uygulanmış) kalemlere net tutarlarıyla orantılı dağıtır.
 * En büyük kalan yöntemi: paylar kuruşu kuruşuna `inv.total`'a eşittir. Σnet=0 ise eşit bölüşür.
 */
export function itemShares(inv: PreStatementInvoice): Map<string, number> {
  const items = inv.items ?? [];
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const cents = Math.round(num(inv.total) * 100);
  const nets = items.map((it) => num(it.total));
  const sumNet = nets.reduce((a, b) => a + b, 0);
  const raw = nets.map((n) => (sumNet === 0 ? cents / items.length : (cents * n) / sumNet));
  const base = raw.map((x) => Math.floor(x + 1e-9));
  let left = cents - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - base[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) base[order[k].i] += 1;
  items.forEach((it, i) => out.set(it.id, base[i] / 100));
  return out;
}

function addTo(rec: Record<string, number>, ccy: string, v: number): void {
  rec[ccy] = (rec[ccy] ?? 0) + v;
}
function roundRec(rec: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(rec)) o[k] = r2(rec[k]);
  return o;
}

export function groupByDoctor(inv: PreStatementInvoice[]): DoctorGroup[] {
  const map = new Map<string, { items: PdfItem[]; sub: Record<string, number>; net: Record<string, number> }>();
  for (const i of inv) {
    const ccy = i.currency || 'TRY';
    const shares = itemShares(i);
    for (const it of i.items ?? []) {
      const name = (it.doctor_name ?? '').trim() || NO_DOCTOR;
      let g = map.get(name);
      if (!g) { g = { items: [], sub: {}, net: {} }; map.set(name, g); }
      const share = shares.get(it.id) ?? 0;
      g.items.push({ ...it, invoice_id: i.id, invoice_date: i.issue_date ?? null, currency: ccy, share });
      addTo(g.sub, ccy, share);
      addTo(g.net, ccy, num(it.total));
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([doctor, g]) => ({ doctor, items: g.items, subtotal: roundRec(g.sub), net: roundRec(g.net) }));
}

/** total = KDV ve fatura indirimi payı dahil (Σ share) */
export function workTypeTotals(inv: PreStatementInvoice[]): { work: string; currency: string; quantity: number; total: number }[] {
  const map = new Map<string, { work: string; currency: string; quantity: number; total: number }>();
  for (const i of inv) {
    const ccy = i.currency || 'TRY';
    const shares = itemShares(i);
    for (const it of i.items ?? []) {
      const work = (it.description ?? '').trim() || NO_DOCTOR;
      const key = `${ccy}\u0000${work}`;
      const e = map.get(key) ?? { work, currency: ccy, quantity: 0, total: 0 };
      e.quantity += num(it.quantity);
      e.total += shares.get(it.id) ?? 0;
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

/**
 * R7: yalnız o hekimin kalemleri; klinik geneli rakamlar (bakiye, vadesi geçen) yok.
 * Sunucunun own-scope formülü: pay = Σnet(kalan)/Σnet(fatura); indirim = Σnet(fatura) − subtotal;
 * subtotal = Σnet(kalan) − indirim×pay; tax = tax×pay; total = subtotal + tax.
 */
export function scopeToDoctor(data: PreStatement, doctor: string): PreStatement {
  const invoices: PreStatementInvoice[] = [];
  const pending: Record<string, number> = {};
  for (const i of data.invoices) {
    const all = i.items ?? [];
    const items = all.filter((it) => ((it.doctor_name ?? '').trim() || NO_DOCTOR) === doctor);
    if (items.length === 0) continue;
    const allNet = all.reduce((s, it) => s + num(it.total), 0);
    const keptNet = items.reduce((s, it) => s + num(it.total), 0);
    const share = allNet === 0 ? 0 : keptNet / allNet;
    const discount = allNet - num(i.subtotal);
    const subtotal = r2(keptNet - discount * share);
    const tax = r2(num(i.tax) * share);
    const total = r2(subtotal + tax);
    invoices.push({ ...i, items, subtotal, tax, total });
    addTo(pending, i.currency || 'TRY', total);
  }
  const pend = roundRec(pending);
  const summary = Object.keys(pend).sort().map((currency) => ({
    currency, finalized_balance: null, overdue: null, pending: pend[currency],
  }));
  return { ...data, scope: 'own', summary, invoices };
}
