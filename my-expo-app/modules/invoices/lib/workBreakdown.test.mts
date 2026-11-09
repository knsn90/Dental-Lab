// İş dökümü (kesinleşmiş faturanın kalem listesi PDF'i) — saf adaptör testleri.
// Not: autoT node'da çalışmaz; başlık çevirmeni parametreyle verilir. setLanguage çağrılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  workBreakdownToPreStatement, workBreakdownTitle, workBreakdownErrorText, workBreakdownFileName,
  WORK_BREAKDOWN_TEXTS, isWorkBreakdownStatus,
} from './workBreakdown.ts';
import { preStatementLines } from './preStatementPdf.ts';

const item = (id: string, total: number, extra: any = {}) => ({
  id, description: `İş ${id}`, quantity: 1, unit_price: total, total, gross_total: total,
  order_no: 'S-' + id, patient_initials: 'A.K.', doctor_name: 'Dr. Ece', dispute_status: null, notes: [],
  ...extra,
});
const rpc = (items: any[], over: any = {}) => ({
  id: 'inv-1', invoice_number: 'F-1240', currency: 'TRY', issue_date: '2026-11-05',
  created_at: '2026-11-05T09:00:00Z', updated_at: '2026-11-05T09:00:00Z',
  subtotal: 1000, tax: 200, total: 1200, items,
  clinic_name: 'Gül Klinik', lab_name: 'Nexadent', ...over,
}) as any;

const cents = (n: number) => Math.round(n * 100);

test('adaptör: tek faturalı ön ekstre, açılış gizli, toplamlar RPC toplamına eşit', () => {
  const r = rpc([item('a', 333.33), item('b', 333.33), item('c', 333.34)]);
  const ps = workBreakdownToPreStatement(r);
  assert.equal(ps.enabled, true);
  assert.equal(ps.scope, 'full');
  assert.equal(ps.invoices.length, 1);
  assert.equal(ps.invoices[0].id, 'inv-1');
  assert.deepEqual(ps.summary, [{ currency: 'TRY', finalized_balance: null, overdue: null, pending: 1200 }]);
  // clinic_name / lab_name faturaya sızmaz
  assert.equal((ps.invoices[0] as any).clinic_name, undefined);
  assert.equal((ps.invoices[0] as any).lab_name, undefined);

  const out = preStatementLines(ps, 'TRY', 'ayrintili');
  assert.equal(out.hideOpening, true);
  assert.equal(out.opening, 0);
  assert.equal(out.closing, 1200);
  assert.equal(out.lines.reduce((s, l) => s + cents(l.debit), 0), cents(1200));
  assert.equal(out.lines.reduce((s, l) => s + cents(l.tax ?? 0), 0), cents(200));
  assert.equal(out.lines[out.lines.length - 1].balance, 1200);
});

test('adaptör: kalem sırası RPC sırasıyla aynı kalır', () => {
  const r = rpc([item('z', 100), item('a', 500), item('m', 400)], { subtotal: 1000, tax: 0, total: 1000 });
  const ps = workBreakdownToPreStatement(r);
  assert.deepEqual(ps.invoices[0].items.map((i) => i.id), ['z', 'a', 'm']);
  const out = preStatementLines(ps, 'TRY', 'ayrintili');
  assert.deepEqual(out.lines.map((l) => l.id), ['inv-1:z', 'inv-1:a', 'inv-1:m']);
});

test('adaptör: dövizli fatura kendi para biriminde; sayısal alanlar sayıya çevrilir', () => {
  const r = rpc([item('a', '50.5' as any)], { currency: 'EUR', subtotal: '50.5', tax: '0', total: '50.5' });
  const ps = workBreakdownToPreStatement(r);
  assert.deepEqual(ps.summary, [{ currency: 'EUR', finalized_balance: null, overdue: null, pending: 50.5 }]);
  assert.equal(typeof ps.invoices[0].total, 'number');
  assert.equal(typeof ps.invoices[0].items[0].total, 'number');
});

test('adaptör: para birimi boşsa TRY', () => {
  const ps = workBreakdownToPreStatement(rpc([item('a', 1200)], { currency: null }));
  assert.equal(ps.invoices[0].currency, 'TRY');
  assert.equal(ps.summary[0].currency, 'TRY');
});

test('adaptör: kalemsiz faturada hata', () => {
  assert.throws(() => workBreakdownToPreStatement(rpc([])), /WB_EMPTY/);
  assert.throws(() => workBreakdownToPreStatement(rpc(null as any)), /WB_EMPTY/);
  assert.throws(() => workBreakdownToPreStatement(null as any), /WB_EMPTY/);
});

test('başlık: "<no> iş dökümü"; çevirmen yalnız sabit kısmı çevirir', () => {
  assert.equal(workBreakdownTitle('F-1240'), 'F-1240 iş dökümü');
  assert.equal(workBreakdownTitle('F-1240', (s) => (s === 'iş dökümü' ? 'work breakdown' : s)), 'F-1240 work breakdown');
  assert.equal(workBreakdownTitle('  F-7 '), 'F-7 iş dökümü');
});

test('dosya adı: güvenli karakterler + .pdf', () => {
  assert.equal(workBreakdownFileName('F-1240'), 'Is-Dokumu-F-1240.pdf');
  assert.equal(workBreakdownFileName('F/12 40'), 'Is-Dokumu-F_12_40.pdf');
  assert.equal(workBreakdownFileName(''), 'Is-Dokumu-Fatura.pdf');
});

test('hata metni: RPC kodları Türkçe anahtara, diğerleri null', () => {
  assert.equal(workBreakdownErrorText({ message: 'PS_SCOPE' }), WORK_BREAKDOWN_TEXTS.scope);
  assert.equal(workBreakdownErrorText({ code: '42501', message: 'x' }), WORK_BREAKDOWN_TEXTS.scope);
  assert.equal(workBreakdownErrorText({ message: 'INV_NOT_FINALIZED' }), WORK_BREAKDOWN_TEXTS.notFinalized);
  assert.equal(workBreakdownErrorText(new Error('WB_EMPTY')), WORK_BREAKDOWN_TEXTS.empty);
  assert.equal(workBreakdownErrorText({ message: 'boom' }), null);
});

test('durum: yalnız kesinleşmiş faturada', () => {
  for (const s of ['kesildi', 'kismi_odendi', 'odendi']) assert.equal(isWorkBreakdownStatus(s), true, s);
  for (const s of ['taslak', 'iptal', null, undefined, '']) assert.equal(isWorkBreakdownStatus(s as any), false, String(s));
});

test('i18n: iş dökümü metinleri üç sözlükte dolu', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf-8');
  const keysOf = (src: string) => [...src.matchAll(/autoT\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const keys = new Set([
    ...Object.values(WORK_BREAKDOWN_TEXTS),
    ...keysOf(read('../components/WorkBreakdownPdfButton.tsx')),
  ]);
  assert.ok(keys.size >= 6);
  for (const lang of ['en', 'de', 'fa']) {
    const d = JSON.parse(read(`../../../core/i18n/locales/auto.${lang}.json`));
    const missing = [...keys].filter((k) => !d[k] || !String(d[k]).trim());
    assert.deepEqual(missing, [], `${lang} eksik`);
  }
});
