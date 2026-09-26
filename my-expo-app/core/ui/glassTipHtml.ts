// GlassTooltip'in ham-HTML ikizi — React ağacı dışındaki yüzeyler için
// (Google Maps OverlayView, Leaflet popup/tooltip). Görünüm GlassTooltip ile
// BİREBİR aynı olmalı (tasarım dili §5 "GlassTooltip"); değiştirirsen ikisini birlikte değiştir.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let injected = false;
/** `.gtip` sınıflarını bir kez <head>'e ekler. */
export function ensureGlassTipStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-glass-tip', '');
  el.textContent = `
.gtip{position:relative;box-sizing:border-box;width:max-content;max-width:240px;padding:8px 10px;border-radius:12px;
  background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.75);
  -webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%);
  box-shadow:0 8px 24px rgba(15,23,42,0.14),inset 0 1px 0 rgba(255,255,255,0.9);
  font-family:Inter,'Inter Tight',system-ui,-apple-system,sans-serif;pointer-events:none}
.gtip-t{font-size:12px;font-weight:700;color:#0F172A;line-height:1.35}
.gtip-n{font-size:12px;font-weight:600;line-height:16px;color:#0F172A;margin-top:3px}
.gtip-x{font-size:11.5px;line-height:16px;color:rgba(15,23,42,0.70);margin-top:2px}
.gtip-a{position:absolute;left:50%;bottom:-7px;width:14px;height:7px;margin-left:-7px;overflow:hidden}
.gtip-a:before{content:'';position:absolute;left:2px;top:-6px;width:10px;height:10px;transform:rotate(45deg);
  background:rgba(255,255,255,0.55);border-right:1px solid rgba(255,255,255,0.75);border-bottom:1px solid rgba(255,255,255,0.75);
  -webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%)}
.gtip.dark{background:rgba(40,36,32,0.55);border-color:rgba(255,255,255,0.14);
  box-shadow:0 8px 24px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.10)}
.gtip.dark .gtip-t{color:#F2F2F2}
.gtip.dark .gtip-n{color:#F2F2F2}
.gtip.dark .gtip-x{color:rgba(255,255,255,0.72)}
.gtip.dark .gtip-a:before{background:rgba(40,36,32,0.55);border-color:rgba(255,255,255,0.14)}
/* Leaflet popup kabuğunu sıyır — içerik .gtip çizer */
.leaflet-popup.gtip-host .leaflet-popup-content-wrapper{background:transparent;box-shadow:none;padding:0;border-radius:0}
.leaflet-popup.gtip-host .leaflet-popup-content{margin:0;width:auto!important}
.leaflet-popup.gtip-host .leaflet-popup-tip-container{display:none}
`;
  document.head.appendChild(el);
}

/** Aşağı bakan oklu cam balon HTML'i. Ok, kutunun alt-ortasındadır. */
export function glassTipHtml({ title, name, text, dark }: {
  title?: string;
  /** Başlık altında vurgulu satır (ör. gönderici/alıcı adı). */
  name?: string;
  text: string; dark?: boolean;
}): string {
  ensureGlassTipStyles();
  return `<div class="gtip${dark ? ' dark' : ''}">`
    + (title ? `<div class="gtip-t">${esc(title)}</div>` : '')
    + (name ? `<div class="gtip-n">${esc(name)}</div>` : '')
    + `<div class="gtip-x"${title ? '' : ' style="margin-top:0"'}>${esc(text)}</div>`
    + `<div class="gtip-a"></div></div>`;
}
