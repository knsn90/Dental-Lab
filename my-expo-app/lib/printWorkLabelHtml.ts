// lib/printWorkLabelHtml.ts
// İş emri ETİKETİ — kutuya yapıştırılıp laboratuvarda teknisyenlerin elinde
// dolaşan çıktı. A4 / A5 / A6; her boyutun kendi ölçüleri var (onaylanan
// "A · Sade" tasarımı). Sağlık Bakanlığı gereği hastadan yalnız baş harfler
// basılır — bu dosyaya hasta adı HİÇ gelmez, çağıran baş harfleri verir.
//
// Saf modül: i18n/React/Supabase import ETMEZ. Çeviri `t`, tarih dili `locale`
// olarak dışarıdan gelir; böylece node'da da üretilip görsel kontrol yapılabilir.
// Ölçü birimi mm: `--u` = 1mm, tüm ölçüler `u(n)` ile yazılır.

import {
  type LabelSize, type WorkLine, type LabelOpRow,
  groupFdi, crossLayout, formatLabelDate,
} from '../modules/orders/lib/workLabel';

export interface WorkLabelInput {
  size: LabelSize;
  orderNumber: string;
  createdAt: Date | string;
  deliveryDate?: Date | string | null;
  isUrgent: boolean;
  /** "A. S." — ad/soyad ASLA verilmez. Boşsa "—" basılır. */
  patientInitials: string;
  clinicName: string;
  doctorName: string;
  lab: { name: string; logoUrl?: string | null };
  /** En kalabalık iş başta. */
  work: WorkLine[];
  shade?: string | null;
  teeth: number[];
  /** Hekim notu (work_orders.notes). lab_notes etikete basılmaz. */
  note?: string | null;
  /** Yalnız A4'te basılan işlem tablosu. */
  ops?: LabelOpRow[];
  /** Hazır QR SVG'si (tercih edilen). Yoksa qrUrl'den dış servis görseli. */
  qrSvg?: string;
  qrUrl?: string;
  /** Çeviri — varsayılan kimlik (Türkçe kaynak). */
  t?: (s: string) => string;
  /** Tarih dili — printLocale(). */
  locale?: string;
  /** `<html>` öznitelikleri — htmlAttrs(). */
  htmlAttrs?: string;
  rtl?: boolean;
  /** Önizlemede kağıdın arkasındaki zemin (yalnız ekranda; baskıya girmez). */
  screenBg?: string;
}

interface SizeSpec {
  w: number; h: number; pad: number; qr: number; no: number; work: number; cross: number;
  teeth: number; date: number; who: number; lbl: number; logo: number;
  noteFont: number; noteLines: number; extraWork: number;
}

// mm — onaylanan taslaktaki ölçüler (A6 basılı puntoları: etiket 6.2pt … iş özeti 15.9pt).
// @page boyutu da buradan mm olarak yazılır: Chrome `size: A6` anahtar
// sözcüğünü tanımıyor, sessizce Letter'a düşüyor.
const SIZES: Record<LabelSize, SizeSpec> = {
  A4: { w: 210, h: 297, pad: 13, qr: 40, no: 4.6, work: 10, cross: 86, teeth: 5.2, date: 5.2, who: 4.4, lbl: 2.3, logo: 12, noteFont: 3.3, noteLines: 8, extraWork: 2 },
  A5: { w: 148, h: 210, pad: 9, qr: 31, no: 3.6, work: 7.4, cross: 66, teeth: 4.2, date: 4.1, who: 3.5, lbl: 2.2, logo: 9, noteFont: 2.9, noteLines: 5, extraWork: 2 },
  A6: { w: 105, h: 148, pad: 6, qr: 25, no: 2.95, work: 5.6, cross: 50, teeth: 3.4, date: 3.2, who: 2.8, lbl: 2.2, logo: 6.5, noteFont: 2.65, noteLines: 3, extraWork: 1 },
};

