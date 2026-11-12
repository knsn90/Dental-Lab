/**
 * İmplant marka/model kataloğu — SAF yardımcılar (supabase/React yok, test edilir).
 *
 * Ad anahtarı DB'deki `_implant_catalog_key` ile birebir aynı kuralı izler:
 * büyük/küçük harf, TR karakter ve noktalama/boşluk farkı yok sayılır.
 * Böylece istemci "bu zaten var" kararını sunucuyla aynı verir.
 */

export interface CatalogModel { id: string; name: string; hidden?: boolean }
export interface CatalogBrand { id: string; name: string; hidden?: boolean; models: CatalogModel[] }

const FROM = 'İIıŞşĞğÜüÖöÇçÅå';
const TO   = 'iiissgguuooccaa';

export function catalogKey(name: string | null | undefined): string {
  let s = '';
  for (const ch of String(name ?? '')) {
    const i = FROM.indexOf(ch);
    s += i >= 0 ? TO[i] : ch;
  }
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Ekranda gösterilecek temiz ad: kenar boşluğu kırpılır, iç boşluklar teke iner. */
export function cleanCatalogName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

export function findByKey<T extends { name: string }>(list: T[], name: string): T | undefined {
  const k = catalogKey(name);
  if (!k) return undefined;
  return list.find(x => catalogKey(x.name) === k);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * "Bunu mu demek istediniz?" önerisi. Birebir eşleşme varsa öneri YOK (o zaten
 * seçilir). Yazım hatası (≤ %25 mesafe, en az 1) ya da yazılanın bir markanın
 * başı olması/markayı içermesi durumunda en yakın marka döner.
 */
export function suggestSimilar(names: string[], typed: string): string | null {
  const k = catalogKey(typed);
  if (k.length < 3) return null;
  let best: { name: string; score: number } | null = null;
  for (const n of names) {
    const nk = catalogKey(n);
    if (!nk) continue;
    if (nk === k) return null;
    let score: number;
    if (nk.startsWith(k) || k.startsWith(nk)) score = Math.abs(nk.length - k.length) * 0.1;
    else {
      const d = levenshtein(k, nk);
      const limit = Math.max(1, Math.floor(Math.max(k.length, nk.length) * 0.25));
      if (d > limit) continue;
      score = d;
    }
    if (!best || score < best.score) best = { name: n, score };
  }
  return best?.name ?? null;
}

/** Arama filtresi: yazılan anahtar markanın anahtarında geçiyorsa. */
export function filterByQuery(names: string[], q: string): string[] {
  const k = catalogKey(q);
  if (!k) return names;
  return names.filter(n => catalogKey(n).includes(k));
}

/** "Straumann" + "BLX" → "Straumann BLX"; model boşsa yalnız marka. */
export function brandWithModel(brand?: string | null, model?: string | null): string {
  return [brand, model].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
}
