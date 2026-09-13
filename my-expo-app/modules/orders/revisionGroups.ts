/**
 * revisionGroups — bir sipariş listesini "vaka grupları"na çevirir.
 *
 * Revizyonlar zincir kurar: create_revision_order revizyonu DOĞRUDAN ebeveynine
 * bağlar (revision_of_id = ebeveyn) ve revision_no'yu bir artırır. Yani
 * 0118 → 0118-1 → 0118-2 mümkün; köke ulaşmak için yukarı yürümek gerekir.
 *
 * Yerleşim kuralı (ürün kararı): grup, zincirin EN GÜNCEL üyesinin (en yüksek
 * revision_no) bulunduğu yerde görünür; eski üyeler onun altında girintili
 * geçmiş satırları olur. Böylece devam eden iş "Tamamlandı" kulvarına gömülmez.
 *
 * Sunum bileşenleri bu modülü kullanır; veri katmanı değişmez.
 */

export interface RevisionGroupable {
  id: string;
  revision_of_id?: string | null;
  revision_no?: number | null;
  /** Devam siparişi bağı (planlı sonraki aşama, ör. geçici→nihai). Revizyon gibi
   *  aynı vaka grubuna yuvalanır ama "Devam Siparişi" olarak etiketlenir. */
  continues_order_id?: string | null;
}

/** Bu kaydın ASIL işe bağı: revizyon → revision_of_id, devam → continues_order_id. */
function parentLinkOf(o: RevisionGroupable, linkBy: LinkBy = 'all'): string | null {
  if (linkBy === 'revision') return o.revision_of_id ?? null;
  return o.revision_of_id ?? o.continues_order_id ?? null;
}

/**
 * Hangi bağ gruplamayı kurar:
 *  • 'all'      — revizyon + devam siparişi (varsayılan; vaka çatısı görünümleri)
 *  • 'revision' — YALNIZ revizyon. Devam siparişi asıl işin yerine GEÇMEZ, ayrı
 *    bir iştir; listede kendi satırı olmalı (masaüstü Siparişler böyle çalışır).
 */
export type LinkBy = 'all' | 'revision';

export interface RevisionCases<T> {
  /** Listede gösterilecek satırlar — her vakadan yalnız en güncel üye. */
  anchors: T[];
  /** anchor.id → altında girintili gösterilecek eski üyeler (yeniden eskiye). */
  children: Map<string, T[]>;
}

/**
 * Listeyi vaka gruplarına ayırır.
 *
 * Ebeveyni listede OLMAYAN revizyon (ör. sayfalama penceresi dışında kaldıysa)
 * kendi başına anchor olur — sessizce kaybolmaz.
 */
export function buildRevisionCases<T extends RevisionGroupable>(list: T[], opts?: { linkBy?: LinkBy }): RevisionCases<T> {
  const linkBy: LinkBy = opts?.linkBy ?? 'all';
  const byId = new Map<string, T>();
  list.forEach(o => byId.set(o.id, o));

  // Kök id'ye yürü. Döngüsel/bozuk veri sonsuz döngü yapmasın diye adım sınırı var.
  const rootOf = (o: T): string => {
    let cur: T = o;
    for (let hop = 0; hop < 20; hop++) {
      const parentId = parentLinkOf(cur, linkBy);
      if (!parentId) break;
      const parent = byId.get(parentId);
      if (!parent) break;          // ebeveyn listede yok → burası kök sayılır
      cur = parent;
    }
    return cur.id;
  };

  const groups = new Map<string, T[]>();
  list.forEach(o => {
    const root = rootOf(o);
    const arr = groups.get(root);
    if (arr) arr.push(o);
    else groups.set(root, [o]);
  });

  const order = new Map<string, number>();
  list.forEach((o, i) => order.set(o.id, i));

  const anchors: T[] = [];
  const children = new Map<string, T[]>();

  groups.forEach(members => {
    if (members.length === 1) { anchors.push(members[0]); return; }
    // En güncel = en yüksek revision_no (kök = 0 sayılır)
    const sorted = [...members].sort((a, b) => (b.revision_no ?? 0) - (a.revision_no ?? 0));
    const [anchor, ...rest] = sorted;
    anchors.push(anchor);
    children.set(anchor.id, rest);
  });

  // Çağıranın sıralaması korunsun (kulvar/tarih sıralamasını bozmayalım)
  anchors.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { anchors, children };
}

