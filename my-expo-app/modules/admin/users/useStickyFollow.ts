import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Detay panelini kaydırırken görünür tutar (web, geniş ekran).
 *
 * NEDEN `position: sticky` YETMEDİ: PatternsShell içeriği kendi ScrollView'unda
 * kaydırıyor; ekranın kendi ScrollView'u içerik boyunca uzuyor ve hiç kaymıyor.
 * sticky en yakın taşma kabına (kaymayan iç ScrollView) bağlanınca hiç
 * yapışmıyordu → listenin altından kullanıcı seçince panel en üstte kalıyordu.
 *
 * Burada gerçek kaydırma kapları (tüm overflow:auto/scroll ataları + window)
 * dinlenir, panel satırın içinde kalacak şekilde translateY ile görünür alanın
 * üstüne (ya da panel ekrandan uzunsa altına) taşınır. Yerleşim değişmez.
 */
export function useStickyFollow(enabled: boolean, top = 24) {
  const rowRef = useRef<any>(null);
  const panelRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const row = rowRef.current as HTMLElement | null;
    const panel = panelRef.current as HTMLElement | null;
    if (!row || !panel || typeof window === 'undefined') return;

    const scrollers: HTMLElement[] = [];
    for (let el = row.parentElement; el; el = el.parentElement) {
      const oy = window.getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') scrollers.push(el);
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = row.getBoundingClientRect();
      const ph = panel.offsetHeight;
      let vTop = 0;
      let vBottom = window.innerHeight;
      for (const s of scrollers) {
        const b = s.getBoundingClientRect();
        vTop = Math.max(vTop, b.top);
        vBottom = Math.min(vBottom, b.bottom);
      }
      const topWant = vTop + top - r.top;          // panelin üstü görünür alanın üstüne
      const bottomWant = vBottom - top - ph - r.top; // uzun panelin altı görünür alanın altına
      const y = Math.min(Math.max(0, Math.min(topWant, Math.max(bottomWant, 0))), Math.max(0, r.height - ph));
      panel.style.transform = y > 0 ? `translateY(${Math.round(y)}px)` : '';
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(update); };

    scrollers.forEach((s) => s.addEventListener('scroll', schedule, { passive: true }));
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(row);
    ro?.observe(panel);
    update();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      scrollers.forEach((s) => s.removeEventListener('scroll', schedule));
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      panel.style.transform = '';
    };
  }, [enabled, top]);

  return { rowRef, panelRef };
}
