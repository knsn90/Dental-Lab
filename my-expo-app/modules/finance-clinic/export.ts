/**
 * Mali İşlemler — Cari Ekstre dışa aktarım.
 *
 * Web odaklı: HTML→Excel (xls) stillenebilir tablo + window.print() PDF için.
 * Native fallback'i basitçe Share API'sine veriyi yolluyor (placeholder).
 *
 * Excel tarafı için "HTML→.xls" tekniği kullanıldı — Excel HTML'i import eder,
 * inline CSS'i renkler/borderlar/font ağırlıkları için saygı duyar.
 */

import { Platform } from 'react-native';
import type { StatementLine } from './api';
import { baseSymbol, getBaseCurrency } from '../../core/money/baseCurrency';
import { rateToBase } from '../../core/money/rateCache';
import { CURRENCY_META, type Currency } from '../../core/money/currency';

/** Satırın kendi para birimi sembolü (debit/credit çevirisiz gösterilir). */
const sym = (cur?: string | null): string =>
  CURRENCY_META[(cur || getBaseCurrency()) as Currency]?.symbol ?? (cur || baseSymbol());

export type ExportContext = {
  clinicName?: string | null;
  labName?: string | null;
  rangeLabel: string;       // 'Bu Ay', 'Geçen Ay', 'Özel (2026-01-01 → 2026-05-30)' vb.
  doctorLabel: string;      // 'Tüm Hekimler' veya hekim adı
  kindLabel: string;        // 'Tümü' / 'Fatura' / 'Tahsilat'
  generatedAt: Date;
};

const fmtMoney = (n: number): string =>
  (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTR = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const fmtDateTime = (d: Date) =>
  d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) +
  ' · ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/* ────────────────────────────────────────────────────────────────────── */
/*  Ortak HTML şablonu — hem Excel hem PDF için kullanılır                */
/* ────────────────────────────────────────────────────────────────────── */

