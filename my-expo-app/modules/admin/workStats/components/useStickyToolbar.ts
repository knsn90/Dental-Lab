import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Araç çubuğunu kaydırırken görünür alanın üstünde tutar (web).
 *
 * `position: sticky` PatternsShell içinde ÇALIŞMAZ: kabuk içeriği kendi kaydırma
 * kabında kaydırır, ekranın ScrollView'u hiç kaymaz (bkz. modules/admin/users/
 * useStickyFollow.ts).
 *
 * Yapışınca çubuk `position: fixed` olur: tarayıcı onu kendisi sabitler, her
 * karede JS ile kaydırılmaz. (Eski yöntem her scroll olayında translateY
 * veriyordu; iOS momentum kaydırmasında olaylar geç geldiği için çubuk içerikle
 * kayıp geri zıplıyor = titriyordu.) JS yalnız yapış/bırak anını ve yatay
 * hizayı belirler. `holderRef` çubuğun yerini aynı yükseklikte tutar → içerik
 * zıplamaz. `rowRef` kabının sonuna gelince çubuk kabın dibine bırakılır.
 * `stuck` = çubuk şu an yapışık (yarı saydam malzeme göster).
 */
export function useStickyToolbar(enabled: boolean, top = 0) {
  const rowRef = useRef<any>(null);
  const holderRef = useRef<any>(null);
  const barRef = useRef<any>(null);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const row = rowRef.current as HTMLElement | null;
    const holder = holderRef.current as HTMLElement | null;
    const bar = barRef.current as HTMLElement | null;
    if (!row || !holder || !bar || typeof window === 'undefined') return;

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

    // `fixed`, dönüşümlü bir atanın içinde ekrana değil o ataya göre konumlanır.
    // RNW her ScrollView'a yalnız GPU ipucu olan `translateZ(0)` (birim matris)
    // verir; çubuk yapışıkken bunları kapatırız. Gerçek bir dönüşüm/filtre varsa
    // eski translateY yöntemine düşülür.
    const IDENTITY = /^matrix\(1, 0, 0, 1, 0, 0\)$|^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/;
    const neutralized: { el: HTMLElement; prev: string }[] = [];
    let canFix = true;
    for (let el = bar.parentElement; el && el !== document.body; el = el.parentElement) {
      const c = window.getComputedStyle(el);
      if (c.transform !== 'none') {
        if (IDENTITY.test(c.transform)) { neutralized.push({ el, prev: el.style.transform }); el.style.transform = 'none'; }
        else canFix = false;
      }
      const bf = (c as any).backdropFilter ?? (c as any).webkitBackdropFilter;
      if (c.filter !== 'none' || c.perspective !== 'none' || (bf && bf !== 'none')
        || /transform|filter/.test(c.willChange) || /paint|layout|strict|content/.test(c.contain || '')) canFix = false;
    }
    if (!canFix) neutralized.splice(0).forEach(({ el, prev }) => { el.style.transform = prev; });

    type Mode = 'flow' | 'fixed' | 'end';
    let mode: Mode = 'flow';
    const clear = () => {
      bar.style.position = ''; bar.style.top = ''; bar.style.left = '';
      bar.style.width = ''; bar.style.transform = '';
      holder.style.height = '';
    };

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = row.getBoundingClientRect();
      const h = holder.getBoundingClientRect();
      const bh = bar.offsetHeight;
      let vTop = 0;
      for (const s of scrollers) vTop = Math.max(vTop, s.getBoundingClientRect().top);
      const pin = vTop + top;                       // çubuğun yapışacağı ekran y'si
      const maxY = Math.max(0, r.height - bh - (h.top - r.top));
      const want = pin - h.top;                     // tutucunun ne kadar yukarı kaydığı
      const next: Mode = want <= 0 ? 'flow' : want >= maxY ? 'end' : 'fixed';

      if (next === 'flow') {
        if (mode !== 'flow') clear();
      } else {
        holder.style.height = `${bh}px`;
        if (next === 'fixed' && !canFix) {
          bar.style.position = 'relative';
          bar.style.transform = `translateY(${Math.round(want)}px)`;
        } else if (next === 'fixed') {
          bar.style.position = 'fixed';
          bar.style.top = `${Math.round(pin)}px`;
          bar.style.left = `${Math.round(h.left)}px`;
          bar.style.width = `${Math.round(h.width)}px`;
          bar.style.transform = '';
        } else {
          bar.style.position = 'relative'; bar.style.top = ''; bar.style.left = ''; bar.style.width = '';
          bar.style.transform = `translateY(${Math.round(maxY)}px)`;
        }
      }
      mode = next;
      const s = next !== 'flow';
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
      clear();
      neutralized.forEach(({ el, prev }) => { el.style.transform = prev; });
      stuckRef.current = false;
      setStuck(false);
    };
  }, [enabled, top]);

  return { rowRef, holderRef, barRef, stuck };
}
