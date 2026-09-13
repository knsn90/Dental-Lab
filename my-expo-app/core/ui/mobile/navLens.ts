// core/ui/mobile/navLens.ts
// LIQUID GLASS'IN ASIL MEKANİZMASI: REFRAKSİYON (mercek), blur değil.
//
// Apple'ın materyali arkadaki içeriği bulanıklaştırmakla yetinmez; bir
// büyüteçten geçmiş gibi YAYAR/SAPTIRIR. Netliği bozan şey bu yer değiştirme.
// Saf blur ise biçimi öldürür: içerik "buğulu" olur ama mercek hissi vermez.
//
// Web'de bunun gerçek karşılığı bir SVG filtresidir:
//   feImage (yer değiştirme haritası) → feDisplacementMap → arkaplan büyütülür
// Harita, R kanalında yatay, G kanalında dikey doğrusal rampa taşır. 128 = yer
// değiştirme yok; rampa merkeze göre dışa doğru büyüyen bir vektör alanı
// üretir → arkaplan DÜZGÜN büyür (magnifier), kenarlarda ışık büker.
//
// `backdrop-filter: url(#...)` yalnız Chromium'da güvenilir. Bu yüzden:
//   • destek varsa  → mercek + AZ blur (asıl iş merceğin)
//   • destek yoksa  → mevcut kanıtlanmış blur+kontrast zinciri (bkz. navGlass)
// Native'de karşılığı yok: iOS 26'da @callstack/liquid-glass GERÇEK Apple
// materyalini (refraksiyon dahil) kullanıyor; iOS < 26 / Android blur'da kalır.

import { Platform } from 'react-native';

export const NAV_LENS_ID = 'simanNavLens';

/**
 * Yer değiştirme haritası — BEVEL (pah) profili, düz büyüteç DEĞİL.
 *
 * R kanalı yatay, G kanalı dikey yer değiştirmeyi taşır (128 = kayma yok).
 * Profil kenarlarda dik, ortada DÜZ: gerçek bir cam dilimi gibi. Işık ortada
 * neredeyse kırılmaz, kenara yaklaştıkça sertçe bükülür — arkadaki yazıyı
 * yayıp netliğini alan şey bu kenar kırılması.
 *
 * (İlk deneme uçtan uca doğrusal rampaydı = düzgün büyütme. Ölçümde arka plan
 * gerçekten yer değiştiriyordu ama içerik SADECE büyüyordu; büyümüş yazı hâlâ
 * okunabilir. Kırılmanın kenarda yoğunlaşması gerekiyor.)
 */
function displacementMapDataUri(): string {
  const stops = (mid: string, lo: string, hi: string) =>
    `<stop offset="0" stop-color="${lo}"/>` +
    `<stop offset="0.16" stop-color="${mid}"/>` +
    `<stop offset="0.84" stop-color="${mid}"/>` +
    `<stop offset="1" stop-color="${hi}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80">` +
    `<defs>` +
    // R: yatay — sol kenar 0 (içe), orta 128 (nötr), sağ kenar 255 (dışa)
    `<linearGradient id="rx" x1="0" y1="0" x2="1" y2="0">` +
    stops('#800000', '#000000', '#ff0000') +
    `</linearGradient>` +
    // G: dikey — üst 0, orta 128, alt 255
    `<linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">` +
    stops('#008000', '#000000', '#00ff00') +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="160" height="80" fill="url(#rx)"/>` +
    `<rect width="160" height="80" fill="url(#gy)" style="mix-blend-mode:screen"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let injected = false;
let supported: boolean | null = null;

/**
 * Filtreyi belgeye bir kez enjekte eder ve destekleniyorsa true döner.
 * (React ağacına SVG basmak yerine belgeye tek sefer yazılır: filtre
 * kimliği global, her cam yüzey aynı tanımı paylaşır.)
 */
export function ensureNavLens(): boolean {
  if (Platform.OS !== 'web') return false;
  if (supported !== null) return supported;
  if (typeof document === 'undefined') return false;

  try {
    const canUse =
      typeof (globalThis as any).CSS !== 'undefined' &&
      typeof (globalThis as any).CSS.supports === 'function' &&
      // Safari `filter: url()`'ü destekler ama backdrop-filter'da SVG referansı
      // güvenilir çalışmaz; supports() yine de false döndüğünde fallback'e düşer.
      (globalThis as any).CSS.supports('backdrop-filter', `url(#${NAV_LENS_ID})`);
    if (!canUse) { supported = false; return false; }

    if (!injected) {
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      host.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">` +
        `<filter id="${NAV_LENS_ID}" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox"` +
        ` x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
        `<feImage href="${displacementMapDataUri()}" x="0" y="0" width="1" height="1"` +
        ` preserveAspectRatio="none" result="lensMap"/>` +
        // scale objectBoundingBox biriminde (bbox köşegeni × scale). 0.16'da
        // kırılmanın bileşimdeki katkısı 5.26 luminans (ölçüldü) — teknik
        // olarak çalışıyor ama gözle zor seçiliyor; 0.30'da kenar bükülmesi
        // belirgin hale gelir, halka artefaktı ölçülmedi.
        `<feDisplacementMap in="SourceGraphic" in2="lensMap" scale="0.30"` +
        ` xChannelSelector="R" yChannelSelector="G"/>` +
        `</filter>` +
        `</svg>`;
      document.body.appendChild(host);
      injected = true;
    }
    supported = true;
    return true;
  } catch {
    supported = false;
    return false;
  }
}

/** Mercek kullanılabiliyor mu (enjeksiyon dahil). */
export function navLensAvailable(): boolean {
  return ensureNavLens();
}
