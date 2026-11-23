// modules/orders/toothConnectors.ts
// Diş şeması köprü bağlantıları (exocad DentalDB "connector" karşılığı).
//
// Bağlantı = komşu iki diş birlikte tasarlanır (köprü / blok kron).
// DB: work_orders.tooth_connectors jsonb → [[a,b], ...] (FDI çifti, küçük önce).
// Plan ekranında belirlenir; sipariş detayı + istasyon salt okunur gösterir.

export type ToothConnector = [number, number];

/** exocad konnektör yeşili — bağlı nokta, diş renginden bağımsız (her iki temada aynı). */
export const CONNECTOR_GREEN = '#3FBF3A';

/** Ark sırası — her çenede soldan sağa (viewer açısından), orta hat dahil. */
const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ARCH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const ADJ = new Set<string>();
for (const arch of [UPPER_ARCH, LOWER_ARCH]) {
  for (let i = 0; i < arch.length - 1; i++) ADJ.add(connectorKey(arch[i], arch[i + 1]));
}

/** Sırasız çift anahtarı: "11-21" (küçük önce). */
export function connectorKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function isAdjacent(a: number, b: number): boolean {
  return ADJ.has(connectorKey(a, b));
}

/** Seçili dişlerden, ikisi de seçili olan komşu çiftler (ark sırasıyla). */
export function adjacentPairs(teeth: number[]): ToothConnector[] {
  const sel = new Set(teeth);
  const out: ToothConnector[] = [];
  for (const arch of [UPPER_ARCH, LOWER_ARCH]) {
    for (let i = 0; i < arch.length - 1; i++) {
      const a = arch[i], b = arch[i + 1];
      if (sel.has(a) && sel.has(b)) out.push([a, b]);
    }
  }
  return out;
}

/**
 * DB'den gelen ham değeri temizle: yalnız komşu ve (teeth verilirse) ikisi de
 * siparişte olan çiftler kalır; tekrarlar atılır. Bozuk/eski veri çökertmez.
 */
export function normalizeConnectors(raw: unknown, teeth?: number[]): ToothConnector[] {
  if (!Array.isArray(raw)) return [];
  const sel = teeth ? new Set(teeth) : null;
  const seen = new Set<string>();
  const out: ToothConnector[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const a = Number(p[0]), b = Number(p[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !isAdjacent(a, b)) continue;
    if (sel && (!sel.has(a) || !sel.has(b))) continue;
    const k = connectorKey(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a < b ? [a, b] : [b, a]);
  }
  return out;
}

export function hasConnector(list: ToothConnector[], a: number, b: number): boolean {
  const k = connectorKey(a, b);
  return list.some(([x, y]) => connectorKey(x, y) === k);
}

export function toggleConnector(list: ToothConnector[], a: number, b: number): ToothConnector[] {
  const k = connectorKey(a, b);
  return hasConnector(list, a, b)
    ? list.filter(([x, y]) => connectorKey(x, y) !== k)
    : [...list, a < b ? [a, b] : [b, a]];
}

/**
 * İşlem adı AÇIKÇA köprü mü? (tr/en/de)
 * "Zirkon Kron / Köprü" gibi genel katalog adları kron da olabileceği için
 * köprü SAYILMAZ — yoksa tek kronlar da otomatik bağlanırdı.
 */
export function isBridgeWorkType(name: string | null | undefined): boolean {
  const s = (name ?? '').toLocaleLowerCase('tr');
  const bridge = s.includes('köprü') || s.includes('kopru') || s.includes('bridge') || s.includes('brücke');
  const crown = s.includes('kron') || s.includes('crown');
  return bridge && !crown;
}

/**
 * Otomatik öneri: aynı köprü işlemindeki ardışık komşu dişleri bağla.
 * `procsOf(t)` → o dişteki işlem adları (bir dişte birden çok işlem olabilir).
 */
export function suggestBridgeConnectors(
  teeth: number[],
  procsOf: (t: number) => string[],
): ToothConnector[] {
  return adjacentPairs(teeth).filter(([a, b]) => {
    const pa = procsOf(a).filter(isBridgeWorkType);
    const pb = new Set(procsOf(b).filter(isBridgeWorkType));
    return pa.some(p => pb.has(p));
  });
}

/** Bağlantılara göre ünite grupları (ark sırasıyla): [[16],[15,14,13],...] */
export function connectorGroups(teeth: number[], list: ToothConnector[]): number[][] {
  const sel = new Set(teeth);
  const groups: number[][] = [];
  for (const arch of [UPPER_ARCH, LOWER_ARCH]) {
    let cur: number[] = [];
    let prev: number | null = null;
    for (const t of arch) {
      if (!sel.has(t)) { if (cur.length) groups.push(cur); cur = []; prev = null; continue; }
      if (prev != null && hasConnector(list, prev, t)) cur.push(t);
      else { if (cur.length) groups.push(cur); cur = [t]; }
      prev = t;
    }
    if (cur.length) groups.push(cur);
  }
  return groups;
}
