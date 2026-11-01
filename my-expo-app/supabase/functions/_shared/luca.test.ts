// node --test my-expo-app/supabase/functions/_shared/luca.test.ts   (Node ≥23 tip ayıklama)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotals, buildSendEnvelope, buildGetTaxPayerEnvelope, buildSearchEnvelope,
  parseSendResponse, parseTaxPayerResponse, parseSearchResponse, signLucaRequest,
  type LucaInvoiceInput,
} from './luca.ts';
// Proxy ile uyum: aynı imza + üretilen her zarf proxy politikasından geçmeli.
import { sign as proxySign, checkPolicy } from '../../../../infra/luca-proxy/app/lib.mjs';

const seller = { taxCode: '1234567801', name: 'Test Kurum', taxOffice: 'BEŞİKTAŞ', street: 'Kobi OSB 103. Cad. No:29', city: 'İstanbul', town: 'Şişli' };

const base: LucaInvoiceInput = {
  kind: 'e_fatura',
  externalCode: '7f9c2b1e-0000-4000-8000-000000000001',
  issueDate: '2026-10-17',
  currency: 'TRY',
  seller,
  receiver: { taxCode: '8810234738', name: 'Alıcı & Ortak <Ltd>', taxOffice: 'KADIKÖY', city: 'İstanbul', town: 'Kadıköy', inboxTag: 'urn:mail:defaultpk@luca.com.tr' },
  lines: [
    { code: 'ZR-01', name: 'Zirkonya kron', quantity: 3, unitPrice: 1000, vatRate: 20 },
    { code: 'MD-01', name: 'Model', quantity: 1, unitPrice: 333.33, vatRate: 10, discountAmount: 33.33 },
  ],
  notes: ['Test faturası'],
};

/** <ein:Tag> doğrudan çocuklarının adları (iç içe olanlar hariç) */
function childNames(xml: string, parentTag: string): string[] {
  const open = xml.indexOf(`<ein:${parentTag}>`);
  const close = xml.indexOf(`</ein:${parentTag}>`, open);
  const inner = xml.slice(open + parentTag.length + 6, close);
  const names: string[] = [];
  let depth = 0;
  for (const m of inner.matchAll(/<(\/?)ein:(\w+)(\/?)>/g)) {
    if (m[1]) { depth--; continue; }
    if (depth === 0) names.push(m[2]);
    if (!m[3]) depth++;
  }
  return names;
}
const ordinalSorted = (a: string[]) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

test('toplamlar: satır net = adet×fiyat − iskonto, KDV 2 haneye yuvarlanır', () => {
  const t = computeTotals(base.lines);
  assert.deepEqual(t.lines.map((l) => [l.lineExtension, l.vat]), [[3000, 600], [300, 30]]);
  assert.equal(t.lineExtension, 3300);
  assert.equal(t.discount, 33.33);
  assert.equal(t.vat, 630);
  assert.equal(t.taxInclusive, 3930);
  assert.equal(t.payable, 3930);
});

test('e-Fatura → SendInvoice; istek ve fatura alanları şema (bayt) sırasında', () => {
  const env = buildSendEnvelope(base);
  assert.equal(env.op, 'SendInvoice');
  assert.equal(env.service, 'InvoiceService');
  const req = childNames(env.body, 'Invoices') && childNames(env.body.replace('<tem:request>', '<ein:REQ>').replace('</tem:request>', '</ein:REQ>'), 'REQ');
  assert.deepEqual(req, ['CompanyTaxCode', 'Invoices']);
  const inv = childNames(env.body, 'Invoice');
  assert.deepEqual(inv, ordinalSorted(inv));
  for (const f of ['ExternalInvoiceCode', 'InvoiceDate', 'InvoiceType', 'ScenarioType', 'Receiver', 'ReceiverInboxTag', 'CurrencyCode', 'TotalPayableAmount', 'InvoiceDetails'])
    assert.ok(inv.includes(f), `eksik: ${f}`);
  assert.ok(env.body.includes('<ein:ScenarioType>TEMELFATURA</ein:ScenarioType>'));
  assert.ok(env.body.includes('<ein:ReceiverInboxTag>urn:mail:defaultpk@luca.com.tr</ein:ReceiverInboxTag>'));
  assert.ok(!inv.includes('CrossRate'), 'TRY faturada kur olmamalı');
});

