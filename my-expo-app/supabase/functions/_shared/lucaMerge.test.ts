// node --test my-expo-app/supabase/functions/_shared/lucaMerge.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeKey, validateMergeSet, mergeInvoices, isEttn, type MergeRow } from './lucaMerge.ts';
import { buildLucaInput, type SellerConfig } from './lucaInvoice.ts';

const LAB = 'lab-1';
const row = (over: Partial<MergeRow>): MergeRow => ({
  id: 'a', lab_id: LAB, clinic_id: 'c1', invoice_number: 'FTR-2026-00001', status: 'kesildi', issue_date: '2026-09-01',
  currency: 'EUR', tax_rate: 10, total: 33, efatura_uuid: null, efatura_status: 'pending', notes: null,
  order_numbers: ['NEX-2026-0001'],
  items: [{ description: 'Zirkon Kron / Köprü', quantity: 1, unit_price: 30, total: 30, net_total: 30 }],
  ...over,
});

test('birleştirme anahtarı sıradan ve tekrardan bağımsız', () => {
  assert.equal(mergeKey(['b', 'a', 'b']), mergeKey(['a', 'b']));
  assert.notEqual(mergeKey(['a', 'b']), mergeKey(['a']));
});

test('ETTN biçimi (UUID) doğrulanır', () => {
  assert.equal(isEttn('06904b10-9810-497f-80e9-0df2b68ddb37'), true);
  assert.equal(isEttn(' 06904B10-9810-497F-80E9-0DF2B68DDB37 '), true);
  assert.equal(isEttn('NEX2026000000001'), false);
  assert.equal(isEttn(''), false);
});

test('geçerli küme: aynı lab + klinik + döviz; taslaklar kesilecekler listesine', () => {
  // Gönderimi Luca'ya hiç ulaşmamış hata (ETTN yok) yeniden denenebilir.
  const rows = [row({ id: 'a' }), row({ id: 'b', status: 'taslak' }), row({ id: 'c', status: 'odendi', efatura_status: 'error', efatura_uuid: null })];
  const r = validateMergeSet(rows, ['a', 'b', 'c'], LAB);
  assert.deepEqual(r, { ok: true, clinicId: 'c1', currency: 'EUR', promoteIds: ['b'] });
});

test('geçersiz kümeler anlaşılır hata verir', () => {
  const err = (rows: MergeRow[], ids = rows.map((r) => r.id)) => {
    const r = validateMergeSet(rows, ids, LAB);
    assert.equal(r.ok, false);
    return (r as { error: string }).error;
  };
  assert.match(err([], []), /En az bir fatura/);
  assert.match(err([row({ id: 'a' })], ['a', 'z']), /bulunamadı/);
  assert.match(err([row({ lab_id: 'lab-2' })]), /laboratuvarınıza ait değil/);
  assert.match(err([row({ id: 'a' }), row({ id: 'b', clinic_id: 'c2' })]), /aynı kliniğe/);
  assert.match(err([row({ clinic_id: null })]), /Kliniği olmayan/);
  assert.match(err([row({ status: 'iptal', invoice_number: 'FTR-9' })]), /İptal edilmiş.*: FTR-9/);
  assert.match(err([row({ efatura_uuid: 'u', efatura_status: 'sent', invoice_number: 'FTR-8' })]), /zaten e-faturalı: FTR-8/);
  // ETTN'si olan fatura durumu "hata" olsa da bir daha toplu e-faturaya giremez (Luca'da fatura var).
  assert.match(err([row({ efatura_uuid: 'u', efatura_status: 'error', invoice_number: 'FTR-6' })]), /zaten e-faturalı: FTR-6/);
  assert.match(err([row({ efatura_uuid: 'u', efatura_status: 'cancelled', invoice_number: 'FTR-5' })]), /zaten e-faturalı: FTR-5/);
  assert.match(err([row({ id: 'a' }), row({ id: 'b', currency: 'TRY' })]), /farklı para birimlerinde/);
  assert.match(err([row({ total: 0, invoice_number: 'FTR-7' })]), /Tutarı 0.*: FTR-7/);
});

