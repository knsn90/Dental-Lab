// lib/printProvaSlipHtml.ts
// PROVA FİŞİ — prova kliniğe giderken kutuya konan A5 belge. Üstte iş bilgisi ve
// lab notu (uygulamada yazılıp basılır); altta hekimin KALEMLE dolduracağı boş not
// kutusu, sonuç kutucukları ve imza satırı. Hekim fişi provayla birlikte geri yollar.
//
// Hasta yalnız BAŞ HARFLERİYLE ("F. C.", KVKK) — çağıran baş harfleri verir.
// Saf modül: i18n/React/Supabase import ETMEZ — çeviri `t`, tarih dili `locale`.

import { type LabelOpRow, formatLabelDate } from '../modules/orders/lib/workLabel';

export interface ProvaSlipInput {
  orderNumber: string;
  /** "2. Prova", "1. Metal prova" — çevrilmiş hâliyle gelir. */
  provaLabel: string;
  /** Fişin basıldığı gün. */
  date?: Date | string | null;
  deliveryDate?: Date | string | null;
  /** "F. C." — tam ad ASLA verilmez. Boşsa satır basılmaz. */
  patientInitials?: string | null;
  clinicName?: string | null;
  doctorName?: string | null;
  lab: { name: string; logoUrl?: string | null };
  /** İş satırları (iş · dişler · renk). */
  ops: LabelOpRow[];
  /** Lab'ın uygulamada yazdığı not. Boşsa kutu el yazısına açık çizgili kalır. */
  labNote?: string | null;
  qrSvg?: string;
  qrUrl?: string;
  t?: (s: string) => string;
  locale?: string;
  htmlAttrs?: string;
  rtl?: boolean;
  /** Önizlemede kağıdın arkasındaki zemin (yalnız ekranda). */
  screenBg?: string;
  /** Geçici / daimi prova: rozet metni + biçimi (geçici çerçeveli, daimi dolu) ve hekim seçenekleri. Yoksa genel "Prova fişi". */
  kind?: 'gecici' | 'daimi' | null;
}

/** Fiş rozeti (Türkçe kaynak; `t` ile çevrilir). */
export function provaSlipTitle(kind?: 'gecici' | 'daimi' | null): string {
  return kind === 'gecici' ? 'Geçici prova fişi' : kind === 'daimi' ? 'Daimi prova fişi' : 'Prova fişi';
}

/** Hekimin kalemle işaretleyeceği seçenekler (Türkçe kaynak). */
export function provaSlipChecks(kind?: 'gecici' | 'daimi' | null): string[] {
  if (kind === 'gecici') return ['Uygun, daimiye geçilsin', 'Düzeltme gerekli', 'Yeniden geçici prova'];
  if (kind === 'daimi') return ['Uygun, bitime geçilsin', 'Düzeltme gerekli', 'Yeniden daimi prova'];
  return ['Uygun, devam edilsin', 'Düzeltme gerekli', 'Yeniden prova istiyorum'];
}

