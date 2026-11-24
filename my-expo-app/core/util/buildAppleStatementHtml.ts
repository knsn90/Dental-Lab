/**
 * Cari ekstre — kompakt, sade düzen (layout: 'apple'). Klinik ekstresi, ön ekstre ve iş dökümü kullanır;
 * tedarikçi/personel/makbuz klasik şablonda (buildCariStatementHtml) kalır.
 *
 * Tasarım (kullanıcı onayı 2026-11-24, "B: Apple style"):
 *  - Başlık: lab logosu/adı · belge türü (turuncu üst etiket) · klinik adı · hekim/alt bilgi.
 *  - Özet bandı: büyük kapanış bakiyesi + açılış/borç/alacak; ön ekstrede onay karekodu.
 *  - Tablo 4 sütun: Tarih·Belge | Açıklama + iş kalemleri | Toplam (altında "tutar − indirim + KDV") | Bakiye.
 *  - Hareket başına TEK <tr>: PDF dilimleyici (core/print/exportHtmlPdf) yalnız <tr> sınırında böler ve
 *    <thead>'i her sayfada yeniden çizer — bir fatura iki sayfaya bölünmez.
 *  - Sayfa numarası basılmaz (html2canvas yolu sayfa bilmez; sabit "Sayfa 1" yanlıştı).
 *  - Mantıksal CSS özellikleri (RTL: fa/ar). Metinler autoT ile.
 */
import { autoT } from '../i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../i18n/printLocale';
import type { CariStatementInput, CariLine, CariItem } from './buildCariStatementHtml';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const num = (n: unknown): number => Number(n) || 0;
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const SYMBOLS: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };
/** Belge para birimi simgesi — üretici başında ayarlanır (üretici eşzamanlı, tek seferde çalışır). */
let SYM = '';

