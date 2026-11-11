// Isı haritası sekmesinin saf yardımcıları (React yok) — hücre yoğunluk
// basamağı ve opaklığı. `node --test` ile sınanır (heatmap.test.mts).
// Her satır KENDİ ölçeğinde: oran = değer / satırın en büyüğü (spec §7.5).

/** Basamak sayısı (0 hariç). Spec §11: basamaklar yapıcıya bırakıldı. */
export const HEAT_LEVELS = 5;

/** Basamak → zemin opaklığı. 0 = zemin (nötr), 1..5 = artan yoğunluk. */
export const HEAT_ALPHA: readonly number[] = [0, 0.16, 0.32, 0.5, 0.68, 0.88];

/**
 * Hücre yoğunluk basamağı. `null` → kayıt dönemi dışı (kesik çerçeve "—");
 * 0 ya da satır en büyüğü 0 → 0 (zemin); pozitif değer en az 1 (görünür kalsın),
 * satırın en büyüğü her zaman en üst basamak.
 */
export function heatLevel(value: number | null | undefined, max: number): number | null {
  if (value == null) return null;
  if (!(value > 0) || !(max > 0)) return 0;
  const ratio = Math.min(1, value / max);
  return Math.max(1, Math.ceil(ratio * HEAT_LEVELS));
}

/** Hücre zemin opaklığı (`null` hücrede null). */
export function heatAlpha(value: number | null | undefined, max: number): number | null {
  const lv = heatLevel(value, max);
  return lv == null ? null : HEAT_ALPHA[lv];
}

/** Yoğun hücrede metin zemin üstü rengine (accent üstü mürekkep) geçer. */
export function heatStrong(level: number | null): boolean {
  return level != null && level >= 4;
}
