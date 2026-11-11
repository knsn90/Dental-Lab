import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Araç çubuğunu kaydırırken görünür alanın üstünde tutar (web).
 *
 * `position: sticky` PatternsShell içinde ÇALIŞMAZ: kabuk içeriği kendi kaydırma
 * kabında kaydırır, ekranın ScrollView'u hiç kaymaz (bkz. modules/admin/users/
 * useStickyFollow.ts — aynı yöntem, araç çubuğuna uyarlandı; o dosya değişmedi).
 *
 * Gerçek kaydırma kapları (overflow:auto/scroll ataları + window/belge) dinlenir;
 * çubuk, `rowRef` kabının içinde kalacak biçimde translateY ile görünür alanın
 * üstüne (+ `top` ofseti, ör. mobil yüzen başlık) taşınır. Yerleşim değişmez.
 * `stuck` = çubuk şu an yerinden kaydırılmış (yarı saydam malzeme göster).
 */
export function useStickyToolbar(enabled: boolean, top = 0) {
  const rowRef = useRef<any>(null);
  const barRef = useRef<any>(null);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const row = rowRef.current as HTMLElement | null;
    const bar = barRef.current as HTMLElement | null;
    if (!row || !bar || typeof window === 'undefined') return;

    // Kaydırma kapları: mobil tarayıcıda belge kaydırması (documentScroll.ts)
    // atalarının taşma stilini sonradan değiştirebildiği için boyut değişiminde yenilenir.
    let scrollers: HTMLElement[] = [];
    const collect = () => {
      scrollers = [];
      for (let el = row.parentElement; el; el = el.parentElement) {
        const oy = window.getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') scrollers.push(el);
      }
    };
    collect();

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = row.getBoundingClientRect();
      const bh = bar.offsetHeight;
      let vTop = 0;
      for (const s of scrollers) vTop = Math.max(vTop, s.getBoundingClientRect().top);
      const want = vTop + top - r.top;
      const y = Math.max(0, Math.min(want, Math.max(0, r.height - bh)));
      bar.style.transform = y > 0 ? `translateY(${Math.round(y)}px)` : '';
      const s = y > 0;
      if (s !== stuckRef.current) { stuckRef.current = s; setStuck(s); }
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(update); };
    const onResize = () => { collect(); schedule(); };

    // scroll kabarcıklanmaz; yakalama evresinde belgeye bağlanınca her kap yakalanır.
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(row);
    ro?.observe(bar);
    update();

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      document.removeEventListener('scroll', schedule, { capture: true } as any);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      bar.style.transform = '';
      stuckRef.current = false;
      setStuck(false);
    };
  }, [enabled, top]);

  return { rowRef, barRef, stuck };
}
