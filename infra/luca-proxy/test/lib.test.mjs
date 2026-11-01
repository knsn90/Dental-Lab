// node --test infra/luca-proxy/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verifySignature, parseRoute, checkPolicy } from '../app/lib.mjs';

const SECRET = 'a'.repeat(64);
const NOW = 1_800_000_000;
const PATH = '/luca/test/InvoiceService';
const ACTION = 'http://tempuri.org/IInvoiceService/GetCompanyBalance';

const env = (op, inner, { prefix = 'ein', svcPrefix = 'tem' } = {}) =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/>` +
  `<soapenv:Body><${svcPrefix}:${op}><${svcPrefix}:request>${inner.replaceAll('P:', `${prefix}:`)}` +
  `</${svcPrefix}:request></${svcPrefix}:${op}></soapenv:Body></soapenv:Envelope>`;

const balance = env('GetCompanyBalance', '<P:CompanyTaxCode>1234567801</P:CompanyTaxCode>');
const TEST_VKN = new Set(['1234567801', '8810234738']);

// ── imza ─────────────────────────────────────────────────────────────────
test('geçerli imza kabul edilir', () => {
  const sig = sign(SECRET, NOW, PATH, ACTION, balance);
  assert.deepEqual(verifySignature({ secret: SECRET, ts: String(NOW), sig, path: PATH, soapAction: ACTION, body: balance, now: NOW }), { ok: true });
});

test('gövdesi değiştirilmiş istek reddedilir', () => {
  const sig = sign(SECRET, NOW, PATH, ACTION, balance);
  const r = verifySignature({ secret: SECRET, ts: String(NOW), sig, path: PATH, soapAction: ACTION, body: balance.replace('1234567801', '6312098145'), now: NOW });
  assert.equal(r.ok, false);
});

test('başka yola (prod) taşınan imza reddedilir', () => {
  const sig = sign(SECRET, NOW, PATH, ACTION, balance);
  const r = verifySignature({ secret: SECRET, ts: String(NOW), sig, path: '/luca/prod/InvoiceService', soapAction: ACTION, body: balance, now: NOW });
  assert.equal(r.ok, false);
});

test('5 dakikadan eski veya ileri tarihli istek reddedilir', () => {
  for (const ts of [NOW - 301, NOW + 301]) {
    const sig = sign(SECRET, ts, PATH, ACTION, balance);
    const r = verifySignature({ secret: SECRET, ts: String(ts), sig, path: PATH, soapAction: ACTION, body: balance, now: NOW });
    assert.equal(r.ok, false, `ts=${ts}`);
  }
});

test('eksik / bozuk imza başlığı reddedilir (çökmez)', () => {
  for (const sig of [undefined, '', 'zz', 'ab'.repeat(32) + 'ff']) {
    const r = verifySignature({ secret: SECRET, ts: String(NOW), sig, path: PATH, soapAction: ACTION, body: balance, now: NOW });
    assert.equal(r.ok, false);
  }
  const r = verifySignature({ secret: SECRET, ts: 'abc', sig: 'ab', path: PATH, soapAction: ACTION, body: balance, now: NOW });
  assert.equal(r.ok, false);
});

// ── yol ──────────────────────────────────────────────────────────────────
test('yalnız test|prod ve bilinen servis yolları çözülür', () => {
  assert.deepEqual(parseRoute('/luca/test/InvoiceService'), { env: 'test', service: 'InvoiceService' });
  assert.deepEqual(parseRoute('/luca/prod/AddressBookService'), { env: 'prod', service: 'AddressBookService' });
  assert.equal(parseRoute('/luca/dev/InvoiceService'), null);
  assert.equal(parseRoute('/luca/test/ProductService'), null);
  assert.equal(parseRoute('/luca/test/InvoiceService/../x'), null);
});

// ── politika ─────────────────────────────────────────────────────────────
const policy = (soapAction, body, service = 'InvoiceService') => checkPolicy({ service, soapAction, body, allowedVkn: TEST_VKN });

test('izinli işlem + izinli VKN geçer (Türkçe ı önekli ad alanı dahil)', () => {
  assert.deepEqual(policy(ACTION, balance), { ok: true, op: 'GetCompanyBalance', vkns: ['1234567801'] });
  const turkish = env('GetCompanyBalance', '<P:CompanyTaxCode>1234567801</P:CompanyTaxCode>', { prefix: 'eın' });
  assert.equal(policy(`"${ACTION}"`, turkish).ok, true);
});

test('izin listesinde olmayan VKN reddedilir', () => {
  const r = policy(ACTION, env('GetCompanyBalance', '<P:CompanyTaxCode>6312098145</P:CompanyTaxCode>'));
  assert.equal(r.ok, false);
});

test('birden çok CompanyTaxCode varsa HEPSİ izinli olmalı', () => {
  const body = env('GetCompanyBalance', '<P:CompanyTaxCode>1234567801</P:CompanyTaxCode><P:CompanyTaxCode>9999999999</P:CompanyTaxCode>');
  assert.equal(policy(ACTION, body).ok, false);
});

test('firma adına işlemde CompanyTaxCode yoksa / boşsa / sayı değilse reddedilir', () => {
  const send = 'http://tempuri.org/IInvoiceService/SendInvoice';
  assert.equal(policy(send, env('SendInvoice', '<P:Invoices/>')).ok, false);
  assert.equal(policy(send, env('SendInvoice', '<P:CompanyTaxCode/>')).ok, false);
  assert.equal(policy(send, env('SendInvoice', '<P:CompanyTaxCode>&#49;234567801</P:CompanyTaxCode>')).ok, false);
});

test('izin listesinde olmayan işlem reddedilir', () => {
  const op = 'CancelArchiveInvoice';
  const r = policy(`http://tempuri.org/IInvoiceService/${op}`, env(op, '<P:CompanyTaxCode>1234567801</P:CompanyTaxCode>'));
  assert.equal(r.ok, false);
});

test('SOAPAction ile gövdedeki işlem farklıysa reddedilir', () => {
  const body = env('SendInvoice', '<P:CompanyTaxCode>1234567801</P:CompanyTaxCode>');
  assert.equal(policy(ACTION, body).ok, false);
});

test('SOAPAction başka servisin sözleşmesini gösteriyorsa reddedilir', () => {
  const r = policy('http://tempuri.org/IAddressBookService/GetCompanyBalance', balance);
  assert.equal(r.ok, false);
});

test('DOCTYPE içeren gövde reddedilir', () => {
  assert.equal(policy(ACTION, '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>' + balance).ok, false);
});

test('HealthCheck ve mükellef sorgusu firma VKN istemez', () => {
  assert.equal(policy('http://tempuri.org/IInvoiceService/HealthCheck', '<s:Envelope xmlns:s="x"><s:Body><tem:HealthCheck/></s:Body></s:Envelope>').ok, true);
  const tp = env('GetTaxPayer', '<P:TaxPayerTaxCode>8810234738</P:TaxPayerTaxCode>');
  assert.equal(policy('http://tempuri.org/IAddressBookService/GetTaxPayer', tp, 'AddressBookService').ok, true);
});