/** Bu kayıt bir revizyon mu (kök değil)? */
export function isRevision(o: RevisionGroupable): boolean {
  return !!o.revision_of_id;
}

/** Bu kayıt bir devam siparişi mi (revizyon değil ama bir işin planlı devamı)? */
export function isContinuation(o: RevisionGroupable): boolean {
  return !o.revision_of_id && !!o.continues_order_id;
}

/**
 * Ham satırları vaka gruplarına ayırıp sunum DTO'suna çevirir.
 * `map` her satırı ekranın kendi DTO'suna dönüştürür (başlık lab'da hekim,
 * klinikte hasta adı olduğu için dışarıdan verilir).
 *
 * Dönen her DTO'ya `isRevision` ve (varsa) `history` eklenir.
 */
export function mapRevisionCases<T extends RevisionGroupable, D>(
  rows: T[],
  map: (row: T) => D,
): Array<D & { isRevision: boolean; isContinuation: boolean; history?: D[] }> {
  const { anchors, children } = buildRevisionCases(rows);
  return anchors.map(a => {
    const kids = children.get(a.id);
    return {
      ...map(a),
      isRevision: isRevision(a),
      isContinuation: isContinuation(a),
      ...(kids && kids.length ? { history: kids.map(map) } : {}),
    } as D & { isRevision: boolean; isContinuation: boolean; history?: D[] };
  });
}

/**
 * Masaüstü tablolar için düz dizi: her vakanın anchor'ı, hemen ardından eski
 * üyeleri `__revChild` bayrağıyla. Tablo satırları tek `.map` ile çizildiği için
 * iç içe yapı yerine bayraklı düzleştirme kullanılır (OrdersListScreenV2 ile
 * aynı sözleşme).
 */
export function flattenRevisionCases<T extends RevisionGroupable>(
  list: T[],
): Array<T & { __revChild?: boolean; __revParent?: boolean; __continuation?: boolean }> {
  const { anchors, children } = buildRevisionCases(list);
  const byId = new Map<string, T>();
  list.forEach(o => byId.set(o.id, o));
  const out: Array<T & { __revChild?: boolean; __revParent?: boolean; __continuation?: boolean }> = [];
  anchors.forEach(a => {
    const kids = children.get(a.id);
    if (!kids || !kids.length) { out.push(a); return; }
    // Siparişler sayfasıyla AYNI dizilim: önce ORİJİNAL (kök), altında girintili
    // çocuklar (revizyon + devam siparişi). Kök = grupta ebeveyn bağı listede
    // OLMAYAN üye (revizyon_no'ya değil, bağa göre — devam siparişinde no yok).
    const members = [a, ...kids];
    const isRootMember = (m: T) => {
      const pid = parentLinkOf(m);
      return !pid || !byId.has(pid);
    };
    const root = members.find(isRootMember) ?? members[0];
    const rest = members
      .filter(m => m.id !== root.id)
      .sort((x, y) => (x.revision_no ?? 0) - (y.revision_no ?? 0));
    out.push({ ...root, __revParent: true });
    rest.forEach(r => out.push({ ...r, __revChild: true, __continuation: isContinuation(r) }));
  });
  return out;
}

/**
 * Listede ebeveyni eksik olan revizyonların ebeveyn id'lerini döner.
 * Özet ekranları yalnız son N siparişi çektiği için revizyon pencerede olup
 * ebeveyni dışarıda kalabiliyor; çağıran bu id'leri ek sorguyla tamamlar.
 */
export function missingParentIds(rows: RevisionGroupable[]): string[] {
  const have = new Set(rows.map(r => r.id));
  const missing = new Set<string>();
  rows.forEach(r => {
    const pid = parentLinkOf(r);
    if (pid && !have.has(pid)) missing.add(pid);
  });
  return Array.from(missing);
}
