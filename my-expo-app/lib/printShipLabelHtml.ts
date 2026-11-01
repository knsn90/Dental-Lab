// lib/printShipLabelHtml.ts
// Kurye / kargo GÖNDERİ FİŞİ — yalnız A6. Basılıp müşteriye giden kargoya ya da
// kutuya yapıştırılır. İş emri etiketiyle (printWorkLabelHtml) aynı sade dil.
//
// Hasta bilgisi YOK (ne ad ne baş harf). Gönderen/alıcı kurye hareketinin
// yönünden çözülmüş olarak gelir (modules/orders/lib/shipLabel.ts).
// Ara harekette "ne için olduğu" (amaç + açıklama) fişin en üstünde yazar.
//
// Saf modül: i18n/React/Supabase import ETMEZ — çeviri `t`, tarih dili `locale`.

import { type ResolvedParty } from '../modules/orders/lib/shipLabel';
import { formatLabelDate } from '../modules/orders/lib/workLabel';

export interface ShipLabelInput {
  orderNumber: string;
  /** Hareketin açıldığı an. */
  date?: Date | string | null;
  /** Siparişin final teslimatı mı? Değilse "Ara hareket". */
  final: boolean;
  /** Amaç etiketi, Türkçe kaynak ("Prova gidiş") — `t` ile çevrilir. */
  purposeLabel: string;
  /** Hareket açıklaması (kurye çağırırken yazılan not). */
  note?: string | null;
  from: ResolvedParty;
  to: ResolvedParty;
  lab: { name: string; logoUrl?: string | null };
  /** "Bizim kurye · Ahmet Y." / "Yurtiçi Kargo" — boşsa satır basılmaz. */
  carrier?: string | null;
  trackingNo?: string | null;
  qrSvg?: string;
  qrUrl?: string;
  t?: (s: string) => string;
  locale?: string;
  htmlAttrs?: string;
  rtl?: boolean;
  /** Önizlemede kağıdın arkasındaki zemin (yalnız ekranda). */
  screenBg?: string;
}

