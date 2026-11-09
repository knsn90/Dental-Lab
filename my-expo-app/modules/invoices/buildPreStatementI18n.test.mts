// Ön ekstre PDF etiketleri en/de/fa sözlüklerinde (CLAUDE.md çok dillilik kuralı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPreStatementDetailHtml, buildPreStatementSummaryHtml } from './buildPreStatementHtml.ts';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../core/i18n/locales/auto.${lang}.json`, import.meta.url), 'utf-8'));

test('PDF etiketlerinin hepsi üç sözlükte dolu', () => {
  const seen = new Set<string>();
  const t = (s: string) => { seen.add(s); return s; };
  const data: any = {
    enabled: true, actor: 'lab', can_manage: true, scope: 'full',
    summary: [{ currency: 'TRY', finalized_balance: 1, overdue: 1, pending: 1 }],
    invoices: [{
      id: 'a', subtotal: 1, tax: 0, invoice_number: null, currency: 'TRY', issue_date: '2026-11-01', created_at: '2026-11-01', updated_at: 'x', total: 1,
      items: [
        { id: '1', description: 'x', quantity: 1, unit_price: 1, total: 1, gross_total: 1, order_no: '1', patient_initials: 'A.', doctor_name: 'D', dispute_status: 'acik', notes: [{}] },
        { id: '2', description: 'y', quantity: 1, unit_price: 1, total: 1, gross_total: 1, order_no: '2', patient_initials: 'A.', doctor_name: 'D', dispute_status: 'yanitlandi', notes: [] },
        { id: '3', description: 'z', quantity: 1, unit_price: 1, total: 1, gross_total: 1, order_no: '3', patient_initials: 'A.', doctor_name: 'D', dispute_status: 'cozuldu', notes: [] },
      ],
    }],
  };
  const input = {
    clinicName: 'K', lab: { name: 'L', tax_number: '1' }, data, generatedAt: '2026-11-09',
    approve: { url: 'u', expiresAt: '2026-12-01' }, i18n: { t, locale: 'tr-TR', htmlAttrs: 'lang="tr" dir="ltr"' },
  };
  buildPreStatementSummaryHtml(input);
  buildPreStatementDetailHtml(input);
  assert.ok(seen.size > 20);
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    const missing = [...seen].filter((k) => !d[k] || !d[k].trim());
    assert.deepEqual(missing, [], `${lang} eksik`);
  }
});
