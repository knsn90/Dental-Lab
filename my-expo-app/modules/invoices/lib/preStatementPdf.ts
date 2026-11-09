// Ön ekstre PDF'leri için saf hesaplar (node --test ile çalışır).
// Yerel içe aktarma yalnız `import type`.
import type { PreStatement, PreStatementInvoice } from '../types';
import type { StatementLine } from '../buildStatementHtml';

export const NO_DOCTOR = '—';

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: unknown): number => Number(n) || 0;

/** `cents` kuruşu ağırlıklarla orantılı, en büyük kalan yöntemiyle dağıtır (Σ = cents). Σağırlık=0 ise eşit. */
function distribute(cents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (sumW === 0 ? cents / weights.length : (cents * w) / sumW));
  const base = raw.map((x) => Math.floor(x + 1e-9));
  let left = cents - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - base[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) base[order[k].i] += 1;
  return base;
}

/**
 * Fatura toplamını (KDV dahil, fatura indirimi uygulanmış) kalemlere net tutarlarıyla orantılı dağıtır.
 * En büyük kalan yöntemi: paylar kuruşu kuruşuna `inv.total`'a eşittir. Σnet=0 ise eşit bölüşür.
 */
export function itemShares(inv: PreStatementInvoice): Map<string, number> {
  const items = inv.items ?? [];
  const out = new Map<string, number>();
  const parts = distribute(Math.round(num(inv.total) * 100), items.map((it) => num(it.total)));
  items.forEach((it, i) => out.set(it.id, parts[i] / 100));
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

const uniq = (xs: (string | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const x of xs) { const v = (x ?? '').trim(); if (v && !out.includes(v)) out.push(v); }
  return out;
};
const dateOf = (i: PreStatementInvoice): string => (i.issue_date ?? i.created_at ?? '').slice(0, 10);

/** Tek KDV oranı: tax/subtotal tam sayıya yakınsa o oran; değilse verilmez. */
function rateOf(i: PreStatementInvoice): number | undefined {
  const sub = num(i.subtotal), tax = num(i.tax);
  if (sub <= 0 || tax <= 0) return undefined;
  const r = (tax / sub) * 100;
  return Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) : undefined;
}

/**
 * Ön ekstreyi mevcut cari ekstre satırlarına (buildStatementHtml) çevirir — tek para birimi.
 *  - özet: fatura başına satır; ayrıntılı: kalem başına satır (pay = itemShares, KDV payı en büyük kalanla).
 *  - opening = kesinleşmiş bakiye (own kapsamda null → 0 ve hideOpening); closing = opening + onay bekleyen.
 *  - balance = opening + kümülatif borç. Hasta yalnız baş harf (RPC tam ad vermez; burada da okunmaz).
 * `money` yalnız ayrıntılı açıklamadaki birim fiyat için (varsayılan 2 ondalık).
 */
export function preStatementLines(
  data: PreStatement,
  currency: string,
  mode: 'ozet' | 'ayrintili',
  opts: { money?: (n: number) => string } = {},
): { lines: StatementLine[]; opening: number; closing: number; hideOpening: boolean } {
  const money = opts.money ?? ((n: number) => num(n).toFixed(2));
  const sum = (data.summary ?? []).find((s) => s.currency === currency);
  const fin = sum?.finalized_balance;
  const hideOpening = fin === null || fin === undefined || data.scope === 'own';
  const opening = hideOpening ? 0 : r2(num(fin));
  const invs = (data.invoices ?? [])
    .filter((i) => (i.currency || 'TRY') === currency)
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => dateOf(a.i).localeCompare(dateOf(b.i))
      || (a.i.invoice_number ?? '').localeCompare(b.i.invoice_number ?? '')
      || a.idx - b.idx)
    .map((x) => x.i);

  const rows: Omit<StatementLine, 'balance'>[] = [];
  for (const inv of invs) {
    const items = inv.items ?? [];
    const common = {
      date: dateOf(inv),
      type: 'invoice' as const,
      invoiceNo: inv.invoice_number ?? undefined,
      status: 'taslak',
      credit: 0,
      taxRate: rateOf(inv),
    };
    if (mode === 'ozet') {
      const net = items.reduce((s, it) => s + num(it.total), 0);
      const disc = r2(net - num(inv.subtotal));
      rows.push({
        ...common,
        id: inv.id,
        description: uniq(items.map((it) => it.description)).join(', ') || (inv.invoice_number ?? ''),
        orderNo: uniq(items.map((it) => it.order_no)).join(', ') || null,
        patientName: uniq(items.map((it) => it.patient_initials)).join(', ') || null,
        doctorName: uniq(items.map((it) => it.doctor_name)).join(', ') || null,
        debit: r2(num(inv.total)),
        tax: r2(num(inv.tax)),
        ...(disc > 0.004 ? { discount: disc, discountBase: r2(net) } : {}),
      });
    } else {
      const shares = itemShares(inv);
      const taxParts = distribute(Math.round(num(inv.tax) * 100), items.map((it) => num(it.total)));
      items.forEach((it, k) => {
        rows.push({
          ...common,
          id: `${inv.id}:${it.id}`,
          description: `${(it.description ?? '').trim() || NO_DOCTOR} · ${num(it.quantity)} × ${money(num(it.unit_price))}`,
          orderNo: it.order_no ?? null,
          patientName: it.patient_initials ?? null,
          doctorName: (it.doctor_name ?? '').trim() || null,
          debit: shares.get(it.id) ?? 0,
          tax: taxParts[k] / 100,
        });
      });
    }
  }
  // Kuruş tamsayısıyla biriktir: kayan nokta kayması bakiyeye girmesin
  let run = Math.round(opening * 100);
  const lines = rows.map((l) => { run += Math.round(l.debit * 100); return { ...l, balance: run / 100 }; });
  const closing = r2(opening + num(pendingTotal(invs)[currency]));
  return { lines, opening, closing, hideOpening };
}
