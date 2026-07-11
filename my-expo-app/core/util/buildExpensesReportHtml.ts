/**
 * Gider Raporu — paylaşılan HTML/XLS builder.
 *
 * Excel uyumlu HTML (.xls uzantısıyla indir): Excel, Numbers, Google Sheets açar
 * ve stil + renk + hücre bordürlerini korur.
 *
 * Tasarım:
 *   - Üst kart: dönem + lab adı + toplam özet
 *   - Kategori özeti tablosu (her kategori ne kadar tutmuş)
 *   - Detay tablosu: Sıra | Tarih | Kategori | Açıklama | Ödeme | Tutar | Notlar
 *   - Footer
 */

import { EXPENSE_CATEGORY_LABELS, type Expense, type ExpenseCategory } from '../../modules/expenses/api';

const PAY_METHODS_LABEL: Record<string, string> = {
  nakit: 'Nakit',
  havale: 'Havale / EFT',
  kart: 'Kart',
  cek: 'Çek',
  diger: 'Diğer',
};

const CATEGORY_ACCENT: Record<ExpenseCategory, string> = {
  malzeme: '#0F766E',
  kira:    '#7C3AED',
  personel:'#2563EB',
  ekipman: '#0891B2',
  vergi:   '#D97706',
  diger:   '#6B6B6B',
};

interface BuildInput {
  labName: string;
  labAddress?: string | null;
  labPhone?: string | null;
  labTaxNo?: string | null;
  periodFrom?: string | null;
  periodTo?:   string | null;
  expenses: Expense[];
  /** Para birimi sembolü (raporda baskın olarak gösterilecek) */
  primaryCurrency?: string;
}