function money(n: number): string {
  return SYM + Math.abs(num(n)).toLocaleString(printLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(printLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(printLocale(), { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Kalem alt bilgisinden satır başlığında zaten yazan parçaları atar (hasta/sipariş/hekim tekrarı). */
function itemExtras(it: CariItem, rowTexts: string[]): string {
  const parts = String(it.sub ?? '').split(' · ').map((p) => p.trim()).filter(Boolean);
  const hasQty = it.qty != null;
  return parts
    .filter((p) => !(hasQty && /^\d+([.,]\d+)?\s*×/.test(p)))
    .filter((p) => !rowTexts.some((t) => t.includes(p)))
    .join(' · ');
}

function itemsHtml(l: CariLine): string {
  const items = l.items ?? [];
  if (!items.length) return '';
  const rowTexts = [l.counterparty, l.counterpartySub].filter(Boolean).map(String);
  const multi = items.length > 1;
  return `<div class="items">${items.map((it) => {
    const extra = itemExtras(it, rowTexts);
    const qp = it.qty != null ? `${esc(it.qty)} × ${esc(money(num(it.unitPrice)))}` : '';
    const amt = multi && it.amount != null ? esc(money(num(it.amount))) : '';
    // Yapılandırılmamış kalem (eski üretici): alt bilgi olduğu gibi
    const legacy = it.qty == null && it.sub ? `<span class="x">${esc(it.sub)}</span>` : '';
    return `<div class="it"><span class="t">${esc(it.text)}${extra ? ` <span class="x">${esc(extra)}</span>` : ''}${legacy ? ' ' + legacy : ''}</span><span class="q">${qp}</span><span class="a">${amt}</span></div>`;
  }).join('')}</div>`;
}

export function buildAppleStatementHtml(input: CariStatementInput): string {
  const docTitle = input.documentTitle ?? autoT('Cari Hesap Ekstresi');
  const currency = input.currency || 'TRY';
  SYM = SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  const wb = input.workBreakdown === true;
  const paper = input.paper === true;
  const L = input.labels ?? {};
  const opening = num(input.openingBalance);
  const closing = num(input.closingBalance);
  const showVat = !!input.vatSummary;
  const hideOpening = input.hideOpening === true;
  const notice = input.notice ?? null;
  const approve = input.approve ?? null;
  const neutral = input.balanceTone === 'neutral';

  const period =
    wb && input.periodFrom && input.periodFrom === input.periodTo ? fmtDateLong(input.periodFrom)
      : input.periodFrom && input.periodTo ? `${fmtDateLong(input.periodFrom)} – ${fmtDateLong(input.periodTo)}`
        : input.periodFrom ? `${fmtDateLong(input.periodFrom)} ${autoT('ve sonrası')}`
          : input.periodTo ? `${fmtDateLong(input.periodTo)} ${autoT('ve öncesi')}`
            : autoT('Tüm dönem');

  const totalDebit = input.summaryTotals?.debit ?? input.lines.reduce((s, l) => s + (l.type === 'debit' ? l.amount + (showVat ? num(l.tax) : 0) : 0), 0);
  const totalCredit = input.summaryTotals?.credit ?? input.lines.reduce((s, l) => s + (l.type === 'credit' && l.kind !== 'discount' ? l.amount : 0), 0);
  const discSum = num(input.discountTotal);

  const balanceTag = (b: number): string => (neutral || input.hideBaBadges ? '' : b < -0.004 ? ` <span class="ba">${esc(autoT('alacak'))}</span>` : '');
  const toneOf = (b: number): string => (neutral ? '' : b > 0.004 ? 'debit' : b < -0.004 ? 'credit' : '');

  // Satır hesabı: tutar (indirimsiz, KDV hariç) − indirim + KDV = toplam
  const calcOf = (l: CariLine): string => {
    const tax = showVat ? num(l.tax) : 0;
    const disc = num(l.discountAmount);
    const net = showVat ? l.amount : l.amount - 0;
    const parts: string[] = [];
    if (disc > 0.004 || tax > 0.004) parts.push(money(net + disc));
    if (disc > 0.004) parts.push(`− ${money(disc)} ${autoT('indirim')}`);
    if (showVat) {
      if (tax > 0.004) parts.push(`+ ${money(tax)} ${autoT('KDV')}${num(l.taxRate) > 0 ? ` %${esc(l.taxRate)}` : ''}`);
      else parts.push(parts.length ? `· ${autoT('KDV yok')}` : autoT('KDV yok'));
    }
    return parts.join(' ');
  };

  // Tüm satırlarda aynı olan durum (ör. ön ekstrede hep "Taslak") bilgi taşımaz → gizle
  const refs = new Set(input.lines.map((l) => l.reference ?? ''));
  const uniformRef = input.lines.length > 1 && refs.size === 1;
  const uniformNo = input.lines.length > 1 && new Set(input.lines.map((l) => l.refNo ?? '')).size === 1;

  let sumNet = 0, sumDisc = 0, sumTax = 0;
  const rows = input.lines.map((l) => {
    const isCredit = l.type === 'credit';
    const isDisc = l.kind === 'discount';
    const total = isCredit ? l.amount : l.amount + (showVat ? num(l.tax) : 0);
    if (!isCredit) { sumNet += l.amount; sumDisc += num(l.discountAmount); sumTax += showVat ? num(l.tax) : 0; }
    const calc = isCredit ? '' : calcOf(l);
    const totalHtml = isCredit
      ? `<div class="tot credit">− ${esc(money(total))}</div>${isDisc ? `<div class="calc">${esc(autoT('indirim'))}</div>` : ''}`
      : `<div class="tot">${esc(money(total))}</div>${calc ? `<div class="calc">${esc(calc)}</div>` : ''}`;
    return `<tr${isCredit ? ' class="cr"' : ''}>
      <td class="c-doc"><div class="d">${esc(fmtDate(l.date))}</div>${l.refNo && !uniformNo ? `<div class="no">${esc(l.refNo)}</div>` : ''}${l.reference && !uniformRef ? `<div class="ref">${esc(l.reference)}</div>` : ''}</td>
      <td class="c-desc"><div class="p">${esc(l.counterparty ?? '')}${l.counterpartySub ? ` <span class="o">${esc(l.counterpartySub)}</span>` : ''}</div>${itemsHtml(l)}</td>
      <td class="c-tot">${totalHtml}</td>
${wb ? '' : `      <td class="c-bal"><div class="bal">${esc(money(l.balance))}${balanceTag(l.balance)}</div></td>
`}    </tr>`;
  }).join('');

  const empty = `<tr><td colspan="${wb ? 3 : 4}" class="empty">${esc(autoT('Bu dönemde hareket bulunmuyor.'))}</td></tr>`;

  // Toplam satırı hesabı: KDV dökümü varsa onunla (ekran ve PDF aynı tanım)
  const net = showVat ? num(input.vatSummary!.net) : r2(sumNet);
  const tax = showVat ? num(input.vatSummary!.tax) : 0;
  // Toplamlar bloğu: KDV hariç → indirim → KDV → KDV dahil; sonra tahsilat/indirim → kapanış
  type SumRow = { k: string; v: string; cls?: string };
  const sumRows: SumRow[] = [];
  const neg = (v: number) => `− ${money(v)}`;
  if (sumDisc > 0.004) {
    sumRows.push({ k: autoT('Ara toplam (KDV hariç)'), v: money(net + sumDisc) });
    sumRows.push({ k: autoT('İndirim'), v: neg(sumDisc), cls: 'credit' });
  }
  if (showVat) {
    sumRows.push({ k: autoT('KDV hariç toplam'), v: money(net), cls: sumDisc > 0.004 ? 'sub' : '' });
    sumRows.push({ k: autoT('KDV'), v: money(tax) });
  }
  sumRows.push({ k: showVat ? autoT('Genel toplam (KDV dahil)') : autoT('Genel toplam'), v: money(totalDebit), cls: 'strong' });
  if (!wb) {
    const hasMoves = totalCredit > 0.004 || discSum > 0.004 || (!hideOpening && Math.abs(opening) > 0.004);
    if (!hideOpening && Math.abs(opening) > 0.004) sumRows.push({ k: L.opening ?? autoT('Açılış bakiyesi'), v: money(opening) });
    if (totalCredit > 0.004) sumRows.push({ k: L.credit ?? autoT('Tahsilat ve alacaklar'), v: neg(totalCredit), cls: 'credit' });
    if (discSum > 0.004) sumRows.push({ k: autoT('Ekstre indirimleri'), v: neg(discSum), cls: 'credit' });
    if (hasMoves) sumRows.push({ k: L.closing ?? autoT('Kapanış bakiyesi'), v: money(closing) + balanceTag(closing).replace(/<[^>]+>/g, ''), cls: `strong ${toneOf(closing)}` });
  }
  const sumsHtml = `  <div class="sums">${sumRows.map((r) => `<div class="sum ${r.cls ?? ''}"><span class="sk">${esc(r.k)}</span><span class="sv">${esc(r.v)}</span></div>`).join('')}</div>`;

  const closingLbl = wb ? autoT('Fatura toplamı') : (L.closing ?? autoT('Kapanış bakiyesi'));
  const closingVal = wb ? totalDebit : closing;
  const closingHint = wb ? '' : L.closingHint !== undefined ? L.closingHint
    : neutral ? '' : closing > 0.004 ? autoT('borç') : closing < -0.004 ? autoT('alacak') : autoT('hesap eşit');
  const holderLines = (input.holder.addressLines ?? []).filter(Boolean) as string[];
  const subLine = [...holderLines, `${input.lines.length} ${wb ? autoT('kalem') : autoT('hareket')}`].join(' · ');

  const stat = (k: string, v: number) => `<div class="st"><div class="k">${esc(k)}</div><div class="v">${esc(money(v))}</div></div>`;

  return `<!DOCTYPE html>
<html ${htmlAttrs()}>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&display=swap" rel="stylesheet">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)} — ${esc(input.holder.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  :root { --label:#1D1D1F; --sec:#6E6E73; --ter:#9A9AA0; --sep:rgba(60,60,67,.16); --fill:#F5F5F7;
          --navy:#1B2F55; --debit:#C9342B; --credit:#1F8A5B; --orange:#B25000; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: 'Inter', -apple-system, 'SF Pro Text', system-ui, sans-serif; color: var(--label);
         font-size: 10.5px; line-height: 1.35; background: ${paper ? '#FFFFFF' : '#ECECEF'};
         -webkit-font-smoothing: antialiased; }
  .page { background: #FFFFFF; ${paper ? '' : 'max-width: 860px; margin: 24px auto; padding: 36px 40px; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08);'} }
  .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center;
             padding: 10px 20px; background: rgba(29,29,31,.92); color: #fff; }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; }
  .toolbar button { font: inherit; font-size: 12px; font-weight: 600; padding: 7px 14px; border-radius: 999px; border: 0; cursor: pointer; }
  .toolbar .btn-print { background: #FFFFFF; color: var(--label); }
  .toolbar .btn-close { background: rgba(255,255,255,.14); color: #fff; }
  @media print { .toolbar { display: none; } body { background: #fff; } .page { margin: 0; padding: 0; box-shadow: none; max-width: none; } }

  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .brand img { max-height: 34px; max-width: 160px; object-fit: contain; display: block; }
  .brand .name { font-size: 14px; font-weight: 700; letter-spacing: .04em; color: var(--navy); }
  .meta { text-align: end; font-size: 9px; color: var(--sec); line-height: 1.5; }
  .eyebrow { margin-top: 18px; font-size: 8.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: ${notice ? 'var(--orange)' : 'var(--sec)'}; }
  h1 { font-size: 21px; font-weight: 600; letter-spacing: -.015em; line-height: 1.3; margin-top: 2px; }
  .sub { font-size: 10px; color: var(--sec); margin-top: 2px; line-height: 1.4; }

  .hero { display: flex; gap: 22px; align-items: center; margin-top: 14px; padding: 13px 16px; background: var(--fill); border-radius: 12px; }
  .hero .k { font-size: 8px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--sec); }
  .hero .big { font-size: 25px; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; margin-top: 2px; white-space: nowrap; }
  .hero .big .u { font-size: 11.5px; font-weight: 500; letter-spacing: 0; color: var(--sec); margin-inline-start: 4px; }
  .hero .grow { flex: 1; }
  .hero .st .v { font-size: 11.5px; font-weight: 500; margin-top: 4px; white-space: nowrap; }
  .hero .qr { display: flex; gap: 8px; align-items: center; max-width: 190px; }
  .hero .qr svg { width: 58px; height: 58px; display: block; flex: none; }
  .hero .qr .cap { font-size: 7.5px; font-weight: 600; color: var(--label); line-height: 1.3; }
  .hero .qr .url { font-size: 6.5px; color: var(--ter); margin-top: 2px; word-break: break-all; line-height: 1.25; }
  .debit { color: var(--debit); } .credit { color: var(--credit); }
  .note { font-size: 9.5px; color: var(--sec); margin-top: 8px; }
  .note b { color: var(--orange); font-weight: 600; }

  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead th { font-size: 8px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ter);
             text-align: start; padding: 0 4px 5px; border-bottom: .75px solid var(--sep); background: #FFFFFF; }
  thead th.n { text-align: end; }
  tbody td { padding: 7px 4px; border-bottom: .75px solid var(--sep); vertical-align: top; }
  td.c-doc { width: 96px; }
  td.c-tot { width: 176px; text-align: end; }
  td.c-bal { width: 84px; text-align: end; }
  .d { font-weight: 500; white-space: nowrap; }
  .no { font-size: 9px; color: var(--sec); margin-top: 1px; white-space: nowrap; }
  .ref { font-size: 8.5px; color: var(--ter); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 96px; }
  .p { font-weight: 600; }
  .o { font-weight: 400; color: var(--ter); font-size: 9.5px; margin-inline-start: 3px; }
  .items { margin-top: 2px; }
  .it { display: flex; gap: 8px; font-size: 9.5px; color: var(--sec); margin-top: 1px; }
  .it .t { flex: 1; min-width: 0; }
  .it .x { color: var(--ter); }
  .it .q { color: var(--ter); white-space: nowrap; }
  .it .a { min-width: 52px; text-align: end; white-space: nowrap; }
  .tot { font-weight: 600; font-size: 11px; white-space: nowrap; }
  .calc { font-size: 8.5px; color: var(--ter); margin-top: 2px; white-space: nowrap; }
  .bal { font-weight: 500; color: var(--sec); white-space: nowrap; }
  .ba { font-size: 8px; color: var(--credit); font-weight: 600; }
  tr.cr .p { font-weight: 500; }
  td.empty { text-align: center; color: var(--ter); padding: 32px 0; font-style: italic; }
  .sums { margin-top: 12px; margin-inline-start: auto; width: 290px; }
  .sum { display: flex; justify-content: space-between; gap: 12px; padding: 3px 4px; font-size: 10px; color: var(--sec); line-height: 1.4; }
  .sum .sv { color: var(--label); white-space: nowrap; }
  .sum.credit .sv { color: var(--credit); }
  .sum.sub { border-top: .75px solid var(--sep); padding-top: 5px; margin-top: 2px; }
  .sum.strong { border-top: .75px solid var(--sep); padding-top: 6px; margin-top: 3px; font-weight: 600; color: var(--label); font-size: 11px; }
  .sum.strong .sv { font-size: 12px; }
  .sum.strong.debit .sv { color: var(--debit); } .sum.strong.credit .sv { color: var(--credit); }
  .legend { margin-top: 20px; padding-bottom: 14px; line-height: 1.5; font-size: 8.5px; color: var(--ter); display: flex; justify-content: space-between; gap: 12px; }
</style>
</head>
<body>
${paper ? '' : `<div class="toolbar">
  <span class="title">${esc(docTitle)} · ${esc(input.holder.name)}</span>
  <button class="btn-print" onclick="window.print()">${esc(autoT('Yazdır / PDF Kaydet'))}</button>
  <button class="btn-close" onclick="window.close()">${esc(autoT('Kapat'))}</button>
</div>
`}<div class="page">
  <div class="top">
    <div class="brand">${input.lab.logoUrl
      ? `<img src="${esc(input.lab.logoUrl)}" alt="${esc(input.lab.name)}" />`
      : `<div class="name">${esc(input.lab.name)}</div>`}</div>
    <div class="meta">${esc(autoT('Düzenlenme'))} ${esc(new Date().toLocaleDateString(printLocale(), { day: '2-digit', month: 'long', year: 'numeric' }))}<br>${esc(period)} · ${esc(currency)}</div>
  </div>
  <div class="eyebrow">${esc(docTitle)}${notice ? ` · ${esc(autoT('Onay bekliyor'))}` : ''}</div>
  <h1>${esc(input.holder.name)}</h1>
  <div class="sub">${esc(subLine)}</div>

  <div class="hero">
    <div><div class="k">${esc(closingLbl)}</div><div class="big ${wb ? '' : toneOf(closingVal)}">${esc(money(closingVal))}${closingHint ? `<span class="u">${esc(closingHint)}</span>` : ''}</div></div>
    <div class="grow"></div>
    ${wb || hideOpening ? '' : stat(L.opening ?? autoT('Açılış'), opening)}
    ${wb ? '' : stat(L.debit ?? autoT('Borç'), totalDebit)}
    ${wb ? '' : stat(L.credit ?? autoT('Alacak'), totalCredit)}
    ${!wb && discSum > 0.004 ? stat(autoT('İndirimler'), discSum) : ''}
    ${approve ? `<div class="qr">${approve.qrSvg ?? ''}<div><div class="cap">${esc(approve.caption)}</div><div class="url">${esc(approve.url)}</div></div></div>` : ''}
  </div>
${notice ? `  <div class="note"><b>${esc(notice.title)}.</b>${notice.text ? ' ' + esc(notice.text) : ''}</div>
` : ''}
  <table>
    <thead><tr>
      <th>${esc(autoT('Tarih · Belge'))}</th>
      <th>${esc(L.party ?? autoT('Açıklama'))}</th>
      <th class="n">${esc(showVat ? autoT('Toplam (KDV dahil)') : autoT('Tutar'))}</th>
${wb ? '' : `      <th class="n">${esc(autoT('Bakiye'))}</th>
`}    </tr></thead>
    <tbody>${rows || empty}</tbody>
  </table>

${sumsHtml}
  <!-- Footer -->
  <div class="legend foot"><span>${esc(autoT('Tutarlar'))} ${esc(currency)}${showVat ? ' · ' + esc(autoT('Toplam = tutar − indirim + KDV')) : ''}</span><span>${input.copyright ?? `© ${esc(input.lab.name)} ${new Date().getFullYear()}`}</span></div>
</div>
</body>
</html>`;
}