function buildHtml(
  lines: StatementLine[],
  opening: number,
  ctx: ExportContext,
  variant: 'excel' | 'pdf',
): string {
  // Satır debit/credit kendi para biriminde; toplamlar/bakiye BAZ para biriminde
  // (çok-para-birimli net → bugünün kuruyla baz'a çevrilip toplanır). baz=TRY.
  const B = baseSymbol();
  const totalDebit  = lines.reduce((s, l) => s + l.debit  * rateToBase(l.currency), 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit * rateToBase(l.currency), 0);
  const closing     = lines.length > 0 ? lines[lines.length - 1].balance : opening;

  // PDF varyasyonu için modern CSS, Excel için inline minimal stiller
  const rows = lines.map(l => {
    const isInvoice = l.kind === 'invoice';
    return `
      <tr>
        <td class="cell-date">${fmtDateTR(l.date)}</td>
        <td class="cell-kind">
          <span class="kind-badge ${isInvoice ? 'kind-invoice' : 'kind-payment'}">
            ${isInvoice ? 'Fatura' : 'Tahsilat'}
          </span>
        </td>
        <td class="cell-desc">
          <div class="desc-main">${escapeHtml(l.description)}</div>
          ${l.doctor_name ? `<div class="desc-sub">${escapeHtml(l.doctor_name)}</div>` : ''}
        </td>
        <td class="cell-no">${escapeHtml(l.invoice_no ?? '')}</td>
        <td class="cell-debit">${l.debit > 0 ? fmtMoney(l.debit) + ' ' + sym(l.currency) : ''}</td>
        <td class="cell-credit">${l.credit > 0 ? fmtMoney(l.credit) + ' ' + sym(l.currency) : ''}</td>
        <td class="cell-balance ${l.balance > 0 ? 'bal-pos' : 'bal-zero'}">${fmtMoney(l.balance)} ${B}</td>
      </tr>
    `;
  }).join('');

  // Excel için sade, PDF için modern stil
  const isExcel = variant === 'excel';

  const css = `
    * { box-sizing: border-box; font-family: ${isExcel ? "'Segoe UI', Calibri, Arial, sans-serif" : "'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif"}; }
    body { margin: 0; padding: ${isExcel ? '12px' : '36px'}; color: #0A0A0A; background: #FFF; }
    .doc { max-width: ${isExcel ? '100%' : '900px'}; margin: 0 auto; }

    .header { margin-bottom: ${isExcel ? '16px' : '28px'}; border-bottom: 2px solid #0A0A0A; padding-bottom: 14px; }
    .brand { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #6B7280; font-weight: 600; margin-bottom: 6px; }
    .title { font-size: 28px; font-weight: 300; letter-spacing: -0.5px; margin: 0; }
    .subtitle { font-size: 12px; color: #6B7280; margin-top: 6px; }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(${isExcel ? 2 : 4}, 1fr);
      gap: 10px 24px;
      margin: 18px 0 24px;
      padding: 14px 16px;
      background: #F8FAFC;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
    }
    .meta-item { }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #6B7280; font-weight: 700; margin-bottom: 3px; }
    .meta-value { font-size: 13px; color: #0A0A0A; font-weight: 500; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .kpi {
      padding: 14px 16px;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      background: #FFF;
    }
    .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: #6B7280; font-weight: 700; margin-bottom: 6px; }
    .kpi-value { font-size: 18px; font-weight: 300; letter-spacing: -0.4px; color: #0A0A0A; }
    .kpi-debit  .kpi-value { color: #0A0A0A; }
    .kpi-credit .kpi-value { color: #1F6B47; }
    .kpi-balance .kpi-value { color: #9C2E2E; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th {
      background: #F1F5F9;
      color: #475569;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      font-weight: 700;
      padding: 10px 8px;
      text-align: left;
      border-bottom: 2px solid #CBD5E1;
    }
    thead th.col-num { text-align: right; }
    tbody td { padding: 10px 8px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
    tbody tr:nth-child(even) { background: ${isExcel ? '#FAFBFC' : 'transparent'}; }

    .cell-date { white-space: nowrap; color: #475569; font-size: 11px; width: 90px; }
    .cell-kind { width: 70px; }
    .cell-no { font-family: ${isExcel ? 'Consolas, monospace' : "'JetBrains Mono', Consolas, monospace"}; font-size: 11px; color: #475569; width: 110px; }
    .cell-desc { font-size: 12px; color: #1F2937; }
    .desc-main { font-weight: 500; }
    .desc-sub { font-size: 10px; color: #6B7280; margin-top: 2px; }
    .cell-debit, .cell-credit, .cell-balance { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cell-debit { color: #0A0A0A; font-weight: 500; }
    .cell-credit { color: #1F6B47; font-weight: 600; }
    .cell-balance { font-weight: 600; }
    .bal-pos { color: #9C2E2E; }
    .bal-zero { color: #0A0A0A; }

    .kind-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .kind-invoice { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
    .kind-payment { background: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; }

    tfoot tr.opening-row td, tfoot tr.totals-row td, tfoot tr.closing-row td {
      padding: 10px 8px;
    }
    tfoot tr.opening-row { background: #F8FAFC; }
    tfoot tr.opening-row td { border-top: 2px solid #CBD5E1; font-size: 11px; color: #475569; font-weight: 600; }
    tfoot tr.totals-row { background: #F1F5F9; }
    tfoot tr.totals-row td { font-weight: 700; font-size: 12px; border-top: 1px solid #CBD5E1; }
    tfoot tr.closing-row td { font-size: 13px; font-weight: 700; border-top: 2px solid #0A0A0A; border-bottom: 2px solid #0A0A0A; padding-top: 12px; padding-bottom: 12px; background: #FFF7ED; }
    tfoot td.label-cell { text-align: right; padding-right: 14px; }

    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #E5E7EB; font-size: 10px; color: #9CA3AF; text-align: center; }

    @media print {
      body { padding: 24px; }
      .no-print { display: none; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
  `;

  const labLine     = ctx.labName     ? `<div class="meta-item"><div class="meta-label">Tedarikçi</div><div class="meta-value">${escapeHtml(ctx.labName)}</div></div>` : '';
  const clinicLine  = ctx.clinicName  ? `<div class="meta-item"><div class="meta-label">Müşteri</div><div class="meta-value">${escapeHtml(ctx.clinicName)}</div></div>` : '';

  const html = `
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Cari Ekstre · ${escapeHtml(ctx.rangeLabel)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="doc">

    <div class="header">
      <div class="brand">${escapeHtml(ctx.labName ?? 'Laboratuvar')} · Mali İşlemler</div>
      <h1 class="title">Cari Ekstre</h1>
      <div class="subtitle">Hesap hareketleri raporu · ${escapeHtml(ctx.rangeLabel)}</div>
    </div>

    <div class="meta-grid">
      ${labLine}
      ${clinicLine}
      <div class="meta-item"><div class="meta-label">Hekim</div><div class="meta-value">${escapeHtml(ctx.doctorLabel)}</div></div>
      <div class="meta-item"><div class="meta-label">Hareket Türü</div><div class="meta-value">${escapeHtml(ctx.kindLabel)}</div></div>
      <div class="meta-item"><div class="meta-label">Dönem</div><div class="meta-value">${escapeHtml(ctx.rangeLabel)}</div></div>
      <div class="meta-item"><div class="meta-label">Rapor Tarihi</div><div class="meta-value">${escapeHtml(fmtDateTime(ctx.generatedAt))}</div></div>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Açılış Bakiye</div><div class="kpi-value">${fmtMoney(opening)} ${B}</div></div>
      <div class="kpi kpi-debit"><div class="kpi-label">Toplam Borç</div><div class="kpi-value">${fmtMoney(totalDebit)} ${B}</div></div>
      <div class="kpi kpi-credit"><div class="kpi-label">Toplam Alacak</div><div class="kpi-value">${fmtMoney(totalCredit)} ${B}</div></div>
      <div class="kpi kpi-balance"><div class="kpi-label">Güncel Bakiye</div><div class="kpi-value">${fmtMoney(closing)} ${B}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Tarih</th>
          <th>Tür</th>
          <th>Açıklama</th>
          <th>Fatura No</th>
          <th class="col-num">Borç</th>
          <th class="col-num">Alacak</th>
          <th class="col-num">Bakiye</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr class="opening-row">
          <td colspan="4" class="label-cell">Açılış Bakiye</td>
          <td colspan="2"></td>
          <td class="cell-balance">${fmtMoney(opening)} ${B}</td>
        </tr>
        <tr class="totals-row">
          <td colspan="4" class="label-cell">Toplam Hareket (${lines.length} kayıt)</td>
          <td class="cell-debit">${fmtMoney(totalDebit)} ${B}</td>
          <td class="cell-credit">${fmtMoney(totalCredit)} ${B}</td>
          <td class="cell-balance">${fmtMoney(totalDebit - totalCredit)} ${B}</td>
        </tr>
        <tr class="closing-row">
          <td colspan="4" class="label-cell">GÜNCEL BAKİYE</td>
          <td colspan="2"></td>
          <td class="cell-balance">${fmtMoney(closing)} ${B}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      Bu rapor ${escapeHtml(fmtDateTime(ctx.generatedAt))} tarihinde otomatik oluşturulmuştur.
    </div>

  </div>
</body>
</html>`;

  return html;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const slugify = (s: string): string =>
  s.toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const fileBase = (ctx: ExportContext): string => {
  const date = ctx.generatedAt.toISOString().slice(0, 10);
  const who  = ctx.clinicName ? slugify(ctx.clinicName) : 'ekstre';
  return `cari-ekstre-${who}-${date}`;
};

/* ────────────────────────────────────────────────────────────────────── */
/*  Excel (.xls — HTML tabanlı, Office tarafından doğal açılır)            */
/* ────────────────────────────────────────────────────────────────────── */

export function exportStatementXls(
  lines: StatementLine[],
  opening: number,
  ctx: ExportContext,
): void {
  const html = buildHtml(lines, opening, ctx, 'excel');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // BOM önemli: Excel'in karakter setini doğru algılaması için
    const bom = '﻿';
    const blob = new Blob([bom + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase(ctx)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  // Native fallback (mobile): expo-sharing ile paylaş — şimdilik no-op
  // Uygulanırsa: expo-file-system writeAsStringAsync + expo-sharing shareAsync
  console.warn('[finance-clinic] Excel export native fallback not implemented yet');
}

/* ────────────────────────────────────────────────────────────────────── */
/*  PDF — yazdırma penceresi (kullanıcı "PDF olarak kaydet" der)          */
/* ────────────────────────────────────────────────────────────────────── */

export function exportStatementPdf(
  lines: StatementLine[],
  opening: number,
  ctx: ExportContext,
): void {
  const html = buildHtml(lines, opening, ctx, 'pdf');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) {
      alert('PDF penceresi açılamadı. Lütfen tarayıcınızdaki pop-up engelleyiciyi kontrol edin.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Belgenin yüklenmesini bekle, ardından yazdırma diyalogunu aç
    w.onload = () => {
      try {
        w.focus();
        w.print();
      } catch { /* no-op */ }
    };
    return;
  }

  console.warn('[finance-clinic] PDF export native fallback not implemented yet');
}
