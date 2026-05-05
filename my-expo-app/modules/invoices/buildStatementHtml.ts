/**
 * Hesap Ekstresi PDF HTML builder
 * A4 yazdırma için optimize. buildInvoiceHtml ile aynı pattern.
 */

import type { Invoice } from './types';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';

// ── Yardımcılar ──────────────────────────────────────────────────────
function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function fmtMoney(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Statement line builder ───────────────────────────────────────────
export interface StatementLine {
  date: string;
  type: 'invoice' | 'payment';
  description: string;
  invoiceNo?: string;
  status?: string;
  method?: string;
  debit: number;
  credit: number;
  balance: number;
}

export function buildStatementLines(invoices: Invoice[]): StatementLine[] {
  const lines: Omit<StatementLine, 'balance'>[] = [];

  for (const inv of invoices) {
    if (inv.status === 'iptal') continue;
    lines.push({
      date: inv.issue_date,
      type: 'invoice',
      description: inv.work_order?.patient_name
        ? `${inv.work_order.patient_name} — ${inv.invoice_number}`
        : inv.invoice_number,
      invoiceNo: inv.invoice_number,
      status: inv.status,
      debit: inv.total,
      credit: 0,
    });
    if (inv.payments) {
      for (const p of inv.payments) {
        lines.push({
          date: p.payment_date,
          type: 'payment',
          description: `Tahsilat — ${inv.invoice_number}`,
          invoiceNo: inv.invoice_number,
          method: p.payment_method,
          debit: 0,
          credit: p.amount,
        });
      }
    }
  }

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  return lines.map(l => {
    running += l.debit - l.credit;
    return { ...l, balance: running };
  });
}

// ── HTML builder ─────────────────────────────────────────────────────
export function buildStatementHtml(
  clinicName: string,
  lines: StatementLine[],
  lab: LabLetterhead,
  period?: { from?: string; to?: string },
): string {
  const labName    = esc(lab.name);
  const labAddress = lab.address    ? esc(lab.address)    : '';
  const labPhone   = lab.phone      ? esc(lab.phone)      : '';
  const labEmail   = lab.email      ? esc(lab.email)      : '';
  const labTaxNo   = lab.tax_number ? esc(lab.tax_number) : '';
  const labLogo    = lab.logo_url   ? esc(lab.logo_url)   : '';

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const finalBalance = totalDebit - totalCredit;

  const periodText = period?.from && period?.to
    ? `${fmtDate(period.from)} — ${fmtDate(period.to)}`
    : period?.from
      ? `${fmtDate(period.from)} ve sonrası`
      : period?.to
        ? `${fmtDate(period.to)} ve öncesi`
        : 'Tüm dönem';

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = lines.map((l, i) => `
    <tr class="${l.type}">
      <td class="date">${fmtDateShort(l.date)}</td>
      <td class="type">${l.type === 'invoice' ? 'Fatura' : 'Tahsilat'}</td>
      <td class="desc">
        ${esc(l.description)}
        ${l.type === 'payment' && l.method ? `<span class="method">${esc(PAYMENT_METHOD_LABELS[l.method as keyof typeof PAYMENT_METHOD_LABELS] ?? l.method)}</span>` : ''}
        ${l.type === 'invoice' && l.status ? `<span class="status status-${l.status}">${esc(INVOICE_STATUS_LABELS[l.status as keyof typeof INVOICE_STATUS_LABELS] ?? l.status)}</span>` : ''}
      </td>
      <td class="money debit">${l.debit > 0 ? fmtMoney(l.debit) : ''}</td>
      <td class="money credit">${l.credit > 0 ? fmtMoney(l.credit) : ''}</td>
      <td class="money balance">${fmtMoney(l.balance)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hesap Ekstresi — ${esc(clinicName)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; font-size: 11px; color: #1a1a1a; background: #f5f5f5; }

  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px; background: #0a0a0a; color: #fff;
  }
  .toolbar button {
    padding: 6px 16px; border-radius: 999px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600;
  }
  .toolbar .btn-print { background: #F5C24B; color: #0a0a0a; }
  .toolbar .btn-close { background: rgba(255,255,255,0.15); color: #fff; }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; }

  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; }
    .page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
  }

  .page {
    max-width: 1100px; margin: 60px auto 20px;
    background: #fff; border-radius: 4px; padding: 32px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0a0a0a; }
  .header .lab { display: flex; align-items: center; gap: 12px; }
  .header .lab img { height: 40px; object-fit: contain; }
  .header .lab-name { font-size: 16px; font-weight: 700; }
  .header .lab-meta { font-size: 10px; color: #6b6b6b; margin-top: 2px; }
  .header .doc-title { text-align: right; }
  .header .doc-title h1 { font-size: 20px; font-weight: 300; letter-spacing: -0.5px; }
  .header .doc-title .period { font-size: 10px; color: #6b6b6b; margin-top: 4px; }
  .header .doc-title .date { font-size: 10px; color: #9a9a9a; margin-top: 2px; }

  /* Info */
  .info { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 14px 18px; background: #fafafa; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05); }
  .info .label { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #9a9a9a; }
  .info .value { font-size: 16px; font-weight: 300; margin-top: 2px; }
  .info .value.danger { color: #9C2E2E; }
  .info .value.success { color: #1F6B47; }

  /* Table */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    color: #6b6b6b; padding: 8px 12px; background: #fafafa;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    text-align: left;
  }
  thead th.money { text-align: right; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 11px; }
  tbody td.money { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.debit { color: #1a1a1a; font-weight: 500; }
  tbody td.credit { color: #1F6B47; font-weight: 500; }
  tbody td.balance { font-weight: 600; }
  tbody td.date { color: #6b6b6b; font-family: monospace; font-size: 10px; }
  tbody td.type { font-size: 10px; }
  tbody td.desc { max-width: 320px; }
  tr.invoice td.type { color: #1F5689; }
  tr.payment td.type { color: #1F6B47; }

  .method { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: rgba(45,154,107,0.1); color: #1F6B47; font-size: 9px; font-weight: 600; }
  .status { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; }
  .status-taslak { background: rgba(0,0,0,0.05); color: #6b6b6b; }
  .status-kesildi { background: rgba(74,143,201,0.12); color: #1F5689; }
  .status-kismi_odendi { background: rgba(232,155,42,0.15); color: #9C5E0E; }
  .status-odendi { background: rgba(45,154,107,0.12); color: #1F6B47; }
  .status-iptal { background: rgba(217,75,75,0.12); color: #9C2E2E; }

  /* Footer */
  tfoot td { padding: 10px 12px; font-weight: 700; border-top: 2px solid #0a0a0a; }
  tfoot td.money { text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }

  .footer-note { margin-top: 24px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.06); font-size: 9px; color: #9a9a9a; text-align: center; }
</style>
</head>
<body>

<!-- Preview toolbar (hidden on print) -->
<div class="toolbar">
  <span class="title">Hesap Ekstresi — ${esc(clinicName)}</span>
  <button class="btn-print" onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="btn-close" onclick="window.close()">Kapat</button>
</div>

<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="lab">
      ${labLogo ? `<img src="${labLogo}" alt="" />` : ''}
      <div>
        <div class="lab-name">${labName}</div>
        <div class="lab-meta">
          ${[labAddress, labPhone, labEmail, labTaxNo ? `VKN: ${labTaxNo}` : ''].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
    <div class="doc-title">
      <h1>Hesap Ekstresi</h1>
      <div class="period">${esc(periodText)}</div>
      <div class="date">Düzenleme: ${today}</div>
    </div>
  </div>

  <!-- Clinic info + summary -->
  <div class="info">
    <div>
      <div class="label">Klinik</div>
      <div class="value" style="font-weight:600;font-size:14px">${esc(clinicName)}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Toplam Borç</div>
      <div class="value">${fmtMoney(totalDebit)}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Toplam Alacak</div>
      <div class="value success">${fmtMoney(totalCredit)}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Bakiye</div>
      <div class="value ${finalBalance > 0 ? 'danger' : 'success'}" style="font-weight:600">${fmtMoney(finalBalance)}</div>
    </div>
  </div>

  <!-- Statement table -->
  <table>
    <thead>
      <tr>
        <th style="width:90px">Tarih</th>
        <th style="width:60px">Tip</th>
        <th>Açıklama</th>
        <th class="money" style="width:110px">Borç</th>
        <th class="money" style="width:110px">Alacak</th>
        <th class="money" style="width:110px">Bakiye</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="font-size:11px;color:#6b6b6b">${lines.length} hareket</td>
        <td class="money">${fmtMoney(totalDebit)}</td>
        <td class="money" style="color:#1F6B47">${fmtMoney(totalCredit)}</td>
        <td class="money">${fmtMoney(finalBalance)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">
    Bu belge ${labName} tarafından ${today} tarihinde düzenlenmiştir.
  </div>
</div>

</body>
</html>`;
}
