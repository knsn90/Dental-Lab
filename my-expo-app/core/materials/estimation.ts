/**
 * estimation.ts — Stage material auto-estimation engine
 *
 * Aşama tamamlama akışında manager/operatöre **tahmini malzeme tüketimi**
 * önerir. Bu sadece bir başlangıç önerisi — operatör onaylarken
 * miktarı düzeltebilir, satır ekleyebilir, fire ekleyebilir.
 *
 * İki kaynak birleştirilir:
 *   1. lab_stations.default_consumption_rules — istasyon-bazlı kategori kuralları
 *   2. stock_items.units_per_tooth + consume_at_stage — ürün-bazlı per-tooth formüller
 *
 * Ürün-bazlı kurallar her zaman önceliklidir (gerçek stok kalemine bağlı).
 * Kategori kuralları yalnız eşleşen stok yoksa "stub" olarak emit edilir
 * (kullanıcı seçecek).
 */

// ── Types ────────────────────────────────────────────────────────────

export type MaterialUnit = 'adet' | 'ml' | 'g' | 'gr' | 'kg' | 'disc' | 'mm' | string;

export interface ConsumptionRule {
  category: string;        // 'zirconia', 'resin', vb.
  per_tooth: number;       // 0.5, 2, vb.
  unit: MaterialUnit;
}

export interface StockItemLite {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  unit: MaterialUnit | null;
  quantity: number;
  unit_cost: number | null;
  units_per_tooth: number | null;
  consume_at_stage: string | null;
  pack_size?: number | null;
  content_unit?: string | null;
  currency?: string | null;
}

export interface StationContext {
  id: string;
  name: string;
  consumes_materials: boolean;
  allowed_material_types: string[];
  default_consumption_rules: ConsumptionRule[];
}

export interface OrderContext {
  id: string;
  tooth_count: number;          // toothNumbers.length
  work_type: string | null;
}

/** Modal'a girecek tahmin satırı */
export interface EstimatedMaterialLine {
  /** stock_items.id varsa — yoksa kullanıcı dropdown'dan seçer */
  item_id: string | null;
  item_name: string;
  category: string | null;
  unit: MaterialUnit | null;

  estimated_qty: number;
  actual_qty: number;            // başlangıçta = estimated_qty (kullanıcı edit eder)
  waste_qty: number;             // başlangıç 0
  waste_reason: string | null;

  unit_cost: number;
  current_stock: number | null;  // null = stub (henüz item seçilmemiş)

  /** Paket içeriği (örn 50). Doluysa actual_qty/waste_qty content_unit (gr) cinsindedir,
   *  stoktan kesirli adet (qty ÷ pack_size) düşer. NULL = paketsiz (adet=adet). */
  pack_size?: number | null;
  content_unit?: string | null;
  /** Kalemin stok/sayım birimi (Adet, Kutu…) — paketli satırda "≈ N adet düşecek" için. */
  stock_unit?: string | null;
  /** Kalemin maliyet para birimi (EUR/USD/TRY…). unit_cost bu para biriminde. */
  currency?: string | null;

  /** Hangi kaynaktan geldi (debug + UI rozeti için) */
  source: 'item-formula' | 'station-rule' | 'manual';

  note: string | null;
}

// ── Engine ───────────────────────────────────────────────────────────

/**
 * Aşamaya ait tahmini malzeme listesini üretir.
 *
 * @param station Aktif istasyonun config'i
 * @param order Sipariş context'i (tooth_count, work_type)
 * @param items Lab'a ait potansiyel stok kalemleri
 *              (consume_at_stage matching VEYA category in allowed_material_types)
 */
