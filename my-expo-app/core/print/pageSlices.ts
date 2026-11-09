/**
 * PDF sayfa dilimleri (saf; node --test). iOS Safari tuval sınırı (~16.7M px) yüzünden belge
 * TEK tuvale çizilmez: her PDF sayfası için ayrı küçük tuval. Kırılma satır/bölüm başlarında,
 * sayfa tablonun ortasında başlarsa tablo başlığı (thead) yeniden çizilir.
 */
export const MAX_CANVAS_PX = 16_000_000;

export interface HeadBox { top: number; bottom: number; tableBottom: number }
export interface PageSlice { y: number; h: number; head: { top: number; bottom: number } | null }

/** width × height × scale² ≤ MAX_CANVAS_PX olacak şekilde ölçeği kısar. */
export function clampScale(width: number, height: number, scale: number): number {
  const k = Math.sqrt(MAX_CANVAS_PX / Math.max(1, width * height));
  return Math.max(0.5, Math.min(scale, k));
}

export function pageSlices(o: { breaks: number[]; totalH: number; pageH: number; heads: HeadBox[]; minFill?: number }): PageSlice[] {
  const { breaks, totalH, pageH, heads } = o;
  const minFill = o.minFill ?? 60;
  const out: PageSlice[] = [];
  let y0 = 0;
  while (y0 < totalH - 1) {
    let head = heads.find((h) => y0 >= h.bottom - 1 && y0 < h.tableBottom - 1) ?? null;
    let headH = head ? head.bottom - head.top : 0;
    if (headH > pageH / 2) { head = null; headH = 0; }
    const room = pageH - headH;
    let y1 = Math.min(y0 + room, totalH);
    if (y1 < totalH) {
      const cand = breaks.filter((b) => b > y0 + minFill && b <= y1);
      if (cand.length) y1 = cand[cand.length - 1];
    }
    if (y1 <= y0) y1 = Math.min(y0 + Math.max(1, room), totalH);
    out.push({ y: y0, h: y1 - y0, head: head ? { top: head.top, bottom: head.bottom } : null });
    y0 = y1;
  }
  if (out.length === 0) out.push({ y: 0, h: Math.max(1, totalH), head: null });
  return out;
}