const W = 148, H = 210, PAD = 9, QR = 26;

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{--u:1mm;width:${W}mm;height:${H}mm;padding:${PAD}mm;background:#fff;color:#0A0A0A;font-family:'Inter Tight',Inter,Vazirmatn,system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column;gap:calc(var(--u)*3.6);overflow:hidden;margin:0 auto}
.lbl{display:block;font-size:calc(var(--u)*2.2);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B;line-height:1.2}
.mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:700;direction:ltr;unicode-bidi:embed}
.head{display:flex;justify-content:space-between;align-items:stretch;gap:calc(var(--u)*5);border-bottom:1px solid #0A0A0A;padding-bottom:calc(var(--u)*3.4)}
.hl{display:flex;flex-direction:column;justify-content:space-between;gap:calc(var(--u)*2.4);min-width:0;flex:1}
.hl img{height:calc(var(--u)*9);width:auto;max-width:100%;object-fit:contain;object-position:left center;display:block;align-self:flex-start}
[dir=rtl] .hl img{object-position:right center;align-self:flex-end}
.hl .wordmark{font-size:calc(var(--u)*4.4);font-weight:800;letter-spacing:-.01em;line-height:1.1;overflow-wrap:anywhere}
.kind{display:flex;flex-direction:column;align-items:flex-start;gap:calc(var(--u)*1.4)}
.kind .pill.out{background:#fff;color:#0A0A0A;box-shadow:inset 0 0 0 1.5px #0A0A0A}
.kind .pill{font-size:calc(var(--u)*2.5);font-weight:800;letter-spacing:.14em;text-transform:uppercase;border-radius:999px;padding:.2em .8em;white-space:nowrap;background:#0A0A0A;color:#fff}
.kind .title{font-size:calc(var(--u)*6.4);font-weight:800;letter-spacing:-.02em;line-height:1.05;overflow-wrap:anywhere}
.kind .date{font-size:calc(var(--u)*2.9);font-weight:600;color:#4B4B4B}
.qrb{display:flex;flex-direction:column;align-items:stretch;flex:none;width:${QR}mm}
.qrb .no{text-align:center;letter-spacing:-.02em;white-space:nowrap;margin-top:calc(var(--u)*1.4)}
.qr{width:${QR}mm;height:${QR}mm;background:#fff}
.qr svg,.qr img{width:100%;height:100%;display:block}
.info{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u)*2.4) calc(var(--u)*5)}
.info .v{display:block;font-size:calc(var(--u)*3.4);font-weight:700;line-height:1.25;margin-top:calc(var(--u)*.6);overflow-wrap:anywhere}
.work{display:flex;flex-direction:column;gap:calc(var(--u)*1.2)}
.work .row{display:flex;align-items:baseline;gap:calc(var(--u)*3);font-size:calc(var(--u)*3.2);line-height:1.3}
.work .w{font-weight:700;flex:1;min-width:0;overflow-wrap:anywhere}
.work .d{font-weight:500;color:#4B4B4B}
.work .teeth{font-size:.92em;white-space:nowrap}
.box{border:1.5px solid #0A0A0A;border-radius:calc(var(--u)*1.8);padding:calc(var(--u)*3) calc(var(--u)*3.4);display:flex;flex-direction:column;gap:calc(var(--u)*1.6)}
.box .text{font-size:calc(var(--u)*3.3);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:7;line-clamp:7;overflow:hidden}
.ruled{background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--u)*7.4 - 1px),#C9C9C9 calc(var(--u)*7.4 - 1px),#C9C9C9 calc(var(--u)*7.4));background-position:0 calc(var(--u)*-1)}
.labnote .ruled{height:calc(var(--u)*14.8)}
.doc{flex:1;min-height:0}
.doc .ruled{flex:1;min-height:calc(var(--u)*22)}
.checks{display:flex;flex-wrap:wrap;gap:calc(var(--u)*2) calc(var(--u)*6);font-size:calc(var(--u)*3);font-weight:600}
.checks span{display:inline-flex;align-items:center;gap:calc(var(--u)*1.6)}
.checks i{display:inline-block;width:calc(var(--u)*3.6);height:calc(var(--u)*3.6);border:1.3px solid #0A0A0A;border-radius:calc(var(--u)*.7)}
.sign{display:grid;grid-template-columns:1.6fr 1fr;gap:calc(var(--u)*6);padding-top:calc(var(--u)*1)}
.sign div{border-top:1px solid #0A0A0A;padding-top:calc(var(--u)*1.2)}
.back{font-size:calc(var(--u)*2.7);color:#4B4B4B;text-align:center;font-weight:600}
@media screen{
  html,body{background:var(--stage,#E9EDF2)}
  body{padding:24px 16px;min-height:100vh}
  .sheet{zoom:var(--fit,1);box-shadow:0 1px 2px rgba(15,23,42,.10),0 10px 28px rgba(15,23,42,.14)}
}
@media print{.sheet{box-shadow:none}}
`;

const FIT_SCRIPT = `<script>(function(){function f(){var s=document.querySelector('.sheet');if(!s)return;document.documentElement.style.setProperty('--fit',String(Math.min(1,(window.innerWidth-32)/s.offsetWidth)));}window.addEventListener('resize',f);f();})();</script>`;

export function buildProvaSlipHtml(p: ProvaSlipInput): string {
  const t = p.t ?? ((x: string) => x);
  const locale = p.locale ?? 'tr-TR';
  const labNote = (p.labNote ?? '').trim();
  const qr = p.qrSvg
    ? p.qrSvg
    : p.qrUrl
      ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&bgcolor=ffffff&color=0a0a0a&data=${encodeURIComponent(p.qrUrl)}" alt="QR">`
      : '';
  const fontFamilies = 'family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700'
    + (p.rtl ? '&family=Vazirmatn:wght@400;600;700;800' : '');
  const logo = (p.lab.logoUrl ?? '').trim();
  const brand = logo
    ? `<img src="${esc(logo)}" alt="${esc(p.lab.name)}">`
    : `<b class="wordmark">${esc(p.lab.name)}</b>`;
  const noFont = Math.min(4, QR / (Math.max(p.orderNumber.length, 1) * 0.6));

  const title = t(provaSlipTitle(p.kind));
  const head = `<div class="head"><div class="hl">${brand}`
    + `<div class="kind"><span class="pill${p.kind === 'gecici' ? ' out' : ''}">${esc(title)}</span>`
    + `<span class="title">${esc(p.provaLabel)}</span>`
    + `<span class="date">${esc(formatLabelDate(p.date ?? new Date(), locale))}</span></div></div>`
    + `<div class="qrb"><div class="qr">${qr}</div>`
    + `<span class="no mono" style="font-size:${Math.round(noFont * 100) / 100}mm">${esc(p.orderNumber)}</span></div></div>`;

  const cell = (k: string, v: string | null | undefined) =>
    (v ?? '').trim() ? `<div><span class="lbl">${esc(t(k))}</span><span class="v">${esc(v)}</span></div>` : '';
  const delivery = p.deliveryDate ? formatLabelDate(p.deliveryDate, locale) : '';
  const info = `<div class="info">${cell('Klinik', p.clinicName)}${cell('Hekim', p.doctorName)}`
    + `${cell('Hasta', p.patientInitials)}${cell('Teslim tarihi', delivery)}</div>`;

  const rows = p.ops.slice(0, 5).map((o) => {
    const detail = [o.detail, o.shade ? `${t('Renk')}: ${o.shade}` : ''].filter(Boolean).join(' · ');
    return `<div class="row"><span class="w">${esc(o.work)}${detail ? ` <span class="d">· ${esc(detail)}</span>` : ''}</span>`
      + (o.teeth.length ? `<span class="teeth mono">${esc(o.teeth.join(' '))}</span>` : '')
      + `</div>`;
  }).join('');
  const work = rows ? `<div class="work"><span class="lbl">${esc(t('İş'))}</span>${rows}</div>` : '';

  const labBox = `<div class="box labnote"><span class="lbl">${esc(t('Lab notu'))}</span>`
    + (labNote ? `<div class="text">${esc(labNote)}</div>` : `<div class="ruled"></div>`)
    + `</div>`;

  const checks = provaSlipChecks(p.kind)
    .map((c) => `<span><i></i>${esc(t(c))}</span>`).join('');
  const docBox = `<div class="box doc"><span class="lbl">${esc(t('Hekim notu'))}</span>`
    + `<div class="checks">${checks}</div><div class="ruled"></div>`
    + `<div class="sign"><div><span class="lbl">${esc(t('Hekim imza / kaşe'))}</span></div>`
    + `<div><span class="lbl">${esc(t('Tarih'))}</span></div></div></div>`;

  const back = `<div class="back">${esc(t('Lütfen bu fişi doldurup provayla birlikte geri gönderin.'))}</div>`;

  const body = head + info + work + labBox + docBox + back;
  const stage = p.screenBg ? `<style>:root{--stage:${esc(p.screenBg)}}</style>` : '';
  return `<!DOCTYPE html><html ${p.htmlAttrs ?? 'lang="tr" dir="ltr"'}><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)} · ${esc(p.orderNumber)}</title>`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies}&display=swap">`
    // Chrome `size: A5` anahtar sözcüğünü tanımıyor (Letter'a düşer) → mm.
    + `<style>@page{size:${W}mm ${H}mm;margin:0}${CSS}</style>${stage}</head>`
    + `<body><div class="sheet">${body}</div>${FIT_SCRIPT}</body></html>`;
}
