// Ön ekstre PDF metinleri en/de/fa sözlüklerinde (CLAUDE.md çok dillilik kuralı).
// Üretici artık çalışma zamanı modüllerini (autoT/printLocale) içe aktardığı için node'da
// çalıştırılmaz; kaynaktaki autoT('…') sabitleri okunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf-8');
const dict = (lang: string): Record<string, string> => JSON.parse(read(`../../core/i18n/locales/auto.${lang}.json`));
const keysOf = (src: string) => [...src.matchAll(/autoT\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));

test('ön ekstre PDF ve düğme metinlerinin hepsi üç sözlükte dolu', () => {
  const keys = new Set([
    ...keysOf(read('./buildPreStatementHtml.ts')),
    ...keysOf(read('./components/PreStatementPdfButton.tsx')),
  ]);
  assert.ok(keys.size >= 5);
  for (const lang of ['en', 'de', 'fa']) {
    const d = dict(lang);
    const missing = [...keys].filter((k) => !d[k] || !d[k].trim());
    assert.deepEqual(missing, [], `${lang} eksik`);
  }
});