test('kalem ve ürün alanları da şema sırasında', () => {
  const env = buildSendEnvelope(base);
  const det = childNames(env.body, 'InvoiceDetail');
  assert.deepEqual(det, ordinalSorted(det));
  const prod = childNames(env.body, 'Product');
  assert.deepEqual(prod, ordinalSorted(prod));
  const rcv = childNames(env.body, 'Receiver');
  assert.deepEqual(rcv, ordinalSorted(rcv));
});

test('metin XML-kaçışlı yazılır', () => {
  const env = buildSendEnvelope(base);
  assert.ok(env.body.includes('Alıcı &amp; Ortak &lt;Ltd&gt;'));
  assert.ok(!env.body.includes('Ortak <Ltd>'));
});

test('e-Arşiv → SendArchiveInvoice; posta kutusu yok, ELEKTRONİK gönderim', () => {
  const env = buildSendEnvelope({ ...base, kind: 'e_arsiv', receiver: { taxCode: '11111111111', name: 'Ahmet Yılmaz', city: 'İstanbul', town: 'Ataşehir', email: 'a@b.co' } });
  assert.equal(env.op, 'SendArchiveInvoice');
  const req = childNames(env.body.replace('<tem:request>', '<ein:REQ>').replace('</tem:request>', '</ein:REQ>'), 'REQ');
  assert.deepEqual(req, ['ArchiveInvoices', 'CompanyTaxCode']);
  const inv = childNames(env.body, 'ArchiveInvoice');
  assert.deepEqual(inv, ordinalSorted(inv));
  assert.ok(inv.includes('ExternalArchiveInvoiceCode'));
  assert.ok(!env.body.includes('ReceiverInboxTag'));
  assert.ok(!env.body.includes('ScenarioType'));
  assert.ok(env.body.includes('<ein:SendingType>ELEKTRONIK</ein:SendingType>'));
  assert.ok(env.body.includes('<ein:ArchiveInvoiceDetail>'));
});

test('e-Arşiv alıcısının e-postası yoksa KAGIT gönderim (Luca: ELEKTRONIK e-posta ister)', () => {
  const env = buildSendEnvelope({ ...base, kind: 'e_arsiv', receiver: { taxCode: '11111111111', name: 'Ahmet Yılmaz', city: 'İstanbul', town: 'Ataşehir' } });
  assert.ok(env.body.includes('<ein:SendingType>KAGIT</ein:SendingType>'));
  assert.ok(env.body.includes('<ein:SendMailAutomatically>false</ein:SendMailAutomatically>'));
});

test('dövizli fatura: CrossRate zorunlu, TRY dışı para birimi kalemlere de yazılır', () => {
  assert.throws(() => buildSendEnvelope({ ...base, currency: 'EUR' }), /kur/i);
  const env = buildSendEnvelope({ ...base, currency: 'EUR', crossRate: 48.1234 });
  assert.ok(env.body.includes('<ein:CrossRate>48.1234</ein:CrossRate>'));
  assert.equal((env.body.match(/<ein:CurrencyCode>EUR<\/ein:CurrencyCode>/g) ?? []).length, 3);
});

test('e-Fatura posta kutusu olmadan kurulmaz; boş kalem listesi reddedilir', () => {
  assert.throws(() => buildSendEnvelope({ ...base, receiver: { ...base.receiver, inboxTag: undefined } }), /posta kutusu/i);
  assert.throws(() => buildSendEnvelope({ ...base, lines: [] }), /kalem/i);
});