const u = (n: number) => `calc(var(--u)*${Math.round(n * 1000) / 1000})`;

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function qrBlock(p: WorkLabelInput, s: SizeSpec): string {
  const inner = p.qrSvg
    ? p.qrSvg
    : p.qrUrl
      ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&bgcolor=ffffff&color=0a0a0a&data=${encodeURIComponent(p.qrUrl)}" alt="QR">`
      : '';
  // Uzun sipariş numarası QR genişliğini aşmasın: mono hane ≈ .6em.
  const noFont = Math.min(s.no, s.qr / (Math.max(p.orderNumber.length, 1) * 0.6));
  return `<div class="qrb" style="width:${u(s.qr)}">`
    + `<div class="qr" style="width:${u(s.qr)};height:${u(s.qr)}">${inner}</div>`
    + `<div class="no" style="font-size:${u(noFont)}">${esc(p.orderNumber)}</div></div>`;
}

function head(p: WorkLabelInput, s: SizeSpec, t: (x: string) => string): string {
  const logo = (p.lab.logoUrl ?? '').trim();
  const labName = (p.lab.name ?? '').trim();
  const brand = logo
    ? `<img src="${esc(logo)}" style="height:${u(s.logo)}" alt="">`
      + (labName ? `<div class="labname" style="font-size:${u(Math.max(s.who * 0.72, 2.5))}">${esc(labName)}</div>` : '')
    : `<div class="labname wordmark" style="font-size:${u(s.who * 1.05)}">${esc(labName)}</div>`;
  const row = (label: string, value: string, cls = '') =>
    `<div><span class="lbl">${esc(t(label))}</span><b class="${cls}">${esc(value || '—')}</b></div>`;
  return `<div class="head"><div class="lb-brand">`
    + `<div class="lab">${brand}</div>`
    + `<div class="who" style="font-size:${u(s.who)}">`
    + row('Klinik', p.clinicName, 'clinic')
    + row('Hekim', p.doctorName)
    + `<div class="pt"><span class="lbl">${esc(t('Hasta'))}</span><b class="ini">${esc(p.patientInitials || '—')}</b></div>`
    + `</div></div>${qrBlock(p, s)}</div>`;
}

function dates(p: WorkLabelInput, s: SizeSpec, t: (x: string) => string, locale: string): string {
  return `<div class="dates" style="font-size:${u(s.date)}">`
    + `<div><span class="lbl">${esc(t('Alındı'))}</span><b>${esc(formatLabelDate(p.createdAt, locale))}</b></div>`
    + `<div class="due"><span class="lbl">${esc(t('Teslim'))}</span><b>${esc(formatLabelDate(p.deliveryDate ?? null, locale))}</b>`
    + (p.isUrgent ? `<em>${esc(t('ACİL'))}</em>` : '')
    + `</div></div>`;
}

function work(p: WorkLabelInput, s: SizeSpec, t: (x: string) => string): string {
  const [first, ...rest] = p.work;
  const shade = (p.shade ?? '').trim();
  const meta = [
    first && first.count > 1 ? `× ${first.count}` : '',
    shade ? `${t('Renk')} ${shade}` : '',
  ].filter(Boolean).join(' · ');
  const shown = rest.slice(0, s.extraWork);
  const hidden = rest.length - shown.length;
  const extra = shown.map(w => `<div class="wt2">+ ${esc(w.name)}${w.count > 1 ? ` × ${w.count}` : ''}</div>`).join('')
    + (hidden > 0 ? `<div class="wt2">+${hidden} ${esc(t('iş daha'))}</div>` : '');
  return `<div class="work"><span class="lbl">${esc(t('İş'))}</span>`
    + `<div class="wt" style="font-size:${u(s.work)}"><span class="wn">${esc(first?.name ?? '—')}</span>`
    + (meta ? ` <small>${esc(meta)}</small>` : '') + `</div>`
    + (extra ? `<div class="wextra" style="font-size:${u(Math.max(s.work * 0.42, 2.6))}">${extra}</div>` : '')
    + `</div>`;
}

function cross(p: WorkLabelInput, s: SizeSpec): string {
  const q = groupFdi(p.teeth);
  const max = Math.max(q.ur.length, q.ul.length, q.lr.length, q.ll.length);
  if (max === 0) return '';
  const lay = crossLayout({ maxPerQuadrant: max, baseWidth: s.cross, font: s.teeth, innerWidth: s.w - 2 * s.pad });
  const cell = (nums: number[], side: 'r' | 'l') =>
    `<div class="q ${side}">${nums.length ? nums.map(n => `<span class="t">${n}</span>`).join('') : '<span class="dash">—</span>'}</div>`;
  return `<div class="cross" style="width:${u(lay.width)};font-size:${u(lay.font)}">`
    + cell(q.ur, 'r') + cell(q.ul, 'l') + cell(q.lr, 'r') + cell(q.ll, 'l') + `</div>`;
}

