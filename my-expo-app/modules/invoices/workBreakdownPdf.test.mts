// node --test modules/invoices/workBreakdownPdf.test.mts
// İş dökümü PDF'i tek, kesinleşmiş faturanın dökümüdür — açık cari bakiye gibi okunmamalı:
// kapanış kartı, Bakiye sütunu, B/A işaretleri ve lejantı, "Toplam Alacak"/"Kapanış bakiyesi" yok;
// "Fatura Özeti" başlığı ve fatura tarihi dönemi var. Diğer ekstre çıktıları değişmez.
//
// Üreticiler çalışma zamanı modüllerini (autoT .tsx, printLocale, baseCurrency) uzantısız içe aktarır;
// burada yalnız bu üçü saf stub'larla değiştirilir, gerisi gerçek koddur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const stub = (src: string) => 'data:text/javascript,' + encodeURIComponent(src);
const STUBS: Record<string, string> = {
  autoTranslate: stub('export const autoT = (s) => s;'),
  printLocale: stub("export const htmlAttrs = () => 'lang=\"tr\" dir=\"ltr\"'; export const printLocale = () => 'tr-TR'; export const printNum = (s) => s;"),
  baseCurrency: stub("export const getBaseCurrency = () => 'TRY'; export const baseSymbol = () => '₺'; export const fmtBase = (n) => String(n);"),
};
registerHooks({
  resolve(spec, ctx, next) {
    for (const [k, url] of Object.entries(STUBS)) if (spec.endsWith('/' + k)) return { url, shortCircuit: true };
    if ((spec.startsWith('.') || spec.startsWith('/')) && !/\.[mc]?[jt]sx?$/.test(spec) && ctx.parentURL?.startsWith('file:')) {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const u = new URL(base.href + ext);
        if (existsSync(fileURLToPath(u))) return { url: u.href, shortCircuit: true };
      }
    }
    return next(spec, ctx);
  },
});

const { buildWorkBreakdownHtml, buildPreStatementDetailHtml, buildPreStatementSummaryHtml } = await import('./buildPreStatementHtml.ts');
const { buildStatementHtml } = await import('./buildStatementHtml.ts');
const { buildCariStatementHtml } = await import('../../core/util/buildCariStatementHtml.ts');
const { workBreakdownToPreStatement } = await import('./lib/workBreakdown.ts');

const it = (id: string, d: string, q: number, p: number) => ({
  id, description: d, quantity: q, unit_price: p, total: q * p, gross_total: q * p,
  order_no: 'S-' + id, patient_initials: 'A.K.', doctor_name: 'Dr. Ece', dispute_status: null, notes: [],
});
const items = [it('1', 'Zirkonyum kron', 3, 1500), it('2', 'E.max kron', 1, 2200)];
const sub = items.reduce((s, i) => s + i.total, 0);
const rpc = {
  id: 'inv-1', invoice_number: 'F-1240', currency: 'TRY', issue_date: '2026-11-05',
  created_at: '2026-11-05T09:00:00Z', updated_at: '2026-11-05T09:00:00Z',
  subtotal: sub, tax: sub * 0.2, total: sub * 1.2, items, clinic_name: 'Gül Klinik', lab_name: 'Nexadent',
};
const lab = { id: 'lab', name: 'Nexadent Dental Lab' };
const wb = () => buildWorkBreakdownHtml({
  clinicName: 'Gül Klinik', lab: lab as never, data: workBreakdownToPreStatement(rpc as never),
  currency: 'TRY', documentTitle: 'F-1240 iş dökümü',
});

test('wb_hides_balance_elements: kapanış kartı, Bakiye sütunu, B/A, lejant, Toplam Alacak yok', () => {
  const html = wb();
  assert.equal(html.includes('Kapanış Bakiyesi'), false, 'kapanış kartı / alt hücre');
  assert.equal(html.includes('Toplam Alacak'), false, 'Toplam Alacak');
  assert.equal(html.includes('class="balance-cell"'), false, 'Bakiye hücreleri');
  assert.equal(html.includes('class="ba-flag"'), false, 'B/A işaretleri');
  assert.equal(/<th class="num">Bakiye<\/th>/.test(html), false, 'Bakiye başlığı');
  assert.equal(html.includes('Borç bakiyesi'), false, 'B/A lejantı ve kapanış ipucu');
  assert.equal(html.includes('Hesap Özeti'), false, 'Hesap Özeti başlığı');
});

test('wb_shows_invoice_summary: Fatura Özeti, Toplam Borç, KDV dökümü, dönem = fatura tarihi', () => {
  const html = wb();
  assert.ok(html.includes('Fatura Özeti'));
  assert.ok(html.includes('Toplam Borç'));
  assert.ok(html.includes('Faturaların KDV dökümü'));
  assert.equal(html.includes('Tüm dönem'), false);
  const day = new Date('2026-11-05T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  assert.match(html, new RegExp(`<div class="lbl">Dönem</div>\\s*<div class="val">${day}</div>`));
  // tablo sütunu sayısı başlıkla aynı (Bakiye düşünce satır hücresi de düşer)
  const ths = (html.match(/<thead>[\s\S]*?<\/thead>/)![0].match(/<th[ >]/g) ?? []).length;
  const firstRow = html.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>/)![1];
  assert.equal((firstRow.match(/<td[ >]/g) ?? []).length, ths);
});

test('non_wb_outputs_unchanged: bayrak yokken bakiye öğeleri yerinde, bayrak=false ile bit bit aynı', () => {
  const data = workBreakdownToPreStatement(rpc as never);
  for (const f of [buildPreStatementDetailHtml, buildPreStatementSummaryHtml]) {
    const html = f({ clinicName: 'K', lab: lab as never, data, currency: 'TRY' });
    assert.ok(html.includes('Kapanış Bakiyesi'));
    assert.ok(html.includes('class="balance-cell"'));
    assert.ok(html.includes('Hesap Özeti'));
    assert.equal(html.includes('Fatura Özeti'), false);
  }
  const line = { date: '2026-11-01', type: 'invoice' as const, description: 'F-1', invoiceNo: 'F-1', debit: 120, credit: 0, balance: 120, tax: 20, taxRate: 20, status: 'kesildi' };
  const a = buildStatementHtml('K', [line], lab as never, { from: '2026-11-01', to: '2026-11-30' }, 'TRY', undefined, { vat: true, paper: true });
  const b = buildStatementHtml('K', [line], lab as never, { from: '2026-11-01', to: '2026-11-30' }, 'TRY', undefined, { vat: true, paper: true, workBreakdown: false });
  assert.equal(a, b);
  const cari = {
    documentTitle: 'Cari', lab: { name: 'L' }, holder: { name: 'H' }, openingBalance: 0, closingBalance: 50, currency: 'TRY',
    lines: [{ refNo: 'A', reference: 'Fatura', date: '2026-11-01', counterparty: 'x', amount: 50, currency: 'TRY', type: 'debit', balance: 50 }],
  };
  assert.equal(buildCariStatementHtml(cari as never), buildCariStatementHtml({ ...cari, workBreakdown: false } as never));
});

test('wb_i18n: "Fatura Özeti" üç sözlükte dolu', async () => {
  const { readFileSync } = await import('node:fs');
  for (const lang of ['en', 'de', 'fa']) {
    const d = JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));
    assert.ok(d['Fatura Özeti']?.trim(), `${lang} eksik`);
  }
});