test('birleştirme: kalemler tarih sırasıyla, sipariş no satır notunda, satır KDV\'si faturasından', () => {
  const m = mergeInvoices([
    row({ id: 'b', invoice_number: 'FTR-2026-00002', issue_date: '2026-09-05', tax_rate: 20, total: 24, order_numbers: ['NEX-2026-0002'],
      items: [{ description: 'Gece plağı', quantity: 1, unit_price: 20, total: 20, net_total: 20 }] }),
    row({ id: 'a', items: [{ description: '[LAB-1] Zirkon', quantity: 1, unit_price: 30, total: 30, net_total: 30 }] }),
  ], '2026-10-21');
  assert.equal(m.id, 'a');
  assert.equal(m.issue_date, '2026-10-21');
  assert.equal(m.currency, 'EUR');
  assert.equal(m.total, 57);
  assert.equal(m.invoice_number, 'FTR-2026-00001, FTR-2026-00002');
  // Ürün adı temiz kalır (Luca ürün kartı adla eşleşir); sipariş no satırın açıklamasına gider.
  assert.deepEqual(m.items.map((i) => [i.description, i.line_note, i.vat_rate]), [
    ['[LAB-1] Zirkon', 'NEX-2026-0001', 10], ['Gece plağı', 'NEX-2026-0002', 20],
  ]);
});

test('çok faturada not özetlenir (ilk … son, adet)', () => {
  const many = Array.from({ length: 12 }, (_, i) => row({ id: `i${i}`, invoice_number: `FTR-2026-${String(i + 1).padStart(5, '0')}`, issue_date: `2026-09-${String(i + 1).padStart(2, '0')}` }));
  assert.equal(mergeInvoices(many, '2026-10-21').invoice_number, 'FTR-2026-00001 … FTR-2026-00012 (12 fatura)');
});

test('birleştirilmiş fatura Luca girdisine dönüşür: karışık KDV, toplam = Siman toplamları', () => {
  const seller: SellerConfig = { vkn: '6312098145', tax_office: 'Kozyatağı', city: 'İstanbul', town: 'Ataşehir', street: 'Vatan Cad. 21' };
  const clinic = { name: 'Luna', vkn: '6091290810', tax_office: 'Kozyatağı', address: 'Metropol, Ataşehir / İstanbul', email: null, phone: null, efatura_alias: null };
  const m = mergeInvoices([row({ id: 'a' }), row({ id: 'b', tax_rate: 20, total: 24, items: [{ description: 'X', quantity: 2, unit_price: 10, total: 20, net_total: 20 }] })], '2026-10-21');
  const r = buildLucaInput({ invoice: m, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: seller.vkn, inboxTag: 'urn:mail:defaultpk@x', crossRate: 55.6, totalTolerance: 0.02 });
  if (!r.ok) throw new Error(r.error);
  assert.deepEqual(r.input.lines.map((l) => l.vatRate), [10, 20]);
  assert.deepEqual(r.input.lines.map((l) => l.note), ['NEX-2026-0001', 'NEX-2026-0001']);
  assert.equal(r.input.lines[0].code, r.input.lines[0].code.replace(/\[.*\]/, ''));
  assert.equal(r.input.issueDate, '2026-10-21');
});

test('birleştirme: yalnız indirimli faturanın kalemlerine pay yazılır; Luca toplamı tutar', () => {
  const seller: SellerConfig = { vkn: '6312098145', tax_office: 'Kozyatağı', city: 'İstanbul', town: 'Ataşehir', street: 'Vatan Cad. 21' };
  const clinic = { name: 'Luna', vkn: '6091290810', tax_office: 'Kozyatağı', address: 'Metropol, Ataşehir / İstanbul', email: null, phone: null, efatura_alias: null };
  const a = row({ id: 'a', tax_rate: 20, total: 348, discount_amount: 10, items: [
    { description: 'A1', quantity: 1, unit_price: 100, total: 100, net_total: 100 },
    { description: 'A2', quantity: 1, unit_price: 200, total: 200, net_total: 200 },
  ] });
  const b = row({ id: 'b', invoice_number: 'FTR-2026-00002', issue_date: '2026-09-05', tax_rate: 20, total: 120, items: [
    { description: 'B1', quantity: 1, unit_price: 100, total: 100, net_total: 100 },
  ] });
  const m = mergeInvoices([a, b], '2026-10-21');
  const r = buildLucaInput({ invoice: m, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: seller.vkn, inboxTag: 'urn:mail:defaultpk@x', crossRate: 55.6, totalTolerance: 0.02 });
  if (!r.ok) throw new Error(r.error);
  assert.deepEqual(r.input.lines.map((l) => l.discountAmount), [3.33, 6.67, 0]);
});

