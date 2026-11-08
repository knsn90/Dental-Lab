// Tahsilat penceresinde elle fatura seçimi — saf yardımcılar.
// Not: node ile test edildiği için yerel içe aktarma yalnız `import type`.
import type { OpenInvoice } from '../types';

/** Seçim sırasını korur; seçili olan tekrar dokunulunca çıkar. */
export function toggleSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

/** Artık açık listede olmayan faturaları seçimden atar (sırayı korur). */
export function pruneSelection(ids: string[], open: OpenInvoice[]): string[] {
  const set = new Set(open.map(o => o.invoice_id));
  return ids.filter(id => set.has(id));
}

/** Seçilebilir liste: yalnız fişte tutarı > 0 olan satırların para birimindeki açık faturalar
 *  (farklı para birimindeki seçili fatura DB'de uygulanmaz). */
export function selectableInvoices(open: OpenInvoice[], lineCurrencies: string[]): OpenInvoice[] {
  const set = new Set(lineCurrencies);
  return open.filter(o => set.has(o.currency));
}

/** Sunucu hata mesajını okunur Türkçe metne çevirir; tanınmayan için null. */
export function receiptErrorText(msg: string): string | null {
  return String(msg ?? '').includes('RCPT_INVOICE_INVALID')
    ? 'Seçilen fatura artık açık değil'
    : null;
}
