// scripts/cacheBustEntry.js
// index.html'deki giriş paketi adresine İÇERİK özeti ekler: entry-<ad>.js?v=<özet>
//
// NEDEN: expo export, yalnız lazy ekran chunk'ları değiştiğinde entry dosyasının
// ADINI değiştirmiyor, ama içeriği (chunk haritası) değişiyor. Vercel entry'yi
// `max-age=31536000, immutable` ile sunduğu için önceki deploy'da siteyi açmış
// tarayıcı eski entry'yi kullanıp artık olmayan eski chunk'ı istiyordu (404 →
// sipariş sihirbazı açılmıyordu, 2026-09-29). index.html her açılışta yeniden
// doğrulandığı için adres değişince tarayıcı taze entry'yi indirir; içerik
// aynıysa adres de aynı kalır, önbellek boşa kırılmaz.

const crypto = require('crypto');

const ENTRY_RE = /\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/;

/**
 * @param {string} html
 * @param {(entryUrl: string) => string | Buffer} readEntry entry dosyasının içeriğini döndürür
 * @returns {{ html: string, version: string | null }}
 */
function cacheBustEntry(html, readEntry) {
  const m = html.match(ENTRY_RE);
  if (!m) return { html, version: null };
  const url = m[0];
  const version = crypto.createHash('sha256').update(readEntry(url)).digest('hex').slice(0, 12);
  // Yalnız henüz ek almamış (hemen ardından tırnak gelen) adresler — iki kez
  // çalışınca ek ikilenmez.
  const bare = new RegExp(url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?=["\'])', 'g');
  return { html: html.replace(bare, `${url}?v=${version}`), version };
}

module.exports = { cacheBustEntry };
