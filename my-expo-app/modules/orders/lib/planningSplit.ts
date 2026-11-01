// modules/orders/lib/planningSplit.ts
// Siparişler ekranı: "Planlama bekliyor" bloğu ile ana listenin ayrımı (saf; node --test ile denenir).
//
// Kural (kullanıcı 2026-10-28): revizyon/devam siparişi planlama beklerken ASIL sipariş planlama
// bloğuna TAŞINMAZ — kendi durumuyla ana listede kalır. Eskiden asıl iş (teslim edilmiş olsa bile)
// planlama bloğuna çekilip revizyon altına yuvalanıyordu; asıl sipariş planlamaya düşmüş gibi görünüyordu.
// İlişki her iki listede aynı biçimde etiketlenir: __relType ('revizyon' | 'devam') + __parentNo.

export interface PlanningSplitOrder {
  id: string;
  status?: string | null;
  triaged_at?: string | null;
  order_number?: string | null;
  revision_of_id?: string | null;
  continues_order_id?: string | null;
}

export type Tagged<T> = T & { __relType?: 'revizyon' | 'devam'; __parentNo?: string | null };

export const isTriagePending = (o: PlanningSplitOrder) => o.status === 'alindi' && !o.triaged_at;

export function splitPlanning<T extends PlanningSplitOrder>(list: T[]): { planning: Tagged<T>[]; main: Tagged<T>[] } {
  const byId = new Map(list.map((o) => [o.id, o]));
  const tag = (o: T): Tagged<T> => {
    const pid = o.revision_of_id ?? o.continues_order_id;
    if (!pid) return o;
    const isCont = !o.revision_of_id && !!o.continues_order_id;
    return { ...o, __relType: isCont ? 'devam' : 'revizyon', __parentNo: byId.get(pid)?.order_number ?? null };
  };
  const planning: Tagged<T>[] = [];
  const main: Tagged<T>[] = [];
  for (const o of list) (isTriagePending(o) ? planning : main).push(tag(o));
  return { planning, main };
}
