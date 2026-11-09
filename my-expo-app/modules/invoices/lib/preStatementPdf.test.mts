import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingTotal, scopeToDoctor, itemShares, preStatementLines, pdfCurrencies, pickCurrency } from './preStatementPdf.ts';
import { invoiceDiscountOf } from './statementDiscount.ts';

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

const cents = (n: number) => Math.round(n * 100);
const FULL = 'Ayşe Kaya';
const ps = (invoices: any[], fin: number | null = 1000): any => ({
  enabled: true, actor: 'lab', can_manage: true, scope: 'full',
  summary: [{ currency: 'TRY', finalized_balance: fin, overdue: 0, pending: pendingTotal(invoices).TRY ?? 0 },
    { currency: 'EUR', finalized_balance: 5, overdue: 0, pending: pendingTotal(invoices).EUR ?? 0 }],
  invoices,
});
// Fixture'da hasta TAM adı da var (RPC vermez ama sızıntıyı yakalamak için)
const withName = (i: any) => ({ ...i, patient_name: FULL, items: i.items.map((it: any) => ({ ...it, patient_name: FULL })) });
const LATE = { ...F2, id: 'f0', issue_date: null, created_at: '2026-10-28T09:00:00Z' };

test('preStatementLines özet: fatura başına satır, running bakiye = closing = opening + pending', () => {
  const r = preStatementLines(ps([F1, F2, F3, LATE].map(withName)), 'TRY', 'ozet');
  assert.equal(r.lines.length, 3);                       // EUR faturası (F3) yok
  assert.equal(r.opening, 1000);
  assert.equal(r.hideOpening, false);
  assert.equal(cents(r.closing), cents(1000 + pendingTotal([F1, F2, LATE]).TRY));
  assert.equal(cents(r.lines[r.lines.length - 1].balance), cents(r.closing));
  // sıralama issue_date ?? created_at artan
  assert.deepEqual(r.lines.map((l) => l.id), ['f0', 'f1', 'f2']);
  const l1 = r.lines[1];
  assert.equal(l1.type, 'invoice');
  assert.equal(l1.status, 'taslak');
  assert.equal(cents(l1.debit), cents(F1.total));
  assert.equal(cents(l1.tax!), cents(F1.tax));
  assert.equal(l1.taxRate, 20);
  assert.equal(l1.credit, 0);
  assert.equal(l1.orderNo, 'S1, S2, S3');
  assert.equal(l1.patientName, 'A.K.');
  // İndirimli fatura: Σ net (183.6) − subtotal (170.5)
  assert.equal(cents(l1.discount!), cents(183.6 - 170.5));
  assert.equal(cents(l1.discountBase!), cents(183.6));
  assert.equal(r.lines[2].discount ?? 0, 0);
});

test('preStatementLines ayrıntılı: kalem başına satır; debit ve tax fatura toplamına kuruşu kuruşuna eşit', () => {
  const r = preStatementLines(ps([F1, F2, F3].map(withName)), 'TRY', 'ayrintili');
  assert.equal(r.lines.length, 4);
  for (const f of [F1, F2]) {
    const ls = r.lines.filter((l) => l.id!.startsWith(f.id + ':'));
    assert.equal(ls.length, f.items.length);
    assert.equal(ls.reduce((s, l) => s + cents(l.debit), 0), cents(f.total));
    assert.equal(ls.reduce((s, l) => s + cents(l.tax ?? 0), 0), cents(f.tax));
  }
  const first = r.lines[0];
  assert.equal(first.orderNo, 'S1');
  assert.equal(first.patientName, 'A.K.');
  assert.equal(first.doctorName, 'Dr. Ali');
  assert.match(first.description, /^Kron · 1 × /);
  assert.ok(r.lines.every((l) => !l.discount));
  assert.equal(cents(r.lines[r.lines.length - 1].balance), cents(r.closing));
});

test('preStatementLines: finalized_balance null → opening 0 ve hideOpening', () => {
  const r = preStatementLines(ps([F1], null), 'TRY', 'ozet');
  assert.equal(r.opening, 0);
  assert.equal(r.hideOpening, true);
  assert.equal(cents(r.closing), cents(F1.total));
  // hekime özel kapsam (own) da açılışsız
  const own = preStatementLines(scopeToDoctor(ps([F1, F2]), 'Dr. Ali'), 'TRY', 'ayrintili');
  assert.equal(own.hideOpening, true);
  assert.equal(own.opening, 0);
});

test('preStatementLines: başka para birimi satıra girmez; EUR seçilince yalnız EUR', () => {
  const r = preStatementLines(ps([F1, F3]), 'EUR', 'ozet');
  assert.deepEqual(r.lines.map((l) => l.id), ['f3']);
  assert.equal(r.opening, 5);
  assert.equal(cents(r.closing), cents(5 + F3.total));
});

test('preStatementLines: hasta tam adı hiçbir satırda yok (KVKK)', () => {
  for (const mode of ['ozet', 'ayrintili'] as const) {
    const r = preStatementLines(ps([F1, F2].map(withName)), 'TRY', mode);
    assert.ok(!JSON.stringify(r).includes(FULL), mode);
  }
});

test('preStatementLines özet indirimi mevcut ekstreyle aynı: satır indirimi + fatura altı indirim', () => {
  // Kalem: brüt 200 / net 180 (satır indirimi 20); fatura altı indirim 10 → subtotal 170
  const d = inv('d1', 'TRY', [item('1', 'Dr. Ali', 'Kron', 180, 200)], { subtotal: 170, tax: 0, total: 170 });
  const l = preStatementLines(ps([d]), 'TRY', 'ozet').lines[0];
  assert.equal(l.discount, 30);
  assert.equal(l.discountBase, 200);
  // Mevcut ekstrenin hesabı (fatura kalemi: total = brüt, net_total = net; discount_amount = fatura altı)
  const existing = invoiceDiscountOf({ items: [{ total: 200, net_total: 180 }], discount_amount: 10 });
  assert.deepEqual({ amount: l.discount, gross: l.discountBase }, existing);
});

test('pdfCurrencies: hekim seçilince yalnız o hekimin kalemlerinin para birimleri', () => {
  const data = ps([A, B, C]);                       // A,B TRY (Ali, Zeynep, —); C EUR (yalnız Ali)
  assert.deepEqual(pdfCurrencies(data, null), ['TRY', 'EUR']);
  assert.deepEqual(pdfCurrencies(data, 'Dr. Ali'), ['TRY', 'EUR']);
  assert.deepEqual(pdfCurrencies(data, 'Dr. Zeynep'), ['TRY']);
});

test('pickCurrency: seçim listede kalırsa korunur; değilse tercih, o da yoksa ilki', () => {
  assert.equal(pickCurrency(['TRY', 'EUR'], 'EUR', 'TRY'), 'EUR');
  assert.equal(pickCurrency(['TRY'], 'EUR', 'TRY'), 'TRY');
  assert.equal(pickCurrency(['TRY', 'EUR'], null, 'EUR'), 'EUR');
  assert.equal(pickCurrency(['TRY'], null, 'EUR'), 'TRY');
  assert.equal(pickCurrency([], null, undefined), 'TRY');
});
