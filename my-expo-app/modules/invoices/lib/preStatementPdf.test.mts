import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByDoctor, workTypeTotals, pendingTotal, scopeToDoctor, itemShares } from './preStatementPdf.ts';

const item = (id: string, doctor: string | null, description: string, total: number, gross = total, qty = 1) => ({
  id, description, quantity: qty, unit_price: gross / qty, total, gross_total: gross,
  order_no: 'S' + id, patient_initials: 'A.K.', doctor_name: doctor, dispute_status: null, notes: [],
}) as any;
const inv = (id: string, currency: string, items: any[], over: any = {}) => ({
  id, invoice_number: null, currency, issue_date: '2026-11-01',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  subtotal: items.reduce((s, i) => s + i.total, 0), tax: 0,
  total: items.reduce((s, i) => s + i.total, 0), items, ...over,
}) as any;

const A = inv('i1', 'TRY', [item('1', 'Dr. Zeynep', 'Kron', 100), item('2', 'Dr. Ali', 'Köprü', 50)]);
const B = inv('i2', 'TRY', [item('3', 'Dr. Ali', 'Kron', 70), item('4', null, 'Model', 10)]);
const C = inv('i3', 'EUR', [item('5', 'Dr. Ali', 'Kron', 20)]);

test('groupByDoctor gruplar, boş adı — altına koyar, para birimi başına toplar', () => {
  const g = groupByDoctor([A, B, C]);
  assert.deepEqual(g.map((x) => x.doctor), ['—', 'Dr. Ali', 'Dr. Zeynep']);
  const ali = g.find((x) => x.doctor === 'Dr. Ali')!;
  assert.equal(ali.items.length, 3);
  assert.deepEqual(ali.subtotal, { TRY: 120, EUR: 20 });
  assert.equal(ali.items[0].invoice_id, 'i1');
  assert.equal(ali.items[2].currency, 'EUR');
  assert.deepEqual(g.find((x) => x.doctor === '—')!.subtotal, { TRY: 10 });
});

test('workTypeTotals aynı işi ve para birimini birleştirir, tutara göre azalan', () => {
  const w = workTypeTotals([A, B, C]);
  assert.deepEqual(w.find((x) => x.work === 'Kron' && x.currency === 'TRY'), { work: 'Kron', currency: 'TRY', quantity: 2, total: 170 });
  assert.ok(w.find((x) => x.work === 'Kron' && x.currency === 'EUR'));
  const tr = w.filter((x) => x.currency === 'TRY').map((x) => x.total);
  assert.deepEqual(tr, [...tr].sort((a, b) => b - a));
  assert.equal(w[0].total, 170);
});

test('pendingTotal para birimi başına 2 ondalığa yuvarlar', () => {
  assert.deepEqual(pendingTotal([{ currency: 'TRY', total: 100.005 } as any, { currency: 'TRY', total: 0.01 } as any]), { TRY: 100.02 });
  assert.deepEqual(pendingTotal([A, C]), { TRY: 150, EUR: 20 });
});

test('scopeToDoctor yalnız o hekimin kalemlerini bırakır', () => {
  const data: any = {
    enabled: true, actor: 'lab', can_manage: true, scope: 'full',
    summary: [{ currency: 'TRY', finalized_balance: 500, overdue: 50, pending: 230 }],
    invoices: [A, B],
  };
  const r = scopeToDoctor(data, 'Dr. Ali');
  assert.equal(r.scope, 'own');
  assert.equal(r.invoices.length, 2);
  const all = r.invoices.flatMap((i) => i.items);
  assert.ok(all.every((i) => i.doctor_name === 'Dr. Ali'));
  assert.equal(r.invoices[0].total, 50);
  assert.equal(r.invoices[1].total, 70);
  assert.equal(r.summary[0].finalized_balance, null);
  assert.equal(r.summary[0].overdue, null);
  assert.equal(r.summary[0].pending, 120);
  // Kalemi kalmayan fatura düşer
  const r2 = scopeToDoctor({ ...data, invoices: [A, B] }, 'Dr. Zeynep');
  assert.equal(r2.invoices.length, 1);
  assert.equal(r2.invoices[0].id, 'i1');
  assert.equal(r2.invoices[0].total, 100);
  assert.equal(r2.summary[0].pending, 100);
  // Kaynak değişmez
  assert.equal(data.invoices[0].items.length, 2);
});

