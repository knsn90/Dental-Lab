// modules/search/lib/searchModel.ts — genel arama kararları (saf; node --test ile sınanır).
// Spec: docs/superpowers/specs/2026-10-25-genel-arama-design.md §5.2, §5.4, §5.5
import type { SearchKind, SearchPanel } from '../types';

export const MIN_QUERY = 2;
export const DEBOUNCE_MS = 250;

export function shouldSearch(q: string): boolean {
  return (q ?? '').trim().length >= MIN_QUERY;
}

function ordersHref(panel: SearchPanel): string {
  if (panel === 'admin') return '/(admin)/orders';
  if (panel === 'lab') return '/(lab)/all-orders';
  return `/(${panel})/orders`;
}

/** Bir grup ancak gidilecek sayfa o panelde varsa ve kişinin menüsü onu gösteriyorsa aranır. */
export function kindsForPanel(panel: SearchPanel, navHrefs: string[]): SearchKind[] {
  const has = (href: string) => navHrefs.includes(href);
  const labSide = panel === 'admin' || panel === 'lab';
  const orders = has(ordersHref(panel));
  const kinds: SearchKind[] = [];
  if (orders) kinds.push('orders');
  if (labSide && has(`/(${panel})/clinics`)) kinds.push('clinics');
  if (labSide && orders) kinds.push('doctors');
  if (panel !== 'station' && has(`/(${panel})/finance`)) kinds.push('invoices');
  return kinds;
}

export function hrefFor(panel: SearchPanel, kind: SearchKind, id: string): string {
  switch (kind) {
    case 'orders':   return `/(${panel})/order/${id}`;
    case 'clinics':  return `/(${panel})/clinics?clinic=${id}`;
    case 'doctors':  return `${ordersHref(panel)}?doctor=${id}`;
    case 'invoices': return `/(${panel})/invoice/${id}`;
  }
}

/** Gösterilen sonuç ekrandaki sorgunun kendisine mi ait? Değilse kayıt satırları gösterilmez/seçilmez
 *  (hızlı yazıp Enter'a basınca bir önceki sorgunun ilk siparişine gitmesin). */
export function isFresh(forQ: string | null, q: string): boolean {
  return forQ !== null && forQ === (q ?? '').trim();
}

export const STALE: unique symbol = Symbol('stale');

/** Hızlı yazarken eski yanıt yenisinin üstüne yazılmasın: yalnız en son verilen söz değerini geçirir. */
export function latestOnly<T>(): (p: Promise<T>) => Promise<T | typeof STALE> {
  let seq = 0;
  return (p) => {
    const mine = ++seq;
    return p.then(
      (v) => (mine === seq ? v : STALE),
      (e) => { if (mine === seq) throw e; return STALE; },
    );
  };
}
