// supabase/functions/_shared/lucaConsolidate.ts
//
// E-fatura satırlarını aynı hizmet + birim fiyat + KDV oranı (+ birim) anahtarıyla birleştirir.
// Saf (I/O yok). buildLucaInput 'birlesik' modunda kullanır. Testler: lucaConsolidate.test.ts
//
// Anahtardaki birim fiyat Luca'ya GİDEN fiyattır: genel orandan gelen kalemde bu liste fiyatıdır,
// iskontolar toplanır; net tutar (adet × fiyat − iskonto) birleşmeyle değişmez.
// KDV birleşik satırda tek sefer yuvarlanır → kalem KDV'leri toplamından 1 kuruş sapabilir;
// bunu denetlemek buildLucaInput'un işidir (sapmada kalem satırlarına geri düşer).

import type { LucaLine } from './luca.ts';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export function consolidateLucaLines(lines: LucaLine[]): LucaLine[] {
  const groups = new Map<string, LucaLine[]>();
  for (const l of lines) {
    const key = JSON.stringify([l.name.trim(), l.unitPrice, l.vatRate, l.unit ?? 'C62']);
    const g = groups.get(key);
    if (g) g.push(l); else groups.set(key, [l]);
  }
  const out: LucaLine[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push({ ...g[0] }); continue; }
    const first = g[0];
    const { note: _n, ...rest } = first;
    const merged: LucaLine = {
      ...rest,
      quantity: r4(g.reduce((a, l) => a + l.quantity, 0)),
      discountAmount: r2(g.reduce((a, l) => a + (l.discountAmount ?? 0), 0)),
    };
    const firstNote = first.note ?? null;
    if (firstNote && g.every((l) => (l.note ?? null) === firstNote)) merged.note = firstNote;
    out.push(merged);
  }
  return out;
}
