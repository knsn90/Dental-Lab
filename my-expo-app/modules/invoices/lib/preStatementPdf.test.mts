import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByDoctor, workTypeTotals, pendingTotal, scopeToDoctor } from './preStatementPdf.ts';

const item = (id: string, doctor: string | null, description: string, total: number, gross = total, qty = 1) => ({
  id, description, quantity: qty, unit_price: gross / qty, total, gross_total: gross,
  order_no: 'S' + id, patient_initials: 'A.K.', doctor_name: doctor, dispute_status: null, notes: [],
}) as any;
const inv = (id: string, currency: string, items: any[], over: any = {}) => ({
  id, subtotal: 0, tax: 0, invoice_number: null, currency, issue_date: '2026-11-01',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
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

test('scopeToDoctor: KDV ve ara toplam kalemlerden yeniden hesaplanır', () => {
  // subtotal = Σ net (total), total = Σ gross_total, tax = fark
  const vi = inv('v1', 'TRY', [item('1', 'Dr. Ali', 'Kron', 100, 120), item('2', 'Dr. Zeynep', 'Kron', 40, 40)]);
  const r = scopeToDoctor({ enabled: true, actor: 'lab', can_manage: true, scope: 'full', summary: [], invoices: [vi] } as any, 'Dr. Ali');
  assert.equal(r.invoices[0].subtotal, 100);
  assert.equal(r.invoices[0].tax, 20);
  assert.equal(r.invoices[0].total, 120);
});