test('birleştirme: indirimsiz kümede çıktı değişmez (discount_amount 0/yok)', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b', invoice_number: 'FTR-2026-00002', issue_date: '2026-09-05' })];
  const base = mergeInvoices(rows, '2026-10-21');
  assert.deepEqual(mergeInvoices(rows.map((r) => ({ ...r, discount_amount: 0 })), '2026-10-21'), base);
});

// ── düzeltme turu 1: KDV dengeli birleştirme ─────────────────────────────
import { invoiceTotalsWithDiscount } from './invoiceDiscount.ts';
import { computeTotals } from './luca.ts';

const mkSeller: SellerConfig = { vkn: '6312098145', tax_office: 'Kozyatağı', city: 'İstanbul', town: 'Ataşehir', street: 'Vatan Cad. 21' };
const mkClinic = { name: 'Luna', vkn: '6091290810', tax_office: 'Kozyatağı', address: 'Metropol, Ataşehir / İstanbul', email: null, phone: null, efatura_alias: null };
/** İndirimli kaynak fatura: DB gibi toplam = ROUND(ara toplam) + ROUND(KDV). */
const discounted = (id: string, nets: number[], pct: number): MergeRow => {
  const sum = nets.reduce((a, b) => a + b, 0);
  const t = invoiceTotalsWithDiscount(sum, 20, 'percent', pct);
  return row({ id, invoice_number: `FTR-2026-${id.padStart(5, '0')}`, tax_rate: 20, total: t.total, discount_amount: t.discount,
    items: nets.map((n, i) => ({ description: `K${i}`, quantity: 1, unit_price: n, total: n, net_total: n, sort_order: i })) });
};
const sendMerged = (rows: MergeRow[]) => {
  const m = mergeInvoices(rows, '2026-10-21');
  return { m, r: buildLucaInput({ invoice: m, clinic: mkClinic, doctor: null, seller: mkSeller, kind: 'e_fatura', companyTaxCode: mkSeller.vkn, inboxTag: 'urn:mail:defaultpk@x', crossRate: 55.6, totalTolerance: rows.length / 100 }) };
};

test('birleştirme: 8 indirimli fatura → birleşik ödenecek tutar Σ toplam ile KURUŞU KURUŞUNA', () => {
  const rows = [
    discounted('1', [850, 850, 175], 7.5), discounted('2', [1250.5, 99.9, 33.33, 650], 12.5), discounted('3', [300, 2400], 10),
    discounted('4', [175, 175, 175, 12.34], 5), discounted('5', [1000, 4500, 650, 850, 7.77], 7.5), discounted('6', [850, 850], 7.5),
    discounted('7', [33.33, 33.33, 33.33], 10), discounted('8', [1250, 1250, 1250, 1250, 1250], 12.5),
  ];
  const { m, r } = sendMerged(rows);
  if (!r.ok) throw new Error(r.error);
  const sumTotals = Math.round(rows.reduce((a, x) => a + Number(x.total), 0) * 100) / 100;
  assert.equal(m.total, sumTotals);
  assert.equal(computeTotals(r.input.lines).payable, sumTotals);
});

test('birleştirme: indirimli + indirimsiz karışık — indirimliler tam, indirimsizlerde eski 1 kuruş toleransı', () => {
  const plain = row({ id: 'p', invoice_number: 'FTR-2026-00099', tax_rate: 20, total: 24, items: [{ description: 'X', quantity: 1, unit_price: 20, total: 20, net_total: 20 }] });
  const { m, r } = sendMerged([discounted('1', [850, 850, 175], 7.5), plain, discounted('2', [300, 2400], 10)]);
  if (!r.ok) throw new Error(r.error);
  assert.equal(computeTotals(r.input.lines).payable, m.total);
  assert.equal(m.discount_tolerance, 0.015);
});

test('birleştirme: dengelenemeyen kaynak fatura birleşik faturayı reddettirir', () => {
  const bad = row({ id: 'z', tax_rate: 1, total: 651.1, discount_amount: 2304.95, items: [
    { description: 'A', quantity: 1, unit_price: 2550, total: 2550, net_total: 2550 }, { description: 'B', quantity: 1, unit_price: 399.6, total: 399.6, net_total: 399.6 }] });
  const { r } = sendMerged([bad, row({ id: 'a' })]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /dağıtılamadı/);
});