test('üretilen her zarf proxy politikasından geçer', () => {
  const allowed = new Set(['1234567801', '8810234738']);
  const envs = [
    buildSendEnvelope(base),
    buildSendEnvelope({ ...base, kind: 'e_arsiv', receiver: { taxCode: '11111111111', name: 'X Y', city: 'A', town: 'B' } }),
    buildGetTaxPayerEnvelope('8810234738'),
    buildSearchEnvelope('e_fatura', '1234567801', { externalCode: base.externalCode }),
    buildSearchEnvelope('e_arsiv', '1234567801', { ettn: 'abc' }),
  ];
  for (const e of envs) {
    const r = checkPolicy({ service: e.service, soapAction: e.soapAction, body: e.body, allowedVkn: allowed });
    assert.equal(r.ok, true, `${e.op}: ${r.reason}`);
  }
});

test('imza proxy ile birebir aynı', async () => {
  const body = buildGetTaxPayerEnvelope('8810234738').body;
  const args = ['s'.repeat(64), 1_800_000_000, '/luca/test/AddressBookService', 'http://tempuri.org/IAddressBookService/GetTaxPayer', body] as const;
  assert.equal(await signLucaRequest(...args), proxySign(...args));
});

// ── yanıt çözümleme ──────────────────────────────────────────────────────
const wrap = (inner: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`;

test('gönderim yanıtı: başarı → ETTN + fatura no; hata → mesaj', () => {
  const ok = wrap('<SendInvoiceResponse xmlns="http://tempuri.org/"><SendInvoiceResult xmlns:a="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><a:ErrorMessage i:nil="true"/><a:Result>Success</a:Result><a:Invoices><a:InvoiceReturn><a:Ettn>3f2b-11</a:Ettn><a:ExternalInvoiceCode>x</a:ExternalInvoiceCode><a:InvoiceNumber>TST2026000000001</a:InvoiceNumber></a:InvoiceReturn></a:Invoices></SendInvoiceResult></SendInvoiceResponse>');
  assert.deepEqual(parseSendResponse(ok), { ok: true, ettn: '3f2b-11', invoiceNumber: 'TST2026000000001' });
  const arc = wrap('<SendArchiveInvoiceResult xmlns:a="m"><a:Result>Success</a:Result><a:ArchiveInvoices><a:ArchiveInvoiceReturn><a:ArchiveInvoiceNumber>ARS1</a:ArchiveInvoiceNumber><a:Ettn>e-1</a:Ettn></a:ArchiveInvoiceReturn></a:ArchiveInvoices></SendArchiveInvoiceResult>');
  assert.deepEqual(parseSendResponse(arc), { ok: true, ettn: 'e-1', invoiceNumber: 'ARS1' });
  const bad = wrap('<SendInvoiceResult xmlns:a="m"><a:ErrorMessage>Alıcı posta kutusu &amp; VKN uyuşmuyor</a:ErrorMessage><a:Result>Failed</a:Result></SendInvoiceResult>');
  assert.deepEqual(parseSendResponse(bad), { ok: false, error: 'Alıcı posta kutusu & VKN uyuşmuyor' });
  const fault = wrap('<s:Fault><faultcode>a:DeserializationFailed</faultcode><faultstring xml:lang="en-US">The formatter threw</faultstring></s:Fault>');
  assert.equal(parseSendResponse(fault).ok, false);
  assert.match(parseSendResponse(fault).error ?? '', /formatter/);
});

test('mükellef yanıtı: kayıtlıysa posta kutuları (PK önce)', () => {
  const reg = wrap('<GetTaxPayerResult xmlns:a="m" xmlns:b="arr"><a:ErrorMessage/><a:Result>Success</a:Result><a:TaxPayers><a:TaxPayer><a:InboxTagList><b:string>urn:mail:defaultgb@luca.com.tr</b:string><b:string>urn:mail:defaultpk@luca.com.tr</b:string></a:InboxTagList><a:TaxPayerName>02-TÜRMOB</a:TaxPayerName><a:TaxPayerTaxCode>8810234738</a:TaxPayerTaxCode></a:TaxPayer></a:TaxPayers></GetTaxPayerResult>');
  assert.deepEqual(parseTaxPayerResponse(reg), { ok: true, registered: true, name: '02-TÜRMOB', inboxTags: ['urn:mail:defaultpk@luca.com.tr', 'urn:mail:defaultgb@luca.com.tr'] });
  const none = wrap('<GetTaxPayerResult xmlns:a="m"><a:Result>Success</a:Result><a:TaxPayers/></GetTaxPayerResult>');
  assert.deepEqual(parseTaxPayerResponse(none), { ok: true, registered: false, inboxTags: [] });
});

test('arama yanıtı: durum + ayrıntılı durum', () => {
  const xml = wrap('<SearchInvoiceResult xmlns:a="m"><a:Result>Success</a:Result><a:Invoices><a:Invoice><a:DetailStatus>Basariyla_Tamamlandi</a:DetailStatus><a:ETTN>e-9</a:ETTN><a:InvoiceNumber>TST1</a:InvoiceNumber><a:Status>Onaylandi</a:Status></a:Invoice></a:Invoices></SearchInvoiceResult>');
  assert.deepEqual(parseSearchResponse(xml), { ok: true, found: true, status: 'Onaylandi', detailStatus: 'Basariyla_Tamamlandi', ettn: 'e-9', invoiceNumber: 'TST1' });
  const empty = wrap('<SearchInvoiceResult xmlns:a="m"><a:Result>Success</a:Result><a:Invoices/></SearchInvoiceResult>');
  assert.deepEqual(parseSearchResponse(empty), { ok: true, found: false });
});

// ── Gelen faturalar (keşif) ──────────────────────────────────────────────
import { parseInvoiceList } from './luca.ts';

test('gelen fatura araması: yön + sayfalama + ayrıntı isteği', () => {
  const e = buildSearchEnvelope('e_fatura', '6312098145', { direction: 'Incoming', page: 2, perPage: 25, includeDetail: true });
  assert.match(e.body, /<ein:InvoiceDirection>Incoming<\/ein:InvoiceDirection>/);
  assert.match(e.body, /<ein:PageNumber>2<\/ein:PageNumber>/);
  assert.match(e.body, /<ein:RecordsPerPage>25<\/ein:RecordsPerPage>/);
  assert.match(e.body, /<ein:IsInvoiceDetailIncluded>true<\/ein:IsInvoiceDetailIncluded>/);
  // varsayılan: giden, 10 kayıt, ayrıntısız (mevcut durum sorgusu değişmez)
  const d = buildSearchEnvelope('e_fatura', '6312098145', { ettn: 'x' });
  assert.match(d.body, /<ein:InvoiceDirection>Outgoing<\/ein:InvoiceDirection>/);
  assert.match(d.body, /<ein:RecordsPerPage>10<\/ein:RecordsPerPage>/);
  assert.match(d.body, /<ein:IsInvoiceDetailIncluded>false<\/ein:IsInvoiceDetailIncluded>/);
});

test('fatura listesi: her faturanın yaprak alanları + görülen etiketler; base64 kısaltılır', () => {
  const big = 'A'.repeat(2000);
  const xml = `<s:Envelope><s:Body><SearchInvoiceResponse><SearchInvoiceResult>
    <a:Result>Success</a:Result><a:TotalCount>2</a:TotalCount>
    <a:Invoices>
      <a:Invoice><a:ETTN>e-1</a:ETTN><a:InvoiceNumber>ABC2026000000001</a:InvoiceNumber><a:SenderTaxCode>1111111111</a:SenderTaxCode>
        <a:PayableAmount>120.50</a:PayableAmount><a:InvoicePdf>${big}</a:InvoicePdf><a:Note i:nil="true"/></a:Invoice>
      <a:Invoice><a:ETTN>e-2</a:ETTN><a:InvoiceNumber>XYZ2026000000007</a:InvoiceNumber><a:SenderName>Tedarik &amp; Co</a:SenderName></a:Invoice>
    </a:Invoices>
  </SearchInvoiceResult></SearchInvoiceResponse></s:Body></s:Envelope>`;
  const r = parseInvoiceList(xml);
  if (!r.ok) throw new Error(r.error);
  assert.equal(r.invoices.length, 2);
  assert.equal(r.invoices[0].ETTN, 'e-1');
  assert.equal(r.invoices[0].PayableAmount, '120.50');
  assert.equal(r.invoices[0].InvoicePdf, '[2000 karakter]');
  assert.equal(r.invoices[1].SenderName, 'Tedarik & Co');
  assert.equal(r.meta.TotalCount, '2');
  assert.deepEqual(r.tags, ['ETTN', 'InvoiceNumber', 'InvoicePdf', 'PayableAmount', 'SenderName', 'SenderTaxCode']);
});

test('fatura listesi: hata ve boş sonuç', () => {
  assert.deepEqual(parseInvoiceList('<x><Result>Error</Result><ErrorMessage>Yetki yok</ErrorMessage></x>'), { ok: false, error: 'Yetki yok' });
  const r = parseInvoiceList('<x><Result>Success</Result><Invoices/></x>');
  assert.equal(r.ok && r.invoices.length, 0);
});

import { xmlOutline } from './luca.ts';

test('XML ana hattı: yol = değer, tekrarlayan kardeşler sıra numaralı, uzun değer kısaltılır', () => {
  const xml = `<a:Invoice><a:ETTN>e-1</a:ETTN><a:Lines><a:Line><a:Name>Alçı</a:Name><a:Qty>2</a:Qty></a:Line>`
    + `<a:Line><a:Name>Zirkon &amp; disk</a:Name><a:Qty>1</a:Qty></a:Line></a:Lines><a:Pdf>${'B'.repeat(500)}</a:Pdf><a:Note i:nil="true"/></a:Invoice>`;
  assert.deepEqual(xmlOutline(xml), [
    'Invoice/ETTN = e-1',
    'Invoice/Lines/Line[0]/Name = Alçı',
    'Invoice/Lines/Line[0]/Qty = 2',
    'Invoice/Lines/Line[1]/Name = Zirkon & disk',
    'Invoice/Lines/Line[1]/Qty = 1',
    'Invoice/Pdf = [500 karakter]',
  ]);
});

import { parseIncomingInvoice, unitFromCode } from './luca.ts';

test('gelen fatura ayrıntısı → yapılandırılmış (gerçek DOKUZ KİMYA şekli)', () => {
  const inv = `<a:Invoice><a:ApprovalDate>0001-01-01T00:00:00</a:ApprovalDate><a:CrossRate>0.0000</a:CrossRate><a:CurrencyCode>TRY</a:CurrencyCode>
    <a:ETTN>76457015-E2B7-4267-B5C2-62E877991F49</a:ETTN><a:InvoiceDate>2026-10-21T00:00:00</a:InvoiceDate>
    <a:InvoiceDetails>
      <a:InvoiceDetail><a:CurrencyCode>TRY</a:CurrencyCode><a:DiscountAmount>0.00</a:DiscountAmount><a:LineExtensionAmount>41.67</a:LineExtensionAmount>
        <a:Product><a:MeasureUnit>C62</a:MeasureUnit><a:ProductName>REÇİNE SIYIRMA APARATI</a:ProductName><a:UnitPrice>41.670000</a:UnitPrice></a:Product>
        <a:Quantity>1</a:Quantity><a:VATAmount>8.33</a:VATAmount><a:VATRate>20.00</a:VATRate></a:InvoiceDetail>
      <a:InvoiceDetail><a:CurrencyCode>TRY</a:CurrencyCode><a:DiscountAmount>50.00</a:DiscountAmount><a:LineExtensionAmount>6700.00</a:LineExtensionAmount>
        <a:Product><a:MeasureUnit>KGM</a:MeasureUnit><a:ProductName>MODEL REÇİNESİ &amp; GRİ</a:ProductName><a:UnitPrice>2250.000000</a:UnitPrice></a:Product>
        <a:Quantity>3</a:Quantity><a:VATAmount>1340.00</a:VATAmount><a:VATRate>20.00</a:VATRate></a:InvoiceDetail>
    </a:InvoiceDetails>
    <a:InvoiceNumber>EFA2026000002699</a:InvoiceNumber><a:LastPaymentDate>2026-11-20T00:00:00</a:LastPaymentDate>
    <a:Notes><a:string>(İrsaliye yerine geçer.)</a:string><a:string>YALNIZ SEKİZBİN</a:string></a:Notes>
    <a:Receiver><a:ReceiverName>DOKUZ KİMYA ARGE</a:ReceiverName><a:ReceiverTaxCode>3090341668</a:ReceiverTaxCode></a:Receiver>
    <a:ScenarioType>TICARIFATURA</a:ScenarioType><a:Status>Onay_Bekliyor</a:Status>
    <a:TotalDiscountAmount>50.00</a:TotalDiscountAmount><a:TotalLineExtensionAmount>6741.67</a:TotalLineExtensionAmount>
    <a:TotalPayableAmount>8090.00</a:TotalPayableAmount><a:TotalVATAmount>1348.33</a:TotalVATAmount></a:Invoice>`;
  const r = parseIncomingInvoice(`<x><a:Result>Success</a:Result>${inv}</x>`);
  if (!r) throw new Error('çözümlenemedi');
  assert.equal(r.ettn, '76457015-e2b7-4267-b5c2-62e877991f49');
  assert.equal(r.number, 'EFA2026000002699');
  assert.equal(r.date, '2026-10-21');
  assert.equal(r.dueDate, '2026-11-20');
  assert.equal(r.currency, 'TRY');
  assert.equal(r.crossRate, null);
  assert.deepEqual(r.supplier, { name: 'DOKUZ KİMYA ARGE', vkn: '3090341668' });
  assert.equal(r.scenario, 'TICARIFATURA');
  assert.equal(r.status, 'Onay_Bekliyor');
  assert.deepEqual(r.totals, { net: 6741.67, discount: 50, vat: 1348.33, payable: 8090 });
  assert.deepEqual(r.notes, ['(İrsaliye yerine geçer.)', 'YALNIZ SEKİZBİN']);
  assert.equal(r.lines.length, 2);
  // net birim fiyat = satır net tutarı / miktar (iskonto dahil) → alış faturası toplamı tutar
  assert.deepEqual(r.lines[1], { name: 'MODEL REÇİNESİ & GRİ', quantity: 3, unit: 'kg', unitCode: 'KGM', unitPrice: 2250, netUnitPrice: 2233.333333, lineNet: 6700, discount: 50, vatRate: 20, vatAmount: 1340 });
  assert.equal(r.lines[0].unit, 'adet');
});

test('birim kodları (UN/ECE) → Siman birimleri; bilinmeyen → adet', () => {
  assert.equal(unitFromCode('C62'), 'adet');
  assert.equal(unitFromCode('KGM'), 'kg');
  assert.equal(unitFromCode('GRM'), 'g');
  assert.equal(unitFromCode('LTR'), 'lt');
  assert.equal(unitFromCode('BX'), 'kutu');
  assert.equal(unitFromCode('XYZ'), 'adet');
  assert.equal(unitFromCode(undefined), 'adet');
});
