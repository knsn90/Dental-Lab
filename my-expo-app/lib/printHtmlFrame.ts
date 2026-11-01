/**
 * Hazır bir HTML belgesini GİZLİ iframe içinde yazdırır (yalnız web).
 *
 * Sayfanın kendisini yazdırmak yerine iframe: ekranın stilleri çıktıya
 * karışmaz, `@page` boyutu belgeden gelir. Logo dış kaynaktan, yazı tipleri
 * Google Fonts'tan geldiği için onload + fonts.ready beklenir; erken print
 * boş görsel basıyordu. Diyalog kapanmadan iframe kaldırılırsa yazdırma iptal
 * olur — bu yüzden geç temizlenir.
 */
export function printHtmlInHiddenFrame(html: string): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
  // srcdoc EKLEMEDEN önce: src'siz iframe eklenince Chrome about:blank için de
  // load atar; o yükte print boş sayfa basardı. Tek yük = belgenin kendisi.
  frame.srcdoc = html;
  let printed = false;
  frame.onload = () => {
    if (printed) return;
    printed = true;
    const fonts = (frame.contentDocument as any)?.fonts;
    Promise.resolve(fonts?.ready).catch(() => undefined).then(() => setTimeout(() => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* yoksay */ }
      setTimeout(() => frame.remove(), 60_000);
    }, 150));
  };
  document.body.appendChild(frame);
}
