// core/materials/unitConvert.ts
// Malzeme miktarı birim dönüşümü — tüketim tahmini ile stok kaleminin birimi
// farklı olduğunda (ör. istasyon kuralı "ml", kalem "L") miktarı kalemin birimine
// çevirmek için. Aksi halde ml cinsi tahmin, L olarak düşülüp 1000× fazla stok
// tüketimine yol açar.
//
// Yalnız AYNI aile içinde (hacim ↔ hacim, kütle ↔ kütle) çevirir. Bilinmeyen ya
// da çapraz aile birimlerinde null döner → çağıran taraf miktarı OLDUĞU GİBİ bırakır
// (asla bozma).

type Family = 'volume' | 'mass';

// Birim → [aile, baz-birim çarpanı]
const UNITS: Record<string, [Family, number]> = {
  // Hacim (baz: ml)
  ml: ['volume', 1],
  cc: ['volume', 1],
  cl: ['volume', 10],
  dl: ['volume', 100],
  l:  ['volume', 1000],
  lt: ['volume', 1000],
  // Kütle (baz: mg)
  mg: ['mass', 1],
  g:  ['mass', 1000],
  gr: ['mass', 1000],
  kg: ['mass', 1_000_000],
};

/** Birim etiketini normalize et: küçük harf, boşluk/nokta kırp, tr 'lt'/'gr' kabul. */
function norm(u: string | null | undefined): string {
  return (u ?? '').trim().toLowerCase().replace(/\.$/, '');
}

/** İki birim aynı ailede ve çevrilebilir mi? */
export function isConvertible(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = UNITS[norm(from)];
  const b = UNITS[norm(to)];
  return !!a && !!b && a[0] === b[0];
}

/**
 * `qty`'yi `from` biriminden `to` birimine çevirir.
 * Çevrilemezse (bilinmeyen/çapraz aile) `null` döner — çağıran miktarı korumalı.
 * 6 ondalık hane (NUMERIC uyumu; ör. 4 ml → 0.004 L).
 */
export function convertQty(
  qty: number,
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!Number.isFinite(qty)) return null;
  const a = UNITS[norm(from)];
  const b = UNITS[norm(to)];
  if (!a || !b || a[0] !== b[0]) return null;
  if (norm(from) === norm(to)) return qty;
  return +((qty * a[1]) / b[1]).toFixed(6);
}
