/**
 * consumptionRef.ts — Malzeme tüketim referans tablosu (diş-başı öneri kaynağı)
 *
 * Kullanıcıdan (lab pratiğinden) gelen gerçek üretim verileri. Stok kalemi
 * eklerken/düzenlerken `units_per_tooth` (diş başına tüketim) alanını otomatik
 * ÖNERMEK için kullanılır — nihai değeri operatör her zaman düzeltebilir.
 *
 * NOT: Bu bir "başlangıç önerisi" kaynağıdır; estimation.ts motoru yine sadece
 * stock_items.units_per_tooth'u okur. Burası o değeri türetmenin insan-okunur
 * referansıdır.
 *
 * Karar: tüketim TEK KRON oranından hesaplanır (köprü ayrımı yapılmaz — basit).
 */

// ── Kalınlık-bazlı disk malzemeleri (zirkonyum, PMMA) ────────────────
//
// Bir diskten çıkan iş sayısı disk kalınlığına bağlıdır.
// `units_per_tooth = 1 / (diskten çıkan ortalama kron sayısı)` → diş başına disk kesri.

export type DiscMaterial = 'zirconia' | 'pmma';

export interface DiscYieldRow {
  /** Disk kalınlığı (mm) — 20-25 gibi aralıklarda üst sınır saklanır */
  thicknessMm: number;
  /** Etiket (aralıklar için "20-25 mm" gibi) */
  label: string;
  /** Disk başına çıkan ortalama kron sayısı [min, max] */
  crowns: [number, number];
  /** 3-üyeli köprüden disk başına köprü sayısı [min, max] (referans; hesaba katılmaz) */
  bridges3?: [number, number];
}

export const DISC_YIELD: Record<DiscMaterial, DiscYieldRow[]> = {
  zirconia: [
    { thicknessMm: 12, label: '12 mm',    crowns: [18, 25], bridges3: [4, 6] },
    { thicknessMm: 14, label: '14 mm',    crowns: [22, 30], bridges3: [5, 7] },
    { thicknessMm: 16, label: '16 mm',    crowns: [28, 38], bridges3: [6, 9] },
    { thicknessMm: 18, label: '18 mm',    crowns: [35, 45], bridges3: [8, 10] },
    { thicknessMm: 25, label: '20-25 mm', crowns: [45, 60] },
  ],
  pmma: [
    { thicknessMm: 12, label: '12 mm', crowns: [20, 30] },
    { thicknessMm: 16, label: '16 mm', crowns: [30, 40] },
    { thicknessMm: 20, label: '20 mm', crowns: [40, 50] },
    { thicknessMm: 25, label: '25 mm', crowns: [50, 70] },
  ],
};

/** Geriye dönük uyum: eski adla zirkonyum tablosu. */
export const ZIRCONIA_DISC_YIELD = DISC_YIELD.zirconia;