function note(p: WorkLabelInput, s: SizeSpec, t: (x: string) => string): string {
  const text = (p.note ?? '').trim();
  if (!text) return '';
  return `<div class="hnote"><span class="lbl">${esc(t('Hekim notu'))}</span>`
    + `<div class="note" style="font-size:${u(s.noteFont)};-webkit-line-clamp:${s.noteLines};line-clamp:${s.noteLines}">${esc(text)}</div></div>`;
}

function opsTable(p: WorkLabelInput, t: (x: string) => string): string {
  const rows = p.ops ?? [];
  if (rows.length === 0) return '';
  const hasDetail = rows.some(r => r.detail);
  const hasShade = rows.some(r => r.shade);
  const th = (x: string) => `<th>${esc(t(x))}</th>`;
  return `<div class="ex"><div class="sec"><span class="lbl">${esc(t('İş detayı'))}</span></div>`
    + `<table class="tbl"><thead><tr>${th('İş')}${hasDetail ? th('Detay') : ''}${hasShade ? th('Renk') : ''}${th('Diş')}</tr></thead><tbody>`
    + rows.map(r => `<tr><td>${esc(r.work)}</td>`
      + (hasDetail ? `<td>${esc(r.detail || '—')}</td>` : '')
      + (hasShade ? `<td>${esc(r.shade || '—')}</td>` : '')
      + `<td class="mono">${r.teeth.length ? r.teeth.join(' · ') : '—'}</td></tr>`).join('')
    + `</tbody></table></div>`;
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{--u:1mm;position:relative;background:#fff;color:#0A0A0A;font-family:'Inter Tight',Inter,Vazirmatn,system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column;gap:calc(var(--u)*4);overflow:hidden;margin:0 auto}
.lbl{display:block;font-size:var(--lbl);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B;line-height:1.2}
.head{display:flex;justify-content:space-between;align-items:stretch;gap:calc(var(--u)*5);border-bottom:1px solid #0A0A0A;padding-bottom:calc(var(--u)*3)}
.lb-brand{display:flex;flex-direction:column;justify-content:space-between;gap:calc(var(--u)*3);min-width:0;flex:1}
.lab{display:flex;flex-direction:column;gap:calc(var(--u)*1.2);align-items:flex-start}
.lab img{width:auto;max-width:100%;object-fit:contain;object-position:left center;display:block}
[dir=rtl] .lab img{object-position:right center}
.labname{font-weight:600;color:#4B4B4B;letter-spacing:.01em;line-height:1.1}
.labname.wordmark{font-weight:800;color:#0A0A0A;letter-spacing:-.01em}
.who{display:flex;flex-direction:column;gap:calc(var(--u)*1.6);line-height:1.15;min-width:0}
.who b{display:block;font-weight:600;margin-top:calc(var(--u)*.5);overflow-wrap:anywhere}
.who .clinic{font-weight:800;font-size:1.18em;letter-spacing:-.01em}
.who .pt{display:flex;align-items:baseline;gap:calc(var(--u)*2)}
.who .pt b{margin:0}
.ini{font-weight:800}
.qrb{display:flex;flex-direction:column;align-items:stretch;flex:none}
.qr{background:#fff}
.qr svg,.qr img{width:100%;height:100%;display:block}
.no{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:700;text-align:center;letter-spacing:-.02em;margin-top:calc(var(--u)*1.6);white-space:nowrap;direction:ltr}
.dates{display:grid;grid-template-columns:1fr 1.25fr;border-bottom:1px solid #D4D4D4}
.dates>div{padding:0 0 calc(var(--u)*2);display:flex;flex-direction:column;gap:calc(var(--u)*.6);min-width:0}
.dates>div+div{padding-inline-start:calc(var(--u)*4);border-inline-start:1px solid #D4D4D4}
.dates b{font-weight:600;letter-spacing:-.01em}
.dates .due b{font-weight:800}
.dates em{font-style:normal;align-self:flex-start;font-size:max(.62em,calc(var(--u)*2.5));font-weight:800;letter-spacing:.14em;color:#C62828;border:1.5px solid #C62828;border-radius:999px;padding:.05em .55em;margin-top:.2em}
.work .wt{font-weight:300;letter-spacing:-.025em;line-height:1.05;margin-top:calc(var(--u)*.6)}
.work .wn{display:-webkit-inline-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.work small{font-weight:600;font-size:.55em;color:#6B6B6B;letter-spacing:0;white-space:nowrap}
.wextra{margin-top:calc(var(--u)*1.2);font-weight:600;color:#2C2C2C;line-height:1.3}
.cross{display:grid;grid-template-columns:1fr 1fr;align-self:center;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:700;direction:ltr}
.cross .q{display:flex;flex-wrap:wrap;gap:.45em;padding:.35em .6em;min-height:1.6em;align-items:center;align-content:center}
.cross .q.r{justify-content:flex-end;border-right:1.5px solid #0A0A0A}
.cross .q:nth-child(-n+2){border-bottom:1.5px solid #0A0A0A}
.cross .dash{color:#C4C4C4;font-weight:400}
.hnote{border-top:1px solid #D4D4D4;padding-top:calc(var(--u)*2)}
.note{line-height:1.4;color:#2C2C2C;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;margin-top:calc(var(--u)*1);white-space:pre-line;overflow-wrap:anywhere}
.ex{display:flex;flex-direction:column;gap:calc(var(--u)*2);margin-top:calc(var(--u)*1)}
.sec{border-bottom:1px solid #EAEAEA;padding-bottom:calc(var(--u)*1)}
.tbl{width:100%;border-collapse:collapse;font-size:calc(var(--u)*2.8)}
.tbl th{text-align:start;font-size:var(--lbl);letter-spacing:.12em;text-transform:uppercase;color:#6B6B6B;padding:calc(var(--u)*1) calc(var(--u)*2) calc(var(--u)*1) 0;border-bottom:1px solid #D4D4D4;font-weight:700}
.tbl td{padding:calc(var(--u)*1.2) calc(var(--u)*2) calc(var(--u)*1.2) 0;border-bottom:1px solid #EFEFEF;vertical-align:top}
.tbl .mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:700;white-space:nowrap;direction:ltr;text-align:start}
@media screen{
  html,body{background:var(--stage,#E9EDF2)}
  body{padding:24px 16px;min-height:100vh}
  .sheet{zoom:var(--fit,1);box-shadow:0 1px 2px rgba(15,23,42,.10),0 10px 28px rgba(15,23,42,.14)}
}
@media print{.sheet{box-shadow:none}}
`;

/** Önizleme penceresinde kağıdı genişliğe sığdırır; baskıyı etkilemez (`zoom` yalnız @media screen). */
const FIT_SCRIPT = `<script>(function(){function f(){var s=document.querySelector('.sheet');if(!s)return;var w=s.offsetWidth;var a=window.innerWidth-32;document.documentElement.style.setProperty('--fit',String(Math.min(1,a/w)));}window.addEventListener('resize',f);f();})();</script>`;

export function buildWorkLabelHtml(p: WorkLabelInput): string {
  const s = SIZES[p.size] ?? SIZES.A5;
  const t = p.t ?? ((x: string) => x);
  const locale = p.locale ?? 'tr-TR';
  const fontFamilies = 'family=Inter+Tight:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700'
    + (p.rtl ? '&family=Vazirmatn:wght@300;400;600;700;800' : '');
  const sheetStyle = `--lbl:${u(s.lbl)};width:${s.w}mm;height:${s.h}mm;padding:${s.pad}mm`;
  const body = head(p, s, t)
    + dates(p, s, t, locale)
    + work(p, s, t)
    + cross(p, s)
    + note(p, s, t)
    + (p.size === 'A4' ? opsTable(p, t) : '');
  const stage = p.screenBg ? `<style>:root{--stage:${esc(p.screenBg)}}</style>` : '';
  return `<!DOCTYPE html><html ${p.htmlAttrs ?? 'lang="tr" dir="ltr"'}><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(t('İş Emri'))} · ${esc(p.orderNumber)}</title>`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
    + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontFamilies}&display=swap">`
    + `<style>@page{size:${s.w}mm ${s.h}mm;margin:0}${CSS}</style>${stage}</head>`
    + `<body><div class="sheet size-${p.size}" style="${sheetStyle}">${body}</div>${FIT_SCRIPT}</body></html>`;
}
