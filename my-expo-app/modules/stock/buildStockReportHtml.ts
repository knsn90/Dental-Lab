/**
 * Stok Raporu PDF/Print HTML builder.
 *
 * Cari ekstresiyle aynı corporate stil:
 *   - Üstte siyah brand bar
 *   - Title block + Düzenlenme tarihi
 *   - 4 sütun KPI özet (Toplam Ürün · Toplam Değer · Kritik · Tükenen)
 *   - Kategoriye göre gruplanmış tablo (her grup başlığı + satırlar)
 *   - Footer
 */

export interface StockReportItem {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  quantity: number;
  min_quantity: number;
  unit?: string | null;
  /** TL karşılığı birim maliyet (rapor para birimi cinsinden). */
  unit_cost?: number | null;
  /** Orijinal para birimindeki birim maliyet (sadece TRY değilse) — küçük gri olarak gösterilir. */
  unit_cost_original?: number | null;
  unit_cost_original_currency?: string | null;
  location?: string | null;
  barcode?: string | null;
  warehouse_name?: string | null;
  status?: 'ok' | 'critical' | 'empty';   // hesaplanmış durum
}

export interface StockReportInput {
  /** Lab letterhead */
  lab: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxNo?: string | null;
  };
  /** Filtre bilgisi (üstte gözükür) */
  filter?: {
    label?: string;          // örn "Tüm kategoriler" / "Üretim malzemeleri"
    searchTerm?: string;
  };
  items: StockReportItem[];
  /** Gruplama tercihi — default 'category' */
  groupBy?: 'category' | 'warehouse' | 'none';
  /** Para birimi (default 'TRY') */
  currency?: string;
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMoney(n: number, currency = 'TRY'): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

function fmtInt(n: number): string {
  return n.toLocaleString('tr-TR');
}

function getStatus(item: StockReportItem): 'ok' | 'critical' | 'empty' {
  if (item.status) return item.status;
  if (item.quantity <= 0) return 'empty';
  if (item.min_quantity > 0 && item.quantity < item.min_quantity) return 'critical';
  return 'ok';
}

