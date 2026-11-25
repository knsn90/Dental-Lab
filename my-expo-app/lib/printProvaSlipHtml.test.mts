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

test('geçici / daimi tür: rozet, biçim ve hekim seçenekleri', () => {
  const g = buildProvaSlipHtml({ ...base, kind: 'gecici', provaLabel: '1. Geçici prova' });
  assert.match(g, /class="pill out">Geçici prova fişi</);
  assert.match(g, /Uygun, daimiye geçilsin/);
  assert.match(g, /Yeniden geçici prova/);
  assert.match(g, /<title>Geçici prova fişi/);
  const d = buildProvaSlipHtml({ ...base, kind: 'daimi', provaLabel: '2. Daimi prova' });
  assert.match(d, /class="pill">Daimi prova fişi</);
  assert.match(d, /Uygun, bitime geçilsin/);
  const n = buildProvaSlipHtml({ ...base });
  assert.match(n, /class="pill">Prova fişi</);
  assert.match(n, /Uygun, devam edilsin/);
});
