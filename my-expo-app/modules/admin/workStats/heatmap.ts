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

// ── Hücre metni rengi: karşıtlığa göre seçilir (WCAG) ──────────────────────
function rgbOf(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** İki rengin WCAG karşıtlık oranı. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** `base` rengi `alpha` ile `surface` üstüne bindirilince oluşan zemin. */
export function composite(base: string, alpha: number, surface: string): [number, number, number] | null {
  const b = rgbOf(base), s = rgbOf(surface);
  if (!b || !s) return null;
  return [0, 1, 2].map((i) => Math.round(b[i] * alpha + s[i] * (1 - alpha))) as [number, number, number];
}
/**
 * Hücre zemini üstünde en yüksek karşıtlığı veren mürekkep. Sabit "yoğun hücre
 * = beyaz metin" kuralı açık kobaltta ~3.3:1 kalıyordu; seçim hesapla yapılır.
 * Renkler 6 haneli hex olmalı; çözülemezse ilk aday döner.
 */
export function heatInk(base: string, alpha: number, surface: string, inks: string[]): string {
  const bg = composite(base, alpha, surface);
  if (!bg) return inks[0];
  let best = inks[0], bestR = -1;
  for (const ink of inks) {
    const c = rgbOf(ink);
    if (!c) continue;
    const r = contrastRatio(bg, c);
    if (r > bestR) { best = ink; bestR = r; }
  }
  return best;
}
