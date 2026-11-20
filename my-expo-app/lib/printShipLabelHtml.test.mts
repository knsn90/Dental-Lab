// npx tsx --test lib/printShipLabelHtml.test.mts   (my-expo-app içinden; .mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShipLabelHtml } from './printShipLabelHtml.ts';
import { patientInitials } from '../modules/orders/lib/workLabel.ts';

const base = {
  orderNumber: 'NEX-2026-0211', final: false, purposeLabel: 'Prova gidiş',
  from: { name: 'Nexadent', address: 'Ataşehir', phone: '0216', isLab: true },
  to: { name: 'BestDent', person: 'Dt. Ebru C.', address: 'Ataşehir', phone: '0537', isLab: false },
  lab: { name: 'Nexadent' },
} as any;

test('gönderi fişi: hasta yalnız baş harfleriyle alıcı kutusunda', () => {
  const html = buildShipLabelHtml({ ...base, patientInitials: patientInitials('Fatma Ceylan') });
  assert.match(html, /<span class="k">Hasta<\/span> F\. C\./);
  assert.doesNotMatch(html, /Fatma|Ceylan/);
});

test('gönderi fişi: hasta yoksa satır basılmaz', () => {
  const html = buildShipLabelHtml({ ...base });
  assert.doesNotMatch(html, /class="k">Hasta</);
});
