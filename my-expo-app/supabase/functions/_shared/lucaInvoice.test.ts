// node --test my-expo-app/supabase/functions/_shared/lucaInvoice.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCityTown, mapLucaStatus, buildLucaInput, buildLucaPreview, productCode, type DbInvoice, type SellerConfig } from './lucaInvoice.ts';
import { buildSendEnvelope } from './luca.ts';

const seller: SellerConfig = { vkn: '6312098145', tax_office: 'Kozyatağı', city: 'İstanbul', town: 'Ataşehir', street: 'Atatürk Mah. Vatan Cad. No: 21' };
const clinic = { name: 'Gülüş Diş Kliniği', vkn: '8810234738', tax_office: 'Kadıköy', address: 'Caferağa Mah. Moda Cad. No:5, Kadıköy / İstanbul', email: 'info@gulus.test', phone: null, efatura_alias: null };
const inv: DbInvoice = {
  id: '11111111-2222-4333-8444-555555555555', invoice_number: 'FTR-2026-00060', issue_date: '2026-10-17',
  currency: 'TRY', tax_rate: 20, subtotal: 3150, tax_amount: 630, total: 3780, notes: null,
  items: [
    { description: 'Zirkonyum kron', quantity: 2, unit_price: 1500, total: 3000, net_total: 2900 },
    { description: 'Çalışma modeli', quantity: 1, unit_price: 250, total: 250, net_total: 250 },
  ],
};
const ok = (r: ReturnType<typeof buildLucaInput>) => { if (!r.ok) throw new Error(r.error); return r.input; };

// ── adres ────────────────────────────────────────────────────────────────
test('adres sonundaki "İlçe / İl" ayrıştırılır', () => {
  assert.deepEqual(parseCityTown('Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir / İstanbul'),
    { street: 'Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2', town: 'Ataşehir', city: 'İstanbul' });
  assert.deepEqual(parseCityTown('Moda Cad. 5 Kadıköy/İstanbul'), { street: 'Moda Cad. 5', town: 'Kadıköy', city: 'İstanbul' });
  assert.deepEqual(parseCityTown('Kadıköy / İstanbul'), { street: '', town: 'Kadıköy', city: 'İstanbul' });
  for (const bad of [null, '', 'Moda Cad. No:5 Kadıköy', 'a / b / c'])
    assert.equal(parseCityTown(bad), null, String(bad));
});

// ── durum eşleme ─────────────────────────────────────────────────────────
test('e-Fatura durumları', () => {
  assert.equal(mapLucaStatus('e_fatura', { status: 'Gonderildi', detailStatus: 'Basariyla_Tamamlandi' }, 'TEMELFATURA').status, 'accepted');
  assert.equal(mapLucaStatus('e_fatura', { status: 'Gonderildi', detailStatus: 'Basariyla_Tamamlandi' }, 'TICARIFATURA').status, 'sent');
  assert.equal(mapLucaStatus('e_fatura', { status: 'Alici_Kabul_Etti' }, 'TICARIFATURA').status, 'accepted');
  assert.equal(mapLucaStatus('e_fatura', { status: 'Alici_Reddetti' }, 'TICARIFATURA').status, 'rejected');
  assert.equal(mapLucaStatus('e_fatura', { status: 'Ziplendi', detailStatus: 'Zarflanmadi' }, 'TEMELFATURA').status, 'sent');
  const err = mapLucaStatus('e_fatura', { status: 'Gib_Tarafinda_Hata_Olustu', detailStatus: 'Adres_Bulunamadi' }, 'TEMELFATURA');
  assert.equal(err.status, 'error');
  assert.match(err.error ?? '', /Adres_Bulunamadi/);
  assert.equal(mapLucaStatus('e_fatura', { status: 'Gonderildi', detailStatus: 'Fatura_Iptale_Konu_Edildi' }, 'TEMELFATURA').status, 'cancelled');
});

