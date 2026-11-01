// node --test my-expo-app/supabase/functions/_shared/lucaPreviewToken.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson, previewDigest, signPreviewToken, verifyPreviewToken, PREVIEW_TOKEN_TTL_MS,
} from './lucaPreviewToken.ts';

const SECRET = 'test-secret';
const INV = '11111111-1111-1111-1111-111111111111';
const content = { kind: 'e_fatura', currency: 'TRY', lines: [{ name: 'Zirkonya', qty: 2, price: 1500 }], total: 3600 };

test('anahtar sırası özeti değiştirmez, tanımsız alanlar yok sayılır', async () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(await previewDigest({ a: 1, x: undefined }), await previewDigest({ a: 1 }));
});

test('önizlenen içerik aynen gönderilirse jeton geçer', async () => {
  const now = 1_800_000_000_000;
  const d = await previewDigest(content);
  const tok = await signPreviewToken(SECRET, INV, d, now + PREVIEW_TOKEN_TTL_MS);
  assert.deepEqual(await verifyPreviewToken(SECRET, tok, INV, d, now + 60_000), { ok: true });
});

test('jeton yoksa gönderim reddedilir', async () => {
  const d = await previewDigest(content);
  assert.deepEqual(await verifyPreviewToken(SECRET, '', INV, d, 0), { ok: false, reason: 'missing' });
  assert.deepEqual(await verifyPreviewToken(SECRET, undefined, INV, d, 0), { ok: false, reason: 'missing' });
  assert.deepEqual(await verifyPreviewToken(SECRET, 'bozuk', INV, d, 0), { ok: false, reason: 'malformed' });
});

test('önizlemeden sonra tutar değişirse reddedilir', async () => {
  const now = 1_800_000_000_000;
  const tok = await signPreviewToken(SECRET, INV, await previewDigest(content), now + PREVIEW_TOKEN_TTL_MS);
  const changed = await previewDigest({ ...content, total: 3700 });
  assert.deepEqual(await verifyPreviewToken(SECRET, tok, INV, changed, now), { ok: false, reason: 'mismatch' });
});

test('başka faturanın jetonu veya farklı sır kabul edilmez', async () => {
  const now = 1_800_000_000_000;
  const d = await previewDigest(content);
  const tok = await signPreviewToken(SECRET, INV, d, now + PREVIEW_TOKEN_TTL_MS);
  assert.equal((await verifyPreviewToken(SECRET, tok, '22222222-2222-2222-2222-222222222222', d, now)).ok, false);
  assert.equal((await verifyPreviewToken('baska-sir', tok, INV, d, now)).ok, false);
});

test('süresi dolan jeton reddedilir', async () => {
  const now = 1_800_000_000_000;
  const d = await previewDigest(content);
  const tok = await signPreviewToken(SECRET, INV, d, now + PREVIEW_TOKEN_TTL_MS);
  assert.deepEqual(await verifyPreviewToken(SECRET, tok, INV, d, now + PREVIEW_TOKEN_TTL_MS + 1), { ok: false, reason: 'expired' });
});

// ── Gerçek fatura kurucusuyla: önizleme ve gönderim AYNI özeti üretmeli ──────
import { buildLucaInput, type DbInvoice, type SellerConfig } from './lucaInvoice.ts';

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
// efatura-luca'daki contentDigest ile aynı sarmalayıcı
const digestOf = (invoice: DbInvoice, crossRate: number | null = null) => {
  const r = buildLucaInput({ invoice, clinic, doctor: null, seller, kind: 'e_fatura', companyTaxCode: '6312098145', inboxTag: 'urn:mail:x@y', crossRate });
  if (!r.ok) throw new Error(r.error);
  return previewDigest({ env: 'prod', kind: 'e_fatura', currency: invoice.currency, crossRate, input: { ...r.input, externalCode: undefined } });
};

test('aynı fatura iki kez kurulunca özet aynı (önizleme = gönderim)', async () => {
  assert.equal(await digestOf(inv), await digestOf({ ...inv, items: inv.items.map((i) => ({ ...i })) }));
});

test('kalem açıklaması, kur veya dış kod dışı içerik değişirse özet değişir', async () => {
  const base = await digestOf(inv);
  const renamed = { ...inv, items: [{ ...inv.items[0], description: 'E.max kron' }, inv.items[1]] };
  assert.notEqual(await digestOf(renamed), base);
  assert.notEqual(await digestOf(inv, 35.12), base);
});