/** [min,max] ortalaması */
function mid(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/**
 * Verilen disk malzemesi + kalınlığı için diş (kron) başına disk kesri.
 * = 1 / (disk başına ortalama kron sayısı). NUMERIC(10,4) uyumlu 4 hane.
 * Eşleşme yoksa null.
 */
export function discUnitsPerTooth(material: DiscMaterial, thicknessMm: number): number | null {
  const row = DISC_YIELD[material]?.find(r => r.thicknessMm === thicknessMm);
  if (!row) return null;
  const crownsPerDisc = mid(row.crowns);
  if (crownsPerDisc <= 0) return null;
  return +(1 / crownsPerDisc).toFixed(4);
}

/** Geriye dönük uyum. */
export function zirconiaUnitsPerTooth(thicknessMm: number): number | null {
  return discUnitsPerTooth('zirconia', thicknessMm);
}

// ── Porselen (diş/kron başına gram) ──────────────────────────────────
// Tek kron için ~0,3–1 gr porselen kullanılabilir. Öneri = ortalama.
export const PORCELAIN_PER_CROWN_G = { min: 0.3, max: 1, mid: 0.65 } as const;

/** Porselen için diş başına gram önerisi (ortalama). */
export function porcelainUnitsPerTooth(): number {
  return PORCELAIN_PER_CROWN_G.mid;
}

// ── Cam seramik (e.max / lityum disilikat) blok ──────────────────────
// 1 blok → 1 kron  ·  1 blok → 1 veneer  ·  1 blok → 1 inlay/onlay.
// Yani birebir: her iş (diş) için 1 blok. units_per_tooth = 1.
export const GLASS_CERAMIC_BLOCK_PER_UNIT = 1 as const;

/** Cam seramik blok için diş (iş) başına blok sayısı = 1 (birebir). */
export function glassCeramicUnitsPerTooth(): number {
  return GLASS_CERAMIC_BLOCK_PER_UNIT;
}

// ── Model reçinesi (3D baskı) — ÇENE başına ml (diş-başı DEĞİL) ───────
// Tek çene model: 42 ml  ·  Alt + üst model: 78 ml.
// Bu malzeme diş sayısına bağlı değil; çene/vaka başına sabit. Diş-başı
// motoruna girmez → formda bilgi olarak gösterilir, tüketim "manuel".
export const MODEL_RESIN_ML = { singleJaw: 42, bothJaws: 78 } as const;

export function isModelResinType(matType: string | null | undefined): boolean {
  const t = (matType ?? '').toLowerCase();
  const hasResin = t.includes('reçine') || t.includes('recine') || t.includes('resin') || t.includes('rezin');
  return (t.includes('model') && hasResin) || t.includes('baskı reç') || t.includes('baski rec') || t.includes('model rec');
}

// ── SprintRay reçineleri (3D baskı) — paket başına verim + maliyet ────
//
// Her ürün: bir paket (gramaj) → N adet iş. Birim maliyet = fiyat / adet.
// "per" = tüketim birimi: 'tooth' (diş/kron başına) · 'case' (vaka/parça başına)
// · 'model' (çene/model başına). units_per_tooth otomatik önerisi yalnız 'tooth'.

export type SprintrayPer = 'tooth' | 'case' | 'model';

export interface SprintrayResin {
  key: string;
  name: string;
  /** Paket gramajı etiketi (ör. "250 gr", "1 kg") */
  packLabel: string;
  /** Paket gramajı (gr) — birim başına gram için */
  packGrams: number;
  /** Baskı süresi (dk) — referans */
  printMin: number;
  /** Paket başına çıkan iş adedi */
  yield: number;
  /** Paket fiyatı (EUR) */
  priceEur: number;
  /** Tüketim birimi */
  per: SprintrayPer;
}

/** Birim (iş) başına maliyet (EUR) = fiyat / verim. */
export function sprintrayUnitCost(r: SprintrayResin): number {
  return r.yield > 0 ? +(r.priceEur / r.yield).toFixed(2) : 0;
}

/**
 * Üye/iş başına kullanım miktarı (gram) = paket gramajı / verim.
 * Ürün stoğa eklenince units_per_tooth (gr/diş) önerisi olarak kullanılır.
 */
export function sprintrayGramsPerUnit(r: SprintrayResin): number {
  return r.yield > 0 ? +(r.packGrams / r.yield).toFixed(2) : 0;
}

export const SPRINTRAY_RESINS: SprintrayResin[] = [
  { key: 'ceramic_crown',   name: 'Ceramic Crown',           packLabel: '250 gr', packGrams: 250,  printMin: 14,  yield: 70,  priceEur: 390, per: 'tooth' },
  { key: 'onx_tough_2',     name: 'OnX Tough 2',             packLabel: '500 gr', packGrams: 500,  printMin: 24,  yield: 30,  priceEur: 749, per: 'case'  },
  { key: 'die_model_2',     name: 'Die & Model 2',           packLabel: '1 kg',   packGrams: 1000, printMin: 22,  yield: 56,  priceEur: 149, per: 'model' },
  { key: 'temporary_crown', name: 'Temporary Crown & Teeth', packLabel: '1 kg',   packGrams: 1000, printMin: 23,  yield: 85,  priceEur: 550, per: 'tooth' },
  { key: 'denture_base',    name: 'Denture Base',            packLabel: '1 kg',   packGrams: 1000, printMin: 109, yield: 55,  priceEur: 530, per: 'case'  },
  { key: 'night_guard',     name: 'Night Guard',             packLabel: '1 kg',   packGrams: 1000, printMin: 20,  yield: 100, priceEur: 450, per: 'case'  },
  { key: 'gingiva_mask',    name: 'Gingiva Mask',            packLabel: '1 kg',   packGrams: 1000, printMin: 25,  yield: 350, priceEur: 239, per: 'model' },
  { key: 'surgical_guide',  name: 'Surgical Guide',          packLabel: '1 kg',   packGrams: 1000, printMin: 33,  yield: 56,  priceEur: 299, per: 'case'  },
];

// MIDAS Ceramic Crown kapsülü (3'lü paket, 59 €) — restorasyon tipine göre verim.
export interface MidasYield { restoration: string; per: SprintrayPer; yield: number; }
export const MIDAS_CERAMIC_CAPSULE = {
  packLabel: '3 kapsül', priceEur: 59,
  rows: [
    { restoration: 'Kron',          per: 'tooth' as SprintrayPer, yield: 3 },
    { restoration: 'Inlay / Onlay', per: 'tooth' as SprintrayPer, yield: 6 },
    { restoration: 'Lamine Veneer', per: 'tooth' as SprintrayPer, yield: 9 },
  ] as MidasYield[],
};

/** MIDAS kapsül birim maliyeti (EUR) = 59 / verim. */
export function midasUnitCost(row: MidasYield): number {
  return row.yield > 0 ? +(MIDAS_CERAMIC_CAPSULE.priceEur / row.yield).toFixed(2) : 0;
}

// ── Materyal türü sınıflandırma (öneri hangi materyalde gösterilsin) ──
export function isZirconiaType(matType: string | null | undefined): boolean {
  const t = (matType ?? '').toLowerCase();
  return t.includes('zirkon') || t.includes('zircon');
}

export function isPmmaType(matType: string | null | undefined): boolean {
  const t = (matType ?? '').toLowerCase();
  return t.includes('pmma');
}

/** matType kalınlık-bazlı bir disk malzemesine denk geliyorsa döndürür. */
export function discMaterialFor(matType: string | null | undefined): DiscMaterial | null {
  if (isZirconiaType(matType)) return 'zirconia';
  if (isPmmaType(matType)) return 'pmma';
  return null;
}

export function isPorcelainType(matType: string | null | undefined): boolean {
  const t = (matType ?? '').toLowerCase();
  // Sadece porselen (dizim tozu) — "cam seramik" ile çakışmasın diye genel
  // "seramik" burada eşleşmez; o glassCeramic'e gider.
  return t.includes('porsel') || t.includes('porcel');
}

export function isGlassCeramicType(matType: string | null | undefined): boolean {
  const t = (matType ?? '').toLowerCase();
  return t.includes('cam seramik') || t.includes('emax') || t.includes('e.max') || t.includes('e-max')
    || t.includes('disilik') || t.includes('disilic') || t.includes('lityum') || t.includes('litiyum')
    || t.includes('glass ceramic');
}