function tr(amount: number, currency = 'TRY'): string {
  const sym = currency === 'TRY' ? '₺'
            : currency === 'USD' ? '$'
            : currency === 'EUR' ? '€'
            : currency === 'GBP' ? '£'
            : currency + ' ';
  return sym + amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function buildExpensesReportHtml(input: BuildInput): string {
  const { labName, labAddress, labPhone, labTaxNo, periodFrom, periodTo, expenses, primaryCurrency = 'TRY' } = input;

  // ── Kategori özeti — KATI per-currency: farklı para birimleri ASLA toplanmaz ──
  const CCY_ORDER = ['TRY', 'EUR', 'USD', 'GBP'];
  const ccyOf = (e: Expense) => (((e as any).currency as string) || primaryCurrency);
  const addTo = (m: Map<string, number>, ccy: string, amt: number) => m.set(ccy, (m.get(ccy) ?? 0) + amt);
  const sortCcy = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => {
      const ia = CCY_ORDER.indexOf(a[0]), ib = CCY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  /** "₺12.500,00 · €300,00" — para birimi başına ayrı toplam */
  const fmtTotals = (m: Map<string, number>) =>
    m.size === 0 ? tr(0, primaryCurrency) : sortCcy(m).map(([c, v]) => tr(v, c)).join(' · ');

  const byCategory = new Map<ExpenseCategory, { count: number; totals: Map<string, number> }>();
  const grandTotals = new Map<string, number>();
  let grandCount = 0;
  for (const e of expenses) {
    const cat = e.category;
    const slot = byCategory.get(cat) ?? { count: 0, totals: new Map<string, number>() };
    slot.count += 1;
    addTo(slot.totals, ccyOf(e), Number(e.amount) || 0);
    byCategory.set(cat, slot);
    addTo(grandTotals, ccyOf(e), Number(e.amount) || 0);
    grandCount += 1;
  }
  // Pay (%) yalnız tek para birimi varsa anlamlı — çoklu dövizde '—' basılır.
  const singleCcy = grandTotals.size <= 1 ? (sortCcy(grandTotals)[0]?.[0] ?? primaryCurrency) : null;
  const grandSingleTotal = singleCcy ? (grandTotals.get(singleCcy) ?? 0) : 0;

  const periodLabel =
    (periodFrom && periodTo)
      ? `${fmtDate(periodFrom)} — ${fmtDate(periodTo)}`
      : (periodFrom ? `${fmtDate(periodFrom)} — Bugün` : 'Tüm dönem');

  // Sıralama: (öncelik primaryCurrency toplamı, yoksa ilk döviz toplamı) desc
  const sortKey = (t: Map<string, number>) => t.get(primaryCurrency) ?? sortCcy(t)[0]?.[1] ?? 0;
  const categoryRows = Array.from(byCategory.entries())
    .map(([cat, s]) => ({
      cat,
      count: s.count,
      totals: s.totals,
      pct: singleCcy && grandSingleTotal > 0 ? ((s.totals.get(singleCcy) ?? 0) / grandSingleTotal) * 100 : null,
    }))
    .sort((a, b) => sortKey(b.totals) - sortKey(a.totals));

  // Detay sırası: tarih desc
  const detailRows = [...expenses].sort((a, b) =>
    new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime(),
  );

  const generatedAt = new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="tr"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Gider Raporu — ${escapeHtml(labName)}</title>
  <style>
    body { font-family: 'Inter Tight', Inter, Arial, sans-serif; color: #0A0A0A; background: #FFFFFF; margin: 24px; }
    .header { background: #F8FAFC; border-radius: 16px; padding: 22px 26px; margin-bottom: 20px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .doc-title { font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: #0A0A0A; margin: 0; }
    .doc-sub { font-size: 11px; color: #64748B; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; margin-top: 4px; }
    .period { font-size: 13px; color: #475569; margin-top: 10px; }
    .lab-info { text-align: right; font-size: 12px; color: #475569; line-height: 1.5; }
    .lab-name { font-size: 14px; font-weight: 700; color: #0A0A0A; margin-bottom: 4px; }
    .summary { display: flex; gap: 20px; margin-top: 18px; }
    .summary-card { flex: 1; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; }
    .summary-label { font-size: 10px; color: #64748B; letter-spacing: 0.8px; text-transform: uppercase; font-weight: 700; }
    .summary-value { font-size: 22px; font-weight: 800; color: #0A0A0A; margin-top: 4px; letter-spacing: -0.4px; }
    .summary-sub { font-size: 11px; color: #94A3B8; margin-top: 2px; }
    .section-title { font-size: 11px; font-weight: 700; color: #64748B; letter-spacing: 1.2px; text-transform: uppercase; margin: 24px 0 8px 0; }
    table { width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; }
    thead th {
      background: #0F172A; color: #FFFFFF;
      font-size: 11px; font-weight: 700;
      letter-spacing: 0.6px; text-transform: uppercase;
      padding: 10px 12px; text-align: left; border-right: 1px solid #1E293B;
    }
    thead th:last-child { border-right: 0; }
    tbody td {
      padding: 9px 12px; font-size: 12px; color: #1E293B;
      border-top: 1px solid #F1F5F9; border-right: 1px solid #F1F5F9;
    }
    tbody td:last-child { border-right: 0; }
    tbody tr:nth-child(even) td { background: #FAFBFC; }
    tbody tr:hover td { background: #F1F5F9; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .muted { color: #94A3B8; }
    .cat-badge {
      display: inline-block; padding: 2px 8px; border-radius: 9999px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
      color: #FFFFFF;
    }
    tfoot td {
      background: #F8FAFC; font-weight: 800; font-size: 13px;
      padding: 12px; border-top: 2px solid #0F172A;
    }
    .grand { font-size: 16px; color: #0A0A0A; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; }
    @media print {
      body { margin: 0; }
      .summary { page-break-inside: avoid; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div class="header-row">
      <div>
        <div class="doc-sub">Gider Raporu</div>
        <h1 class="doc-title">Operasyonel Giderler</h1>
        <div class="period">Dönem: <strong>${escapeHtml(periodLabel)}</strong></div>
      </div>
      <div class="lab-info">
        <div class="lab-name">${escapeHtml(labName)}</div>
        ${labAddress ? `<div>${escapeHtml(labAddress)}</div>` : ''}
        ${labPhone   ? `<div>${escapeHtml(labPhone)}</div>` : ''}
        ${labTaxNo   ? `<div>VKN: ${escapeHtml(labTaxNo)}</div>` : ''}
      </div>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="summary-label">Toplam Tutar</div>
        <div class="summary-value">${fmtTotals(grandTotals)}</div>
        <div class="summary-sub">${expenses.length} kayıt${grandTotals.size > 1 ? ' · para birimi başına ayrı toplam' : ''}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Kategori Sayısı</div>
        <div class="summary-value">${byCategory.size}</div>
        <div class="summary-sub">${detailRows.length > 0 ? `İlk: ${fmtDate(detailRows[detailRows.length - 1].expense_date)}` : ''}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Ortalama Kayıt</div>
        <div class="summary-value">${singleCcy ? tr(grandCount > 0 ? grandSingleTotal / grandCount : 0, singleCcy) : '—'}</div>
        <div class="summary-sub">${detailRows.length > 0 ? `Son: ${fmtDate(detailRows[0].expense_date)}` : ''}</div>
      </div>
    </div>
  </div>

  <!-- KATEGORİ ÖZETİ -->
  <div class="section-title">Kategori Özeti</div>
  <table>
    <colgroup>
      <col style="width: 30%">
      <col style="width: 15%">
      <col style="width: 25%">
      <col style="width: 30%">
    </colgroup>
    <thead>
      <tr>
        <th>Kategori</th>
        <th>Kayıt</th>
        <th class="num">Toplam</th>
        <th class="num">Pay</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRows.map(r => `
        <tr>
          <td>
            <span class="cat-badge" style="background:${CATEGORY_ACCENT[r.cat]}">${escapeHtml(EXPENSE_CATEGORY_LABELS[r.cat])}</span>
          </td>
          <td>${r.count}</td>
          <td class="num">${fmtTotals(r.totals)}</td>
          <td class="num">${r.pct != null ? r.pct.toFixed(1) + '%' : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td>Toplam</td>
        <td>${expenses.length}</td>
        <td class="num grand">${fmtTotals(grandTotals)}</td>
        <td class="num">${singleCcy ? '100,0%' : '—'}</td>
      </tr>
    </tfoot>
  </table>

  <!-- DETAY TABLOSU -->
  <div class="section-title">Detaylı Kayıt Listesi</div>
  <table>
    <colgroup>
      <col style="width: 5%">
      <col style="width: 11%">
      <col style="width: 14%">
      <col style="width: 30%">
      <col style="width: 13%">
      <col style="width: 13%">
      <col style="width: 14%">
    </colgroup>
    <thead>
      <tr>
        <th>#</th>
        <th>Tarih</th>
        <th>Kategori</th>
        <th>Açıklama</th>
        <th>Ödeme</th>
        <th class="num">Tutar</th>
        <th>Notlar</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows.map((e, i) => `
        <tr>
          <td class="muted">${i + 1}</td>
          <td>${fmtDate(e.expense_date)}</td>
          <td>
            <span class="cat-badge" style="background:${CATEGORY_ACCENT[e.category]}">${escapeHtml(EXPENSE_CATEGORY_LABELS[e.category])}</span>
          </td>
          <td>${escapeHtml(e.description ?? '')}</td>
          <td class="muted">${escapeHtml(PAY_METHODS_LABEL[e.payment_method] ?? e.payment_method ?? '—')}</td>
          <td class="num">${tr(Number(e.amount), ((e as any).currency as string) ?? primaryCurrency)}</td>
          <td class="muted">${escapeHtml(e.notes ?? '')}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Genel Toplam</td>
        <td class="num grand">${fmtTotals(grandTotals)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div>Oluşturma: ${escapeHtml(generatedAt)}</div>
    <div>${escapeHtml(labName)} · Gider Raporu</div>
  </div>

</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tarayıcıda dosya indirir — .xls uzantısıyla Excel/Sheets açar */
export function downloadExpensesReport(html: string, filename: string): { ok: boolean; error?: string } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, error: 'window yok' };
  }
  try {
    // Excel mime ile blob — Excel düz HTML'i yorumlar ve stil korur
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xls') ? filename : filename + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Dosya indirilemedi' };
  }
}
