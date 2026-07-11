// PostgREST .or() filtre grameri için girdi temizleyici.
// Virgül/parantez filtre sözdizimini bozar (enjeksiyon); boşlukla değiştirilir.

/** Kullanıcı girdisini .or()/ilike deseninde güvenli hale getirir. Boş dönerse filtre atlanmalı. */
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()]/g, ' ').trim();
}