test('indirimsiz birleştirme çıktısında yeni anahtar yok (discount_tolerance/discount_error)', () => {
  const m = mergeInvoices([row({ id: 'a' })], '2026-10-21');
  assert.equal('discount_tolerance' in m, false);
  assert.equal('discount_error' in m, false);
});

test('birleştirme: indirimli kaynağın kendi kuruş sapması birleşik tolerans içinde gizlenemez', () => {
  // 500 + 500, %10 indirim → DB 1080,00; ek kalem net_total null, total 0,01 → kaynağın kendi ödenecek tutarı 1080,01.
  const sneaky = row({ id: 's', tax_rate: 20, total: 1080, discount_amount: 100, items: [
    { description: 'A', quantity: 1, unit_price: 500, total: 500, net_total: 500, sort_order: 0 },
    { description: 'B', quantity: 1, unit_price: 500, total: 500, net_total: 500, sort_order: 1 },
    { description: 'C', quantity: 1, unit_price: 0.01, total: 0.01, net_total: null, sort_order: 2 },
  ] });
  const plain = row({ id: 'p', invoice_number: 'FTR-2026-00099', tax_rate: 20, total: 24, items: [{ description: 'X', quantity: 1, unit_price: 20, total: 20, net_total: 20 }] });
  const { r } = sendMerged([sneaky, plain]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /kuruşu kuruşuna dağıtılamadı/);
});

// ── Görev 17: birleşik faturada liste fiyatı + oran ─────────────────────
test('birleştirme: liste alanları kaleme taşınır; Luca satır net’i ve ödenecek tutar liste alanı yokkenkiyle aynı', () => {
  const listed = { description: 'Zirkon', quantity: 2, unit_price: 1062.93, total: 2125.86, net_total: 2125.86, list_unit_price: 1250.5, list_discount_pct: 15, sort_order: 0 };
  const plain = { description: 'Model', quantity: 1, unit_price: 250, total: 250, net_total: 250, sort_order: 1 };
  const t = invoiceTotalsWithDiscount(2375.86, 20, 'fixed', 100);
  const a = row({ id: 'a', tax_rate: 20, total: t.total, discount_amount: t.discount, items: [listed, plain] });
  const b = row({ id: 'b', invoice_number: 'FTR-2026-00002', issue_date: '2026-09-05', tax_rate: 20, total: 3000.64,
    items: [{ ...listed, net_total: 2500.53, quantity: 1, unit_price: 2500.53, total: 2500.53, list_unit_price: 2941.8, list_discount_pct: 15 }] });
  // b: 2941,80 × 0,85 = 2500,53; × 1,2 = 3000,636 → 3000,64
  const strip = (r: MergeRow): MergeRow => ({ ...r, items: r.items.map(({ list_unit_price: _a, list_discount_pct: _b, ...it }: any) => it) });
  const { m, r } = sendMerged([a, b]);
  const { r: r0 } = sendMerged([strip(a), strip(b)]);
  if (!r.ok) throw new Error(r.error);
  if (!r0.ok) throw new Error(r0.error);
  assert.deepEqual(m.items.map((i) => [i.list_unit_price ?? null, i.list_discount_pct ?? null]), [[1250.5, 15], [null, null], [2941.8, 15]]);
  assert.deepEqual(r.input.lines.map((l) => l.unitPrice), [1250.5, 250, 2941.8]);
  const tl = computeTotals(r.input.lines), t0 = computeTotals(r0.input.lines);
  assert.deepEqual(tl.lines.map((x) => [x.lineExtension, x.vat]), t0.lines.map((x) => [x.lineExtension, x.vat]));
  assert.equal(tl.payable, t0.payable);
  assert.equal(tl.payable, Math.round((t.total + 3000.64) * 100) / 100);
  // iskonto = adet × liste − (net − pay)
  assert.equal(r.input.lines[2].discountAmount, Math.round((2941.8 - 2500.53) * 100) / 100);
  assert.equal(r.input.lines[0].discountAmount, Math.round((2501 - tl.lines[0].lineExtension) * 100) / 100);
  assert.ok(tl.lines[0].lineExtension < 2125.86); // a'nın fatura altı payı bu satırda
});