test('scopeToDoctor: satır indirimi + KDV sunucunun own formülüyle', () => {
  // 200 liste, %10 satır indirimi -> net 180; KDV %20 -> fatura: subtotal 216 - ... basit: iki kalem
  // Ali: net 180 (gross 200), Zeynep: net 20. Fatura indirimi 20 -> subtotal 180, KDV 36, total 216.
  const vi = inv('v1', 'TRY', [item('1', 'Dr. Ali', 'Kron', 180, 200), item('2', 'Dr. Zeynep', 'Kron', 20, 20)],
    { subtotal: 180, tax: 36, total: 216 });
  const r = scopeToDoctor({ enabled: true, actor: 'lab', can_manage: true, scope: 'full', summary: [], invoices: [vi] } as any, 'Dr. Ali');
  // share = 180/200 = 0.9; discount = 200-180 = 20; subtotal = 180 - 20*0.9 = 162; tax = 36*0.9 = 32.4; total = 194.4
  assert.equal(r.invoices[0].subtotal, 162);
  assert.equal(r.invoices[0].tax, 32.4);
  assert.equal(r.invoices[0].total, 194.4);
  assert.equal(r.summary[0].pending, 194.4);
  // satır indirimi (gross-net) KDV sayılmaz: indirimsiz faturada tax 0 kalır
  const vi2 = inv('v2', 'TRY', [item('1', 'Dr. Ali', 'Kron', 180, 200)]);
  const r2 = scopeToDoctor({ enabled: true, actor: 'lab', can_manage: true, scope: 'full', summary: [], invoices: [vi2] } as any, 'Dr. Ali');
  assert.equal(r2.invoices[0].tax, 0);
  assert.equal(r2.invoices[0].total, 180);
});

test('itemShares: paylar fatura toplamına kuruşu kuruşuna eşit', () => {
  const three = inv('s', 'TRY', [item('a', 'D', 'x', 33.333), item('b', 'D', 'x', 33.333), item('c', 'D', 'x', 33.333)], { total: 100 });
  const sh = itemShares(three);
  const sum = [...sh.values()].reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100), 10000);
  assert.deepEqual([...sh.values()].map((v) => Math.round(v * 100)).sort(), [3333, 3333, 3334]);
  // net 0 -> eşit bölüş
  const z = inv('z', 'TRY', [item('a', 'D', 'x', 0), item('b', 'D', 'x', 0)], { total: 10.01 });
  assert.equal(Math.round([...itemShares(z).values()].reduce((a, b) => a + b, 0) * 100), 1001);
  assert.equal(itemShares(inv('e', 'TRY', [], { total: 5 })).size, 0);
});

// KDV + fatura indirimi: subtotal < Σ net
const vatInv = (id: string, ccy: string, items: any[], subtotal: number, tax: number) =>
  inv(id, ccy, items, { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 });
const F1 = vatInv('f1', 'TRY', [item('1', 'Dr. Ali', 'Kron', 100.1), item('2', 'Dr. Zeynep', 'Kron', 50.2), item('3', null, 'Model', 33.3)], 170.5, 34.1);
const F2 = vatInv('f2', 'TRY', [item('4', 'Dr. Ali', 'Köprü', 77.7)], 77.7, 15.54);
const F3 = vatInv('f3', 'EUR', [item('5', 'Dr. Ali', 'Kron', 10), item('6', 'Dr. Ali', 'Model', 10)], 18, 3.6);

test('toplamlar birebir: hekim ara toplamları = iş türü toplamları = pendingTotal', () => {
  const all = [F1, F2, F3];
  for (const i of all) {
    const sum = [...itemShares(i).values()].reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 100), Math.round(i.total * 100));
  }
  const pend = pendingTotal(all);
  const byDoc: Record<string, number> = {};
  for (const g of groupByDoctor(all)) for (const [c, v] of Object.entries(g.subtotal)) byDoc[c] = Math.round(((byDoc[c] ?? 0) + v) * 100) / 100;
  const byWork: Record<string, number> = {};
  for (const w of workTypeTotals(all)) byWork[w.currency] = Math.round(((byWork[w.currency] ?? 0) + w.total) * 100) / 100;
  assert.deepEqual(byDoc, pend);
  assert.deepEqual(byWork, pend);
});
