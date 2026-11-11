// node --test modules/admin/workStats/exportDoc.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkStatsPdfHtml, buildWorkStatsXlsHtml, workStatsFileBase, WORK_STATS_TEXTS,
  type ExportDocInput,
} from './exportDoc.ts';
import { windowMonths } from './months.ts';
import { UNKNOWN_CLINIC_NAME, type WorkStats } from './aggregate.ts';

const months = windowMonths('2026-11', 12);
const monthLabels = months.map((m) => `AY${m}`);

function stats(over: Partial<WorkStats> = {}): WorkStats {
  return {
    months,
    trend: [],
    selectedQty: { uye: 4321, cene: 2, adet: 1 },
    compareQty: { uye: 3000, cene: 1, adet: 1 },
    avg6Uye: 12.5,
    workTypes: [
      { label: 'Zirkon', unit: 'Üye', unitLabel: 'üye', bucket: 'uye', qty: 3, compare: 5,
        series: months.map((_, i) => (i === 0 ? null : i)) },
    ],
    clinics: [
      { id: 'cA', name: 'Klinik A', qty: { uye: 3, cene: 2, adet: 1 }, compare: { uye: 5, cene: 1, adet: 0 } },
      { id: '__unknown__', name: UNKNOWN_CLINIC_NAME, qty: { uye: 1, cene: 0, adet: 0 }, compare: null },
    ],
    ...over,
  };
}

function inp(over: Partial<ExportDocInput> = {}): ExportDocInput {
  return {
    stats: stats(), heat: [], lab: { name: 'Lab X' }, clinicLabel: 'Tüm klinikler',
    monthLabel: 'Kasım 2026', compareLabel: 'Ekim 2026', generatedAt: new Date(2026, 10, 12),
    t: (s) => s, locale: 'tr-TR', monthLabels, ...over,
  };
}

test('pdf: bölümler', () => {
  const h = buildWorkStatsPdfHtml(inp());
  for (const s of ['İş İstatistikleri', 'Tüm klinikler', 'Kasım 2026', UNKNOWN_CLINIC_NAME, 'Zirkon', ...monthLabels]) {
    assert.ok(h.includes(s), s);
  }
  assert.ok(h.includes('4321') || h.includes('4.321'));
  assert.ok(h.includes('lang="tr-TR"') && h.includes('dir="ltr"'));
  assert.ok(buildWorkStatsPdfHtml(inp({ locale: 'fa-IR' })).includes('dir="rtl"'));
});

test('pdf: geçen yıl yok', () => {
  const s = stats({
    compareQty: null,
    workTypes: [{ label: 'Zirkon', unit: 'Üye', unitLabel: 'üye', bucket: 'uye', qty: 3, compare: null, series: months.map(() => 1) }],
    clinics: [{ id: 'cA', name: 'Klinik A', qty: { uye: 3, cene: 0, adet: 0 }, compare: null }],
  });
  const h = buildWorkStatsPdfHtml(inp({ stats: s }));
  assert.ok(h.includes('class="diff">—<'));
  assert.ok(!h.includes('%'));
  assert.ok(!h.includes('NaN') && !h.includes('Infinity'));
});

test('xls: kaçış ve sayı', () => {
  const s = stats({ clinics: [{ id: 'c', name: 'A&B <Diş> "Klinik"', qty: { uye: 3, cene: 0, adet: 0 }, compare: null }] });
  const h = buildWorkStatsXlsHtml(inp({ stats: s }));
  assert.ok(h.includes('A&amp;B &lt;Diş&gt; &quot;Klinik&quot;'));
  assert.ok(!h.includes('A&B <Diş>'));
  assert.ok(h.includes("mso-number-format:'0'"));
  assert.ok(h.includes("mso-number-format:'0.0'"));
});

test('fileBase', () => {
  assert.equal(workStatsFileBase('2026-11', 'Şirin Diş Kliniği'), 'is-istatistikleri-2026-11-sirin-dis-klinigi');
  assert.equal(workStatsFileBase('2026-11', null), 'is-istatistikleri-2026-11');
  assert.equal(workStatsFileBase('2026-11', '!!!'), 'is-istatistikleri-2026-11');
});

test('WORK_STATS_TEXTS: t ile geçer', () => {
  assert.ok(Object.keys(WORK_STATS_TEXTS).length > 5);
  const h = buildWorkStatsPdfHtml(inp({ t: (s) => `«${s}»` }));
  assert.ok(h.includes('«İş İstatistikleri»'));
});
