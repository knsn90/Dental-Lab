import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreStatementSummaryHtml, buildPreStatementDetailHtml, _groupsForTest, _workTotalsForTest } from './buildPreStatementHtml.ts';
import { groupByDoctor, workTypeTotals, pendingTotal } from './lib/preStatementPdf.ts';

const FULL_NAME = 'Ayşe Kaya';
const mk = (id: string, doctor: string | null, desc: string, total: number, extra: any = {}) => ({
  id, description: desc, quantity: 2, unit_price: total / 2, total, gross_total: total,
  order_no: 'S' + id, patient_initials: 'A.K.', doctor_name: doctor, dispute_status: null,
  notes: [{ id: 'n' + id, author_side: 'clinic', body: `${FULL_NAME} için not`, created_at: '2026-11-02T00:00:00Z' }],
  patient_name: FULL_NAME, ...extra,
}) as any;
const inv = (id: string, items: any[], currency = 'TRY') => ({
  id, subtotal: items.reduce((s, i) => s + i.total, 0), tax: 0, invoice_number: null, currency,
  issue_date: '2026-11-03', created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z',
  total: items.reduce((s, i) => s + i.total, 0), items,
}) as any;

const data = (over: any = {}): any => ({
  enabled: true, actor: 'lab', can_manage: true, scope: 'full',
  summary: [{ currency: 'TRY', finalized_balance: 1000, overdue: 200, pending: 360 }],
  invoices: [
    inv('a', [mk('1', 'Dr. Ali', 'Zirkonyum kron', 200, { dispute_status: 'acik' }), mk('2', 'Dr. Zeynep', 'Model', 60)]),
    inv('b', [mk('3', 'Dr. Ali', 'Gece plağı', 100, { dispute_status: 'yanitlandi' })]),
  ],
  ...over,
});
const i18n = { t: (s: string) => s, locale: 'tr-TR', htmlAttrs: 'lang="tr" dir="ltr"' };
const base = { clinicName: 'Örnek Klinik', lab: { name: 'Örnek Lab' }, generatedAt: '2026-11-09T09:00:00Z', i18n };
const both = (d: any, extra: any = {}) => [
  buildPreStatementSummaryHtml({ ...base, data: d, ...extra }),
  buildPreStatementDetailHtml({ ...base, data: d, ...extra }),
];

test('iki çıktı da başlık bandını içerir', () => {
  for (const h of both(data())) assert.ok(h.includes('Ön ekstre — onay bekliyor'));
});

test('approve verilince qrSvg ve URL geçer; verilmeyince karekod metni yok', () => {
  const approve = { url: 'https://siman.app/s/TOKEN123', qrSvg: '<svg id="qr-marker"></svg>', expiresAt: '2026-12-24T00:00:00Z' };
  for (const h of both(data(), { approve })) {
    assert.ok(h.includes('qr-marker'));
    assert.ok(h.includes('https://siman.app/s/TOKEN123'));
    assert.ok(h.includes('karekodu okutun'));
  }
  for (const h of both(data())) assert.ok(!h.includes('karekodu okutun'));
  // qrSvg yoksa yalnız URL
  const h = buildPreStatementSummaryHtml({ ...base, data: data(), approve: { url: 'https://siman.app/s/X', expiresAt: '2026-12-24' } });
  assert.ok(h.includes('https://siman.app/s/X'));
});

test('hasta tam adı geçmez, baş harfler geçer', () => {
  for (const h of both(data())) {
    assert.ok(!h.includes(FULL_NAME));
    assert.ok(!h.includes('Ayşe'));
  }
  assert.ok(buildPreStatementDetailHtml({ ...base, data: data() }).includes('A.K.'));
});

test('açıklamadaki <script> kaçırılır', () => {
  const d = data({ invoices: [inv('x', [mk('1', 'Dr. <b>Ali</b>', '<script>alert(1)</script>', 10)])] });
  for (const h of both(d)) {
    assert.ok(!h.includes('<script>'));
    assert.ok(h.includes('&lt;script&gt;'));
  }
});