const W = 105, H = 148, PAD = 6, QR = 27;

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function partyBlock(p: ResolvedParty, role: 'from' | 'to', t: (x: string) => string): string {
  const head = `<b class="pname">${esc(p.name || '—')}</b>`;
  return `<div class="party ${role}"><span class="lbl">${esc(t(role === 'from' ? 'Gönderen' : 'Alıcı'))}</span>`
    + head
    + (p.person ? `<div class="person"><span class="k">${esc(t('Hekim'))}</span> ${esc(p.person)}</div>` : '')
    + (p.address ? `<div class="addr">${esc(p.address)}</div>` : '')
    + (p.phone ? `<div class="phone"><span class="k">${esc(t('Tel'))}</span> <span class="mono">${esc(p.phone)}</span></div>` : '')
    + `</div>`;
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{--u:1mm;width:${W}mm;height:${H}mm;padding:${PAD}mm;background:#fff;color:#0A0A0A;font-family:'Inter Tight',Inter,Vazirmatn,system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column;gap:calc(var(--u)*3.2);overflow:hidden;margin:0 auto}
.lbl{display:block;font-size:calc(var(--u)*2.2);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B;line-height:1.2}
.mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:700;direction:ltr;unicode-bidi:embed}
.head{display:flex;justify-content:space-between;align-items:stretch;gap:calc(var(--u)*4);border-bottom:1px solid #0A0A0A;padding-bottom:calc(var(--u)*3)}
.hl{display:flex;flex-direction:column;justify-content:space-between;gap:calc(var(--u)*2.2);min-width:0;flex:1}
.hl img{height:calc(var(--u)*9);width:auto;max-width:100%;object-fit:contain;object-position:left center;display:block;align-self:flex-start}
[dir=rtl] .hl img{object-position:right center;align-self:flex-end}
.hl .wordmark{font-size:calc(var(--u)*4.2);font-weight:800;letter-spacing:-.01em;line-height:1.1;overflow-wrap:anywhere}
.hl .date{font-size:calc(var(--u)*2.8);font-weight:600;color:#4B4B4B}
.kind{display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--u)*1.4)}
.kind .pill{font-size:calc(var(--u)*2.6);font-weight:800;letter-spacing:.14em;text-transform:uppercase;border-radius:999px;padding:.2em .8em;white-space:nowrap}
.kind .pill.final{background:#0A0A0A;color:#fff}
.kind .pill.mid{border:1.5px solid #0A0A0A}
.kind .purpose{font-size:calc(var(--u)*4.2);font-weight:800;letter-spacing:-.01em;line-height:1.1;overflow-wrap:anywhere}
.qrb{display:flex;flex-direction:column;align-items:stretch;flex:none;width:${QR}mm}
.qrb .no{text-align:center;letter-spacing:-.02em;white-space:nowrap;margin-top:calc(var(--u)*1.4)}
.party{display:flex;flex-direction:column;gap:calc(var(--u)*.9);min-width:0}
.party .pname{display:block;font-weight:800;letter-spacing:-.01em;line-height:1.15;overflow-wrap:anywhere}
.party .person{font-weight:600}
.party .k{font-size:.78em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B}
.party .addr{line-height:1.3;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.from{font-size:calc(var(--u)*2.7)}
.from .pname{font-size:calc(var(--u)*3.2)}
.from .addr{-webkit-line-clamp:2;line-clamp:2;color:#2C2C2C}
.to{font-size:calc(var(--u)*3.6);border:1.5px solid #0A0A0A;border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*3.4);gap:calc(var(--u)*1.4)}
.to .pname{font-size:calc(var(--u)*5.8)}
.to .addr{-webkit-line-clamp:4;line-clamp:4}
.to .phone .mono{font-size:1.15em}
.foot{margin-top:auto;display:flex;flex-direction:column;gap:calc(var(--u)*1.6);border-top:1px solid #D4D4D4;padding-top:calc(var(--u)*2.4)}
.why{font-size:calc(var(--u)*3);line-height:1.35;color:#2C2C2C;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
.why .k{font-weight:700}
.foot .meta{font-size:calc(var(--u)*2.6);color:#4B4B4B;line-height:1.35;overflow-wrap:anywhere}
.qr{width:${QR}mm;height:${QR}mm;background:#fff}
.qr svg,.qr img{width:100%;height:100%;display:block}
@media screen{
  html,body{background:var(--stage,#E9EDF2)}
  body{padding:24px 16px;min-height:100vh}
  .sheet{zoom:var(--fit,1);box-shadow:0 1px 2px rgba(15,23,42,.10),0 10px 28px rgba(15,23,42,.14)}
}
@media print{.sheet{box-shadow:none}}
`;

const FIT_SCRIPT = `<script>(function(){function f(){var s=document.querySelector('.sheet');if(!s)return;document.documentElement.style.setProperty('--fit',String(Math.min(1,(window.innerWidth-32)/s.offsetWidth)));}window.addEventListener('resize',f);f();})();</script>`;

export function buildShipLabelHtml(p: ShipLabelInput): string {
  const t = p.t ?? ((x: string) => x);
  const locale = p.locale ?? 'tr-TR';
  const note = (p.note ?? '').trim();
  const kind = p.final
    ? `<span class="pill final">${esc(t('Teslimat'))}</span>`
    : `<span class="pill mid">${esc(t('Ara hareket'))}</span><span class="purpose">${esc(t(p.purposeLabel))}</span>`;
  const qr = p.qrSvg
    ? p.qrSvg
    : p.qrUrl
      ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&bgcolor=ffffff&color=0a0a0a&data=${encodeURIComponent(p.qrUrl)}" alt="QR">`
      : '';
  const meta = [
    p.carrier ? esc(p.carrier) : '',
    p.trackingNo ? `${esc(t('Takip no'))}: <span class="mono">${esc(p.trackingNo)}</span>` : '',
  ].filter(Boolean).join('<br>');
  const fontFamilies = 'family=Inter+Tight:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700'
    + (p.rtl ? '&family=Vazirmatn:wght@400;600;700;800' : '');
  // Lab logosu HER fişte başlıkta (laba gelen harekette lab alıcıdır, yine de görünür).
  const logo = (p.lab.logoUrl ?? '').trim();
  const brand = logo
    ? `<img src="${esc(logo)}" alt="${esc(p.lab.name)}">`
    : `<b class="wordmark">${esc(p.lab.name)}</b>`;
  // Uzun sipariş numarası QR genişliğini aşmasın: mono hane ≈ .6em.
  const noFont = Math.min(4, QR / (Math.max(p.orderNumber.length, 1) * 0.6));
  const head = `<div class="head"><div class="hl">${brand}`
    + `<span class="date">${esc(formatLabelDate(p.date ?? null, locale))}</span>`
    + `<div class="kind">${kind}</div></div>`
    + `<div class="qrb"><div class="qr">${qr}</div>`
    + `<span class="no mono" style="font-size:${Math.round(noFont * 100) / 100}mm">${esc(p.orderNumber)}</span></div></div>`;
  // Not ve kurye/kargo bilgisi en altta.
  const foot = (note || meta)
    ? `<div class="foot">`
      + (note ? `<div class="why"><span class="k">${esc(t(p.final ? 'Not' : 'Açıklama'))}:</span> ${esc(note)}</div>` : '')
      + (meta ? `<div class="meta">${meta}</div>` : '')
      + `</div>`
    : '';
  const body = head + partyBlock(p.from, 'from', t) + partyBlock(p.to, 'to', t) + foot;
  const stage = p.screenBg ? `<style>:root{--stage:${esc(p.screenBg)}}</style>` : '';
  return `<!DOCTYPE html><html ${p.htmlAttrs ?? 'lang="tr" dir="ltr"'}><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(t('Gönderi fişi'))} · ${esc(p.orderNumber)}</title>`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies}&display=swap">`
    // Chrome `size: A6` anahtar sözcüğünü tanımıyor (Letter'a düşer) → mm.
    + `<style>@page{size:${W}mm ${H}mm;margin:0}${CSS}</style>${stage}</head>`
    + `<body><div class="sheet">${body}</div>${FIT_SCRIPT}</body></html>`;
}