export function estimateStageMaterials(
  station: StationContext,
  order: OrderContext,
  items: StockItemLite[],
): EstimatedMaterialLine[] {
  if (!station.consumes_materials) return [];
  if (order.tooth_count <= 0) return [];

  const lines: EstimatedMaterialLine[] = [];
  const usedCategories = new Set<string>();

  // ── 1. Ürün-bazlı kurallar (öncelikli) ────────────────────────
  // stock_items'tan consume_at_stage = station.name VEYA
  // category ∈ allowed_material_types olan ve units_per_tooth dolu olanlar
  const matchingItems = items.filter(it => {
    if (!it.units_per_tooth || it.units_per_tooth <= 0) return false;
    const stageMatch = it.consume_at_stage === station.name;
    const categoryMatch = it.category != null
      && station.allowed_material_types.includes(it.category);
    return stageMatch || categoryMatch;
  });

  // Aynı kategoriden birden fazla ürün varsa: stoğu en yüksek olan + en ucuz
  // birim maliyetli olanı tercih et (tipik üretim seçimi)
  const itemsByCategory = new Map<string, StockItemLite[]>();
  for (const it of matchingItems) {
    const key = it.category ?? '__other__';
    if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
    itemsByCategory.get(key)!.push(it);
  }

  for (const [cat, catItems] of itemsByCategory) {
    catItems.sort((a, b) => {
      // 1. Stoklu olanlar önce
      if (a.quantity > 0 && b.quantity <= 0) return -1;
      if (a.quantity <= 0 && b.quantity > 0) return 1;
      // 2. Ucuz olanlar önce
      const aCost = a.unit_cost ?? Infinity;
      const bCost = b.unit_cost ?? Infinity;
      return aCost - bCost;
    });
    const best = catItems[0];
    const qty = +(best.units_per_tooth! * order.tooth_count).toFixed(3);
    // Paketli kalemde tüketim içerik biriminde (gr) → satır birimi content_unit
    const packaged = !!best.pack_size && best.pack_size > 0;
    const lineUnit = packaged ? (best.content_unit ?? best.unit) : best.unit;

    lines.push({
      item_id: best.id,
      item_name: best.name,
      category: best.category,
      unit: lineUnit,
      estimated_qty: qty,
      actual_qty: qty,
      waste_qty: 0,
      waste_reason: null,
      unit_cost: best.unit_cost ?? 0,
      current_stock: best.quantity,
      pack_size: best.pack_size ?? null,
      content_unit: best.content_unit ?? null,
      stock_unit: best.unit ?? null,
      currency: best.currency ?? null,
      source: 'item-formula',
      note: `${best.units_per_tooth} ${lineUnit ?? ''}/diş × ${order.tooth_count}`,
    });
    if (cat !== '__other__') usedCategories.add(cat);
  }

  // ── 2. İstasyon kuralları (kategori bazlı stub) ───────────────
  // Sadece henüz emit edilmemiş kategoriler için "stub" üret
  // (kullanıcı modal'da bu satıra tıklayıp stok seçebilir)
  for (const rule of station.default_consumption_rules ?? []) {
    if (usedCategories.has(rule.category)) continue;

    const qty = +(rule.per_tooth * order.tooth_count).toFixed(3);
    lines.push({
      item_id: null,
      item_name: `${capitalize(rule.category)} (seçilmedi)`,
      category: rule.category,
      unit: rule.unit,
      estimated_qty: qty,
      actual_qty: qty,
      waste_qty: 0,
      waste_reason: null,
      unit_cost: 0,
      current_stock: null,
      source: 'station-rule',
      note: `${rule.per_tooth} ${rule.unit}/diş × ${order.tooth_count}`,
    });
  }

  return lines;
}

// ── Helpers ──────────────────────────────────────────────────────────
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

/** Yeni manuel satır şablonu (modal "Ekle" butonu için) */
export function createManualLine(): EstimatedMaterialLine {
  return {
    item_id: null,
    item_name: '',
    category: null,
    unit: null,
    estimated_qty: 0,
    actual_qty: 0,
    waste_qty: 0,
    waste_reason: null,
    unit_cost: 0,
    current_stock: null,
    pack_size: null,
    content_unit: null,
    stock_unit: null,
    currency: null,
    source: 'manual',
    note: null,
  };
}

/** Toplam beklenen maliyet (actual + waste). Paketli satırda birim maliyet
 *  içerik birimi başınadır (unit_cost ÷ pack_size). */
export function totalLineCost(line: EstimatedMaterialLine): number {
  const perUnit = (line.pack_size && line.pack_size > 0)
    ? line.unit_cost / line.pack_size
    : line.unit_cost;
  return (line.actual_qty + line.waste_qty) * perUnit;
}

export function totalEstimateCost(lines: EstimatedMaterialLine[]): number {
  return lines.reduce((s, l) => s + totalLineCost(l), 0);
}

/** Satır geçerliliği (en az item_name + (actual_qty veya waste_qty) > 0) */
export function isLineValid(line: EstimatedMaterialLine): boolean {
  if (!line.item_name.trim()) return false;
  if (line.actual_qty <= 0 && line.waste_qty <= 0) return false;
  if (line.waste_qty > 0 && !(line.waste_reason ?? '').trim()) return false;
  return true;
}
