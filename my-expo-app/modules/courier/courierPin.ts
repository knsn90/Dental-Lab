/**
 * Kurye pini — takip haritalarının TEK kaynağı (Google + Leaflet + native aynı
 * geometriyi kullanır).
 *
 * BİÇİM: damla. Üstte kuryenin FOTOĞRAFI beyaz bir çerçeve içinde, altta beyaz
 * bir uç; ucun sivri noktası gerçek koordinata oturur. Eskiden burada sabit bir
 * scooter PNG'si vardı — kimin taşıdığını göstermiyordu.
 *
 * CANLI: konum akarken pinin çevresinde YEŞİL nabız (iki halka, gecikmeli) ve
 * fotoğrafın etrafında ince yeşil halka. Nabız DEKOR DEĞİL — yalnız canlı konum
 * varken çalışır, gönderi bitince/konum bayatlayınca susar. `prefers-reduced-
 * motion` açıkken hareket durur, yerine sabit yeşil hâle kalır (bilgi kaybolmaz).
 *
 * Geometri sabitleri üç haritada da aynıdır; ucun tam koordinata oturması için
 * çapa DAİMA (PIN_W/2, PIN_H) yani alt-orta noktadır.
 */

/**
 * Pin kutusu. Çerçeve kutunun ORTASINDA durur; kenarda kalan 4px canlı halkası
 * ve nabız için pay — ring kutuya sığmazsa Leaflet divIcon'u kırpıyor.
 */
export const PIN_W = 50;
export const PIN_H = 55;
/** Fotoğraf çerçevesinin dış çapı. */
export const PIN_FRAME = 42;
/** Çerçevenin kutu içindeki sol/üst konumu. */
export const PIN_FRAME_X = (PIN_W - PIN_FRAME) / 2;  // 4
export const PIN_FRAME_Y = 4;
/** Ucun tabanı ve yüksekliği — sivri nokta kutunun TAM ALT-ORTASI. */
export const PIN_TAIL_W = 15;
export const PIN_TAIL_H = 11;
/** Beyaz çerçeve kalınlığı ve foto yoksa baş harflerin punto'su. */
export const PIN_RING = 2.5;
export const PIN_INITIALS_SIZE = 13;
/** Canlı nabzın rengi — status success (tüm panellerde ortak). */
export const PIN_LIVE_GREEN = '#2D9A6B';

/** "Ahmet Yılmaz" → "AY" (foto yoksa çerçevenin içine bu yazılır). */
export function courierInitials(name?: string | null): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p.charAt(0).toLocaleUpperCase('tr-TR')).join('') || 'K';
}

