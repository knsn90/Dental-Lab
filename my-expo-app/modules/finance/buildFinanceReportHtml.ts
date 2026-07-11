/**
 * Finans Raporu PDF/Print HTML builder — Gelir / Gider / Kâr.
 *
 * Tasarım:
 *   - Brand bar (siyah) — lab letterhead
 *   - Title block + dönem
 *   - 3 büyük KPI (Toplam Gelir / Gider / Net Kâr) — yeşil / kırmızı / lacivert
 *   - Aylık döküm tablosu (Ay · Gelir · Gider · Kâr · Marj %)
 *   - Görsel bar chart (her ay için gelir/gider yatay bar)
 *   - Summary bar + footer
 */

export interface FinanceMonthRow {
  month: string;       // YYYY-MM-DD (1st of month)
  income: number;
  expense: number;
  profit: number;
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  amount: number;
}

export interface MethodBreakdown {
  method: string;
  label: string;
  amount: number;
}

export interface TopExpense {
  date: string;
  description: string;
  category: string;
  amount: number;
}

export interface CollectionStats {
  totalBilled: number;
  totalPaid: number;
  totalOverdue: number;
  invoiceCount: number;
}

export interface PreviousPeriod {
  income: number;
  expense: number;
}

export interface FinanceReportInput {
  lab: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxNo?: string | null;
  };
  /** Filtre etiketi (dönem, örn. "Son 12 Ay") */
  periodLabel: string;
  rows: FinanceMonthRow[];
  currency?: string; // default TRY
  /** Önceki dönem karşılaştırması (varsa) */
  previousPeriod?: PreviousPeriod;
  /** Gider kategorisi kırılımı */
  categoryBreakdown?: CategoryBreakdown[];
  /** Ödeme yöntemi kırılımı */
  methodBreakdown?: MethodBreakdown[];
  /** En yüksek N gider */
  topExpenses?: TopExpense[];
  /** Tahsilat performansı */
  collection?: CollectionStats;
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMoney(n: number, currency = 'TRY'): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

