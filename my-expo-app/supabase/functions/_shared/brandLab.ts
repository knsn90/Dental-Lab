// supabase/functions/_shared/brandLab.ts
// Bildirim e-postasında markanın (logo + ad) alınacağı lab — saf, içe aktarma yok.
// Sipariş varsa siparişin lab'ı. Yoksa (günlük iş takibi, stok sayımı, tarama programı)
// alıcıların ORTAK lab'ı; alıcılar farklı lab'lardaysa ya da lab'sızsa marka yok —
// başka bir lab'ın adını yazmaktansa nötr kalınır.
export function brandLabIdFor(woLabId: string | null, recipientLabIds: Array<string | null>): string | null {
  if (woLabId) return woLabId;
  const labs = new Set(recipientLabIds.filter((x): x is string => !!x));
  return labs.size === 1 ? [...labs][0] : null;
}
