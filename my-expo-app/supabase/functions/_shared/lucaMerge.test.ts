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
