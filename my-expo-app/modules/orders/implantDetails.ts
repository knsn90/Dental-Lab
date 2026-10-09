import type { ImplantDetail } from './types';

/**
 * İmplant pozisyonları değişince diş-başına implant bilgisini yeniden kurar.
 *
 * - Kaldırılan dişin bilgisi düşer, kalan dişinki aynen korunur.
 * - YENİ eklenen dişe, kalan implant dişlerinin HEPSİ aynı markadaysa o marka
 *   yazılır. Yalnız marka: tip/abutment/vida konuma özgüdür, boş kalır.
 *
 * NEDEN: marka yalnız diş-başına tutuluyor (vaka geneli `implant_brand` pratikte
 * boş). Düzenlemede implant 26→27 taşınınca 27 markasız kalıyor, 2. adımın marka
 * kuralı ileri geçişi kilitliyordu (NEX-2026-0183). Vakada farklı markalar varsa
 * tahmin YOK — marka seçimi kullanıcıya kalır, kural uyarısı devreye girer.
 */
export function reconcileImplantDetails(
  prev: Record<number, ImplantDetail>,
  nextTeeth: number[],
): Record<number, ImplantDetail> {
  const keep = new Set(nextTeeth);
  const next: Record<number, ImplantDetail> = {};
  const brands = new Set<string>();

  Object.entries(prev).forEach(([k, v]) => {
    const tooth = Number(k);
    if (!keep.has(tooth)) return;
    next[tooth] = v;
    const brand = (v.system ?? '').trim();
    if (brand) brands.add(brand);
  });

  const shared = brands.size === 1 ? [...brands][0] : '';
  if (shared) {
    for (const tooth of nextTeeth) {
      if (!next[tooth]) next[tooth] = { system: shared, type: '', abutment: '', screw: '' };
    }
  }
  return next;
}