test('e-Arşiv durumları', () => {
  assert.equal(mapLucaStatus('e_arsiv', { status: 'Fatura_Olusturuldu', reportStatus: 'Gibe_Otomatik_Raporlanacaktir' }).status, 'accepted');
  assert.equal(mapLucaStatus('e_arsiv', { status: 'Pdf_Hazirlaniyor' }).status, 'sent');
  assert.equal(mapLucaStatus('e_arsiv', { status: 'Silindi' }).status, 'cancelled');
  assert.equal(mapLucaStatus('e_arsiv', { status: 'Fatura_Olusturuldu', reportStatus: 'Gib_Tarafinda_Hata_Olustu' }).status, 'error');
});

// ── fatura kurulumu ──────────────────────────────────────────────────────
test('kurumsal klinik → e-Fatura girdisi; iskonto = brüt − net, KDV fatura oranı', () => {
  const input = ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
  assert.equal(input.externalCode, inv.id);
  assert.equal(input.seller.taxCode, '6312098145');
  assert.deepEqual([input.receiver.taxCode, input.receiver.town, input.receiver.city, input.receiver.inboxTag], ['8810234738', 'Kadıköy', 'İstanbul', 'urn:mail:x@y']);
  assert.deepEqual(input.lines.map((l) => [l.quantity, l.unitPrice, l.discountAmount, l.vatRate]), [[2, 1500, 100, 20], [1, 250, 0, 20]]);
  assert.deepEqual(input.notes, ['Siman fatura no: FTR-2026-00060']);
  buildSendEnvelope(input); // kurulabilir olmalı
});

test('şahıs şirketi: satıcı TCKN (11 hane) kabul edilir', () => {
  const input = ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller: { ...seller, vkn: '10000000146' }, kind: 'e_arsiv', companyTaxCode: '10000000146' }));
  assert.equal(input.seller.taxCode, '10000000146');
});

test('test ortamında satıcı VKN yerine demo VKN (companyTaxCode) kullanılır', () => {
  const input = ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '1234567801' }));
  assert.equal(input.seller.taxCode, '1234567801');
});

