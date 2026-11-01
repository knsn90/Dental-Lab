// core/ui/mobile/documentScroll.ts
//
// Mobil TARAYICIDA (Safari/Chrome, PWA değil) ekranın kendi kaydırma alanı
// yerine SAYFA (belge) kaysın. iOS tarayıcıları adres çubuğunu küçültüp alt
// araç çubuğunu yalnız belge kaydırmasında gizler; uygulama içi kaydırma
// alanında çubuklar hep tam boy kalıyordu. Hekim Özeti'nde denendi (2026-10-20),
// iPhone'da onaylandı → panel düzeyine yayıldı.
//
// Nasıl: her rota değişiminde görünen ekranın ANA dikey kaydırma alanı DOM'da
// bulunur, `data-docscroll` ile işaretlenir ve <html>'e `doc-scroll` eklenir.
// global.css işaretin ATALARINI (`:has()`) normal akışa çevirir → içerik belgeyi
// uzatır. Logo, üst butonlar ve navbar web'de `fixed` olduğu için yerinde kalır.
//
// Kapsam: yalnız web + dar ekran + tarayıcı modu (standalone/PWA DEĞİL).
// Native ve masaüstü hiç etkilenmez. Hariç rotalar (harita, sohbet, sanal
// liste, yeni sipariş…) kendi kaydırma alanında kalır.

import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';

const MOBILE_MAX_W = 769;
const MARK = 'data-docscroll';

/**
 * Belge kaydırmasına ALINMAYAN rotalar:
 *  - harita / kurye takip (harita kendi jestini ister, onScroll'a bağlı)
 *  - mesajlar / sohbet / destek (alta yapışık sohbet, scrollToEnd)
 *  - onaylar, stok (FlatList — sanal liste kendi kaydırma olayıyla satır çizer)
 *  - yeni sipariş, kurulum sihirbazı (programla scrollTo kullanır)
 */
const EXCLUDE: RegExp[] = [
  /\/new-order/, /\/courier/, /\/deliver/, /\/messages/, /\/wa-support/,
  /\/support/, /\/approvals/, /\/stock/, /\/setup-wizard/,
];

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window.navigator as any).standalone) return true;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch { /* yut */ }
  return false;
}

function unmarkAll() {
  document.querySelectorAll(`[${MARK}]`).forEach(el => el.removeAttribute(MARK));
}

/** Görünen ekranın ana dikey kaydırma alanı: #root içinde, görünür, ekranın
 *  büyük kısmını kaplayan en büyük overflow:auto/scroll öğesi. */
function findMainScroller(): HTMLElement | null {
  const root = document.getElementById('root');
  if (!root) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  let best: HTMLElement | null = null;
  let bestArea = 0;
  root.querySelectorAll('div').forEach((node) => {
    const el = node as HTMLElement;
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) return;
    if (el.offsetParent === null) return;                 // gizli sekme sahnesi
    const r = el.getBoundingClientRect();
    if (r.width < W * 0.8 || r.height < H * 0.5) return;  // yatay şerit / küçük kutu
    const area = r.width * r.height;
    if (area > bestArea) { best = el; bestArea = area; }
  });
  return best;
}

/**
 * Panel düzeninde (mobil dal) bir kez çağrılır. Rota değiştikçe ana kaydırma
 * alanını yeniden işaretler; içerik geç yüklenebildiği için birkaç kez dener.
 */
export function useAutoDocumentScroll() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [eligible] = useState(() => Platform.OS === 'web' && !isStandalone());
  const active = eligible && width < MOBILE_MAX_W;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const excluded = EXCLUDE.some(re => re.test(pathname || ''));

    // Önceki ekranın işaretini kaldır, belgeyi başa al.
    unmarkAll();
    html.classList.remove('doc-scroll');
    try { window.scrollTo(0, 0); } catch { /* yut */ }
    if (!active || excluded) return;

    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      // Hâlâ işaretli ve görünür bir alan varsa dokunma (yeniden işaretleme
      // düzeni bir an eski haline döndürüp kaydırma konumunu sıçratırdı).
      const current = document.querySelector(`[${MARK}]`) as HTMLElement | null;
      if (current && current.isConnected && current.offsetParent !== null) return;
      const el = findMainScroller();
      if (!el) return;
      el.setAttribute(MARK, '1');
      html.classList.add('doc-scroll');
    };
    // İçerik (lazy rota, veri) geç oturabilir → kademeli dene.
    const timers = [120, 500, 1200, 2500].map(ms => setTimeout(apply, ms));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      unmarkAll();
      html.classList.remove('doc-scroll');
    };
  }, [pathname, active]);
}
