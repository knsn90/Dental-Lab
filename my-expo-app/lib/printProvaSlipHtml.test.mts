import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProvaSlipHtml } from './printProvaSlipHtml';

const base = {
  orderNumber: 'NEX-2026-0235',
  provaLabel: '2. Prova',
  date: '2026-11-20',
  patientInitials: 'M. A.',
  clinicName: 'Test Klinik',
  doctorName: 'Dr. Test',
  lab: { name: 'Nexadent' },
  ops: [{ work: 'Zirkon Kron', detail: '', shade: 'A1', teeth: [11, 21] }],
};

test('lab notu yazılıysa basılır, kaçışlanır', () => {
  const html = buildProvaSlipHtml({ ...base, labNote: 'Kontak <sıkı> kontrol' });
  assert.match(html, /Kontak &lt;sıkı&gt; kontrol/);
  assert.match(html, /2\. Prova/);
  assert.match(html, /M\. A\./);
});

test('lab notu boşsa çizgili boş kutu; hekim kutusu ve imza her zaman var', () => {
  const html = buildProvaSlipHtml({ ...base, labNote: '  ' });
  assert.ok(!html.includes('class="text"'));
  assert.match(html, /Hekim notu/);
  assert.match(html, /Hekim imza \/ kaşe/);
  assert.match(html, /Düzeltme gerekli/);
});

test('A5 sayfa ölçüsü', () => {
  assert.match(buildProvaSlipHtml(base), /@page\{size:148mm 210mm/);
});
