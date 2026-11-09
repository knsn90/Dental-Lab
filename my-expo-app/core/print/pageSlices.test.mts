import test from 'node:test';
import assert from 'node:assert/strict';
import { pageSlices, clampScale, MAX_CANVAS_PX } from './pageSlices.ts';

const PAGE = 1000;
const rows = (n: number, h = 27, start = 100) => Array.from({ length: n }, (_, i) => start + i * h);

test('0 satır: tek dilim, tüm yükseklik', () => {
  const s = pageSlices({ breaks: [], totalH: 400, pageH: PAGE, heads: [] });
  assert.deepEqual(s, [{ y: 0, h: 400, head: null }]);
});

test('300 satır: dilimler kesintisiz, hiçbiri sayfayı aşmaz, kırılma satır başında', () => {
  const br = rows(300);
  const totalH = 100 + 300 * 27 + 50;
  const heads = [{ top: 60, bottom: 84, tableBottom: totalH - 50 }];
  const s = pageSlices({ breaks: br, totalH, pageH: PAGE, heads });
  assert.ok(s.length >= 8);
  let y = 0;
  for (const sl of s) {
    assert.equal(sl.y, y);
    const headH = sl.head ? sl.head.bottom - sl.head.top : 0;
    assert.ok(sl.h + headH <= PAGE + 1e-9);
    y += sl.h;
    if (y < totalH) assert.ok(br.includes(y), 'kırılma satır başında ' + y);
  }
  assert.equal(y, totalH);
  assert.equal(s[0].head, null);
  assert.ok(s[1].head);
});

test('sayfadan uzun tek satır: ilerler, sonsuz döngü yok, toplam korunur', () => {
  const s = pageSlices({ breaks: [100, 2500], totalH: 3000, pageH: PAGE, heads: [] });
  assert.equal(s.reduce((a, x) => a + x.h, 0), 3000);
  assert.ok(s.every((x) => x.h > 0 && x.h <= PAGE));
});

test('clampScale: genişlik×sayfa×ölçek² ≤ 16M', () => {
  assert.equal(clampScale(688, 1001, 2), 2);
  const k = clampScale(5000, 5000, 2);
  assert.ok(5000 * 5000 * k * k <= MAX_CANVAS_PX + 1);
});
