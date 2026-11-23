import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkLabelHtml } from './printWorkLabelHtml';

const base = {
  size: 'A5' as const, orderNumber: 'NEX-2026-0244', createdAt: '2026-11-23', deliveryDate: '2026-11-30',
  isUrgent: false, patientInitials: 'H. B.', clinicName: 'Test Klinik', doctorName: 'Dt. Test',
  lab: { name: 'Nexadent' }, work: [{ name: 'Zirkon Kron', count: 1 }] as any, shade: 'A1', teeth: [25],
};

test('hekim notları basılır, kaçışlanır; kalan + ses/dosya satırı', () => {
  const html = buildWorkLabelHtml({
    ...base,
    doctorNotes: [{ who: 'Dt. Test', when: '23 Kas 14:32', text: 'Kontak <sıkı>' }],
    doctorNotesMore: 2, doctorNotesMedia: { audio: 1, files: 0 },
  });
  assert.match(html, /Hekim notları/);
  assert.match(html, /Dt\. Test · 23 Kas 14:32/);
  assert.match(html, /Kontak &lt;sıkı&gt;/);
  assert.match(html, /\+2 mesaj daha · 1 sesli mesaj — uygulamada/);
});

test('hekim notu yoksa bölüm basılmaz', () => {
  const html = buildWorkLabelHtml({ ...base, doctorNotes: [] });
  assert.ok(!html.includes('class="hnotes"'));
});

test('A6 hekim notları basmaz, eski tek nota düşer', () => {
  const html = buildWorkLabelHtml({ ...base, size: 'A6', note: 'Sipariş notu metni', doctorNotes: [{ who: 'X', when: '', text: 'mesaj' }] });
  assert.ok(!html.includes('class="hnotes"'));
  assert.match(html, /Sipariş notu metni/);
});