test('ayrıntılı çıktı yazdırma kurallarını içerir', () => {
  const h = buildPreStatementDetailHtml({ ...base, data: data() });
  assert.ok(h.includes('table-header-group'));
  assert.ok(h.includes('break-inside: avoid'));
  assert.ok(h.includes('page-break-inside: avoid'));
  assert.ok(h.includes('@page { size: A4; margin: 16mm 14mm }'));
});

test('hekim ara toplamı sayısı hekim grubu sayısına eşit', () => {
  const h = buildPreStatementDetailHtml({ ...base, data: data() });
  assert.equal((h.match(/data-doctor-subtotal/g) ?? []).length, 2);
});

test('scope own: Kesinleşmiş bakiye ve Vadesi geçen etiketi yok', () => {
  const d = data({ scope: 'own', summary: [{ currency: 'TRY', finalized_balance: null, overdue: null, pending: 360 }] });
  for (const h of both(d)) {
    assert.ok(!h.includes('Kesinleşmiş bakiye'));
    assert.ok(!h.includes('Vadesi geçen'));
    assert.ok(h.includes('Onay bekleyen'));
  }
  for (const h of both(data())) assert.ok(h.includes('Kesinleşmiş bakiye'));
});

test('300 kalem 300 satır üretir', () => {
  const items = Array.from({ length: 300 }, (_, n) => mk(String(n), n % 2 ? 'Dr. Ali' : 'Dr. Zeynep', 'Kron', 10));
  const h = buildPreStatementDetailHtml({ ...base, data: data({ invoices: [inv('big', items)] }) });
  assert.equal((h.match(/<tr data-item/g) ?? []).length, 300);
});

test('çeviri fonksiyonu verilirse etiketler çevrilir', () => {
  const h = buildPreStatementSummaryHtml({ ...base, data: data(), i18n: { t: (s: string) => (s === 'Onay bekleyen' ? 'Awaiting' : s), locale: 'en', htmlAttrs: 'lang="en" dir="ltr"' } });
  assert.ok(h.includes('Awaiting'));
  assert.ok(h.includes('lang="en"'));
});

// KDV + fatura indirimi fixture'ı (subtotal < Σ net)
const vat = (id: string, ccy: string, items: any[], subtotal: number, tax: number) => ({
  ...inv(id, items, ccy), subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100,
});
const VINV: any[] = [
  vat('f1', 'TRY', [mk('1', 'Dr. Ali', 'Kron', 100.1), mk('2', 'Dr. Zeynep', 'Kron', 50.2), mk('3', null, 'Model', 33.3)], 170.5, 34.1),
  vat('f2', 'TRY', [mk('4', 'Dr. Ali', 'Köprü', 77.7)], 77.7, 15.54),
  vat('f3', 'EUR', [mk('5', 'Dr. Ali', 'Kron', 10), mk('6', 'Dr. Ali', 'Model', 10)], 18, 3.6),
];
const money = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test('parity: builder kopyası lib ile aynı sonucu verir', () => {
  const a = _groupsForTest(VINV).map((g) => ({ doctor: g.doctor, subtotal: g.subtotal, net: g.net, items: g.items.map((i) => [i.id, i.share]) }));
  const b = groupByDoctor(VINV).map((g) => ({ doctor: g.doctor, subtotal: g.subtotal, net: g.net, items: g.items.map((i) => [i.id, i.share]) }));
  assert.deepEqual(a, b);
  assert.deepEqual(_workTotalsForTest(VINV), workTypeTotals(VINV));
  assert.ok(a.some((g) => g.doctor === '—'));
});

test('ayrıntılı PDF: Genel toplam pendingTotal ile aynı, hekim bölümünde üç satır', () => {
  const d = data({ invoices: VINV, summary: [{ currency: 'TRY', finalized_balance: 0, overdue: 0, pending: 0 }] });
  const h = buildPreStatementDetailHtml({ ...base, data: d });
  const pend = pendingTotal(VINV);
  assert.equal((h.match(/data-grand-total/g) ?? []).length, 2);
  assert.ok(h.includes(money(pend.TRY)));
  assert.ok(h.includes(money(pend.EUR)));
  assert.ok(h.includes('Genel toplam'));
  assert.ok(h.includes('KDV ve indirim payı'));
  assert.ok(h.includes('Hekim toplamı'));
  assert.equal((h.match(/data-doctor-subtotal/g) ?? []).length, 3);
});