/** XSS kapısı: yalnız http(s) ve data:image URL'leri <img src>'ye girebilir. */
function safePhotoUrl(url?: string | null): string | null {
  const u = String(url ?? '').trim();
  if (!u) return null;
  if (!/^(https?:\/\/|data:image\/)/i.test(u)) return null;
  return u.replace(/["'<>]/g, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** Stil etiketi bir kez basılır (Leaflet ve Google aynı sınıfları kullanır). */
export function ensureCourierPinStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-courier-pin]')) return;
  const el = document.createElement('style');
  el.setAttribute('data-courier-pin', '1');
  el.textContent = `
    .cpin { position: relative; width: ${PIN_W}px; height: ${PIN_H}px; }
    /* Gövde (çerçeve + uç) TEK gölge alır: ayrı ayrı gölgelenince ek yerinde
       çizgi görünüyordu. filter shape'in dış konturunu takip eder. */
    .cpin-body { position: absolute; inset: 0; filter: drop-shadow(0 4px 7px rgba(15,23,42,0.26)); }
    /* Uç çerçevenin İÇİNE girer (${PIN_FRAME_Y + PIN_FRAME - (PIN_H - PIN_TAIL_H)}px örtüşme):
       aralık kalırsa damla ikiye bölünmüş görünüyor. */
    .cpin-tail {
      position: absolute; left: 50%; top: ${PIN_H - PIN_TAIL_H}px;
      margin-left: -${PIN_TAIL_W / 2}px;
      width: 0; height: 0;
      border-left: ${PIN_TAIL_W / 2}px solid transparent;
      border-right: ${PIN_TAIL_W / 2}px solid transparent;
      border-top: ${PIN_TAIL_H}px solid #FFFFFF;
    }
    .cpin-frame {
      position: absolute; left: ${PIN_FRAME_X}px; top: ${PIN_FRAME_Y}px;
      width: ${PIN_FRAME}px; height: ${PIN_FRAME}px; border-radius: 50%;
      background: #FFFFFF; padding: ${PIN_RING}px; box-sizing: border-box; overflow: hidden;
    }
    .cpin-photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
    .cpin-initials {
      width: 100%; height: 100%; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font: 700 ${PIN_INITIALS_SIZE}px/1 system-ui, -apple-system, Segoe UI, sans-serif; color: #FFFFFF;
      letter-spacing: 0.5px;
    }
    /* Canlı halkası çerçevenin DIŞINA çizilir (box-shadow spread): içeri
       çizilince beyaz çerçeveyi yutuyor ve pin damla olmaktan çıkıyordu.
       Hareket kapalıyken "canlı" bilgisini tek başına bu halka taşır. */
    .cpin.live .cpin-frame { box-shadow: 0 0 0 1.75px ${PIN_LIVE_GREEN}; }
    .cpin-halo {
      position: absolute; left: ${PIN_FRAME_X}px; top: ${PIN_FRAME_Y}px;
      width: ${PIN_FRAME}px; height: ${PIN_FRAME}px; border-radius: 50%;
      background: ${PIN_LIVE_GREEN}2E; border: 1.5px solid ${PIN_LIVE_GREEN}66;
      box-sizing: border-box;
      animation: cpin-pulse 2200ms cubic-bezier(0.22, 1, 0.36, 1) infinite;
      will-change: transform, opacity;
    }
    .cpin-halo.b { animation-delay: 1100ms; }
    @keyframes cpin-pulse {
      0%   { transform: scale(1);    opacity: 0.8; }
      75%  { transform: scale(1.85); opacity: 0; }
      100% { transform: scale(1.85); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cpin-halo { animation: none; transform: scale(1.22); opacity: 0.45; }
      .cpin-halo.b { display: none; }
    }
  `;
  document.head.appendChild(el);
}

/**
 * Pinin HTML'i. Leaflet `divIcon` ve Google `OverlayView` AYNI markup'ı basar —
 * iki haritada pinin bir piksel bile farklı görünmemesi için.
 */
export function courierPinHtml(opts: {
  photo?: string | null;
  name?: string | null;
  /** Canlı konum akıyor mu? Yalnız true iken yeşil nabız çizilir. */
  live?: boolean;
  /** Fotoğraf yoksa baş harflerin zemini (panel accent'i). */
  accent?: string;
}): string {
  const photo = safePhotoUrl(opts.photo);
  const name = esc(String(opts.name ?? 'Kurye'));
  const accent = /^#[0-9a-f]{6}$/i.test(String(opts.accent ?? '')) ? String(opts.accent) : '#0A2540';
  const inner = photo
    ? `<img class="cpin-photo" src="${photo}" alt="${name}" draggable="false"
             onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div class=&quot;cpin-initials&quot; style=&quot;background:${accent}&quot;>${esc(courierInitials(opts.name))}</div>')" />`
    : `<div class="cpin-initials" style="background:${accent}">${esc(courierInitials(opts.name))}</div>`;
  const halos = opts.live
    ? `<div class="cpin-halo"></div><div class="cpin-halo b"></div>`
    : '';
  return (
    `<div class="cpin${opts.live ? ' live' : ''}" title="${name}">` +
      halos +
      `<div class="cpin-body">` +
        `<div class="cpin-tail"></div>` +
        `<div class="cpin-frame">${inner}</div>` +
      `</div>` +
    `</div>`
  );
}