test('VKN\'siz klinik GÖNDERİLMEZ (şirket kliniği "nihai tüketici" e-Arşivi olmasın); biçim de denetlenir', () => {
  const err = (c: any) => { const r = buildLucaInput({ invoice: inv, clinic: c, doctor: { full_name: 'Dr. Ayşe Kaya', tckn: '10000000146' }, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' }); assert.equal(r.ok, false); return (r as any).error as string; };
  assert.match(err({ ...clinic, vkn: null }), /vergi numarası eksik/);
  assert.match(err({ ...clinic, vkn: '12345' }), /vergi numarası geçersiz/);
  // Şahıs hekim: klinik kaydına 11 haneli TCKN girilir → geçerli alıcı
  const t = ok(buildLucaInput({ invoice: inv, clinic: { ...clinic, vkn: '10000000146' }, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' }));
  assert.equal(t.receiver.taxCode, '10000000146');
});

test('döviz faturası kur ister; TRY istemez', () => {
  const eur = { ...inv, currency: 'EUR' };
  const r = buildLucaInput({ invoice: eur, clinic, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' });
  assert.equal(r.ok, false);
  const input = ok(buildLucaInput({ invoice: eur, clinic, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145', crossRate: 55.618 }));
  assert.equal(input.crossRate, 55.618);
});

const reason = (over: Partial<Parameters<typeof buildLucaInput>[0]>) => {
  const r = buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y', ...over });
  assert.equal(r.ok, false);
  return (r as { error: string }).error;
};

test('reddedilen durumlar anlaşılır mesaj verir', () => {
  assert.match(reason({ invoice: { ...inv, tax_rate: 0, tax_amount: 0, total: 3150 } }), /%0/);
  assert.match(reason({ invoice: { ...inv, total: 0, subtotal: 0, tax_amount: 0 } }), /tutar/i);
  assert.match(reason({ invoice: { ...inv, items: [] } }), /kalem/i);
  // Satıcı bilgisi lab'dan (Ayarlar → Genel → Fatura Bilgileri) — mesaj oraya yönlendirir.
  assert.match(reason({ seller: { ...seller, tax_office: '' } }), /Fatura Bilgileri/);
  assert.match(reason({ seller: { ...seller, street: '' } }), /Fatura Bilgileri/);
  assert.match(reason({ seller: { ...seller, vkn: '123' } }), /VKN/);
  assert.match(reason({ clinic: { ...clinic, address: 'Moda Cad. 5' } }), /İlçe \/ İl/);
  assert.match(reason({ clinic: { ...clinic, tax_office: null } }), /vergi dairesi/i);
  assert.match(reason({ inboxTag: null }), /posta kutusu/i);
});

test('uygulamadaki toplamla 1 kuruştan fazla sapma varsa gönderilmez', () => {
  assert.match(reason({ invoice: { ...inv, total: 3790 } }), /uyuşmuyor/);
  ok(buildLucaInput({ invoice: { ...inv, total: 3780.01 }, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
});

test('ürün kodu açıklamadan kararlı üretilir (büyük/küçük harf ve boşluk duyarsız)', () => {
  assert.equal(productCode('Zirkonyum kron'), productCode('  ZİRKONYUM   KRON '));
  assert.notEqual(productCode('Zirkonyum kron'), productCode('Çalışma modeli'));
  assert.match(productCode('Zirkonyum kron'), /^SMN-[0-9A-Z]+$/);
});

// ── önizleme (gönderilecek faturanın birebir özeti; Luca'ya gitmez) ────
const meta = { env: 'prod' as const, sellerName: 'NEXADENT LAB. LTD. ŞTİ.', invoiceNumber: 'FTR-2026-00060' };

test('önizleme: e-Fatura — alıcı, posta kutusu, kalemler ve toplamlar gönderimle aynı', () => {
  const input = ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:defaultpk@gulus.test' }));
  const p = buildLucaPreview(input, meta);
  assert.equal(p.kind, 'e_fatura');
  assert.equal(p.scenario, 'TEMELFATURA');
  assert.equal(p.sendingType, null);
  assert.equal(p.invoiceNumber, 'FTR-2026-00060');
  assert.equal(p.issueDate, '2026-10-17');
  assert.deepEqual(p.seller, { name: 'NEXADENT LAB. LTD. ŞTİ.', taxCode: '6312098145', taxOffice: 'Kozyatağı', address: 'Atatürk Mah. Vatan Cad. No: 21, Ataşehir / İstanbul' });
  assert.equal(p.receiver.name, 'Gülüş Diş Kliniği');
  assert.equal(p.receiver.taxCode, '8810234738');
  assert.equal(p.receiver.taxOffice, 'Kadıköy');
  assert.equal(p.receiver.address, 'Caferağa Mah. Moda Cad. No:5, Kadıköy / İstanbul');
  assert.equal(p.receiver.inboxTag, 'urn:mail:defaultpk@gulus.test');
  assert.deepEqual(p.lines[0], { name: 'Zirkonyum kron', quantity: 2, unitPrice: 1500, discount: 100, vatRate: 20, net: 2900, vat: 580 });
  assert.deepEqual(p.totals, { net: 3150, discount: 100, vat: 630, payable: 3780, payableTry: null });
  assert.equal(p.currency, 'TRY');
  assert.equal(p.crossRate, null);
  assert.deepEqual(p.notes, ['Siman fatura no: FTR-2026-00060']);
});

test('önizleme: e-Arşiv — e-posta varsa ELEKTRONIK, yoksa KAĞIT; senaryo yok', () => {
  const withMail = buildLucaPreview(ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' })), meta);
  assert.equal(withMail.kind, 'e_arsiv');
  assert.equal(withMail.scenario, null);
  assert.equal(withMail.sendingType, 'ELEKTRONIK');
  assert.equal(withMail.receiver.inboxTag, null);
  const noMail = buildLucaPreview(ok(buildLucaInput({ invoice: inv, clinic: { ...clinic, email: null }, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' })), meta);
  assert.equal(noMail.sendingType, 'KAGIT');
});

test('önizleme: döviz faturasında kur ve TL karşılığı gösterilir; test ortamı işaretlenir', () => {
  const eur = { ...inv, currency: 'EUR' };
  const p = buildLucaPreview(ok(buildLucaInput({ invoice: eur, clinic, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '1234567801', crossRate: 55.618 })), { ...meta, env: 'test' });
  assert.equal(p.env, 'test');
  assert.equal(p.currency, 'EUR');
  assert.equal(p.crossRate, 55.618);
  assert.equal(p.totals.payableTry, 210236.04);
  assert.equal(p.seller.taxCode, '1234567801');
});

test('klinik formunun JSON adresi (il/ilçe/mahalle/sokak/bina) ayrıştırılır', () => {
  const json = JSON.stringify({ il: 'İstanbul', ilce: 'Ataşehir', mahalle: 'Atatürk Mah.', sokak: 'Ertuğrul Gazi Sk.', bina_no: '2/29', posta_kodu: '34758' });
  assert.deepEqual(parseCityTown(json), { street: 'Atatürk Mah., Ertuğrul Gazi Sk. No: 2/29', town: 'Ataşehir', city: 'İstanbul' });
  assert.deepEqual(parseCityTown(JSON.stringify({ il: 'Ankara', ilce: 'Çankaya', mahalle: '', sokak: '', bina_no: '' })), { street: '', town: 'Çankaya', city: 'Ankara' });
  assert.equal(parseCityTown(JSON.stringify({ il: 'İzmir', ilce: '' })), null);
  assert.equal(parseCityTown('{bozuk json'), null);
});

test('JSON adresteki daire no sokak satırına "D: 3" olarak eklenir', () => {
  const json = JSON.stringify({ il: 'İstanbul', ilce: 'Kadıköy', mahalle: 'Caferağa Mah.', sokak: 'Moda Cad.', bina_no: '5', daire_no: '3' });
  assert.deepEqual(parseCityTown(json), { street: 'Caferağa Mah., Moda Cad. No: 5 D: 3', town: 'Kadıköy', city: 'İstanbul' });
  assert.deepEqual(parseCityTown(JSON.stringify({ il: 'Ankara', ilce: 'Çankaya', bina_no: '7', daire_no: '2' })), { street: 'No: 7 D: 2', town: 'Çankaya', city: 'Ankara' });
});

test('JSON adresli klinik Luca girdisine dönüşür', () => {
  const c = { ...clinic, address: JSON.stringify({ il: 'İstanbul', ilce: 'Kadıköy', mahalle: 'Caferağa Mah.', sokak: 'Moda Cad.', bina_no: '5' }) };
  const r = buildLucaInput({ invoice: inv, clinic: c, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:defaultpk@x' });
  if (!r.ok) throw new Error(r.error);
  assert.deepEqual([r.input.receiver.town, r.input.receiver.city, r.input.receiver.street], ['Kadıköy', 'İstanbul', 'Caferağa Mah., Moda Cad. No: 5']);
});

test('yurt dışı klinik (adres JSON ulke ≠ TR) e-faturaya gönderilmez — ihracat faturası desteklenmiyor', () => {
  const c = { ...clinic, address: JSON.stringify({ ulke: 'DE', il: 'Bayern', ilce: 'München', sokak: 'Leopoldstr. 12' }) };
  const r = buildLucaInput({ invoice: inv, clinic: c, doctor: null, seller, kind: 'e_arsiv', companyTaxCode: '6312098145' });
  assert.equal(r.ok, false);
  assert.match((r as any).error, /Yurt dışı klinik/);
});

// ── fatura altı indirim (discount_amount) kalemlere dağıtılır ────────────
test('fatura altı indirim: kalem iskontosuna orantılı pay eklenir, Luca toplamı fatura toplamıyla tutar', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, subtotal: 290, tax_amount: 58, total: 348, discount_amount: 10,
    items: [
      { description: 'Kalem A', quantity: 1, unit_price: 100, total: 100, net_total: 100 },
      { description: 'Kalem B', quantity: 1, unit_price: 200, total: 200, net_total: 200 },
    ],
  };
  const input = ok(buildLucaInput({ invoice: d, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
  assert.deepEqual(input.lines.map((l) => l.discountAmount), [3.33, 6.67]);
  const pre = buildLucaPreview(input, { env: 'test', sellerName: 'Lab', invoiceNumber: d.invoice_number });
  assert.ok(Math.abs(pre.totals.payable - 348) <= 0.01);
  assert.equal(pre.totals.discount, 10);
});

test('fatura altı indirim mevcut kalem iskontosunun üstüne eklenir (pay net üzerinden)', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, total: 0, discount_amount: 10,
    items: [
      { description: 'Kalem A', quantity: 1, unit_price: 120, total: 120, net_total: 100 },
      { description: 'Kalem B', quantity: 1, unit_price: 200, total: 200, net_total: 200 },
    ],
  };
  d.total = 348; // (300 − 10) × 1.2
  const input = ok(buildLucaInput({ invoice: d, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
  assert.deepEqual(input.lines.map((l) => l.discountAmount), [23.33, 6.67]);
});

test('discount_amount yok / 0 / null → çıktı bugünküyle aynı', () => {
  const base = ok(buildLucaInput({ invoice: inv, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
  for (const da of [0, null, undefined, '0'] as const) {
    const withField = ok(buildLucaInput({ invoice: { ...inv, discount_amount: da as never }, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' }));
    assert.deepEqual(withField, base);
  }
});

// ── fatura altı indirim: KDV yuvarlama dengelemesi (düzeltme turu 1) ─────
const sendArgs = { clinic, doctor: null, seller, kind: 'e_fatura' as const, companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y' };
import { computeTotals } from './luca.ts';
import { DISCOUNT_BALANCE_ERROR, DISCOUNT_MIXED_VAT_ERROR } from './lucaInvoice.ts';

test('850+850+175, %7,5 indirim, %20 KDV: ödenecek tutar DB toplamıyla KURUŞU KURUŞUNA (2081,24)', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, subtotal: 1734.37, tax_amount: 346.87, total: 2081.24, discount_amount: 140.63,
    items: [850, 850, 175].map((n, i) => ({ description: `Kalem ${i}`, quantity: 1, unit_price: n, total: n, net_total: n })),
  };
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs }));
  const t = computeTotals(input.lines);
  assert.equal(t.vat, 346.87);
  assert.equal(t.payable, 2081.24);
  assert.equal(t.discount, 140.63);
});

test('döviz faturası + indirim: tutarlar fatura para biriminde kalır, TL karşılığı payable × kur', () => {
  const d: DbInvoice = {
    ...inv, currency: 'EUR', tax_rate: 20, total: 2081.24, discount_amount: 140.63,
    items: [850, 850, 175].map((n, i) => ({ description: `Kalem ${i}`, quantity: 1, unit_price: n, total: n, net_total: n })),
  };
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs, crossRate: 40 }));
  assert.equal(input.currency, 'EUR');
  assert.equal(computeTotals(input.lines).payable, 2081.24);
  const pre = buildLucaPreview(input, { env: 'test', sellerName: 'Lab', invoiceNumber: d.invoice_number });
  assert.equal(pre.totals.payable, 2081.24);
  assert.equal(pre.totals.payableTry, 83249.6);
});

test('net 0 kalem indirimden pay almaz', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, total: 348, discount_amount: 10,
    items: [
      { description: 'Ücretsiz', quantity: 1, unit_price: 50, total: 50, net_total: 0 },
      { description: 'A', quantity: 1, unit_price: 100, total: 100, net_total: 100 },
      { description: 'B', quantity: 1, unit_price: 200, total: 200, net_total: 200 },
    ],
  };
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs }));
  assert.deepEqual(input.lines.map((l) => l.discountAmount), [50, 3.33, 6.67]);
});

test('dengelenemeyen indirim gönderilmez: açık Türkçe hata', () => {
  // %1 KDV, iki kalem, büyük sabit indirim: ±10 kuruşta satır KDV'si toplamı DB'ye eşitlenemez.
  const d: DbInvoice = {
    ...inv, tax_rate: 1, total: 651.1, discount_amount: 2304.95,
    items: [{ description: 'A', quantity: 1, unit_price: 2550, total: 2550, net_total: 2550 }, { description: 'B', quantity: 1, unit_price: 399.6, total: 399.6, net_total: 399.6 }],
  };
  const r = buildLucaInput({ invoice: d, ...sendArgs });
  assert.deepEqual(r, { ok: false, error: DISCOUNT_BALANCE_ERROR });
  assert.match(DISCOUNT_BALANCE_ERROR, /kuruşu kuruşuna dağıtılamadı/);
  // mergeInvoices'ten gelen hata da aynen reddedilir
  const r2 = buildLucaInput({ invoice: { ...inv, discount_error: DISCOUNT_BALANCE_ERROR }, ...sendArgs });
  assert.deepEqual(r2, { ok: false, error: DISCOUNT_BALANCE_ERROR });
});

test('indirimli faturada ödenecek tutar toleranssız: DB toplamı 1 kuruş farklıysa reddedilir', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, total: 2081.25, discount_amount: 140.63,
    items: [850, 850, 175].map((n, i) => ({ description: `Kalem ${i}`, quantity: 1, unit_price: n, total: n, net_total: n })),
  };
  const r = buildLucaInput({ invoice: d, ...sendArgs });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /uyuşmuyor/);
});

test('indirimli faturada farklı KDV oranlı kalemler: kendi metniyle reddedilir', () => {
  const d: DbInvoice = {
    ...inv, tax_rate: 20, total: 348, discount_amount: 10,
    items: [
      { description: 'A', quantity: 1, unit_price: 100, total: 100, net_total: 100, vat_rate: 10 },
      { description: 'B', quantity: 1, unit_price: 200, total: 200, net_total: 200, vat_rate: 20 },
    ],
  };
  assert.deepEqual(buildLucaInput({ invoice: d, ...sendArgs }), { ok: false, error: DISCOUNT_MIXED_VAT_ERROR });
});

// ── Görev 17: genel orandan gelen kalemde liste fiyatı + oran ─────────────
// PriceAmount = liste birim fiyatı; DiscountAmount = r2(adet × liste − net_total) + fatura altı pay.
// Satırın Luca net'i (dolayısıyla KDV'si ve ödenecek kontrolü) liste alanı yokken bulunanla aynı kalır.
const listItem = { description: 'Zirkon kron', quantity: 2, unit_price: 1062.93, total: 2125.86, net_total: 2125.86, list_unit_price: 1250.50, list_discount_pct: 15 };
const plainItem = { description: 'Model', quantity: 1, unit_price: 250, total: 250, net_total: 250 };
const lineNets = (lines: ReturnType<typeof ok>['lines']) => computeTotals(lines).lines.map((x) => x.lineExtension);

test('liste fiyatlı kalem: PriceAmount = liste fiyatı, DiscountAmount = adet × liste − net; ödenecek tutar tutar', () => {
  const d: DbInvoice = { ...inv, tax_rate: 20, total: 2851.03, items: [listItem, plainItem] }; // (2125,86 + 250) × 1,2 = 2851,032
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs }));
  assert.deepEqual(input.lines.map((l) => [l.quantity, l.unitPrice, l.discountAmount]), [[2, 1250.5, 375.14], [1, 250, 0]]);
  const strip = { ...d, items: d.items.map(({ list_unit_price: _a, list_discount_pct: _b, ...it }: any) => it) };
  assert.deepEqual(lineNets(input.lines), lineNets(ok(buildLucaInput({ invoice: strip, ...sendArgs })).lines));
  assert.equal(computeTotals(input.lines).payable, 2851.03);
  // Önizleme (EFaturaPreviewModal) Luca girdisinden: satır net'i 2125,86, iskonto 375,14, ödenecek aynı
  const pre = buildLucaPreview(input, { env: 'test', sellerName: 'Lab', invoiceNumber: d.invoice_number });
  assert.deepEqual([pre.lines[0].unitPrice, pre.lines[0].discount, pre.lines[0].net], [1250.5, 375.14, 2125.86]);
  assert.deepEqual([pre.totals.net, pre.totals.discount, pre.totals.payable], [2375.86, 375.14, 2851.03]);
  buildSendEnvelope(input);
});

test('liste fiyatlı kalem + fatura altı indirim: pay iskontoya eklenir, satır net ve KDV değişmez', () => {
  // Σnet 2375,86; indirim 100 → 2275,86 × 1,2 = 2731,032 → 2731,03
  const d: DbInvoice = { ...inv, tax_rate: 20, total: 2731.03, discount_amount: 100, items: [listItem, plainItem] };
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs }));
  const strip = { ...d, items: d.items.map(({ list_unit_price: _a, list_discount_pct: _b, ...it }: any) => it) };
  const base = ok(buildLucaInput({ invoice: strip, ...sendArgs }));
  const share0 = base.lines[0].discountAmount!; // liste alanı yokken iskonto = pay (brüt = net)
  assert.equal(input.lines[0].unitPrice, 1250.5);
  assert.equal(input.lines[0].discountAmount, Math.round((375.14 + share0) * 100) / 100);
  assert.deepEqual(input.lines[1], base.lines[1]);
  assert.deepEqual(lineNets(input.lines), lineNets(base.lines));
  assert.equal(computeTotals(input.lines).vat, computeTotals(base.lines).vat);
  assert.equal(computeTotals(input.lines).payable, 2731.03);
});

test('liste fiyatlı kalem + kalem indirimi: iskonto liste brütünden net_total’a', () => {
  const it = { ...listItem, net_total: 2000 }; // kalem indirimi 125,86
  const d: DbInvoice = { ...inv, tax_rate: 20, total: 2400, items: [it] };
  const input = ok(buildLucaInput({ invoice: d, ...sendArgs }));
  assert.deepEqual([input.lines[0].unitPrice, input.lines[0].discountAmount], [1250.5, 501]);
  assert.equal(computeTotals(input.lines).payable, 2400);
});

test('liste alanı yok / boş / formül tutmuyor → çıktı bugünküyle deepEqual', () => {
  const base = ok(buildLucaInput({ invoice: inv, ...sendArgs }));
  const variants: Array<Record<string, unknown>> = [
    { list_unit_price: null, list_discount_pct: null },
    { list_unit_price: 1600, list_discount_pct: null },
    { list_unit_price: 1600, list_discount_pct: 10 },   // 1600 × 0,9 = 1440 ≠ 1500
    { list_unit_price: 1500, list_discount_pct: 0 },
  ];
  for (const v of variants) {
    const withField = ok(buildLucaInput({ invoice: { ...inv, items: inv.items.map((it) => ({ ...it, ...v })) }, ...sendArgs }));
    assert.deepEqual(withField, base, JSON.stringify(v));
  }
});
