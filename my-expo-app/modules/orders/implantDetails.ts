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

/**
 * İş türünün adından abutment tipini çıkarır — hekim "Custom Abutment" seçtiyse
 * implant kartında abutment tipini yeniden sormak gereksiz (zaten seçti).
 * Eşleşme yoksa '' döner (tahmin yok, seçim kullanıcıya kalır).
 * Dönen değerler ABUTMENT_TYPES içindeki etiketlerle birebir aynıdır.
 */
export function autoAbutmentFor(workType: string | null | undefined): string {
  const s = String(workType ?? '').toLocaleLowerCase('tr-TR');
  if (!s.includes('abutment') && !s.includes('abudman')) return '';
  if (/custom|kişiye|kisiye|özel|ozel/.test(s)) return 'Kişiye özel (Custom)';
  if (/ti-?\s?base|tibase/.test(s)) return 'Ti-base';
  if (/zirkon|zircon/.test(s)) return 'Zirkonyum';
  if (/açılı|acili|angled/.test(s)) return 'Açılı (Angled)';
  return '';
}
