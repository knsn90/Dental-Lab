// node --test my-expo-app/modules/orders/lib/workLabel.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  patientInitials, groupFdi, summarizeWork, crossLayout, labelOps,
  formatLabelDate, qrSvgFromModules, readLabelSize, DEFAULT_LABEL_SIZE,
} from './workLabel.ts';

test('baş harfler: ilk ad + soyad, Türkçe büyük harf', () => {
  assert.equal(patientInitials('Arzu Seğmen'), 'A. S.');
  assert.equal(patientInitials('ismail hakkı çelik'), 'İ. Ç.');
  assert.equal(patientInitials('  Ömer   Faruk  Işık '), 'Ö. I.');
  assert.equal(patientInitials('Cem'), 'C.');
  assert.equal(patientInitials('Ayşe Nur-Kaya'), 'A. N.');
  assert.equal(patientInitials('(Ayşe) Kaya'), 'A. K.');
});

test('baş harfler: boş / tanımsız / harfsiz → boş dize', () => {
  assert.equal(patientInitials(''), '');
  assert.equal(patientInitials(null), '');
  assert.equal(patientInitials(undefined), '');
  assert.equal(patientInitials('—'), '');
  assert.equal(patientInitials('123 45'), '');
});

test('FDI çeyrekleri: üst-sağ ve alt-sağ orta hatta doğru azalır', () => {
  const q = groupFdi([11, 16, 14, 21, 28, 31, 48, 41, 36]);
  assert.deepEqual(q.ur, [16, 14, 11]);
  assert.deepEqual(q.ul, [21, 28]);
  assert.deepEqual(q.lr, [48, 41]);
  assert.deepEqual(q.ll, [31, 36]);
});

test('FDI çeyrekleri: süt dişleri kendi çeyreğine, tekrar ve geçersiz atılır', () => {
  const q = groupFdi([55, 51, 61, 75, 84, 14, 14, 99, 0, 19, 10, NaN as unknown as number]);
  assert.deepEqual(q.ur, [55, 14, 51]);
  assert.deepEqual(q.ul, [61]);
  assert.deepEqual(q.ll, [75]);
  assert.deepEqual(q.lr, [84]);
});

test('iş özeti: kalemlerde dişler sayılır, en kalabalık iş başa', () => {
  const lines = summarizeWork({
    items: [
      { name: 'İmplant üstü kron', quantity: 1, tooth_numbers: [36] },
      { name: 'Zirkonyum kron', quantity: 1, tooth_numbers: [14, 15, 16] },
    ],
    workType: 'Zirkonyum kron, İmplant üstü kron',
    teethCount: 4,
  });
  assert.deepEqual(lines, [
    { name: 'Zirkonyum kron', count: 3 },
    { name: 'İmplant üstü kron', count: 1 },
  ]);
});

test('iş özeti: aynı adlı kalemler birleşir; dişsiz kalem miktarıyla sayılır', () => {
  const lines = summarizeWork({
    items: [
      { name: 'Tam protez', quantity: 2, tooth_numbers: [] },
      { name: 'Tam protez', quantity: 1, tooth_numbers: null },
      { name: '  ', quantity: 5 },
    ],
    workType: null,
    teethCount: 0,
  });
  assert.deepEqual(lines, [{ name: 'Tam protez', count: 3 }]);
});

test('iş özeti: kalem yoksa work_type; tek iş + dişler → diş sayısı', () => {
  assert.deepEqual(
    summarizeWork({ items: [], workType: 'Zirkonyum kron', teethCount: 3 }),
    [{ name: 'Zirkonyum kron', count: 3 }],
  );
  assert.deepEqual(
    summarizeWork({ items: null, workType: 'Kron, Kron, Köprü', teethCount: 3 }),
    [{ name: 'Kron', count: 2 }, { name: 'Köprü', count: 1 }],
  );
  assert.deepEqual(summarizeWork({ items: null, workType: '', teethCount: 0 }), []);
  assert.deepEqual(summarizeWork({ items: null, workType: 'Gece plağı', teethCount: 0 }), [{ name: 'Gece plağı', count: 1 }]);
});

