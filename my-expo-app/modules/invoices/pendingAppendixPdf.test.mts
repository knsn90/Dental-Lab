// node --test modules/invoices/pendingAppendixPdf.test.mts
// Genel ekstre PDF'i: "onay bekleyenler" eki kesinleşmiş bakiyeyi DEĞİŞTİRMEDEN alt bilgiden önce,
// ayrı ve etiketli bölüm olarak eklenir; ek seçilmezse belge bit bit aynı kalır.
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
  currency: stub("export const formatMoney = (n, c) => c + ' ' + Number(n).toFixed(2);"),
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

const { buildStatementHtml } = await import('./buildStatementHtml.ts');
const { buildPendingAppendixHtml, appendBeforeBody } = await import('./lib/pendingAppendixHtml.ts');

const lab = { name: 'Lab', logo_url: null, address: null, phone: null, email: null, tax_number: null };
const line = { date: '2026-11-10', type: 'invoice', description: 'X', invoiceNo: 'F-1', debit: 1000, credit: 0, balance: 1000, tax: 0 };
const base = buildStatementHtml('K', [line] as never, lab as never, {}, 'TRY');

test('ek boşsa belge aynen kalır', () => {
  assert.equal(appendBeforeBody(base, buildPendingAppendixHtml([], 'TRY', 1000)), base);
});

test('ek alt bilgiden önce, toplamlarla eklenir', () => {
  const rows = [
    { ref: 'F-NEX-0221', date: '2026-11-13', description: 'Kron', status: 'awaiting' as const, amount: 3630 },
    { ref: 'S-9', date: null, description: 'Plak', status: 'draft' as const, amount: 370 },
  ];
  const out = appendBeforeBody(base, buildPendingAppendixHtml(rows, 'TRY', 1000));
  const a = out.indexOf('pending-appendix'), f = out.lastIndexOf('<!-- Footer -->');
  assert.ok(a > 0 && f > a, 'ek footer öncesinde');
  assert.match(out, /F-NEX-0221/);
  assert.match(out, /TRY 4000\.00/);   // bekleyen toplam
  assert.match(out, /TRY 5000\.00/);   // kesinleşmiş + bekleyen
  // kesinleşmiş belge kısmı değişmedi
  assert.equal(out.slice(0, a).replace(/\s*<section[\s\S]*$/, ''), base.slice(0, base.lastIndexOf('<!-- Footer -->')).replace(/\s*$/, ''));
});

test('ön ekstre: paper:false genel ekstreyle aynı ekran düzeni (araç çubuğu var), varsayılan kâğıt', async () => {
  const { buildPreStatementSummaryHtml } = await import('./buildPreStatementHtml.ts');
  const data = { enabled: true, actor: 'lab', can_manage: true, scope: 'full',
    summary: [{ currency: 'TRY', finalized_balance: 0, overdue: 0, pending: 100 }],
    invoices: [{ id: 'i1', subtotal: 100, tax: 0, invoice_number: 'F-1', currency: 'TRY', issue_date: '2026-11-13',
      created_at: '2026-11-13', updated_at: '2026-11-13', total: 100,
      items: [{ id: 'x', description: 'Kron', quantity: 1, unit_price: 100, total: 100, gross_total: 100, order_no: 'S-1',
        patient_initials: 'A.K.', doctor_name: 'Dr', dispute_status: null, notes: [] }] }] };
  const input = { clinicName: 'K', lab: lab as never, data: data as never, currency: 'TRY' };
  const screen = buildPreStatementSummaryHtml({ ...input, paper: false });
  const paper = buildPreStatementSummaryHtml(input);
  assert.match(screen, /class="toolbar"/);
  assert.doesNotMatch(paper, /class="toolbar"/);
  // genel ekstreyle aynı araç çubuğu
  assert.match(base, /class="toolbar"/);
});
