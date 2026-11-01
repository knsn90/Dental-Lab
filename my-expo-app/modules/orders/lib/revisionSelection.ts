// modules/orders/lib/revisionSelection.ts
// Revizyon penceresi: asıl siparişin işlem yapılmış dişlerini şerit/işlem gruplarına ayırır ve seçimi
// create_revision_order(p_items) girişine çevirir (saf; node --test). Kural (kullanıcı 2026-10-28):
// "hangi şeritte ve hangi dişlerde revizyon olacak" sorulur; başta hiçbiri seçili değildir.

export interface RevisionSourceItem {
  id: string;
  name: string;
  tooth_numbers?: number[] | null;
  lane?: number | null;
}

export interface RevisionToothGroup {
  itemId: string;
  name: string;
  lane: number;
  teeth: number[];
  /** Sipariş birden çok şeritte üretildiyse grup başlığında "Şerit N" gösterilir. */
  showLane: boolean;
}

/** itemId → seçili dişler */
export type RevisionSelection = Record<string, number[]>;

export function revisionToothGroups(items: RevisionSourceItem[]): RevisionToothGroup[] {
  const withTeeth = items.filter((it) => Array.isArray(it.tooth_numbers) && it.tooth_numbers.length > 0);
  const lanes = new Set(withTeeth.map((it) => it.lane ?? 1));
  return withTeeth
    .map((it) => ({
      itemId: it.id,
      name: it.name,
      lane: it.lane ?? 1,
      teeth: [...(it.tooth_numbers as number[])].sort((a, b) => a - b),
      showLane: lanes.size > 1,
    }))
    .sort((a, b) => a.lane - b.lane || a.name.localeCompare(b.name));
}

export function toggleTooth(sel: RevisionSelection, itemId: string, tooth: number): RevisionSelection {
  const cur = sel[itemId] ?? [];
  const next = cur.includes(tooth) ? cur.filter((t) => t !== tooth) : [...cur, tooth].sort((a, b) => a - b);
  return { ...sel, [itemId]: next };
}

/** Grubun hepsi seçiliyse temizler, değilse hepsini seçer. */
export function toggleGroup(sel: RevisionSelection, g: RevisionToothGroup): RevisionSelection {
  const cur = sel[g.itemId] ?? [];
  const all = g.teeth.every((t) => cur.includes(t));
  return { ...sel, [g.itemId]: all ? [] : [...g.teeth] };
}

export function revisionItemsPayload(sel: RevisionSelection): { item_id: string; teeth: number[] }[] {
  return Object.entries(sel)
    .filter(([, teeth]) => teeth.length > 0)
    .map(([item_id, teeth]) => ({ item_id, teeth: [...teeth].sort((a, b) => a - b) }));
}

export function selectedToothCount(sel: RevisionSelection): number {
  return Object.values(sel).reduce((n, t) => n + t.length, 0);
}