function fmtMonth(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function pct(n: number, den: number): string {
  if (den === 0) return '—';
  return (n / den * 100).toFixed(1) + '%';
}

export function buildFinanceReportHtml(input: FinanceReportInput): string {
  const currency = input.currency ?? 'TRY';
  const rows = [...input.rows].sort((a, b) => a.month.localeCompare(b.month));

  const totalIncome  = rows.reduce((s, r) => s + Number(r.income),  0);
  const totalExpense = rows.reduce((s, r) => s + Number(r.expense), 0);
  const totalProfit  = totalIncome - totalExpense;
  const marginPct    = totalIncome > 0 ? (totalProfit / totalIncome * 100) : 0;

  // ── Trend hesapla (önceki dönemle karşılaştırma) ──
  const renderTrend = (current: number, previous: number, invert = false): string => {
    if (!previous || previous === 0) return '';
    const diff = current - previous;
    const pctDiff = (diff / Math.abs(previous)) * 100;
    if (Math.abs(pctDiff) < 0.5) return '<span class="trend flat">→ %0</span>';
    // invert = true → düşüş iyi (gider için)
    const isPositive = invert ? diff < 0 : diff > 0;
    const cls = isPositive ? 'up' : 'down';
    const arrow = diff > 0 ? '↗' : '↘';
    return `<span class="trend ${cls}">${arrow} %${Math.abs(pctDiff).toFixed(0)}</span>`;
  };
  const prev = input.previousPeriod;

  // Bar chart için max değer
  const maxBar = Math.max(...rows.map(r => Math.max(r.income, r.expense)), 1);

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  const tableRowsHtml = rows.map(r => {
    const income  = Number(r.income);
    const expense = Number(r.expense);
    const profit  = income - expense;
    const margin  = income > 0 ? (profit / income * 100) : 0;
    const incomeW  = (income  / maxBar * 100).toFixed(1);
    const expenseW = (expense / maxBar * 100).toFixed(1);
    return `<tr>
      <td class="month-cell">${esc(fmtMonth(r.month))}</td>
      <td class="num green">${fmtMoney(income, currency)}</td>
      <td class="num red">${fmtMoney(expense, currency)}</td>
      <td class="num ${profit >= 0 ? 'navy' : 'red'} strong">${fmtMoney(profit, currency)}</td>
      <td class="num muted">${income > 0 ? margin.toFixed(1) + '%' : '—'}</td>
      <td class="bar-cell">
        <div class="bar-stack">
          <div class="bar income-bar" style="width:${incomeW}%"></div>
          <div class="bar expense-bar" style="width:${expenseW}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gelir / Gider Raporu — ${esc(input.lab.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink-900: #0B1220;
    --ink-700: #1F2937;
    --ink-500: #4B5563;
    --ink-400: #6B7280;
    --ink-300: #9CA3AF;
    --line:    #E5E7EB;
    --line-2:  #F3F4F6;
    --bg:      #F8F9FB;
    --paper:   #FFFFFF;
    --green:   #0F766E;
    --green-soft: #D1FAE5;
    --red:     #9C2E2E;
    --red-soft:#FEE2E2;
    --navy:    #1E3A8A;
    --navy-soft: #DBEAFE;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg);
    color: var(--ink-900);
    font-size: 11px; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px; background: var(--ink-900); color: #fff;
  }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; }
  .toolbar button {
    padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600;
  }
  .toolbar .btn-print { background: #FFFFFF; color: var(--ink-900); }
  .toolbar .btn-close { background: rgba(255,255,255,0.10); color: #FFFFFF; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #FFFFFF; }
    .page { box-shadow: none !important; border: none !important; }
  }

  .page {
    max-width: 1000px;
    margin: 64px auto 32px;
    background: var(--paper);
    box-shadow: 0 1px 0 rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.06);
    border: 1px solid var(--line);
  }

  .brand-bar {
    background: var(--ink-900); color: #FFFFFF;
    padding: 14px 36px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .brand-name { font-size: 13px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  .brand-name img { height: 22px; max-width: 200px; object-fit: contain; filter: brightness(0) invert(1); }
  .brand-meta { font-size: 10px; color: rgba(255,255,255,0.6); letter-spacing: 0.4px; text-transform: uppercase; }

  .title-block {
    padding: 32px 36px 22px;
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 1px solid var(--line);
  }
  .doc-name { font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: var(--ink-500); margin-bottom: 6px; }
  .doc-title-main { font-size: 24px; font-weight: 600; letter-spacing: -0.6px; color: var(--ink-900); line-height: 1.2; }
  .doc-meta { text-align: right; font-size: 10px; color: var(--ink-400); line-height: 1.6; }
  .doc-meta .lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--ink-500); }
  .doc-meta .val { font-size: 11px; color: var(--ink-900); font-weight: 500; }

  /* Hero KPIs */
  .kpi-hero {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 0;
    border-bottom: 1px solid var(--line);
  }
  .kpi-card {
    padding: 28px 28px 26px;
    border-right: 1px solid var(--line);
    position: relative;
  }
  .kpi-card:last-child { border-right: none; }
  .kpi-card:first-child { padding-left: 36px; }
  .kpi-card:last-child { padding-right: 36px; }
  .kpi-icon-circle {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 14px;
    font-size: 18px; font-weight: 700;
  }
  .kpi-icon-circle.green { background: var(--green-soft); color: var(--green); }
  .kpi-icon-circle.red   { background: var(--red-soft);   color: var(--red); }
  .kpi-icon-circle.navy  { background: var(--navy-soft);  color: var(--navy); }
  .kpi-label {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500); margin-bottom: 6px;
  }
  .kpi-value {
    font-size: 26px; font-weight: 700; color: var(--ink-900);
    letter-spacing: -0.6px; font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }
  .kpi-value.green { color: var(--green); }
  .kpi-value.red   { color: var(--red); }
  .kpi-value.navy  { color: var(--navy); }
  .kpi-sub {
    font-size: 10.5px; color: var(--ink-400); margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }

  /* Period strip */
  .period-strip {
    padding: 14px 36px 14px;
    background: var(--line-2);
    border-bottom: 1px solid var(--line);
    display: flex; gap: 10px; align-items: center;
  }
  .period-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 999px;
    background: #FFFFFF;
    border: 1px solid var(--line);
    font-size: 11px; font-weight: 600; color: var(--ink-700);
  }
  .period-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-700); }
  .period-pill.income .dot { background: var(--green); }
  .period-pill.expense .dot { background: var(--red); }

  /* Table */
  .table-wrap { padding: 24px 36px 8px; }
  .table-title {
    font-size: 13px; font-weight: 700; color: var(--ink-900);
    letter-spacing: -0.2px; margin-bottom: 10px;
    padding-bottom: 8px; border-bottom: 2px solid var(--ink-900);
  }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    font-size: 9px; font-weight: 700; color: var(--ink-500);
    letter-spacing: 1.2px; text-transform: uppercase;
    padding: 12px 10px; border-bottom: 1px solid var(--line);
  }
  thead th.num { text-align: right; }
  tbody td {
    padding: 12px 10px; vertical-align: middle;
    font-size: 11.5px; color: var(--ink-700);
    border-bottom: 1px solid var(--line-2);
  }
  tbody tr:last-child td { border-bottom: 1px solid var(--line); }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.num.strong { font-weight: 700; color: var(--ink-900); }
  tbody td.num.green  { color: var(--green); font-weight: 600; }
  tbody td.num.red    { color: var(--red);   font-weight: 600; }
  tbody td.num.navy   { color: var(--navy);  font-weight: 700; }
  tbody td.num.muted  { color: var(--ink-500); font-weight: 500; }
  .month-cell { font-weight: 600; color: var(--ink-900); }

  /* Bar chart cells */
  td.bar-cell { width: 200px; padding: 8px 10px; }
  .bar-stack { display: flex; flex-direction: column; gap: 4px; }
  .bar { height: 6px; border-radius: 999px; min-width: 2px; }
  .income-bar  { background: var(--green); }
  .expense-bar { background: var(--red); }

  /* Summary bar */
  .summary-bar {
    margin: 0 36px;
    border-top: 2px solid var(--ink-900);
    padding: 16px 0 0;
    display: grid; grid-template-columns: 1fr auto auto auto auto;
    gap: 28px; align-items: baseline;
  }
  .summary-bar .lbl { font-size: 9px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ink-500); }
  .summary-bar .num { font-size: 14px; font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; margin-top: 4px; }
  .summary-bar .num.green { color: var(--green); }
  .summary-bar .num.red   { color: var(--red); }
  .summary-bar .num.navy  { color: var(--navy); }

  /* ── Breakdown sections ── */
  .section {
    padding: 22px 36px;
    border-top: 1px solid var(--line);
    page-break-inside: avoid;
  }
  .section-title {
    font-size: 13px; font-weight: 700; color: var(--ink-900);
    letter-spacing: -0.2px; margin-bottom: 14px;
    padding-bottom: 8px; border-bottom: 2px solid var(--ink-900);
    display: flex; justify-content: space-between; align-items: baseline;
  }
  .section-title .meta { font-size: 10px; color: var(--ink-500); font-weight: 500; font-variant-numeric: tabular-nums; }

  /* Trend indicator (önceki dönemle karşılaştırma) */
  .trend {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.2px;
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
  }
  .trend.up   { background: var(--green-soft); color: var(--green); }
  .trend.down { background: var(--red-soft);   color: var(--red); }
  .trend.flat { background: var(--line-2);     color: var(--ink-500); }

  /* Category bars */
  .cat-row {
    display: grid; grid-template-columns: 140px 1fr 100px 60px;
    gap: 14px; align-items: center;
    padding: 8px 0; border-bottom: 1px solid var(--line-2);
  }
  .cat-row:last-child { border-bottom: none; }
  .cat-name { font-size: 11.5px; font-weight: 600; color: var(--ink-900); }
  .cat-bar-wrap {
    height: 10px; background: var(--line-2); border-radius: 999px; overflow: hidden;
  }
  .cat-bar { height: 100%; border-radius: 999px; }
  .cat-amount { font-size: 11.5px; font-weight: 700; color: var(--ink-900); text-align: right; font-variant-numeric: tabular-nums; }
  .cat-pct { font-size: 10.5px; color: var(--ink-500); text-align: right; font-variant-numeric: tabular-nums; }

  /* Category palette */
  .cat-malzeme  { background: #DC2626; }
  .cat-personel { background: #2563EB; }
  .cat-kira     { background: #7C3AED; }
  .cat-ekipman  { background: #0891B2; }
  .cat-vergi    { background: #D97706; }
  .cat-diger    { background: #6B7280; }

  /* Method pills + bars */
  .method-grid {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;
  }
  .method-card {
    padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px;
    background: #FFFFFF;
  }
  .method-icon {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--line-2); color: var(--ink-700);
    font-size: 12px; margin-bottom: 8px; font-weight: 700;
  }
  .method-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-500); margin-bottom: 3px; }
  .method-amount { font-size: 13px; font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; }
  .method-pct { font-size: 10px; color: var(--ink-400); margin-top: 2px; font-variant-numeric: tabular-nums; }

  /* Top expenses table */
  .top-table { width: 100%; border-collapse: collapse; }
  .top-table td {
    padding: 10px 8px; border-bottom: 1px solid var(--line-2);
    font-size: 11.5px; color: var(--ink-700);
  }
  .top-table tr:last-child td { border-bottom: none; }
  .rank-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--ink-900); color: #FFFFFF;
    font-size: 11px; font-weight: 700;
  }
  .rank-badge.r1 { background: #D97706; }
  .rank-badge.r2 { background: #4B5563; }
  .rank-badge.r3 { background: #92400E; }
  .top-date { color: var(--ink-500); font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .top-desc { font-weight: 600; color: var(--ink-900); }
  .top-cat {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 9.5px; font-weight: 600; letter-spacing: 0.3px;
    background: var(--line-2); color: var(--ink-700);
  }
  .top-amount { font-size: 12.5px; font-weight: 700; color: var(--red); text-align: right; font-variant-numeric: tabular-nums; }

  /* Collection stats */
  .collection-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  }
  .collection-card {
    padding: 14px 16px; border: 1px solid var(--line); border-radius: 8px;
  }
  .collection-card.warn   { border-color: rgba(217, 119, 6, 0.3); background: #FFFBEB; }
  .collection-card.danger { border-color: rgba(156, 46, 46, 0.3); background: #FEF2F2; }
  .collection-card.ok     { border-color: rgba(15, 118, 110, 0.3); background: #F0FDFA; }
  .collection-label { font-size: 9.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--ink-500); margin-bottom: 6px; }
  .collection-value { font-size: 16px; font-weight: 700; color: var(--ink-900); font-variant-numeric: tabular-nums; }
  .collection-value.green { color: var(--green); }
  .collection-value.red   { color: var(--red); }
  .collection-value.warn  { color: #D97706; }
  .collection-sub { font-size: 10px; color: var(--ink-400); margin-top: 4px; }

  /* Progress bar */
  .progress-row { margin-top: 14px; }
  .progress-label {
    display: flex; justify-content: space-between;
    font-size: 10.5px; color: var(--ink-500); margin-bottom: 6px;
  }
  .progress-track {
    height: 8px; background: var(--line-2); border-radius: 999px; overflow: hidden;
    display: flex;
  }
  .progress-fill { height: 100%; }
  .progress-fill.paid     { background: var(--green); }
  .progress-fill.overdue  { background: var(--red); }
  .progress-fill.pending  { background: #D97706; }

  /* Footer */
  .footer {
    padding: 22px 36px 28px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9.5px; color: var(--ink-400); letter-spacing: 0.2px;
    border-top: 1px solid var(--line); margin-top: 0;
  }
  .footer strong { color: var(--ink-900); font-weight: 600; }
</style>
</head>
<body>

<div class="toolbar">
  <span class="title">Gelir / Gider Raporu · ${esc(input.lab.name)}</span>
  <button class="btn-print" onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="btn-close" onclick="window.close()">Kapat</button>
</div>

<div class="page">
  <div class="brand-bar">
    <div class="brand-name">${input.lab.logoUrl ? `<img src="${esc(input.lab.logoUrl)}" alt="" />` : esc(input.lab.name)}</div>
    <div class="brand-meta">${input.lab.taxNo ? `VKN ${esc(input.lab.taxNo)}` : ''}</div>
  </div>

  <div class="title-block">
    <div>
      <div class="doc-name">Mali Performans Raporu</div>
      <div class="doc-title-main">Gelir / Gider Analizi</div>
    </div>
    <div class="doc-meta">
      <div class="lbl">Dönem</div>
      <div class="val">${esc(input.periodLabel)}</div>
      <div class="lbl" style="margin-top:8px">Düzenlenme</div>
      <div class="val">${today}</div>
    </div>
  </div>

  <div class="kpi-hero">
    <div class="kpi-card">
      <div class="kpi-icon-circle green">↗</div>
      <div class="kpi-label">Toplam Gelir ${prev ? renderTrend(totalIncome, prev.income) : ''}</div>
      <div class="kpi-value green">${fmtMoney(totalIncome, currency)}</div>
      <div class="kpi-sub">${rows.length} aylık dönem${prev ? ` · önceki: ${fmtMoney(prev.income, currency)}` : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon-circle red">↘</div>
      <div class="kpi-label">Toplam Gider ${prev ? renderTrend(totalExpense, prev.expense, true) : ''}</div>
      <div class="kpi-value red">${fmtMoney(totalExpense, currency)}</div>
      <div class="kpi-sub">Gelirin ${pct(totalExpense, totalIncome)}'i${prev ? ` · önceki: ${fmtMoney(prev.expense, currency)}` : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon-circle navy">∑</div>
      <div class="kpi-label">Net Kâr ${prev ? renderTrend(totalProfit, prev.income - prev.expense) : ''}</div>
      <div class="kpi-value ${totalProfit >= 0 ? 'navy' : 'red'}">${fmtMoney(totalProfit, currency)}</div>
      <div class="kpi-sub">Marj ${totalIncome > 0 ? marginPct.toFixed(1) + '%' : '—'}${prev ? ` · önceki: ${fmtMoney(prev.income - prev.expense, currency)}` : ''}</div>
    </div>
  </div>

  <div class="period-strip">
    <span class="period-pill income"><span class="dot"></span>Gelir</span>
    <span class="period-pill expense"><span class="dot"></span>Gider</span>
    <span style="flex:1"></span>
    <span style="font-size:10.5px;color:var(--ink-500);font-weight:500">Tüm tutarlar ${esc(currency)} cinsinden · fatura kuruyla TL'ye çevrilmiş</span>
  </div>

  <div class="table-wrap">
    <div class="table-title">Aylık Döküm</div>
    <table>
      <thead>
        <tr>
          <th>Dönem</th>
          <th class="num">Gelir</th>
          <th class="num">Gider</th>
          <th class="num">Net Kâr</th>
          <th class="num">Marj</th>
          <th>Görsel</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center;color:var(--ink-400);padding:32px;font-style:italic">Bu dönemde hareket bulunmuyor.</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="summary-bar">
    <div>
      <div class="lbl">Dönem</div>
      <div class="num" style="font-size:11px;color:var(--ink-500);">${rows.length} ay</div>
    </div>
    <div>
      <div class="lbl">Gelir</div>
      <div class="num green">${fmtMoney(totalIncome, currency)}</div>
    </div>
    <div>
      <div class="lbl">Gider</div>
      <div class="num red">${fmtMoney(totalExpense, currency)}</div>
    </div>
    <div>
      <div class="lbl">Net Kâr</div>
      <div class="num ${totalProfit >= 0 ? 'navy' : 'red'}">${fmtMoney(totalProfit, currency)}</div>
    </div>
    <div>
      <div class="lbl">Marj</div>
      <div class="num">${totalIncome > 0 ? marginPct.toFixed(1) + '%' : '—'}</div>
    </div>
  </div>

  ${(() => {
    const cb = input.categoryBreakdown ?? [];
    if (cb.length === 0) return '';
    const total = cb.reduce((s, c) => s + c.amount, 0);
    const sorted = [...cb].sort((a, b) => b.amount - a.amount);
    const rowsCat = sorted.map(c => {
      const pctV = total > 0 ? (c.amount / total * 100) : 0;
      return `<div class="cat-row">
        <div class="cat-name">${esc(c.label)}</div>
        <div class="cat-bar-wrap"><div class="cat-bar cat-${esc(c.category)}" style="width:${pctV.toFixed(1)}%"></div></div>
        <div class="cat-amount">${fmtMoney(c.amount, currency)}</div>
        <div class="cat-pct">%${pctV.toFixed(1)}</div>
      </div>`;
    }).join('');
    return `<div class="section">
      <div class="section-title">
        <span>Gider Kategori Dağılımı</span>
        <span class="meta">Toplam ${fmtMoney(total, currency)}</span>
      </div>
      ${rowsCat}
    </div>`;
  })()}

  ${(() => {
    const mb = input.methodBreakdown ?? [];
    if (mb.length === 0) return '';
    const total = mb.reduce((s, m) => s + m.amount, 0);
    const methodIcon: Record<string, string> = { nakit: '₺', kart: '◰', havale: '⇄', cek: '▤', diger: '·' };
    return `<div class="section">
      <div class="section-title">
        <span>Ödeme Yöntemi Dağılımı</span>
        <span class="meta">Gider toplamı ${fmtMoney(total, currency)}</span>
      </div>
      <div class="method-grid">
        ${mb.map(m => {
          const pctV = total > 0 ? (m.amount / total * 100) : 0;
          return `<div class="method-card">
            <div class="method-icon">${methodIcon[m.method] ?? '·'}</div>
            <div class="method-label">${esc(m.label)}</div>
            <div class="method-amount">${fmtMoney(m.amount, currency)}</div>
            <div class="method-pct">%${pctV.toFixed(1)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  })()}

  ${(() => {
    const c = input.collection;
    if (!c) return '';
    const collectionRate = c.totalBilled > 0 ? (c.totalPaid / c.totalBilled * 100) : 0;
    const overdueRate    = c.totalBilled > 0 ? (c.totalOverdue / c.totalBilled * 100) : 0;
    const pendingRate    = Math.max(0, 100 - collectionRate - overdueRate);
    return `<div class="section">
      <div class="section-title">
        <span>Tahsilat Performansı</span>
        <span class="meta">${c.invoiceCount} fatura · ${esc(input.periodLabel)}</span>
      </div>
      <div class="collection-grid">
        <div class="collection-card">
          <div class="collection-label">Kesilen Fatura</div>
          <div class="collection-value">${fmtMoney(c.totalBilled, currency)}</div>
          <div class="collection-sub">${c.invoiceCount} adet</div>
        </div>
        <div class="collection-card ok">
          <div class="collection-label">Tahsil Edilen</div>
          <div class="collection-value green">${fmtMoney(c.totalPaid, currency)}</div>
          <div class="collection-sub">%${collectionRate.toFixed(1)} tahsilat oranı</div>
        </div>
        <div class="collection-card warn">
          <div class="collection-label">Bekleyen</div>
          <div class="collection-value warn">${fmtMoney(Math.max(0, c.totalBilled - c.totalPaid - c.totalOverdue), currency)}</div>
          <div class="collection-sub">Vadesi gelmemiş</div>
        </div>
        <div class="collection-card danger">
          <div class="collection-label">Gecikmiş</div>
          <div class="collection-value red">${fmtMoney(c.totalOverdue, currency)}</div>
          <div class="collection-sub">%${overdueRate.toFixed(1)} riskli</div>
        </div>
      </div>
      <div class="progress-row">
        <div class="progress-label">
          <span>Tahsilat dağılımı</span>
          <span>%${collectionRate.toFixed(0)} tahsil / %${pendingRate.toFixed(0)} bekleyen / %${overdueRate.toFixed(0)} gecikmiş</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill paid"    style="width:${collectionRate.toFixed(1)}%"></div>
          <div class="progress-fill pending" style="width:${pendingRate.toFixed(1)}%"></div>
          <div class="progress-fill overdue" style="width:${overdueRate.toFixed(1)}%"></div>
        </div>
      </div>
    </div>`;
  })()}

  ${(() => {
    const te = input.topExpenses ?? [];
    if (te.length === 0) return '';
    return `<div class="section">
      <div class="section-title">
        <span>Dönemin En Yüksek Giderleri</span>
        <span class="meta">İlk ${te.length} kalem</span>
      </div>
      <table class="top-table">
        <tbody>
          ${te.map((e, idx) => {
            const rankClass = idx === 0 ? 'r1' : idx === 1 ? 'r2' : idx === 2 ? 'r3' : '';
            const d = new Date(e.date.includes('T') ? e.date : e.date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td style="width:36px"><div class="rank-badge ${rankClass}">${idx + 1}</div></td>
              <td class="top-date" style="width:96px">${dateStr}</td>
              <td><div class="top-desc">${esc(e.description)}</div></td>
              <td style="width:130px"><span class="top-cat">${esc(e.category)}</span></td>
              <td class="top-amount" style="width:130px">${fmtMoney(e.amount, currency)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  })()}

  <div class="footer">
    <div>${esc(input.lab.name)} · ${input.lab.phone ? esc(input.lab.phone) + ' · ' : ''}${input.lab.email ? esc(input.lab.email) : ''}</div>
    <div>${today} · Sayfa 1</div>
  </div>
</div>

</body>
</html>`;
}