test('haç yerleşimi: az dişte taban genişlik, kalabalıkta genişler, sığmazsa yazı küçülür', () => {
  assert.deepEqual(crossLayout({ maxPerQuadrant: 3, baseWidth: 50, font: 3.4, innerWidth: 93 }), { width: 50, font: 3.4 });
  const mid = crossLayout({ maxPerQuadrant: 6, baseWidth: 50, font: 3.4, innerWidth: 93 });
  assert.equal(mid.font, 3.4);
  assert.ok(mid.width > 50 && mid.width <= 93, `genişlik ${mid.width}`);
  const full = crossLayout({ maxPerQuadrant: 8, baseWidth: 50, font: 3.4, innerWidth: 93 });
  assert.equal(full.width, 93);
  assert.ok(full.font < 3.4 && full.font > 3, `yazı ${full.font}`);
  // diş yoksa da taban ölçü
  assert.deepEqual(crossLayout({ maxPerQuadrant: 0, baseWidth: 66, font: 4.2, innerWidth: 130 }), { width: 66, font: 4.2 });
});

test('A4 işlem tablosu: aynı iş+detay+renk tek satırda, dişler sıralı', () => {
  const rows = labelOps([
    { tooth: 16, workType: 'Zirkonyum kron', shade: 'A2' },
    { tooth: 14, workType: 'Zirkonyum kron', shade: 'A2' },
    { tooth: 36, workType: 'İmplant üstü kron', shade: 'A2', implantSystem: 'Straumann', implantType: 'Bone Level', abutment: 'Ti-base' },
    { tooth: 15, workType: 'Zirkonyum kron', shade: 'A3' },
  ]);
  assert.deepEqual(rows, [
    { work: 'Zirkonyum kron', detail: '', shade: 'A2', teeth: [14, 16] },
    { work: 'İmplant üstü kron', detail: 'Straumann · Bone Level · Ti-base', shade: 'A2', teeth: [36] },
    { work: 'Zirkonyum kron', detail: '', shade: 'A3', teeth: [15] },
  ]);
  assert.deepEqual(labelOps(undefined), []);
});

test('etiket tarihi: kısa gün-ay-gün adı; başka yıl ise yıl eklenir; geçersiz → tire', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  assert.equal(formatLabelDate('2026-10-14T09:00:00Z', 'tr-TR', now), '14 Eki Çar');
  assert.equal(formatLabelDate('2025-12-30T09:00:00Z', 'tr-TR', now), '30 Ara 2025 Sal');
  assert.equal(formatLabelDate(null, 'tr-TR', now), '—');
  assert.equal(formatLabelDate('bozuk', 'tr-TR', now), '—');
});

test('QR SVG: viewBox sessiz bölgeyi içerir, koyu modüller tek path', () => {
  // 3x3: köşegen koyu
  const svg = qrSvgFromModules(3, (r, c) => r === c, 2);
  assert.match(svg, /viewBox="0 0 7 7"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.equal((svg.match(/h1v1h-1z/g) ?? []).length, 3);
  assert.match(svg, /M2 2h1v1h-1z/);
  assert.match(svg, /M4 4h1v1h-1z/);
});

test('etiket boyutu: kayıtlı değer okunur, bilinmeyen → varsayılan', () => {
  assert.equal(readLabelSize('A6'), 'A6');
  assert.equal(readLabelSize('A4'), 'A4');
  assert.equal(readLabelSize('a5'), DEFAULT_LABEL_SIZE);
  assert.equal(readLabelSize(null), DEFAULT_LABEL_SIZE);
  assert.equal(DEFAULT_LABEL_SIZE, 'A5');
});
