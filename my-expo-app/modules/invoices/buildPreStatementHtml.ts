/**
 * Ön ekstre PDF HTML üreticileri (özet + ayrıntılı). A4, her zaman açık renk (kâğıt).
 *
 * Saf dosya: `node --test` ile çalışır, bu yüzden yerel içe aktarma yalnız `import type`.
 * Çalışma zamanı yardımcıları (autoT / printLocale / baseSymbol) buradan ÇAĞRILMAZ; çağıran
 * `input.i18n` ile verir (bkz. PreStatementI18n; zorunlu — Türkçe yedek yok).
 * Gruplama/pay mantığı lib/preStatementPdf.ts ile aynıdır (node, uzantısız yerel içe aktarmayı çözemez).
 * Değiştirirsen ikisini birden değiştir; parity testi korur.
 *
 * KVKK: hasta yalnız `patient_initials`; not içerikleri yazılmaz, yalnız sayısı.
 */
import type { PreStatement, PreStatementInvoice, PreStatementItem } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';

export interface PreStatementI18n {
  /** autoT: Türkçe kaynak metni aktif dile çevirir */
  t: (s: string) => string;
  /** printLocale() — tarih/sayı biçimi için */
  locale: string;
  /** htmlAttrs() — `lang="…" dir="…"` */
  htmlAttrs: string;
}

export type PreStatementPdfInput = {
  clinicName: string;
  lab: LabLetterhead;
  data: PreStatement;
  generatedAt: string;
  approve?: { url: string; qrSvg?: string; expiresAt: string };
  i18n: PreStatementI18n;
};

// ── Yardımcılar ──────────────────────────────────────────────────────
const NO_DOCTOR = '—';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SYMBOLS: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };

interface Ctx { t: (s: string) => string; locale: string; attrs: string }

function ctxOf(input: PreStatementPdfInput): Ctx {
  const i = input.i18n;
  return { t: i.t, locale: i.locale, attrs: i.htmlAttrs };
}

