// core/ui/commandPaletteModel.ts — arama penceresinin satır düzeni (saf; node --test ile sınanır).
// Katlama fonksiyonu parametre: node testinde uzantısız göreli import çözülmüyor.
import type { GlobalSearchResult, SearchKind, OrderHit, ClinicHit, DoctorHit, InvoiceHit } from '../../modules/search/types';

export const GROUP_ORDER: SearchKind[] = ['orders', 'clinics', 'doctors', 'invoices'];
export const GROUP_LABEL: Record<SearchKind, string> = {
  orders: 'Siparişler', clinics: 'Klinikler', doctors: 'Hekimler', invoices: 'Faturalar',
};

export type RecordRow =
  | { kind: 'orders';   id: string; hit: OrderHit }
  | { kind: 'clinics';  id: string; hit: ClinicHit }
  | { kind: 'doctors';  id: string; hit: DoctorHit }
  | { kind: 'invoices'; id: string; hit: InvoiceHit };

/** Bugünkü sayfa süzgeci (etiket ya da grup içerir), Türkçe harf katlamasıyla. */
export function buildPageCommands<T extends { label: string; group: string }>(
  items: T[], q: string, fold: (s: string) => string,
): T[] {
  const needle = fold(q.trim());
  if (!needle) return items;
  return items.filter((c) => fold(c.label).includes(needle) || fold(c.group).includes(needle));
}

/** Kayıt satırları, grup sırasıyla. "Daha fazla sonuç" ipucu satır değildir (seçilemez; ayrı çizilir). */
export function recordRows(result: GlobalSearchResult): RecordRow[] {
  const rows: RecordRow[] = [];
  for (const kind of GROUP_ORDER) {
    for (const hit of (result[kind] ?? []) as any[]) rows.push({ kind, id: hit.id, hit } as RecordRow);
  }
  return rows;
}