export function buildStockReportHtml(input: StockReportInput): string {
  const items = input.items;
  const currency = input.currency ?? 'TRY';
  const groupBy = input.groupBy ?? 'category';
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  // KPI'lar
  const totalItems = items.length;
  const totalQty   = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const totalValue = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0);
  const criticalCount = items.filter(i => getStatus(i) === 'critical').length;
  const emptyCount    = items.filter(i => getStatus(i) === 'empty').length;
  const okCount       = items.filter(i => getStatus(i) === 'ok').length;

  // Grouping
  const groups = new Map<string, StockReportItem[]>();
  for (const item of items) {
    let key = '— Atanmamış —';
    if (groupBy === 'category') key = item.category?.trim() || '— Kategorisiz —';
    else if (groupBy === 'warehouse') key = item.warehouse_name?.trim() || '— Depo atanmamış —';
    else key = 'Tüm Ürünler';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'tr'));

  const groupsHtml = groupKeys.map(key => {
    const list = groups.get(key)!;
    const groupQty = list.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const groupValue = list.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0);
    const rowsHtml = list
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map(i => {
        const status = getStatus(i);
        const statusColor = status === 'empty' ? '#9C2E2E' : status === 'critical' ? '#9C5E0E' : '#0F766E';
        const statusBg    = status === 'empty' ? '#FEE2E2' : status === 'critical' ? '#FEF3C7' : '#D1FAE5';
        const statusLabel = status === 'empty' ? 'Tükendi' : status === 'critical' ? 'Kritik' : 'Stokta';
        const lineValue = Number(i.quantity || 0) * Number(i.unit_cost || 0);
        return `<tr>
          <td>
            <div class="item-name">${esc(i.name)}</div>
            ${i.brand ? `<div class="item-sub">${esc(i.brand)}</div>` : ''}
          </td>
          <td class="loc-cell">${i.warehouse_name ? esc(i.warehouse_name) : ''}${i.location ? `<div class="item-sub">${esc(i.location)}</div>` : ''}</td>
          <td class="num">${fmtInt(Number(i.quantity || 0))}<span class="unit-tag">${esc(i.unit ?? '')}</span></td>
          <td class="num muted">${fmtInt(Number(i.min_quantity || 0))}</td>
          <td class="num">
            ${i.unit_cost != null && i.unit_cost > 0 ? fmtMoney(Number(i.unit_cost), currency) : '—'}
            ${i.unit_cost_original && i.unit_cost_original_currency ? `<div class="orig-cur">≈ ${Number(i.unit_cost_original).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(i.unit_cost_original_currency)}</div>` : ''}
          </td>
          <td class="num strong">${lineValue > 0 ? fmtMoney(lineValue, currency) : '—'}</td>
          <td class="status-cell"><span class="status-badge" style="background:${statusBg};color:${statusColor}">${statusLabel}</span></td>
        </tr>`;
      })
      .join('');

    return `<div class="group">
      <div class="group-header">
        <div class="group-title">${esc(key)}</div>
        <div class="group-meta">${list.length} ürün · ${fmtInt(groupQty)} adet · ${fmtMoney(groupValue, currency)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ürün</th>
            <th>Konum</th>
            <th class="num">Mevcut</th>
            <th class="num">Min</th>
            <th class="num">Birim Maliyet</th>
            <th class="num">Toplam Değer</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stok Raporu — ${esc(input.lab.name)}</title>
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
    --debit:   #9C2E2E;
    --credit:  #0F766E;
    --warn:    #9C5E0E;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg);
    color: var(--ink-900);
    font-size: 11px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px; background: var(--ink-900); color: #fff;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; letter-spacing: -0.1px; }
  .toolbar button {
    padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; letter-spacing: -0.1px;
  }
  .toolbar .btn-print { background: #FFFFFF; color: var(--ink-900); }
  .toolbar .btn-close { background: rgba(255,255,255,0.10); color: #FFFFFF; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #FFFFFF; }
    .page { box-shadow: none !important; margin: 0 !important; border: none !important; }
    .group { page-break-inside: avoid; }
  }
  .page {
    max-width: 1040px;
    margin: 64px auto 32px;
    background: var(--paper);
    box-shadow: 0 1px 0 rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.06);
    border: 1px solid var(--line);
  }

  /* Brand bar */
  .brand-bar {
    background: var(--ink-900); color: #FFFFFF;
    padding: 14px 36px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .brand-name { font-size: 13px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  .brand-name img { height: 22px; max-width: 200px; object-fit: contain; filter: brightness(0) invert(1); }
  .brand-meta { font-size: 10px; color: rgba(255,255,255,0.6); letter-spacing: 0.4px; text-transform: uppercase; }

  /* Title block */
  .title-block {
    padding: 32px 36px 22px;
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 1px solid var(--line);
  }
  .doc-name {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px;
    text-transform: uppercase; color: var(--ink-500);
    margin-bottom: 6px;
  }
  .doc-title-main {
    font-size: 24px; font-weight: 600; letter-spacing: -0.6px;
    color: var(--ink-900); line-height: 1.2;
  }
  .doc-meta { text-align: right; font-size: 10px; color: var(--ink-400); line-height: 1.6; }
  .doc-meta .lbl {
    font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: var(--ink-500);
  }
  .doc-meta .val { font-size: 11px; color: var(--ink-900); font-weight: 500; }

  /* KPI grid */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid var(--line);
  }
  .kpi {
    padding: 20px 24px;
    border-right: 1px solid var(--line);
  }
  .kpi:last-child { border-right: none; }
  .kpi:first-child { padding-left: 36px; }
  .kpi:last-child { padding-right: 36px; }
  .kpi-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500); margin-bottom: 6px;
  }
  .kpi-value {
    font-size: 22px; font-weight: 700; color: var(--ink-900);
    letter-spacing: -0.4px; font-variant-numeric: tabular-nums;
  }
  .kpi-sub { font-size: 10px; color: var(--ink-400); margin-top: 4px; }
  .kpi-value.warn   { color: var(--warn); }
  .kpi-value.danger { color: var(--debit); }
  .kpi-value.credit { color: var(--credit); }

  /* Status badges row */
  .status-bar {
    display: flex; gap: 8px; padding: 14px 36px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--line-2);
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600;
    background: #FFFFFF; color: var(--ink-700);
    border: 1px solid var(--line);
  }
  .pill .dot {
    width: 6px; height: 6px; border-radius: 50%;
  }
  .pill.ok .dot { background: var(--credit); }
  .pill.warn .dot { background: var(--warn); }
  .pill.danger .dot { background: var(--debit); }

  /* Groups */
  .groups-wrap { padding: 24px 36px 8px; }
  .group { margin-bottom: 28px; }
  .group:last-child { margin-bottom: 0; }
  .group-header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 8px; margin-bottom: 4px;
    border-bottom: 2px solid var(--ink-900);
  }
  .group-title {
    font-size: 13px; font-weight: 700; color: var(--ink-900);
    letter-spacing: -0.2px;
  }
  .group-meta {
    font-size: 10px; color: var(--ink-500);
    font-variant-numeric: tabular-nums;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    font-size: 9px; font-weight: 700; color: var(--ink-500);
    letter-spacing: 1.2px; text-transform: uppercase;
    padding: 10px 10px;
    border-bottom: 1px solid var(--line);
  }
  thead th.num { text-align: right; }
  tbody td {
    padding: 10px 10px; vertical-align: top;
    font-size: 11px; color: var(--ink-700);
    border-bottom: 1px solid var(--line-2);
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody td.num {
    text-align: right; font-variant-numeric: tabular-nums;
  }
  tbody td.num.strong { font-weight: 700; color: var(--ink-900); }
  tbody td.num.muted { color: var(--ink-400); }
  .item-name { font-weight: 600; color: var(--ink-900); }
  .item-sub { color: var(--ink-400); font-size: 10px; margin-top: 2px; }
  .loc-cell { color: var(--ink-700); font-size: 10.5px; }
  .unit-tag {
    margin-left: 6px; font-size: 10px; color: var(--ink-400);
    font-weight: 500;
  }
  .orig-cur {
    font-size: 9.5px; color: var(--ink-400); margin-top: 2px;
    font-weight: 500; font-variant-numeric: tabular-nums;
  }
  .status-badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  /* Summary bar */
  .summary-bar {
    margin: 0 36px;
    border-top: 2px solid var(--ink-900);
    padding: 16px 0 0;
    display: grid; grid-template-columns: 1fr auto auto auto;
    gap: 32px; align-items: baseline;
  }
  .summary-bar .lbl {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500);
  }
  .summary-bar .num {
    font-size: 14px; font-weight: 700; color: var(--ink-900);
    font-variant-numeric: tabular-nums; margin-top: 4px;
  }

  /* Footer */
  .footer {
    padding: 22px 36px 28px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9.5px; color: var(--ink-400);
    letter-spacing: 0.2px;
    border-top: 1px solid var(--line);
    margin-top: 24px;
  }
  .footer strong { color: var(--ink-900); font-weight: 600; }
</style>
</head>
<body>

<div class="toolbar">
  <span class="title">Stok Raporu · ${esc(input.lab.name)}</span>
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
      <div class="doc-name">Stok Envanter Raporu</div>
      <div class="doc-title-main">${input.filter?.label ? esc(input.filter.label) : 'Tüm Ürünler'}</div>
      ${input.filter?.searchTerm ? `<div style="font-size:11px;color:var(--ink-500);margin-top:6px">Arama: <strong>"${esc(input.filter.searchTerm)}"</strong></div>` : ''}
    </div>
    <div class="doc-meta">
      <div class="lbl">Düzenlenme</div>
      <div class="val">${today}</div>
      <div class="lbl" style="margin-top:8px">Gruplama</div>
      <div class="val">${groupBy === 'category' ? 'Kategoriye göre' : groupBy === 'warehouse' ? 'Depoya göre' : 'Tek liste'}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Toplam Ürün</div>
      <div class="kpi-value">${fmtInt(totalItems)}</div>
      <div class="kpi-sub">${fmtInt(totalQty)} adet stok</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Toplam Değer</div>
      <div class="kpi-value credit">${fmtMoney(totalValue, currency)}</div>
      <div class="kpi-sub">Birim maliyet × miktar</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Kritik Seviye</div>
      <div class="kpi-value warn">${fmtInt(criticalCount)}</div>
      <div class="kpi-sub">Min altına düştü</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Tükenen</div>
      <div class="kpi-value danger">${fmtInt(emptyCount)}</div>
      <div class="kpi-sub">Stok bitti</div>
    </div>
  </div>

  <div class="status-bar">
    <span class="pill ok"><span class="dot"></span>Stokta: ${fmtInt(okCount)}</span>
    <span class="pill warn"><span class="dot"></span>Kritik: ${fmtInt(criticalCount)}</span>
    <span class="pill danger"><span class="dot"></span>Tükenen: ${fmtInt(emptyCount)}</span>
  </div>

  <div class="groups-wrap">
    ${groupsHtml || '<div style="text-align:center;color:var(--ink-400);padding:48px;font-style:italic">Bu kriterlerde ürün bulunmuyor.</div>'}
  </div>

  <div class="summary-bar">
    <div>
      <div class="lbl">Toplam</div>
      <div class="num" style="font-size:11px;color:var(--ink-500);">${fmtInt(totalItems)} ürün</div>
    </div>
    <div>
      <div class="lbl">Toplam Adet</div>
      <div class="num">${fmtInt(totalQty)}</div>
    </div>
    <div>
      <div class="lbl">Kritik + Tükenen</div>
      <div class="num" style="color:var(--warn)">${fmtInt(criticalCount + emptyCount)}</div>
    </div>
    <div>
      <div class="lbl">Envanter Değeri</div>
      <div class="num" style="color:var(--credit)">${fmtMoney(totalValue, currency)}</div>
    </div>
  </div>

  <div class="footer">
    <div>${esc(input.lab.name)} · ${input.lab.phone ? esc(input.lab.phone) + ' · ' : ''}${input.lab.email ? esc(input.lab.email) : ''}</div>
    <div>${today} · Sayfa 1</div>
  </div>
</div>

</body>
</html>`;
}