function fmtMoney(c: Ctx, amount: unknown, currency: string): string {
  const n = Number(amount) || 0;
  const sym = SYMBOLS[currency] ?? currency;
  return `${n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}

function fmtDate(c: Ctx, iso: string | null | undefined, long = false): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(c.locale, { day: '2-digit', month: long ? 'long' : '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

interface PdfItem extends PreStatementItem { invoice_date: string | null; currency: string; share: number }
interface Group { doctor: string; items: PdfItem[]; subtotal: Record<string, number>; net: Record<string, number> }

/** Fatura toplamını kalem net'leriyle orantılı, en büyük kalan yöntemiyle kuruşu kuruşuna dağıtır (lib ile aynı). */
function itemShares(inv: PreStatementInvoice): Map<string, number> {
  const items = inv.items ?? [];
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const cents = Math.round((Number(inv.total) || 0) * 100);
  const nets = items.map((it) => Number(it.total) || 0);
  const sumNet = nets.reduce((a, b) => a + b, 0);
  const raw = nets.map((n) => (sumNet === 0 ? cents / items.length : (cents * n) / sumNet));
  const base = raw.map((x) => Math.floor(x + 1e-9));
  let left = cents - base.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - base[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) base[order[k].i] += 1;
  items.forEach((it, i) => out.set(it.id, base[i] / 100));
  return out;
}

function roundRec(rec: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(rec)) o[k] = r2(rec[k]);
  return o;
}

function groups(invoices: PreStatementInvoice[]): Group[] {
  const map = new Map<string, { items: PdfItem[]; sub: Record<string, number>; net: Record<string, number> }>();
  for (const inv of invoices) {
    const ccy = inv.currency || 'TRY';
    const shares = itemShares(inv);
    for (const it of inv.items ?? []) {
      const name = (it.doctor_name ?? '').trim() || NO_DOCTOR;
      let g = map.get(name);
      if (!g) { g = { items: [], sub: {}, net: {} }; map.set(name, g); }
      const share = shares.get(it.id) ?? 0;
      g.items.push({ ...it, invoice_date: inv.issue_date ?? null, currency: ccy, share });
      g.sub[ccy] = (g.sub[ccy] ?? 0) + share;
      g.net[ccy] = (g.net[ccy] ?? 0) + (Number(it.total) || 0);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([doctor, g]) => ({ doctor, items: g.items, subtotal: roundRec(g.sub), net: roundRec(g.net) }));
}

function workTotals(invoices: PreStatementInvoice[]): { work: string; currency: string; quantity: number; total: number }[] {
  const map = new Map<string, { work: string; currency: string; quantity: number; total: number }>();
  for (const inv of invoices) {
    const ccy = inv.currency || 'TRY';
    const shares = itemShares(inv);
    for (const it of inv.items ?? []) {
      const work = (it.description ?? '').trim() || NO_DOCTOR;
      const key = `${ccy}\u0000${work}`;
      const e = map.get(key) ?? { work, currency: ccy, quantity: 0, total: 0 };
      e.quantity += Number(it.quantity) || 0;
      e.total += shares.get(it.id) ?? 0;
      map.set(key, e);
    }
  }
  return [...map.values()].map((e) => ({ ...e, total: r2(e.total) })).sort((a, b) => b.total - a.total);
}

/** Fatura total'larının para birimi başına toplamı (lib.pendingTotal ile aynı). */
function pendingOf(invoices: PreStatementInvoice[]): Record<string, number> {
  const rec: Record<string, number> = {};
  for (const i of invoices) { const c = i.currency || 'TRY'; rec[c] = (rec[c] ?? 0) + (Number(i.total) || 0); }
  return roundRec(rec);
}

/** Yalnız parity testi içindir. */
export const _groupsForTest = groups;
export const _workTotalsForTest = workTotals;

// ── Stil ─────────────────────────────────────────────────────────────
const CSS = `
  @page { size: A4; margin: 16mm 14mm }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0; background: #fff }
  body { color: #111; font-family: Inter, -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif; font-size: 11px; line-height: 1.45; -webkit-text-size-adjust: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 12px }
  .lab b { font-size: 15px }
  .lab div { color: #555 }
  .logo { height: 36px; max-width: 140px; object-fit: contain; margin-bottom: 4px; display: block }
  .doc { text-align: end }
  .doc h1 { font-size: 18px; font-weight: 300; letter-spacing: -.4px; margin: 0 0 4px }
  .doc div { color: #555 }
  .qr { text-align: center; width: 120px; margin-inline-start: auto }
  .qr svg { width: 84px; height: 84px; display: block; margin: 0 auto 4px }
  .qr .u { word-break: break-all; font-size: 7.5px; color: #333 }
  .qr .c { font-size: 8.5px; color: #555; margin-top: 3px }
  .band { margin: 12px 0; border: 1.5px dashed #B7791F; border-radius: 6px; padding: 7px 12px; color: #B7791F; font-weight: 700; letter-spacing: 1px; font-size: 11px; text-align: center }
  .parties { margin: 8px 0 12px; display: flex; gap: 24px }
  .lbl { font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #777; font-weight: 700; margin-bottom: 2px }
  .sums { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 16px }
  .sum { display: flex; border: 1px solid #ddd; border-radius: 6px; break-inside: avoid; page-break-inside: avoid }
  .sum > div { flex: 1; padding: 8px 10px; border-inline-end: 1px solid #ddd }
  .sum > div:last-child { border-inline-end: 0 }
  .sum b { display: block; font-size: 14px; font-weight: 600; margin-top: 2px }
  .sum .cur { flex: 0 0 56px; font-weight: 700; color: #555; display: flex; align-items: center; justify-content: center }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #333; margin: 16px 0 6px }
  table { width: 100%; border-collapse: collapse }
  thead { display: table-header-group }
  tr { break-inside: avoid; page-break-inside: avoid }
  th { font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; color: #777; text-align: start; padding: 6px; border-bottom: 1.5px solid #111 }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top }
  .r { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap }
  .m { color: #777; font-size: 9.5px }
  .sub td { font-weight: 700; background: #F5F5F4; border-top: 1px solid #ddd }
  .doctor { break-inside: avoid-column; margin-top: 14px }
  .doctor h3 { font-size: 12px; margin: 0 0 4px; break-after: avoid; page-break-after: avoid }
  .badge { display: inline-block; font-size: 8.5px; font-weight: 700; border: 1px solid #B7791F; color: #B7791F; border-radius: 3px; padding: 0 4px; margin-inline-end: 3px }
  .badge.ok { border-color: #2F855A; color: #2F855A }
  .foot { display: flex; justify-content: space-between; margin-top: 22px; padding-top: 8px; border-top: 1px solid #ddd; color: #777; font-size: 9px }
  .note { font-size: 9.5px; color: #555; margin-top: 6px }
`;

// ── Ortak parçalar ───────────────────────────────────────────────────
function header(input: PreStatementPdfInput, c: Ctx, title: string): string {
  const { lab } = input;
  const logo = lab.logo_url ? `<img class="logo" src="${esc(lab.logo_url)}" alt="" style="height:36px">` : '';
  const lines = [lab.address, [lab.phone, lab.email].filter(Boolean).join(' · '), lab.tax_number ? `${c.t('VKN')} ${lab.tax_number}` : '']
    .filter((x) => x && String(x).trim());
  const qr = input.approve
    ? `<div class="qr">${input.approve.qrSvg ?? ''}<div class="u">${esc(input.approve.url)}</div>`
      + `<div class="c">${esc(c.t('Onaylamak için karekodu okutun'))} · ${esc(c.t('Son geçerlilik'))}: ${esc(fmtDate(c, input.approve.expiresAt))}</div></div>`
    : '';
  return `
  <div class="top">
    <div class="lab">${logo}<b>${esc(lab.name)}</b>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    <div class="doc"><h1>${esc(title)}</h1><div>${esc(c.t('Klinik'))}: ${esc(input.clinicName)}</div><div>${esc(c.t('Oluşturma'))}: ${esc(fmtDate(c, input.generatedAt, true))}</div></div>
    ${qr}
  </div>
  <div class="band">${esc(c.t('Ön ekstre — onay bekliyor'))}</div>`;
}

function summaryBlock(input: PreStatementPdfInput, c: Ctx): string {
  const rows = input.data.summary.map((s) => {
    const cells: string[] = [];
    if (s.finalized_balance !== null && s.finalized_balance !== undefined) {
      cells.push(`<div><span class="lbl">${esc(c.t('Kesinleşmiş bakiye'))}</span><b>${esc(fmtMoney(c, s.finalized_balance, s.currency))}</b></div>`);
    }
    if (s.overdue !== null && s.overdue !== undefined) {
      cells.push(`<div><span class="lbl">${esc(c.t('Vadesi geçen'))}</span><b style="color:#B91C1C">${esc(fmtMoney(c, s.overdue, s.currency))}</b></div>`);
    }
    cells.push(`<div><span class="lbl">${esc(c.t('Onay bekleyen'))}</span><b>${esc(fmtMoney(c, s.pending, s.currency))}</b></div>`);
    return `<div class="sum"><div class="cur">${esc(s.currency)}</div>${cells.join('')}</div>`;
  });
  return `<div class="sums">${rows.join('')}</div>`;
}

function moneyRec(c: Ctx, rec: Record<string, number>): string {
  return Object.keys(rec).sort().map((k) => esc(fmtMoney(c, rec[k], k))).join('<br>');
}

function doctorTotalsTable(gs: Group[], c: Ctx): string {
  return `<h2>${esc(c.t('Hekim toplamları'))}</h2>
  <table><thead><tr><th>${esc(c.t('Hekim'))}</th><th class="r">${esc(c.t('Kalem'))}</th><th class="r">${esc(c.t('Tutar (KDV dahil)'))}</th></tr></thead><tbody>
  ${gs.map((g) => `<tr><td>${esc(g.doctor)}</td><td class="r">${g.items.length}</td><td class="r">${moneyRec(c, g.subtotal)}</td></tr>`).join('')}
  </tbody></table>`;
}

function footer(input: PreStatementPdfInput, c: Ctx): string {
  return `<div class="foot"><span>${esc(input.lab.name)} · ${esc(c.t('Siman ile oluşturuldu'))}</span><span>${esc(c.t('Hasta: baş harfler (KVKK)'))}</span></div>`;
}

function wrap(c: Ctx, title: string, body: string): string {
  return `<!doctype html><html ${c.attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

// ── Özet PDF ─────────────────────────────────────────────────────────
export function buildPreStatementSummaryHtml(input: PreStatementPdfInput): string {
  const c = ctxOf(input);
  const invs = input.data.invoices;
  const gs = groups(invs);
  const works = workTotals(invs);
  const title = c.t('Ön ekstre');
  const invRows = invs.map((i) => {
    const disputes = (i.items ?? []).filter((x) => x.dispute_status === 'acik').length;
    const ccy = i.currency || 'TRY';
    return `<tr><td>${esc(fmtDate(c, i.issue_date ?? i.created_at))}</td><td class="r">${(i.items ?? []).length}</td>`
      + `<td class="r">${esc(fmtMoney(c, i.subtotal, ccy))}</td><td class="r">${esc(fmtMoney(c, i.tax, ccy))}</td>`
      + `<td class="r">${esc(fmtMoney(c, i.total, ccy))}</td><td class="r">${disputes}</td></tr>`;
  }).join('');
  const body = `${header(input, c, title)}
  ${summaryBlock(input, c)}
  ${doctorTotalsTable(gs, c)}
  <h2>${esc(c.t('İş türü toplamları'))}</h2>
  <table><thead><tr><th>${esc(c.t('İş'))}</th><th class="r">${esc(c.t('Adet'))}</th><th class="r">${esc(c.t('Tutar (KDV dahil)'))}</th></tr></thead><tbody>
  ${works.map((w) => `<tr><td>${esc(w.work)}</td><td class="r">${w.quantity}</td><td class="r">${esc(fmtMoney(c, w.total, w.currency))}</td></tr>`).join('')}
  </tbody></table>
  <h2>${esc(c.t('Faturalar'))}</h2>
  <table><thead><tr><th>${esc(c.t('Tarih'))}</th><th class="r">${esc(c.t('Kalem'))}</th><th class="r">${esc(c.t('Ara toplam'))}</th><th class="r">${esc(c.t('KDV'))}</th><th class="r">${esc(c.t('Toplam'))}</th><th class="r">${esc(c.t('İtiraz'))}</th></tr></thead><tbody>
  ${invRows}
  </tbody></table>
  ${footer(input, c)}`;
  return wrap(c, `${title} — ${input.clinicName}`, body);
}

/** Hekim bölümü sonu: Ara toplam (net) · KDV ve indirim payı (0 ise yok) · Hekim toplamı (pay toplamı). */
function subtotalRows(g: Group, c: Ctx): string {
  const diff: Record<string, number> = {};
  for (const k of Object.keys(g.subtotal)) { const d = r2(g.subtotal[k] - (g.net[k] ?? 0)); if (d !== 0) diff[k] = d; }
  const row = (label: string, rec: Record<string, number>, attr = '') =>
    `<tr class="sub"${attr}><td colspan="6">${esc(c.t(label))}</td><td class="r" colspan="2">${moneyRec(c, rec)}</td></tr>`;
  return row('Ara toplam', g.net)
    + (Object.keys(diff).length ? row('KDV ve indirim payı', diff) : '')
    + row('Hekim toplamı', g.subtotal, ' data-doctor-subtotal');
}

// ── Ayrıntılı PDF ────────────────────────────────────────────────────
export function buildPreStatementDetailHtml(input: PreStatementPdfInput): string {
  const c = ctxOf(input);
  const gs = groups(input.data.invoices);
  const title = c.t('Ön ekstre');
  const status = (it: PdfItem): string => {
    const parts: string[] = [];
    if (it.dispute_status === 'acik') parts.push(`<span class="badge">${esc(c.t('İtiraz'))}</span>`);
    else if (it.dispute_status === 'yanitlandi') parts.push(`<span class="badge">${esc(c.t('Yanıtlandı'))}</span>`);
    else if (it.dispute_status === 'cozuldu') parts.push(`<span class="badge ok">${esc(c.t('Çözüldü'))}</span>`);
    const n = (it.notes ?? []).length;
    if (n > 0) parts.push(`<span class="m">${n} ${esc(c.t('not'))}</span>`);
    return parts.join(' ');
  };
  const sections = gs.map((g) => `
  <div class="doctor">
    <h3>${esc(g.doctor)}</h3>
    <table><thead><tr><th>${esc(c.t('Tarih'))}</th><th>${esc(c.t('Sipariş no'))}</th><th>${esc(c.t('Hasta'))}</th><th>${esc(c.t('İş'))}</th><th class="r">${esc(c.t('Adet'))}</th><th class="r">${esc(c.t('Birim fiyat'))}</th><th class="r">${esc(c.t('Tutar'))}</th><th>${esc(c.t('Durum'))}</th></tr></thead><tbody>
    ${g.items.map((it) => `<tr data-item><td>${esc(fmtDate(c, it.invoice_date))}</td><td>${esc(it.order_no)}</td><td>${esc(it.patient_initials)}</td><td>${esc(it.description)}</td><td class="r">${esc(it.quantity)}</td><td class="r">${esc(fmtMoney(c, it.unit_price, it.currency))}</td><td class="r">${esc(fmtMoney(c, it.total, it.currency))}</td><td>${status(it)}</td></tr>`).join('')}
    ${subtotalRows(g, c)}
    </tbody></table>
  </div>`).join('');
  const body = `${header(input, c, `${title} — ${c.t('Ayrıntılı')}`)}
  ${summaryBlock(input, c)}
  ${doctorTotalsTable(gs, c)}
  ${sections}
  ${Object.entries(pendingOf(input.data.invoices)).sort((a, b) => a[0].localeCompare(b[0])).map(([ccy, v]) =>
    `<table><tbody><tr class="sub" data-grand-total><td>${esc(c.t('Genel toplam'))} · ${esc(ccy)}</td><td class="r">${esc(fmtMoney(c, v, ccy))}</td></tr></tbody></table>`).join('')}
  ${footer(input, c)}`;
  return wrap(c, `${title} — ${input.clinicName}`, body);
}
